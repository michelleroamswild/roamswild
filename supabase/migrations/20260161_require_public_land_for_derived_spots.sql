-- Update derivation to ONLY create spots from roads confirmed on public land
-- This matches the updated Full mode behavior where polygon validation is authoritative

-- Add is_on_public_land flag to potential_spots for explicit tracking
ALTER TABLE potential_spots
ADD COLUMN IF NOT EXISTS is_on_public_land BOOLEAN DEFAULT FALSE;

-- Update existing spots: set is_on_public_land based on public_land_id
UPDATE potential_spots
SET is_on_public_land = (public_land_id IS NOT NULL)
WHERE spot_type = 'dead_end';

-- For camp_sites from OSM, they're generally on public land (we trust OSM tagging)
UPDATE potential_spots
SET is_on_public_land = TRUE
WHERE spot_type = 'camp_site' AND source_type = 'osm';

-- Update the derive function to REQUIRE public_land_id
CREATE OR REPLACE FUNCTION derive_all_osm_dead_ends(
    p_north NUMERIC,
    p_south NUMERIC,
    p_east NUMERIC,
    p_west NUMERIC,
    p_batch_size INTEGER DEFAULT 100
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

    -- Only derive from roads that have public_land_id (confirmed on public land)
    -- This ensures accuracy - spots must be validated against public land polygons
    FOR rec IN
        WITH road_endpoints AS (
            SELECT
                ST_SnapToGrid(rs.start_point, 0.0001) as snapped_point,
                rs.start_point as original_point,
                rs.name as road_name,
                rs.vehicle_access,
                rs.source_type,
                rs.public_land_id
            FROM road_segments rs
            WHERE ST_Intersects(rs.start_point, v_bounds)
              AND rs.source_type = 'osm'
              AND rs.public_land_id IS NOT NULL  -- REQUIRE public land

            UNION ALL

            SELECT
                ST_SnapToGrid(rs.end_point, 0.0001) as snapped_point,
                rs.end_point as original_point,
                rs.name as road_name,
                rs.vehicle_access,
                rs.source_type,
                rs.public_land_id
            FROM road_segments rs
            WHERE ST_Intersects(rs.end_point, v_bounds)
              AND rs.source_type = 'osm'
              AND rs.public_land_id IS NOT NULL  -- REQUIRE public land
        ),
        endpoint_counts AS (
            SELECT
                snapped_point,
                (array_agg(original_point))[1] as actual_point,
                COUNT(*) as connection_count,
                array_agg(DISTINCT road_name) FILTER (WHERE road_name IS NOT NULL) as road_names,
                MAX(vehicle_access::text)::vehicle_access_type as best_vehicle_access,
                (array_agg(source_type::text))[1] as source_type,
                (array_agg(public_land_id) FILTER (WHERE public_land_id IS NOT NULL))[1] as public_land_id
            FROM road_endpoints
            GROUP BY snapped_point
        ),
        dead_ends AS (
            SELECT * FROM endpoint_counts
            WHERE connection_count = 1
        ),
        dead_ends_with_agency AS (
            SELECT
                de.*,
                pl.managing_agency
            FROM dead_ends de
            LEFT JOIN public_lands pl ON de.public_land_id = pl.id
        )
        SELECT * FROM dead_ends_with_agency
        LIMIT p_batch_size
    LOOP
        -- Skip if spot already exists nearby
        IF NOT EXISTS (
            SELECT 1 FROM potential_spots
            WHERE ST_DWithin(location::geography, rec.actual_point::geography, 50)
        ) THEN
            INSERT INTO potential_spots (
                location,
                spot_type,
                status,
                confidence_score,
                road_name,
                vehicle_access,
                is_passenger_reachable,
                is_high_clearance_reachable,
                public_land_id,
                managing_agency,
                is_on_public_land,
                derivation_reasons,
                source_type
            ) VALUES (
                rec.actual_point,
                'dead_end',
                'derived',
                CASE
                    WHEN rec.managing_agency = 'BLM' THEN 35
                    WHEN rec.managing_agency IN ('USFS', 'FS') THEN 35
                    ELSE 30
                END,
                rec.road_names[1],
                rec.best_vehicle_access,
                rec.best_vehicle_access = 'passenger',
                rec.best_vehicle_access IN ('passenger', 'high_clearance'),
                rec.public_land_id,
                rec.managing_agency,
                TRUE,  -- Confirmed on public land
                ARRAY[
                    'Road terminus (dead-end)',
                    CASE
                        WHEN rec.managing_agency = 'BLM' THEN 'On BLM land'
                        WHEN rec.managing_agency IN ('USFS', 'FS') THEN 'On National Forest land'
                        ELSE 'On public land'
                    END
                ],
                'osm'
            );
            v_spots_created := v_spots_created + 1;
        END IF;
    END LOOP;

    RETURN v_spots_created;
END;
$$;

-- Also update derive_spots_from_linked_roads to set is_on_public_land
CREATE OR REPLACE FUNCTION derive_spots_from_linked_roads(
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
    v_bounds := ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326);

    -- Only process roads with public_land_id (confirmed on public land)
    FOR rec IN
        WITH road_endpoints AS (
            SELECT
                ST_SnapToGrid(rs.start_point, 0.0001) as snapped_point,
                rs.start_point as original_point,
                rs.name as road_name,
                rs.vehicle_access,
                rs.source_type,
                rs.public_land_id
            FROM road_segments rs
            WHERE ST_Intersects(rs.start_point, v_bounds)
              AND rs.public_land_id IS NOT NULL

            UNION ALL

            SELECT
                ST_SnapToGrid(rs.end_point, 0.0001) as snapped_point,
                rs.end_point as original_point,
                rs.name as road_name,
                rs.vehicle_access,
                rs.source_type,
                rs.public_land_id
            FROM road_segments rs
            WHERE ST_Intersects(rs.end_point, v_bounds)
              AND rs.public_land_id IS NOT NULL
        ),
        endpoint_counts AS (
            SELECT
                snapped_point,
                (array_agg(original_point))[1] as actual_point,
                COUNT(*) as connection_count,
                array_agg(DISTINCT road_name) FILTER (WHERE road_name IS NOT NULL) as road_names,
                MAX(vehicle_access::text)::vehicle_access_type as best_vehicle_access,
                (array_agg(source_type::text))[1] as source_type,
                (array_agg(public_land_id) FILTER (WHERE public_land_id IS NOT NULL))[1] as public_land_id
            FROM road_endpoints
            GROUP BY snapped_point
        ),
        dead_ends AS (
            SELECT * FROM endpoint_counts
            WHERE connection_count = 1
        ),
        dead_ends_with_agency AS (
            SELECT
                de.*,
                pl.managing_agency
            FROM dead_ends de
            JOIN public_lands pl ON de.public_land_id = pl.id
        )
        SELECT * FROM dead_ends_with_agency
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM potential_spots
            WHERE ST_DWithin(location::geography, rec.actual_point::geography, 50)
        ) THEN
            INSERT INTO potential_spots (
                location,
                spot_type,
                status,
                confidence_score,
                road_name,
                vehicle_access,
                is_passenger_reachable,
                is_high_clearance_reachable,
                public_land_id,
                managing_agency,
                is_on_public_land,
                derivation_reasons,
                source_type
            ) VALUES (
                rec.actual_point,
                'dead_end',
                'derived',
                CASE
                    WHEN rec.managing_agency = 'BLM' THEN 35
                    WHEN rec.managing_agency IN ('USFS', 'FS') THEN 35
                    ELSE 30
                END,
                rec.road_names[1],
                rec.best_vehicle_access,
                rec.best_vehicle_access = 'passenger',
                rec.best_vehicle_access IN ('passenger', 'high_clearance'),
                rec.public_land_id,
                rec.managing_agency,
                TRUE,
                ARRAY[
                    'Road terminus (dead-end)',
                    CASE
                        WHEN rec.managing_agency = 'BLM' THEN 'On BLM land'
                        WHEN rec.managing_agency IN ('USFS', 'FS') THEN 'On National Forest land'
                        ELSE 'On public land'
                    END
                ],
                rec.source_type
            );
            v_spots_created := v_spots_created + 1;
        END IF;
    END LOOP;

    RETURN v_spots_created;
