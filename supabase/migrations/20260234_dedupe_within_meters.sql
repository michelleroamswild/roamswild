-- A wider-radius dedup that keeps the oldest derived spot per geographic
-- cluster. The earlier dedupe_derived_spots_in_bbox uses round-to-5dp
-- (~1.1m) — too tight for cases where two derive paths produced spots
-- 3-5m apart at the same physical intersection.
--
-- This version uses ST_ClusterDBSCAN with eps=0.0001° (~11m) on the spots'
-- geometry, which groups any spots within that radius into the same
-- cluster id. Per cluster, the oldest by created_at survives.
--
-- 11m matches our existing snap-to-grid distance in the derive functions
-- and is wide enough to merge near-duplicates at intersections without
-- collapsing genuinely distinct nearby spots (which our 50m derive-time
-- dedup would already block).

CREATE OR REPLACE FUNCTION public.dedupe_derived_spots_within_meters_in_bbox(
    p_west             NUMERIC,
    p_south            NUMERIC,
    p_east             NUMERIC,
    p_north            NUMERIC,
    p_cluster_radius_m NUMERIC DEFAULT 11.0,
    p_dry_run          BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    dup_groups     INTEGER,
    redundant_rows INTEGER,
    deleted_rows   INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
SET statement_timeout = '600s'
AS $$
DECLARE
  v_dup_groups INTEGER := 0;
  v_redundant  INTEGER := 0;
  v_deleted    INTEGER := 0;
  v_eps        NUMERIC;
BEGIN
  -- Convert meters to degrees (rough — same approximation everywhere else
  -- in this file): 0.0001° ≈ 11m at the equator.
  v_eps := p_cluster_radius_m / 110000.0;

  CREATE TEMP TABLE _clusters ON COMMIT DROP AS
  SELECT
    id,
    created_at,
    ST_ClusterDBSCAN(geometry, eps := v_eps, minpoints := 1)
      OVER () AS cid
  FROM public.spots
  WHERE sub_kind = 'derived'
    AND latitude  BETWEEN p_south AND p_north
    AND longitude BETWEEN p_west  AND p_east;

  CREATE TEMP TABLE _ranked ON COMMIT DROP AS
  SELECT
    id,
    cid,
    ROW_NUMBER() OVER (PARTITION BY cid ORDER BY created_at, id) AS rn,
    COUNT(*)    OVER (PARTITION BY cid)                          AS sz
  FROM _clusters;

  SELECT
    COUNT(DISTINCT cid) FILTER (WHERE sz > 1)::INTEGER,
    COUNT(*)            FILTER (WHERE rn > 1)::INTEGER
    INTO v_dup_groups, v_redundant
    FROM _ranked;

  IF NOT p_dry_run AND v_redundant > 0 THEN
    DELETE FROM public.spots
    WHERE id IN (SELECT id FROM _ranked WHERE rn > 1);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
  END IF;

  RETURN QUERY SELECT v_dup_groups, v_redundant, v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dedupe_derived_spots_within_meters_in_bbox TO service_role;
