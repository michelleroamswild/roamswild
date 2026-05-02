-- Fix the false-positive "edge" flag caused by coincident ownership polygons.
--
-- Death Ridge case (Henry Mountains, UT): a spot inside a BLM area is
-- contained by THREE overlapping rows in public_lands:
--   - 'Bureau of Land Management'   (source=blm_sma)
--   - 'Kanab Field Office'          (source=pad_us)
--   - 'National Public Lands'       (source=pad_us)
-- Each row's boundary is slightly different (different upstream sources,
-- simplification at import time). MIN(ST_Distance to each polygon's
-- boundary) returns the small distance between two coincident-but-
-- not-identical polygons → the spot is reported as 7m from "edge" even
-- though it's hundreds of meters inside actual public land.
--
-- Fix: take ST_Union of all containing polygons first, then compute
-- distance to the union's boundary. The union has only the EXTERNAL
-- boundary — shared internal edges between coincident polygons get
-- eliminated by ST_Union, which is what we actually want.
--
-- Same change applied to the recompute and backfill helpers so all three
-- agree.

-- ============================================================
-- 1. compute_spot_public_land_edge_distance — union-aware
-- ============================================================
CREATE OR REPLACE FUNCTION public.compute_spot_public_land_edge_distance(p_spot_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  v_distance NUMERIC;
  v_geometry GEOMETRY;
  v_union    GEOMETRY;
BEGIN
  SELECT geometry INTO v_geometry FROM public.spots WHERE id = p_spot_id;
  IF v_geometry IS NULL THEN RETURN NULL; END IF;

  SELECT ST_Union(boundary)
    INTO v_union
    FROM public.public_lands
   WHERE ST_Covers(boundary, v_geometry)
     AND (
       category IN ('Fee', 'Easement')
       OR (managing_agency = 'TRIB' AND category = 'Proclamation')
       OR category IS NULL
     );

  IF v_union IS NULL THEN RETURN NULL; END IF;

  v_distance := ST_Distance(v_geometry::geography, ST_Boundary(v_union)::geography);
  RETURN v_distance;
END;
$$;


-- ============================================================
-- 2. backfill_spot_public_land_edge_distance — union-aware
-- ============================================================
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
        SELECT
          CASE
            WHEN ST_Union(pl.boundary) IS NULL THEN NULL
            ELSE ST_Distance(b.geometry::geography, ST_Boundary(ST_Union(pl.boundary))::geography)
          END
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
       'near_public_land_edge', COALESCE(c.dist < 50, FALSE),
       'outside_public_land_polygon', (c.dist IS NULL)
     )
    FROM computed c
   WHERE s.id = c.id;

  GET DIAGNOSTICS v_processed = ROW_COUNT;
  RETURN v_processed;
END;
$$;


-- ============================================================
-- 3. recompute_spot_polygon_flags_in_bbox — union-aware
-- ============================================================
CREATE OR REPLACE FUNCTION public.recompute_spot_polygon_flags_in_bbox(
    p_west    NUMERIC,
    p_south   NUMERIC,
    p_east    NUMERIC,
    p_north   NUMERIC,
    p_dry_run BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    scanned          INTEGER,
    became_outside   INTEGER,
    became_edge      INTEGER,
    became_inside    INTEGER,
    no_change        INTEGER,
    updated_rows     INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
SET statement_timeout = '600s'
AS $$
DECLARE
  v_scanned         INTEGER := 0;
  v_became_outside  INTEGER := 0;
  v_became_edge     INTEGER := 0;
  v_became_inside   INTEGER := 0;
  v_no_change       INTEGER := 0;
  v_updated         INTEGER := 0;
BEGIN
  CREATE TEMP TABLE _recompute ON COMMIT DROP AS
  SELECT
    s.id,
    (s.extra->>'outside_public_land_polygon')::BOOLEAN AS old_outside,
    (s.extra->>'near_public_land_edge')::BOOLEAN      AS old_edge,
    (
      SELECT
        CASE
          WHEN ST_Union(pl.boundary) IS NULL THEN NULL
          ELSE ST_Distance(s.geometry::geography, ST_Boundary(ST_Union(pl.boundary))::geography)
        END
      FROM public.public_lands pl
      WHERE ST_Covers(pl.boundary, s.geometry)
        AND (
          pl.category IN ('Fee', 'Easement')
          OR (pl.managing_agency = 'TRIB' AND pl.category = 'Proclamation')
          OR pl.category IS NULL
        )
    ) AS new_dist
  FROM public.spots s
  WHERE s.sub_kind = 'derived'
    AND s.latitude  BETWEEN p_south AND p_north
    AND s.longitude BETWEEN p_west  AND p_east
    AND (
      s.extra ? 'outside_public_land_polygon'
      OR s.extra ? 'near_public_land_edge'
      OR s.extra ? 'meters_from_public_land_edge'
    );

  v_scanned := (SELECT COUNT(*) FROM _recompute);

  SELECT
    COUNT(*) FILTER (WHERE new_dist IS NULL AND COALESCE(old_outside, FALSE) = FALSE),
    COUNT(*) FILTER (WHERE new_dist IS NOT NULL AND new_dist < 50  AND COALESCE(old_edge, FALSE) = FALSE),
    COUNT(*) FILTER (WHERE new_dist IS NOT NULL AND new_dist >= 50 AND (COALESCE(old_outside, FALSE) OR COALESCE(old_edge, FALSE))),
    COUNT(*) FILTER (WHERE
      (new_dist IS NULL     AND COALESCE(old_outside, FALSE) = TRUE) OR
      (new_dist IS NOT NULL AND new_dist <  50 AND COALESCE(old_edge, FALSE) = TRUE) OR
      (new_dist IS NOT NULL AND new_dist >= 50 AND COALESCE(old_outside, FALSE) = FALSE AND COALESCE(old_edge, FALSE) = FALSE)
    )
    INTO v_became_outside, v_became_edge, v_became_inside, v_no_change
    FROM _recompute;

  IF NOT p_dry_run THEN
    UPDATE public.spots s
       SET extra = COALESCE(s.extra, '{}'::jsonb) || jsonb_build_object(
           'meters_from_public_land_edge', r.new_dist,
           'near_public_land_edge', COALESCE(r.new_dist < 50, FALSE),
           'outside_public_land_polygon', (r.new_dist IS NULL)
       )
      FROM _recompute r
     WHERE s.id = r.id
       AND (
         (r.new_dist IS NULL)     <> COALESCE(r.old_outside, FALSE)
         OR
         (r.new_dist IS NOT NULL AND r.new_dist < 50) <> COALESCE(r.old_edge, FALSE)
       );
    GET DIAGNOSTICS v_updated = ROW_COUNT;
  END IF;

  RETURN QUERY SELECT v_scanned, v_became_outside, v_became_edge,
                      v_became_inside, v_no_change, v_updated;
END;
$$;