END;
$$;

-- Delete derived spots that aren't on public land (cleanup)
DELETE FROM potential_spots
WHERE spot_type = 'dead_end'
  AND public_land_id IS NULL;

-- Update get_dispersed_spots to return is_on_public_land
DROP FUNCTION IF EXISTS get_dispersed_spots(NUMERIC, NUMERIC, NUMERIC, TEXT, NUMERIC, BOOLEAN, INTEGER);

CREATE OR REPLACE FUNCTION get_dispersed_spots(
    p_lat NUMERIC,
    p_lng NUMERIC,
    p_radius_miles NUMERIC DEFAULT 10,
    p_vehicle_access TEXT DEFAULT NULL,
    p_min_confidence NUMERIC DEFAULT 0,
    p_include_derived BOOLEAN DEFAULT FALSE,
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
    id UUID,
    lat NUMERIC,
    lng NUMERIC,
    name TEXT,
    spot_type spot_type,
    status spot_status,
    confidence_score NUMERIC,
    road_name TEXT,
    vehicle_access vehicle_access_type,
    managing_agency TEXT,
    derivation_reasons TEXT[],
    is_established_campground BOOLEAN,
    is_road_accessible BOOLEAN,
    is_on_public_land BOOLEAN,
    osm_tags JSONB,
    distance_miles NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_center GEOMETRY;
    v_radius_meters NUMERIC;
BEGIN
    v_center := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326);
    v_radius_meters := p_radius_miles * 1609.34;

    RETURN QUERY
    SELECT
        ps.id,
        ps.lat,
        ps.lng,
        ps.name,
        ps.spot_type,
        ps.status,
        ps.confidence_score,
        ps.road_name,
        ps.vehicle_access,
        ps.managing_agency,
        ps.derivation_reasons,
        ps.is_established_campground,
        COALESCE(ps.is_road_accessible, TRUE) as is_road_accessible,
        COALESCE(ps.is_on_public_land, TRUE) as is_on_public_land,
        ps.osm_tags,
        (ST_Distance(ps.location::geography, v_center::geography) / 1609.34)::NUMERIC(6,2) as distance_miles
    FROM potential_spots ps
    WHERE ST_DWithin(ps.location::geography, v_center::geography, v_radius_meters)
      AND ps.confidence_score >= p_min_confidence
      AND (p_include_derived OR ps.status IN ('admin_verified', 'user_confirmed'))
      AND (p_vehicle_access IS NULL OR
           (p_vehicle_access = 'passenger' AND ps.is_passenger_reachable = TRUE) OR
           (p_vehicle_access = 'high_clearance' AND ps.is_high_clearance_reachable = TRUE) OR
           (p_vehicle_access = '4wd'))
    ORDER BY
        CASE WHEN ps.status = 'admin_verified' THEN 0
             WHEN ps.status = 'user_confirmed' THEN 1
             ELSE 2 END,
        ps.confidence_score DESC,
        distance_miles ASC
    LIMIT p_limit;
END;
$$;
