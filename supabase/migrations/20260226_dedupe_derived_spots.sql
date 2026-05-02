-- One-shot cleanup function for duplicate derived spots.
--
-- Background:
--   - The derive functions (derive_spots_from_linked_roads, derive_blm_spots,
--     derive_dead_end_spots) gate inserts behind an `IF EXISTS … ST_DWithin(50m)`
--     check. That works inside one transaction but loses to itself when the
--     bulk-analysis driver issued multiple overlapping-bbox calls in parallel
--     — each transaction only saw committed data from the others, so they
--     all inserted at the same coord.
--   - Result: hotspots like (38.491445, -109.618657) ended up with 14 rows
--     of the same dead-end, written across two name conventions
--     ("Unnamed Track" from the newer derive path, "Dispersed N{lat} W{lng}"
--     from the older fallback path).
--
-- This function dedupes within a bbox so it can be piloted on Utah before
-- being unleashed nationwide. It clusters derived spots by lat/lng rounded
-- to 5 decimal places (~1.1m at the equator, tighter on lng at higher
-- latitudes), keeps the oldest row in each cluster by created_at, and
-- deletes the rest.
--
-- Tiebreaker: created_at ASC, then id (stable). Oldest wins because that's
-- what the original 50m dedup gate intended — first writer takes the slot.
--
-- A dry-run mode lets the admin preview the count before any deletion.

CREATE OR REPLACE FUNCTION public.dedupe_derived_spots_in_bbox(
    p_west    NUMERIC,
    p_south   NUMERIC,
    p_east    NUMERIC,
    p_north   NUMERIC,
    p_dry_run BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    dup_groups        INTEGER,
    redundant_rows    INTEGER,
    deleted_rows      INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_dup_groups     INTEGER := 0;
  v_redundant_rows INTEGER := 0;
  v_deleted_rows   INTEGER := 0;
BEGIN
  -- One pass to gather metrics + the IDs we'd delete. Reused for both
  -- dry-run reporting and the actual delete.
  CREATE TEMP TABLE _dedupe_targets ON COMMIT DROP AS
  WITH clusters AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY round(latitude::numeric,  5),
                     round(longitude::numeric, 5)
        ORDER BY created_at, id
      ) AS rn,
      COUNT(*) OVER (
        PARTITION BY round(latitude::numeric,  5),
                     round(longitude::numeric, 5)
      ) AS cluster_size
    FROM public.spots
    WHERE sub_kind = 'derived'
      AND latitude  >= p_south AND latitude  <= p_north
      AND longitude >= p_west  AND longitude <= p_east
  )
  SELECT id, rn, cluster_size FROM clusters WHERE cluster_size > 1;

  -- Stats are independent of dry-run.
  SELECT COUNT(DISTINCT cluster_size) FILTER (WHERE TRUE)  -- placeholder
    INTO v_dup_groups
    FROM (SELECT 1) _;
  SELECT
    COUNT(*) FILTER (WHERE rn = 1),       -- distinct dup groups (one survivor each)
    COUNT(*) FILTER (WHERE rn > 1)        -- rows that would/will be deleted
    INTO v_dup_groups, v_redundant_rows
    FROM _dedupe_targets;

  IF NOT p_dry_run AND v_redundant_rows > 0 THEN
    DELETE FROM public.spots
    WHERE id IN (SELECT id FROM _dedupe_targets WHERE rn > 1);
    GET DIAGNOSTICS v_deleted_rows = ROW_COUNT;
  END IF;

  RETURN QUERY SELECT v_dup_groups, v_redundant_rows, v_deleted_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dedupe_derived_spots_in_bbox TO service_role;

COMMENT ON FUNCTION public.dedupe_derived_spots_in_bbox IS
  'Removes duplicate derived spots clustered at the same lat/lng (5dp, ~1m) within bbox. Keeps oldest by created_at. Set p_dry_run=true to preview counts.';
