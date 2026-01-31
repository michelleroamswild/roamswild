-- Derive spots from ALL roads, then filter by polygon intersection
-- This matches the client-side behavior more closely

CREATE OR REPLACE FUNCTION derive_all_dead_ends_batch(
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

    -- Find all dead-ends from ALL roads (not just linked ones)
    -- Then check if the spot itself is within a public land polygon
    FOR rec IN
        WITH road_endpoints AS (
            -- Get all endpoints from all roads in bounds
            SELECT
                ST_SnapToGrid(rs.start_point, 0.0001) as point,
                rs.name as road_name,
                rs.vehicle_access,
                rs.source_type
            FROM road_segments rs
            WHERE ST_Intersects(rs.start_point, v_bounds)

            UNION ALL

            SELECT
                ST_SnapToGrid(rs.end_point, 0.0001) as point,
                rs.name as road_name,
                rs.vehicle_access,
                rs.source_type
            FROM road_segments rs
            WHERE ST_Intersects(rs.end_point, v_bounds)
        ),
        endpoint_counts AS (
            SELECT
                point,
                COUNT(*) as connection_count,
                array_agg(DISTINCT road_name) FILTER (WHERE road_name IS NOT NULL) as road_names,
                MAX(vehicle_access::text)::vehicle_access_type as best_vehicle_access,
                (array_agg(source_type::text))[1] as source_type
            FROM road_endpoints
            GROUP BY point
            HAVING COUNT(*) = 1  -- Dead ends only
        ),
        -- Check which dead-ends are within public land polygons
        dead_ends_with_land AS (
            SELECT
                ec.*,
                pl.id as public_land_id,
                pl.managing_agency
            FROM endpoint_counts ec
            LEFT JOIN public_lands pl ON ST_Within(ec.point, pl.boundary)
                AND pl.dispersed_camping_allowed = TRUE
        )
        SELECT * FROM dead_ends_with_land
        WHERE public_land_id IS NOT NULL  -- Only keep spots on public land
        LIMIT p_batch_size
    LOOP
        -- Skip if spot already exists nearby
        IF NOT EXISTS (
            SELECT 1 FROM potential_spots
            WHERE ST_DWithin(location::geography, rec.point::geography, 50)
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
                rec.point,
                'dead_end',
                'derived',
                25 + CASE WHEN rec.best_vehicle_access IN ('high_clearance', '4wd') THEN 10 ELSE 0 END +
                     CASE WHEN rec.road_names IS NOT NULL AND array_length(rec.road_names, 1) > 0 THEN 5 ELSE 0 END,
                COALESCE(rec.road_names[1], 'Unnamed Road'),
                rec.best_vehicle_access,
                rec.best_vehicle_access = 'passenger',
                rec.best_vehicle_access IN ('passenger', 'high_clearance'),
                rec.public_land_id,
                rec.managing_agency,
                ARRAY['Road terminus (dead-end)', 'On ' || COALESCE(rec.managing_agency, 'public') || ' land'],
                rec.source_type::road_source_type
            );
            v_spots_created := v_spots_created + 1;
        END IF;
    END LOOP;

    RETURN v_spots_created;
END;
$$;

GRANT EXECUTE ON FUNCTION derive_all_dead_ends_batch TO service_role;
