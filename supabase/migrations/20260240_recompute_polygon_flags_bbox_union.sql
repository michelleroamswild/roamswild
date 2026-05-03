-- Performance fix for recompute_spot_polygon_flags_in_bbox.
--
-- The 20260238 implementation does, for every flagged spot in the bbox,
-- a correlated subquery that ST_Union's all polygons containing that spot
-- and then ST_Distance's to the boundary. With Utah's ownership-polygon
-- density that subquery dominates: 1° tiles time out at the 600s cap,
-- and even small tiles take ~10s.
--
-- Rewrite: compute ONE bbox-wide union of all relevant ownership polygons
-- up front, then per spot do (a) ST_Covers against that union (outside
-- flag), and (b) ST_Distance to its boundary (edge / meters_from_edge).
-- PostGIS internally R-tree-indexes the boundary linestrings inside a
-- single complex geography, so per-spot distance is effectively
-- O(log segments) instead of repeating the union work each row.
--
-- Correctness vs. the per-spot union: for a spot S in polygon P1 with
-- adjacent ownership polygon P2 (touching but not covering S), per-spot
-- union is P1 alone; bbox-wide union is P1 ∪ P2 and eliminates the shared
-- internal edge between them. The bbox-wide answer is the same as or
-- LARGER than the per-spot answer, which is exactly the Death Ridge fix
-- direction from 20260238 — coincident-polygon shared edges should not
-- count as a public-land edge. So this is both faster and at least as
-- correct as the per-spot variant.

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
  v_bbox            GEOMETRY;
  v_union           GEOMETRY;
  v_boundary_geog   GEOGRAPHY;
  v_scanned         INTEGER := 0;
  v_became_outside  INTEGER := 0;
  v_became_edge     INTEGER := 0;
  v_became_inside   INTEGER := 0;
  v_no_change       INTEGER := 0;
  v_updated         INTEGER := 0;
BEGIN
  v_bbox := ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326);

  -- One bbox-wide union of ownership polygons. Polygons that intersect
  -- the bbox are kept whole (not clipped) so spots near the bbox edge
  -- measure against the polygon's true boundary, not an artificial cut.
  -- Filter mirrors compute_spot_public_land_edge_distance: ownership
  -- only — Fee, Easement, tribal Proclamation, or NULL category.
  SELECT ST_Union(boundary)
    INTO v_union
    FROM public.public_lands
   WHERE ST_Intersects(boundary, v_bbox)
     AND (
       category IN ('Fee', 'Easement')
       OR (managing_agency = 'TRIB' AND category = 'Proclamation')
       OR category IS NULL
     );

  IF v_union IS NOT NULL THEN
    v_boundary_geog := ST_Boundary(v_union)::geography;
  END IF;

  CREATE TEMP TABLE _recompute ON COMMIT DROP AS
  SELECT
    s.id,
    (s.extra->>'outside_public_land_polygon')::BOOLEAN AS old_outside,
    (s.extra->>'near_public_land_edge')::BOOLEAN      AS old_edge,
    CASE
      WHEN v_union IS NULL THEN NULL
      WHEN NOT ST_Covers(v_union, s.geometry) THEN NULL
      ELSE ST_Distance(s.geometry::geography, v_boundary_geog)
    END AS new_dist
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

GRANT EXECUTE ON FUNCTION public.recompute_spot_polygon_flags_in_bbox TO service_role;
