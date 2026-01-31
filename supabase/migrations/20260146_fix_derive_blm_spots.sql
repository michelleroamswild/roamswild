-- Fix derive_blm_spots function - can't use MAX on UUID

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
            -- Get all endpoints from OSM roads that are within BLM land
            SELECT
                ST_SnapToGrid(rs.start_point, 0.0001) as point,
                rs.id as road_id,
                rs.name as road_name,
                rs.source_type,
                rs.vehicle_access,
                bl.id as blm_land_id,
                bl.name as blm_land_name
            FROM road_segments rs
            INNER JOIN blm_lands bl ON ST_Within(rs.start_point, bl.boundary)
            WHERE rs.source_type = 'osm'
              AND ST_Intersects(rs.geometry, v_bounds)

            UNION ALL

            SELECT
                ST_SnapToGrid(rs.end_point, 0.0001) as point,
                rs.id as road_id,
                rs.name as road_name,
                rs.source_type,
                rs.vehicle_access,
                bl.id as blm_land_id,
                bl.name as blm_land_name
            FROM road_segments rs
            INNER JOIN blm_lands bl ON ST_Within(rs.end_point, bl.boundary)
            WHERE rs.source_type = 'osm'
              AND ST_Intersects(rs.geometry, v_bounds)
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

-- Also add index to speed up the query
CREATE INDEX IF NOT EXISTS idx_road_segments_source_geom
    ON road_segments USING GIST(geometry)
    WHERE source_type = 'osm';
