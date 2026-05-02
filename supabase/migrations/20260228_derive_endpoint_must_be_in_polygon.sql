-- Prevent future false-positive derived spots in private inholdings, valley
-- corridors, and checkerboard private parcels.
--
-- Background: all three derive functions (derive_spots_from_linked_roads,
-- derive_blm_spots, derive_dead_end_spots) gate inserts on the road's
-- import-time `public_land_id` linkage. That linkage is set once at OSM
-- import time using bbox overlap, so a road can be linked to a BLM polygon
-- because its midpoint or starting end touches BLM, while its dead-end
-- (where the spot lives) ends up on private ranchland just downhill.
--
-- Examples found in cleanup: dozens of Long Valley corridor spots on US-89,
-- Bears Ears checkerboard spots, Aneth-area spots inside Navajo Nation that
-- our derive thought were BLM. After PAD-US is fully loaded these all show
-- `outside_public_land_polygon: true`, but by then the row already exists.
--
-- Fix: at derive time, instead of trusting the road's stored public_land_id,
-- look up which public_lands polygon actually COVERS the endpoint. If
-- nothing covers it, skip the spot. If something does, use that polygon's
-- agency / unit name in the new row. ST_Covers (boundary-inclusive) matches
-- what compute_spot_public_land_edge_distance does, so the same point is
-- consistently classified across functions.
--
-- Cost: one GIST + ST_Covers lookup per dead-end candidate. Cheap.

-- ============================================================
-- 1. derive_spots_from_linked_roads — main pipeline path
-- ============================================================
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
    v_score NUMERIC;
    v_managing_agency TEXT;
    v_land_unit_name TEXT;
    v_source TEXT;
    v_extra JSONB;
BEGIN
    v_bounds := ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326);

    FOR rec IN
        WITH road_endpoints AS (
            SELECT ST_SnapToGrid(rs.start_point, 0.0001) as snapped_point,
                   rs.start_point as actual_point,
                   rs.name as road_name, rs.vehicle_access,
                   rs.source_type
            FROM road_segments rs
            WHERE ST_Intersects(rs.start_point, v_bounds)
            UNION ALL
            SELECT ST_SnapToGrid(rs.end_point, 0.0001),
                   rs.end_point, rs.name, rs.vehicle_access,
                   rs.source_type
            FROM road_segments rs
            WHERE ST_Intersects(rs.end_point, v_bounds)
        ),
        endpoint_counts AS (
            SELECT snapped_point,
                   (array_agg(actual_point))[1] as actual_point,
                   COUNT(*) as connection_count,
                   array_agg(DISTINCT road_name) FILTER (WHERE road_name IS NOT NULL) as road_names,
                   MAX(vehicle_access::text)::vehicle_access_type as best_vehicle_access,
                   (array_agg(source_type))[1] as source_type
            FROM road_endpoints
            GROUP BY snapped_point
        )
        SELECT * FROM endpoint_counts WHERE connection_count = 1
    LOOP
        -- Look up which public_lands polygon actually COVERS the dead-end.
        -- This replaces the old "trust the road's import-time public_land_id"
        -- gate. ST_Covers includes boundary points; smaller polygon wins on
        -- ties so a tribal/state-trust inholding inside a larger BLM polygon
        -- is preferred over the BLM one.
        SELECT pl.managing_agency, pl.name
          INTO v_managing_agency, v_land_unit_name
          FROM public.public_lands pl
          WHERE ST_Covers(pl.boundary, rec.actual_point)
          ORDER BY ST_Area(pl.boundary) ASC
          LIMIT 1;

        IF v_managing_agency IS NULL THEN CONTINUE; END IF;

        -- Skip if any spot already exists within 50m
        IF EXISTS (
            SELECT 1 FROM spots
            WHERE ST_DWithin(geometry::geography, rec.actual_point::geography, 50)
        ) THEN CONTINUE; END IF;

        v_score := CASE
            WHEN v_managing_agency = 'BLM' THEN 35
            WHEN v_managing_agency IN ('USFS', 'FS') THEN 35
            ELSE 30
        END;

        v_source := COALESCE(rec.source_type::TEXT, 'derived');

        v_extra := jsonb_build_object(
            'confidence_score', v_score,
            'derivation_reasons', ARRAY[
                'Road terminus (dead-end)',
                CASE
                    WHEN v_managing_agency = 'BLM' THEN 'On BLM land'
                    WHEN v_managing_agency IN ('USFS', 'FS') THEN 'On National Forest land'
                    ELSE 'On public land'
                END
            ],
            'is_passenger_reachable', rec.best_vehicle_access = 'passenger',
            'is_high_clearance_reachable', rec.best_vehicle_access IN ('passenger', 'high_clearance'),
            'is_road_accessible', TRUE,
            'status', 'derived',
            'road_name', rec.road_names[1]
        );

        INSERT INTO spots (
            name, latitude, longitude,
            kind, sub_kind, source,
            public_land_unit, public_land_manager,
            land_type, amenities, extra
        ) VALUES (
            COALESCE(rec.road_names[1], 'Dispersed spot'),
            ST_Y(rec.actual_point), ST_X(rec.actual_point),
            'dispersed_camping', 'derived', v_source,
            v_land_unit_name, v_managing_agency,
            'public',
            jsonb_build_object('vehicle_required', rec.best_vehicle_access::text),
            v_extra
        );

        v_spots_created := v_spots_created + 1;
    END LOOP;

    RETURN v_spots_created;
