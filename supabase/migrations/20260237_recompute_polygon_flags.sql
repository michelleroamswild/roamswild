-- Recompute the outside_public_land_polygon / near_public_land_edge /
-- meters_from_public_land_edge flags for derived spots that already have
-- them set. After migration 20260233 narrowed the compute function to
-- ownership polygons only (dropping Designation/Proclamation overlays),
-- many spots flagged "edge" because of a Designation internal boundary
-- should now reclassify — and many "outside" spots that were really
-- inside a Designation should reclassify to inside an ownership polygon.
--
-- The original `backfill_spot_public_land_edge_distance` only processes
-- spots that DON'T have the keys yet — it skips ones that have already
-- been computed once. This function explicitly re-evaluates them.

CREATE OR REPLACE FUNCTION public.recompute_spot_polygon_flags_in_bbox(
    p_west    NUMERIC,
    p_south   NUMERIC,
    p_east    NUMERIC,
    p_north   NUMERIC,
    p_dry_run BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    scanned          INTEGER,
    became_outside   INTEGER,    -- previously edge or inside, now outside polygon
    became_edge      INTEGER,    -- not edge before, now within 50m of edge
    became_inside    INTEGER,    -- previously edge or outside, now well inside
    no_change        INTEGER,
    updated_rows     INTEGER     -- 0 when dry-run; otherwise total of the three "became_*" buckets
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
  -- Compute the new edge distance for every derived spot in bbox that
  -- already has any of the three keys set (i.e., compute has run on it
  -- before). This avoids touching freshly-derived spots with no flags.
  CREATE TEMP TABLE _recompute ON COMMIT DROP AS
  SELECT
    s.id,
    -- Old state
    (s.extra->>'outside_public_land_polygon')::BOOLEAN AS old_outside,
    (s.extra->>'near_public_land_edge')::BOOLEAN      AS old_edge,
    -- Recomputed distance (NULL = no ownership polygon contains the spot)
    (
      SELECT MIN(ST_Distance(s.geometry::geography, ST_Boundary(pl.boundary)::geography))
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

  -- Categorize the result for reporting.
  SELECT
    COUNT(*) FILTER (WHERE new_dist IS NULL AND COALESCE(old_outside, FALSE) = FALSE),
    COUNT(*) FILTER (WHERE new_dist IS NOT NULL AND new_dist < 50  AND COALESCE(old_edge,    FALSE) = FALSE),
    COUNT(*) FILTER (WHERE new_dist IS NOT NULL AND new_dist >= 50 AND (COALESCE(old_outside,FALSE) OR COALESCE(old_edge, FALSE))),
    COUNT(*) FILTER (WHERE
      (new_dist IS NULL     AND COALESCE(old_outside,FALSE) = TRUE) OR
      (new_dist IS NOT NULL AND new_dist <  50 AND COALESCE(old_edge,FALSE) = TRUE) OR
      (new_dist IS NOT NULL AND new_dist >= 50 AND COALESCE(old_outside,FALSE) = FALSE AND COALESCE(old_edge,FALSE) = FALSE)
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
       -- Only update rows whose state actually changes — saves a lot of
       -- writes since most spots will land in the no-change bucket.
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
