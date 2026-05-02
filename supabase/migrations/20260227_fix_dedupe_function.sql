-- Fix dedupe_derived_spots_in_bbox: the previous implementation used a
-- CREATE TEMP TABLE ... AS construction that lost the cluster_size column
-- between statements ("column \"cluster_size\" does not exist"). Rewriting
-- as straight CTEs — same semantics, no temp table.

CREATE OR REPLACE FUNCTION public.dedupe_derived_spots_in_bbox(
    p_west    NUMERIC,
    p_south   NUMERIC,
    p_east    NUMERIC,
    p_north   NUMERIC,
    p_dry_run BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    dup_groups     INTEGER,
    redundant_rows INTEGER,
    deleted_rows   INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_dup_groups   INTEGER := 0;
  v_redundant    INTEGER := 0;
  v_deleted      INTEGER := 0;
BEGIN
  -- Single-pass count: clusters with size>1 contribute one survivor (rn=1)
  -- and (size-1) deletables (rn>1). We count those here without touching
  -- the table, regardless of dry-run.
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
      ) AS sz
    FROM public.spots
    WHERE sub_kind = 'derived'
      AND latitude  BETWEEN p_south AND p_north
      AND longitude BETWEEN p_west  AND p_east
  )
  SELECT
    COUNT(*) FILTER (WHERE rn = 1 AND sz > 1)::INTEGER,
    COUNT(*) FILTER (WHERE rn > 1)::INTEGER
    INTO v_dup_groups, v_redundant
    FROM clusters;

  -- Actual delete only when not dry-run and there's something to drop.
  IF NOT p_dry_run AND v_redundant > 0 THEN
    WITH clusters AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY round(latitude::numeric,  5),
                       round(longitude::numeric, 5)
          ORDER BY created_at, id
        ) AS rn
      FROM public.spots
      WHERE sub_kind = 'derived'
        AND latitude  BETWEEN p_south AND p_north
        AND longitude BETWEEN p_west  AND p_east
    )
    DELETE FROM public.spots
    WHERE id IN (SELECT id FROM clusters WHERE rn > 1);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
  END IF;

  RETURN QUERY SELECT v_dup_groups, v_redundant, v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dedupe_derived_spots_in_bbox TO service_role;
