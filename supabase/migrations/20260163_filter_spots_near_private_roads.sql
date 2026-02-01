-- Filter out derived spots that are near private roads
-- This ensures spots near ranger stations, private driveways, etc. are excluded

-- 1. Create a table to store private road points for filtering
CREATE TABLE IF NOT EXISTS private_road_points (
    id SERIAL PRIMARY KEY,
    location GEOMETRY(Point, 4326) NOT NULL,
    osm_id BIGINT,
    access_type TEXT,  -- 'private', 'no', 'customers'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_private_road_points_location
ON private_road_points USING GIST (location);

CREATE INDEX IF NOT EXISTS idx_private_road_points_osm_id
ON private_road_points (osm_id);

-- 2. Add is_near_private_road column to potential_spots
ALTER TABLE potential_spots
ADD COLUMN IF NOT EXISTS is_near_private_road BOOLEAN DEFAULT FALSE;

-- 3. Create function to import private road points from OSM for a region
CREATE OR REPLACE FUNCTION import_private_road_points(
    p_north NUMERIC,
    p_south NUMERIC,
    p_east NUMERIC,
    p_west NUMERIC,
    p_points JSONB  -- Array of {lat, lng, osm_id, access} objects
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_count INTEGER := 0;
    v_point JSONB;
BEGIN
    FOR v_point IN SELECT * FROM jsonb_array_elements(p_points)
    LOOP
        -- Insert point if not already exists (by osm_id)
        INSERT INTO private_road_points (location, osm_id, access_type)
        VALUES (
            ST_SetSRID(ST_MakePoint((v_point->>'lng')::NUMERIC, (v_point->>'lat')::NUMERIC), 4326),
            (v_point->>'osm_id')::BIGINT,
            v_point->>'access'
        )
        ON CONFLICT DO NOTHING;

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

-- 4. Create function to check if a point is near any private road (within 0.5 miles)
CREATE OR REPLACE FUNCTION is_near_private_road(
    p_location GEOMETRY,
    p_threshold_meters NUMERIC DEFAULT 804.67  -- 0.5 miles in meters
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM private_road_points prp
        WHERE ST_DWithin(prp.location::geography, p_location::geography, p_threshold_meters)
    );
END;
$$;

-- 5. Update derive_spots_from_linked_roads to check private roads
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
    v_near_private BOOLEAN;
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
        -- Skip if near private road (within 0.5 miles / 804.67 meters)
        v_near_private := is_near_private_road(rec.actual_point);
        IF v_near_private THEN
            CONTINUE;
        END IF;

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
                is_near_private_road,
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
                FALSE,  -- Not near private road (we checked above)
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

-- 6. Update derive_all_osm_dead_ends to also check private roads
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
    v_near_private BOOLEAN;
BEGIN
    -- Create bounding box
    v_bounds := ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326);

    -- Only derive from roads that have public_land_id (confirmed on public land)
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
              AND rs.source_type = 'osm'
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
            LEFT JOIN public_lands pl ON de.public_land_id = pl.id
        )
        SELECT * FROM dead_ends_with_agency
        LIMIT p_batch_size
    LOOP
        -- Skip if near private road (within 0.5 miles / 804.67 meters)
        v_near_private := is_near_private_road(rec.actual_point);
        IF v_near_private THEN
            CONTINUE;
        END IF;

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
                is_near_private_road,
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
                FALSE,  -- Not near private road
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

-- 7. Grant permissions
GRANT SELECT, INSERT ON private_road_points TO service_role;
GRANT USAGE, SELECT ON SEQUENCE private_road_points_id_seq TO service_role;
GRANT EXECUTE ON FUNCTION import_private_road_points TO service_role;
GRANT EXECUTE ON FUNCTION is_near_private_road TO service_role;
GRANT EXECUTE ON FUNCTION is_near_private_road TO anon;
GRANT EXECUTE ON FUNCTION is_near_private_road TO authenticated;
