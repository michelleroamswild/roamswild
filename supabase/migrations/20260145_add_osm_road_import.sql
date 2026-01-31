-- Add missing insert_road_segment_simple function and support for OSM road import
-- This enables importing OSM tracks for BLM land where no official road data exists

-- =============================================================================
-- INSERT ROAD SEGMENT (Simple version - skips public_land lookup for performance)
-- =============================================================================

CREATE OR REPLACE FUNCTION insert_road_segment_simple(
    p_external_id TEXT,
    p_source_type TEXT,
    p_geometry_wkt TEXT,
    p_name TEXT,
    p_surface_type TEXT,
    p_vehicle_access TEXT,
    p_seasonal_closure TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_id UUID;
    v_geometry GEOMETRY;
    v_start_key TEXT;
    v_end_key TEXT;
    v_length_miles NUMERIC;
BEGIN
    -- Parse WKT to geometry
    v_geometry := ST_GeomFromText(p_geometry_wkt, 4326);

    -- Calculate length in miles
    v_length_miles := ST_Length(v_geometry::geography) / 1609.34;

    -- Generate node keys for network matching (rounded to ~10m precision)
    v_start_key := ROUND(ST_X(ST_StartPoint(v_geometry))::numeric, 4)::text || ',' ||
                   ROUND(ST_Y(ST_StartPoint(v_geometry))::numeric, 4)::text;
    v_end_key := ROUND(ST_X(ST_EndPoint(v_geometry))::numeric, 4)::text || ',' ||
                 ROUND(ST_Y(ST_EndPoint(v_geometry))::numeric, 4)::text;

    -- Simple insert without public_land lookup (will be populated later)
    INSERT INTO road_segments (
        external_id,
        source_type,
        geometry,
        length_miles,
        name,
        surface_type,
        vehicle_access,
        seasonal_closure,
        start_node_key,
        end_node_key
    )
    VALUES (
        p_external_id,
        p_source_type::road_source_type,
        v_geometry,
        v_length_miles,
        p_name,
        p_surface_type,
        p_vehicle_access::vehicle_access_type,
        p_seasonal_closure,
        v_start_key,
        v_end_key
    )
    ON CONFLICT (external_id) DO UPDATE SET
        geometry = EXCLUDED.geometry,
        length_miles = EXCLUDED.length_miles,
        name = COALESCE(EXCLUDED.name, road_segments.name),
        vehicle_access = EXCLUDED.vehicle_access,
        updated_at = NOW()
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- =============================================================================
-- BACKFILL PUBLIC LAND IDs FOR ROADS
-- Run this after importing roads to associate them with public lands
-- =============================================================================

CREATE OR REPLACE FUNCTION backfill_road_public_lands(
    p_north NUMERIC DEFAULT NULL,
    p_south NUMERIC DEFAULT NULL,
    p_east NUMERIC DEFAULT NULL,
    p_west NUMERIC DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_bounds GEOMETRY;
    v_updated INTEGER := 0;
BEGIN
    -- Create bounding box if provided, otherwise update all
    IF p_north IS NOT NULL AND p_south IS NOT NULL AND p_east IS NOT NULL AND p_west IS NOT NULL THEN
        v_bounds := ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326);
    END IF;

    -- Update roads that don't have a public_land_id yet
    WITH updated AS (
        UPDATE road_segments rs
        SET public_land_id = (
            SELECT pl.id
            FROM public_lands pl
            WHERE ST_Intersects(pl.boundary, rs.geometry)
              AND pl.dispersed_camping_allowed = TRUE
            ORDER BY pl.area_acres DESC NULLS LAST
            LIMIT 1
        ),
        updated_at = NOW()
        WHERE rs.public_land_id IS NULL
          AND (v_bounds IS NULL OR ST_Intersects(rs.geometry, v_bounds))
        RETURNING rs.id
    )
    SELECT COUNT(*) INTO v_updated FROM updated;

    RETURN v_updated;
END;
$$;

-- =============================================================================
-- DERIVE SPOTS FOR BLM LAND (from OSM roads that intersect BLM polygons)
-- =============================================================================

CREATE OR REPLACE FUNCTION derive_blm_spots(
    p_north NUMERIC,
    p_south NUMERIC,
    p_east NUMERIC,
    p_west NUMERIC
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_bounds GEOMETRY;
    v_spots_created INTEGER := 0;
    rec RECORD;
BEGIN
    -- Create bounding box
    v_bounds := ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326);

    -- Find road endpoints within BLM land that have only one connection (dead-ends)
    FOR rec IN
        WITH blm_lands AS (
            -- Get BLM polygons in the area
            SELECT id, boundary, name
            FROM public_lands
            WHERE managing_agency = 'BLM'
              AND ST_Intersects(boundary, v_bounds)
              AND dispersed_camping_allowed = TRUE
        ),
        road_endpoints AS (
            -- Get all endpoints from OSM roads
            SELECT
                ST_SnapToGrid(start_point, 0.0001) as point,
                rs.id as road_id,
                rs.name as road_name,
                rs.source_type,
                rs.vehicle_access,
                bl.id as blm_land_id,
                bl.name as blm_land_name
            FROM road_segments rs
            CROSS JOIN blm_lands bl
            WHERE rs.source_type = 'osm'
              AND ST_Intersects(rs.geometry, v_bounds)
              AND ST_Within(rs.start_point, bl.boundary)

            UNION ALL

            SELECT
                ST_SnapToGrid(end_point, 0.0001) as point,
                rs.id as road_id,
                rs.name as road_name,
                rs.source_type,
                rs.vehicle_access,
                bl.id as blm_land_id,
                bl.name as blm_land_name
            FROM road_segments rs
            CROSS JOIN blm_lands bl
            WHERE rs.source_type = 'osm'
              AND ST_Intersects(rs.geometry, v_bounds)
              AND ST_Within(rs.end_point, bl.boundary)
        ),
        endpoint_counts AS (
            SELECT
                point,
                COUNT(*) as connection_count,
                array_agg(DISTINCT road_name) FILTER (WHERE road_name IS NOT NULL) as road_names,
                MAX(vehicle_access::text)::vehicle_access_type as best_vehicle_access,
                (array_agg(blm_land_id))[1] as public_land_id,
                'BLM' as managing_agency
            FROM road_endpoints
            GROUP BY point
        )
        SELECT * FROM endpoint_counts
        WHERE connection_count = 1  -- True dead ends only
    LOOP
        -- Skip if spot already exists nearby (within ~50m)
        IF NOT EXISTS (
            SELECT 1 FROM potential_spots
            WHERE ST_DWithin(location::geography, rec.point::geography, 50)
        ) THEN
            -- Calculate confidence score for BLM spots
            -- Base: 25 for dead-end on BLM land
            -- +10 if high clearance required (more remote)
            -- +5 for having a road name
            INSERT INTO potential_spots (
                location,
                spot_type,
                status,
                confidence_score,
                score_breakdown,
                road_name,
                vehicle_access,
                is_passenger_reachable,
                is_high_clearance_reachable,
                public_land_id,
                managing_agency,
                derivation_reasons,
                source_type
            )
            VALUES (
                rec.point,
                'dead_end',
                'derived',
                25 +
                    CASE WHEN rec.best_vehicle_access IN ('high_clearance', '4wd') THEN 10 ELSE 0 END +
                    CASE WHEN rec.road_names IS NOT NULL AND array_length(rec.road_names, 1) > 0 THEN 5 ELSE 0 END,
                jsonb_build_object(
                    'base', 25,
                    'vehicle_bonus', CASE WHEN rec.best_vehicle_access IN ('high_clearance', '4wd') THEN 10 ELSE 0 END,
                    'name_bonus', CASE WHEN rec.road_names IS NOT NULL AND array_length(rec.road_names, 1) > 0 THEN 5 ELSE 0 END
                ),
                COALESCE(rec.road_names[1], 'Unnamed Road'),
                rec.best_vehicle_access,
                rec.best_vehicle_access = 'passenger',
                rec.best_vehicle_access IN ('passenger', 'high_clearance'),
                rec.public_land_id,
                rec.managing_agency,
                ARRAY['Road terminus (dead-end)', 'On BLM land'],
                'osm'
            );

            v_spots_created := v_spots_created + 1;
        END IF;
    END LOOP;

    RETURN v_spots_created;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION insert_road_segment_simple TO anon;
GRANT EXECUTE ON FUNCTION insert_road_segment_simple TO authenticated;
GRANT EXECUTE ON FUNCTION insert_road_segment_simple TO service_role;
GRANT EXECUTE ON FUNCTION backfill_road_public_lands TO service_role;
GRANT EXECUTE ON FUNCTION derive_blm_spots TO service_role;
