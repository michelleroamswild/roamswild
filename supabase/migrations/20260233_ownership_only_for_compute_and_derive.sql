-- Restrict the compute / derive functions to ownership polygons only, so we
-- can safely import Designation rows (National Monuments, Wilderness Areas,
-- ACECs, WSAs) for display + "what monument am I in?" queries without
-- polluting edge-distance / outside-polygon / derive-gate logic.
--
-- Ownership filter:
--   - Category IN ('Fee', 'Easement')                — actual ownership / parcels
--   - OR (Mang_Type='TRIB' AND Category='Proclamation') — tribal reservations,
--     since 94% of TRIB rows are Proclamation in PAD-US (treaty-established)
--   - OR Category IS NULL                            — legacy rows imported
--     before the category column existed
--
-- This filter is shared by:
--   1. compute_spot_public_land_edge_distance / its backfill
--   2. derive_spots_from_linked_roads
--   3. derive_blm_spots
--   4. derive_dead_end_spots
--
-- get_public_lands_in_bbox keeps returning everything (admin map wants to
-- see Designations); callers can pass p_fee_only=true to scope.

-- ============================================================
-- 1. compute_spot_public_land_edge_distance — used by the edge flag
-- ============================================================
CREATE OR REPLACE FUNCTION public.compute_spot_public_land_edge_distance(p_spot_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  v_distance NUMERIC;
  v_geometry GEOMETRY;
BEGIN
  SELECT geometry INTO v_geometry
  FROM public.spots
  WHERE id = p_spot_id;

  IF v_geometry IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT
    MIN(ST_Distance(v_geometry::geography, ST_Boundary(boundary)::geography))
    INTO v_distance
  FROM public.public_lands
  WHERE ST_Covers(boundary, v_geometry)
    AND (
      category IN ('Fee', 'Easement')
      OR (managing_agency = 'TRIB' AND category = 'Proclamation')
      OR category IS NULL
    );

  RETURN v_distance;
END;
$$;

CREATE OR REPLACE FUNCTION public.backfill_spot_public_land_edge_distance(p_batch_size INT DEFAULT 500)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_processed INT;
BEGIN
  WITH batch AS (
    SELECT id, geometry
    FROM public.spots
    WHERE sub_kind = 'derived'
      AND kind IN ('dispersed_camping', 'informal_camping', 'established_campground')
      AND NOT (extra ? 'outside_public_land_polygon')
    ORDER BY id
    LIMIT p_batch_size
  ),
  computed AS (
    SELECT
      b.id,
      (
        SELECT MIN(ST_Distance(b.geometry::geography, ST_Boundary(pl.boundary)::geography))
        FROM public.public_lands pl
        WHERE ST_Covers(pl.boundary, b.geometry)
          AND (
            pl.category IN ('Fee', 'Easement')
            OR (pl.managing_agency = 'TRIB' AND pl.category = 'Proclamation')
            OR pl.category IS NULL
          )
      ) AS dist
    FROM batch b
  )
  UPDATE public.spots s
  SET extra = COALESCE(s.extra, '{}'::jsonb) || jsonb_build_object(
    'meters_from_public_land_edge', c.dist,
    'near_public_land_edge', COALESCE(c.dist < 50, false),
    'outside_public_land_polygon', (c.dist IS NULL)
  )
  FROM computed c
  WHERE s.id = c.id;

  GET DIAGNOSTICS v_processed = ROW_COUNT;
  RETURN v_processed;
END;
$$;


-- ============================================================
-- 2. derive_spots_from_linked_roads — endpoint-in-ownership-polygon gate
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
        SELECT pl.managing_agency, pl.name
          INTO v_managing_agency, v_land_unit_name
          FROM public.public_lands pl
          WHERE ST_Covers(pl.boundary, rec.actual_point)
            AND (
              pl.category IN ('Fee', 'Easement')
              OR (pl.managing_agency = 'TRIB' AND pl.category = 'Proclamation')
              OR pl.category IS NULL
            )
          ORDER BY ST_Area(pl.boundary) ASC
          LIMIT 1;

        IF v_managing_agency IS NULL THEN CONTINUE; END IF;

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
-- 3. derive_blm_spots — same ownership filter
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
        SELECT pl.id, pl.name
          INTO v_blm_id, v_blm_name
          FROM public.public_lands pl
          WHERE pl.managing_agency = 'BLM'
            AND pl.dispersed_camping_allowed = TRUE
            AND ST_Covers(pl.boundary, rec.actual_point)
            AND (
              pl.category IN ('Fee', 'Easement')
              OR pl.category IS NULL
            )
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
-- 4. derive_dead_end_spots — same ownership filter
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
            AND (
              pl.category IN ('Fee', 'Easement')
              OR (pl.managing_agency = 'TRIB' AND pl.category = 'Proclamation')
              OR pl.category IS NULL
            )
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
