-- 20260240 introduced a bbox-wide ST_Union to amortize the per-spot
-- cost, but on Utah ST_Union failed with a GEOS topology error:
--
--   lwgeom_unaryunion_prec: GEOS Error: TopologyException: unable to
--   assign free hole to a shell at -109.00..., 38.92...
--
-- One or more ownership polygons (PAD-US / blm_sma) have invalid topology
-- (self-intersection, free hole, etc.) that the per-spot variant got
-- away with because it only unioned 1-3 polygons covering each spot,
-- but the bbox-wide variant tries to union dozens-to-hundreds at once
-- and the dirty inputs aggregate into an unsolvable cascaded union.
--
-- Fix: ST_MakeValid() each polygon before unioning. ST_CollectionExtract
-- with type 3 (POLYGON) drops any GEOMETRYCOLLECTION fragments
-- ST_MakeValid can produce on degenerate input (slivers etc.). The cost
-- is paid once per bbox call, not per spot, so it's still cheap.

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

  SELECT ST_Union(ST_CollectionExtract(ST_MakeValid(boundary), 3))
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
