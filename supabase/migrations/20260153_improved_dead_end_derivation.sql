-- Dead-end derivation matching client-side logic exactly
-- Uses same snapping (0.0001 = toFixed(4)) and counting rules as use-dispersed-roads.ts

CREATE OR REPLACE FUNCTION derive_dead_ends_matching_client(
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

    -- Match client-side logic from use-dispersed-roads.ts findDeadEnds():
    -- 1. Snap to 0.0001 grid (same as toFixed(4))
    -- 2. Count each segment endpoint
    -- 3. Dead-end = count === 1
    -- 4. Check isPublicLand OR within public land boundary
    FOR rec IN
        WITH road_endpoints AS (
            -- Get all endpoints from OSM roads (matching client osmTracks processing)
            SELECT
                -- Snap to 0.0001 grid = toFixed(4) in JavaScript
                ST_SnapToGrid(rs.start_point, 0.0001) as snapped_point,
                rs.start_point as original_point,
                rs.name as road_name,
                rs.vehicle_access,
                rs.source_type,
                -- Mark as likely public (matching isLikelyPublicLand logic)
                -- OSM tracks are likely public unless marked private
                CASE
                    WHEN rs.vehicle_access = '4wd' THEN TRUE
                    ELSE TRUE -- Default to true for tracks (client does this)
                END as is_likely_public,
                CASE WHEN rs.vehicle_access = '4wd' THEN TRUE ELSE FALSE END as is_high_clearance
            FROM road_segments rs
            WHERE ST_Intersects(rs.start_point, v_bounds)
              AND rs.source_type = 'osm'

            UNION ALL

            SELECT
                ST_SnapToGrid(rs.end_point, 0.0001) as snapped_point,
                rs.end_point as original_point,
                rs.name as road_name,
                rs.vehicle_access,
                rs.source_type,
                CASE
                    WHEN rs.vehicle_access = '4wd' THEN TRUE
                    ELSE TRUE
                END as is_likely_public,
                CASE WHEN rs.vehicle_access = '4wd' THEN TRUE ELSE FALSE END as is_high_clearance
            FROM road_segments rs
            WHERE ST_Intersects(rs.end_point, v_bounds)
              AND rs.source_type = 'osm'
        ),
        endpoint_counts AS (
            -- Group by snapped point and count (matching client endpointMap logic)
            SELECT
                snapped_point,
                (array_agg(original_point))[1] as actual_point,
                COUNT(*) as connection_count,  -- This is entry.count in client
                array_agg(DISTINCT road_name) FILTER (WHERE road_name IS NOT NULL) as road_names,
                bool_or(is_likely_public) as is_public_land,
                bool_or(is_high_clearance) as is_high_clearance,
                MAX(vehicle_access::text)::vehicle_access_type as best_vehicle_access,
                (array_agg(source_type::text))[1] as source_type
            FROM road_endpoints
            GROUP BY snapped_point
        ),
        dead_ends AS (
            -- entry.count === 1 means dead-end (client line 906)
            SELECT * FROM endpoint_counts
            WHERE connection_count = 1
        ),
        -- Check public land boundary (client line 898: isWithinPublicLand check)
        dead_ends_with_land AS (
            SELECT
                de.*,
                pl.id as public_land_id,
                pl.managing_agency
            FROM dead_ends de
            LEFT JOIN public_lands pl ON ST_Within(de.actual_point, pl.boundary)
                AND pl.dispersed_camping_allowed = TRUE
        )
        -- Client line 901: include if is_public_land OR within boundary
        SELECT * FROM dead_ends_with_land
        WHERE is_public_land = TRUE OR public_land_id IS NOT NULL
        LIMIT p_batch_size
    LOOP
        -- Skip if spot already exists nearby (client filters these out too)
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
                derivation_reasons,
                source_type
            )
            VALUES (
                rec.actual_point,
                'dead_end',
                'derived',
                -- Client scoring: base 25 + 10 for high clearance
                25 + CASE WHEN rec.is_high_clearance THEN 10 ELSE 0 END,
                COALESCE(rec.road_names[1], 'Unnamed Road'),
                rec.best_vehicle_access,
                rec.best_vehicle_access = 'passenger',
                rec.best_vehicle_access IN ('passenger', 'high_clearance'),
                rec.public_land_id,
                COALESCE(rec.managing_agency, 'BLM'),  -- Default to BLM for OSM tracks on public land
                ARRAY['Road terminus (dead-end)', 'On public land'],
                rec.source_type::road_source_type
            );
            v_spots_created := v_spots_created + 1;
        END IF;
    END LOOP;

    RETURN v_spots_created;
END;
$$;

GRANT EXECUTE ON FUNCTION derive_dead_ends_matching_client TO service_role;
