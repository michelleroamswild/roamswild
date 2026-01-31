-- Fast spot derivation using pre-backfilled public_land_id on roads
-- This avoids expensive spatial joins at derive time

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
    -- Create bounding box
    v_bounds := ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326);

    -- Find dead-end points from roads that already have public_land_id set
    -- This is much faster than doing spatial joins at query time
    FOR rec IN
        WITH road_endpoints AS (
            -- Get all endpoints from roads with public_land_id
            SELECT
                ST_SnapToGrid(rs.start_point, 0.0001) as point,
                rs.id as road_id,
                rs.name as road_name,
                rs.source_type,
                rs.vehicle_access,
                rs.public_land_id,
                pl.managing_agency
            FROM road_segments rs
            INNER JOIN public_lands pl ON rs.public_land_id = pl.id
            WHERE rs.public_land_id IS NOT NULL
              AND ST_Intersects(rs.start_point, v_bounds)
              AND pl.dispersed_camping_allowed = TRUE

            UNION ALL

            SELECT
                ST_SnapToGrid(rs.end_point, 0.0001) as point,
                rs.id as road_id,
                rs.name as road_name,
                rs.source_type,
                rs.vehicle_access,
                rs.public_land_id,
                pl.managing_agency
            FROM road_segments rs
            INNER JOIN public_lands pl ON rs.public_land_id = pl.id
            WHERE rs.public_land_id IS NOT NULL
              AND ST_Intersects(rs.end_point, v_bounds)
              AND pl.dispersed_camping_allowed = TRUE
        ),
        endpoint_counts AS (
            SELECT
                point,
                COUNT(*) as connection_count,
                array_agg(DISTINCT road_name) FILTER (WHERE road_name IS NOT NULL) as road_names,
                MAX(vehicle_access::text)::vehicle_access_type as best_vehicle_access,
                (array_agg(public_land_id))[1] as public_land_id,
                (array_agg(managing_agency))[1] as managing_agency,
                (array_agg(source_type::text))[1] as source_type
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
            -- Calculate confidence score
            -- Base: 25 for dead-end on public land
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
                ARRAY['Road terminus (dead-end)', 'On ' || COALESCE(rec.managing_agency, 'public') || ' land'],
                rec.source_type::road_source_type
            );

            v_spots_created := v_spots_created + 1;
        END IF;
    END LOOP;

    RETURN v_spots_created;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION derive_spots_from_linked_roads TO service_role;

-- Add index on public_land_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_road_segments_public_land
    ON road_segments(public_land_id)
    WHERE public_land_id IS NOT NULL;
