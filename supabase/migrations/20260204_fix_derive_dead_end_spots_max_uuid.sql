-- Fix derive_dead_end_spots: MAX(public_land_id) fails because max(uuid)
-- is not a valid PostgreSQL aggregate. Use (array_agg(...))[1] to pick
-- any one of the public_land_ids associated with the endpoint.

CREATE OR REPLACE FUNCTION derive_dead_end_spots(
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
    v_score NUMERIC;
BEGIN
    v_bounds := ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326);

    FOR rec IN
        WITH endpoints AS (
            SELECT ST_SnapToGrid(start_point, 0.0001) as point,
                   name as road_name, source_type, vehicle_access, public_land_id
            FROM road_segments WHERE ST_Intersects(geometry, v_bounds)
            UNION ALL
            SELECT ST_SnapToGrid(end_point, 0.0001),
                   name, source_type, vehicle_access, public_land_id
            FROM road_segments WHERE ST_Intersects(geometry, v_bounds)
        ),
        endpoint_counts AS (
            SELECT point,
                   COUNT(*) as connection_count,
                   array_agg(DISTINCT road_name) FILTER (WHERE road_name IS NOT NULL) as road_names,
                   MAX(vehicle_access::text)::vehicle_access_type as best_vehicle_access,
                   (array_agg(public_land_id) FILTER (WHERE public_land_id IS NOT NULL))[1] as public_land_id,
                   MAX(source_type::text)::road_source_type as source_type
            FROM endpoints GROUP BY point
        )
        SELECT ec.*, pl.managing_agency, pl.name as land_unit_name
        FROM endpoint_counts ec
        LEFT JOIN public_lands pl ON ec.public_land_id = pl.id
        WHERE ec.connection_count = 1 AND ec.public_land_id IS NOT NULL
    LOOP
        IF EXISTS (
            SELECT 1 FROM spots
            WHERE ST_DWithin(geometry::geography, rec.point::geography, 50)
        ) THEN CONTINUE; END IF;

        v_score := 25
            + CASE WHEN rec.best_vehicle_access IN ('high_clearance', '4wd') THEN 10 ELSE 0 END
            + CASE WHEN rec.road_names IS NOT NULL AND array_length(rec.road_names, 1) > 0 THEN 5 ELSE 0 END;

        INSERT INTO spots (
            name, latitude, longitude,
            kind, sub_kind, source,
            public_land_unit, public_land_manager,
            land_type, amenities, extra
        ) VALUES (
            COALESCE(rec.road_names[1], 'Dispersed spot'),
            ST_Y(rec.point), ST_X(rec.point),
            'dispersed_camping', 'derived',
            COALESCE(rec.source_type::TEXT, 'derived'),
            rec.land_unit_name, rec.managing_agency,
            'public',
            jsonb_build_object('vehicle_required', rec.best_vehicle_access::text),
            jsonb_build_object(
                'confidence_score', v_score,
                'derivation_reasons', ARRAY['Road terminus (dead-end)', 'On public land'],
                'is_passenger_reachable', rec.best_vehicle_access = 'passenger',
                'is_high_clearance_reachable', rec.best_vehicle_access IN ('passenger', 'high_clearance'),
                'is_road_accessible', TRUE,
                'status', 'derived',
                'road_name', rec.road_names[1]
            )
        );

        v_spots_created := v_spots_created + 1;
    END LOOP;

    RETURN v_spots_created;
END;
$$;
