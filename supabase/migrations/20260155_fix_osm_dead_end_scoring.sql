-- Fix OSM dead-end scoring to match client-side (base 25 = Medium confidence)

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
    v_bounds := ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326);

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
                25,  -- Base score for OSM dead-ends (Medium confidence)
                COALESCE(rec.road_names[1], 'Unnamed Road'),
                rec.best_vehicle_access,
                rec.best_vehicle_access = 'passenger',
                rec.best_vehicle_access IN ('passenger', 'high_clearance'),
                rec.public_land_id,
                COALESCE(rec.managing_agency, 'BLM'),
                ARRAY['Road terminus (dead-end)', 'On public land'],
                rec.source_type::road_source_type
            );
            v_spots_created := v_spots_created + 1;
        END IF;
    END LOOP;

    RETURN v_spots_created;
END;
$$;
