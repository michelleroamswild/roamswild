-- Two fixes for mark_road_intersection_spots:
--
-- 1. False-positive intersections caused by the same OSM way appearing in
--    road_segments under two external_id formats:
--      'osm_10107229'  ← newer prefix convention
--      '10107229'      ← older no-prefix convention
--    Both refer to the same OSM way. Our DISTINCT external_id check counted
--    them as two separate roads → flagged as intersection.
--
--    Fix: strip the leading "<source>_" prefix before comparing, so
--    OSM-way 10107229 collapses to a single signature regardless of how
--    it was imported.
--
-- 2. Stale flags. The previous body only ADDED the flag — never cleared it.
--    Re-running with the fix would leave already-flagged false positives
--    permanently flagged. Make it idempotent: set or unset based on current
--    detection.

CREATE OR REPLACE FUNCTION public.mark_road_intersection_spots(
    p_west    NUMERIC,
    p_south   NUMERIC,
    p_east    NUMERIC,
    p_north   NUMERIC,
    p_dry_run BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    derived_total      INTEGER,
    intersections      INTEGER,
    updated_rows       INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
SET statement_timeout = '600s'
AS $$
DECLARE
  v_total         INTEGER := 0;
  v_intersections INTEGER := 0;
  v_updated       INTEGER := 0;
BEGIN
  -- All derived spots in bbox (whether or not they're at an intersection
  -- right now). We need this set so we can clear the flag on rows that
  -- no longer qualify.
  CREATE TEMP TABLE _candidates ON COMMIT DROP AS
  SELECT s.id, s.geometry
    FROM public.spots s
   WHERE s.sub_kind = 'derived'
     AND s.latitude  BETWEEN p_south AND p_north
     AND s.longitude BETWEEN p_west  AND p_east;

  -- Subset that currently qualifies as at-intersection. Same JOIN as
  -- before but with normalized external_id comparison: strip a leading
  -- "<lowercase_word>_" prefix so 'osm_10107229' and '10107229' match.
  CREATE TEMP TABLE _intersection_ids ON COMMIT DROP AS
  SELECT c.id
    FROM _candidates c
    JOIN public.road_segments rs
      ON ST_DWithin(rs.geometry, c.geometry, 0.00005)
   GROUP BY c.id
  HAVING COUNT(DISTINCT regexp_replace(
            COALESCE(rs.external_id, rs.id::text),
            '^[a-z]+_', ''
         )) >= 2;

  v_total         := (SELECT COUNT(*) FROM _candidates);
  v_intersections := (SELECT COUNT(*) FROM _intersection_ids);

  IF NOT p_dry_run THEN
    -- Set the flag for spots that ARE at intersections, unset for the rest.
    UPDATE public.spots s
       SET extra = CASE
         WHEN i.id IS NOT NULL THEN
           COALESCE(s.extra, '{}'::jsonb) || jsonb_build_object('at_road_intersection', TRUE)
         ELSE
           COALESCE(s.extra, '{}'::jsonb) - 'at_road_intersection'
       END
      FROM _candidates c
      LEFT JOIN _intersection_ids i ON c.id = i.id
     WHERE s.id = c.id
       -- Skip rows whose state already matches — avoid useless UPDATEs.
       AND (
         (i.id IS NOT NULL AND COALESCE((s.extra->>'at_road_intersection')::BOOLEAN, FALSE) = FALSE)
         OR
         (i.id IS NULL     AND s.extra ? 'at_road_intersection')
       );
    GET DIAGNOSTICS v_updated = ROW_COUNT;
  END IF;

  RETURN QUERY SELECT v_total, v_intersections, v_updated;
END;
$$;