END;
$$;


-- ============================================================
-- 2. derive_blm_spots — BLM-only fallback path
-- ============================================================
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
    v_score NUMERIC;
    v_blm_id UUID;
    v_blm_name TEXT;
BEGIN
    v_bounds := ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326);

    FOR rec IN
        WITH road_endpoints AS (
            SELECT ST_SnapToGrid(rs.start_point, 0.0001) as point,
                   rs.start_point as actual_point,
                   rs.name as road_name, rs.vehicle_access
            FROM road_segments rs
            WHERE rs.source_type = 'osm' AND ST_Intersects(rs.geometry, v_bounds)
            UNION ALL
            SELECT ST_SnapToGrid(rs.end_point, 0.0001),
                   rs.end_point, rs.name, rs.vehicle_access
            FROM road_segments rs
            WHERE rs.source_type = 'osm' AND ST_Intersects(rs.geometry, v_bounds)
        ),
        endpoint_counts AS (
            SELECT point,
                   (array_agg(actual_point))[1] as actual_point,
                   COUNT(*) as connection_count,
                   array_agg(DISTINCT road_name) FILTER (WHERE road_name IS NOT NULL) as road_names,
                   MAX(vehicle_access::text)::vehicle_access_type as best_vehicle_access
            FROM road_endpoints
            GROUP BY point
        )
        SELECT * FROM endpoint_counts WHERE connection_count = 1
    LOOP
        -- Endpoint must be inside a BLM polygon that allows dispersed camping.
        SELECT pl.id, pl.name
          INTO v_blm_id, v_blm_name
          FROM public.public_lands pl
          WHERE pl.managing_agency = 'BLM'
            AND pl.dispersed_camping_allowed = TRUE
            AND ST_Covers(pl.boundary, rec.actual_point)
          ORDER BY ST_Area(pl.boundary) ASC
          LIMIT 1;

        IF v_blm_id IS NULL THEN CONTINUE; END IF;

        IF EXISTS (
            SELECT 1 FROM spots
            WHERE ST_DWithin(geometry::geography, rec.actual_point::geography, 50)
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
            COALESCE(rec.road_names[1], 'Unnamed Road'),
            ST_Y(rec.actual_point), ST_X(rec.actual_point),
            'dispersed_camping', 'derived', 'osm',
            v_blm_name, 'BLM',
            'public',
            jsonb_build_object('vehicle_required', rec.best_vehicle_access::text),
            jsonb_build_object(
                'confidence_score', v_score,
                'score_breakdown', jsonb_build_object(
                    'base', 25,
                    'vehicle_bonus', CASE WHEN rec.best_vehicle_access IN ('high_clearance', '4wd') THEN 10 ELSE 0 END,
                    'name_bonus', CASE WHEN rec.road_names IS NOT NULL AND array_length(rec.road_names, 1) > 0 THEN 5 ELSE 0 END
                ),
                'derivation_reasons', ARRAY['Road terminus (dead-end)', 'On BLM land'],
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


-- ============================================================
-- 3. derive_dead_end_spots — older fallback (still callable)
-- ============================================================
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
    v_managing_agency TEXT;
    v_land_unit_name TEXT;
BEGIN
    v_bounds := ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326);

    FOR rec IN
        WITH endpoints AS (
            SELECT ST_SnapToGrid(start_point, 0.0001) as point,
                   start_point as actual_point,
                   name as road_name, source_type, vehicle_access
            FROM road_segments WHERE ST_Intersects(geometry, v_bounds)
            UNION ALL
            SELECT ST_SnapToGrid(end_point, 0.0001),
                   end_point, name, source_type, vehicle_access
            FROM road_segments WHERE ST_Intersects(geometry, v_bounds)
        ),
        endpoint_counts AS (
            SELECT point,
                   (array_agg(actual_point))[1] as actual_point,
                   COUNT(*) as connection_count,
                   array_agg(DISTINCT road_name) FILTER (WHERE road_name IS NOT NULL) as road_names,
                   MAX(vehicle_access::text)::vehicle_access_type as best_vehicle_access,
                   MAX(source_type::text)::road_source_type as source_type
            FROM endpoints GROUP BY point
        )
        SELECT * FROM endpoint_counts WHERE connection_count = 1
    LOOP
        SELECT pl.managing_agency, pl.name
          INTO v_managing_agency, v_land_unit_name
          FROM public.public_lands pl
          WHERE ST_Covers(pl.boundary, rec.actual_point)
          ORDER BY ST_Area(pl.boundary) ASC
          LIMIT 1;

        IF v_managing_agency IS NULL THEN CONTINUE; END IF;

        IF EXISTS (
            SELECT 1 FROM spots
            WHERE ST_DWithin(geometry::geography, rec.actual_point::geography, 50)
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
            ST_Y(rec.actual_point), ST_X(rec.actual_point),
            'dispersed_camping', 'derived',
            COALESCE(rec.source_type::TEXT, 'derived'),
            v_land_unit_name, v_managing_agency,
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
