-- Simple batched BLM dead-end derivation that avoids complex spatial joins
-- Uses pre-indexed columns for speed

CREATE OR REPLACE FUNCTION derive_blm_dead_ends_simple(
    p_batch_size INTEGER DEFAULT 50
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_spots_created INTEGER := 0;
    rec RECORD;
BEGIN
    -- Find OSM road endpoints that are within BLM polygons
    -- Uses the simpler approach: find endpoints, check if within BLM
    FOR rec IN
        WITH osm_endpoints AS (
            -- Get unique endpoints from OSM roads
            SELECT DISTINCT ON (ST_SnapToGrid(point, 0.0001))
                ST_SnapToGrid(point, 0.0001) as point,
                name,
                vehicle_access
            FROM (
                SELECT start_point as point, name, vehicle_access
                FROM road_segments WHERE source_type = 'osm'
                UNION ALL
                SELECT end_point as point, name, vehicle_access
                FROM road_segments WHERE source_type = 'osm'
            ) endpoints
        ),
        endpoint_counts AS (
            -- Count connections per endpoint
            SELECT
                e.point,
                e.name,
                e.vehicle_access,
                (SELECT COUNT(*) FROM road_segments rs
                 WHERE rs.source_type = 'osm'
                 AND (ST_DWithin(rs.start_point, e.point, 0.0001)
                      OR ST_DWithin(rs.end_point, e.point, 0.0001))) as conn_count
            FROM osm_endpoints e
        ),
        dead_ends AS (
            -- Only true dead-ends (1 connection)
            SELECT point, name, vehicle_access
            FROM endpoint_counts
            WHERE conn_count = 1
        ),
        with_blm AS (
            -- Check which are on BLM land
            SELECT
                de.point,
                de.name,
                de.vehicle_access,
                pl.id as public_land_id
            FROM dead_ends de
            INNER JOIN public_lands pl ON ST_Within(de.point, pl.boundary)
            WHERE pl.managing_agency = 'BLM'
              AND pl.dispersed_camping_allowed = TRUE
        )
        SELECT * FROM with_blm
        WHERE NOT EXISTS (
            SELECT 1 FROM potential_spots ps
            WHERE ST_DWithin(ps.location::geography, with_blm.point::geography, 50)
        )
        LIMIT p_batch_size
    LOOP
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
            rec.point,
            'dead_end',
            'derived',
            25 + CASE WHEN rec.vehicle_access IN ('high_clearance', '4wd') THEN 10 ELSE 0 END,
            COALESCE(rec.name, 'Unnamed Road'),
            rec.vehicle_access,
            rec.vehicle_access = 'passenger',
            rec.vehicle_access IN ('passenger', 'high_clearance'),
            rec.public_land_id,
            'BLM',
            ARRAY['Road terminus (dead-end)', 'On BLM land'],
            'osm'
        );
        v_spots_created := v_spots_created + 1;
    END LOOP;

    RETURN v_spots_created;
END;
$$;

GRANT EXECUTE ON FUNCTION derive_blm_dead_ends_simple TO service_role;
