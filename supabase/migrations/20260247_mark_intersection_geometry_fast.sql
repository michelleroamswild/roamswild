-- 20260245 switched mark_road_intersection_spots to geography-based
-- ST_DWithin for symmetric meter-accurate distances. Correct, but the
-- geography cast bypasses the GIST index in practice and a 200-spot
-- bbox times out at 30s+.
--
-- Revert to geometry-based ST_DWithin (which IS index-supported) but
-- bump the default threshold from the original 0.00005° (~5m) to
-- 0.00014° (~15m latitude / ~12m longitude at 37°N). Still asymmetric
-- but the latitude-direction is the wider one — symmetry isn't worth
-- the 100x perf hit.
--
-- p_threshold_meters renamed to p_threshold_degrees to be honest about
-- units. Old (5m) → new (~15m at typical western-US latitudes).

DROP FUNCTION IF EXISTS public.mark_road_intersection_spots(
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, BOOLEAN, NUMERIC
);

CREATE OR REPLACE FUNCTION public.mark_road_intersection_spots(
    p_west             NUMERIC,
    p_south            NUMERIC,
    p_east             NUMERIC,
    p_north            NUMERIC,
    p_dry_run          BOOLEAN DEFAULT FALSE,
    p_threshold_degrees NUMERIC DEFAULT 0.00014
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
  CREATE TEMP TABLE _candidates ON COMMIT DROP AS
  SELECT s.id, s.geometry
    FROM public.spots s
   WHERE s.sub_kind = 'derived'
     AND s.latitude  BETWEEN p_south AND p_north
     AND s.longitude BETWEEN p_west  AND p_east;

  CREATE TEMP TABLE _intersection_ids ON COMMIT DROP AS
  SELECT c.id
    FROM _candidates c
    JOIN public.road_segments rs
      ON ST_DWithin(rs.geometry, c.geometry, p_threshold_degrees)
   GROUP BY c.id
  HAVING COUNT(DISTINCT regexp_replace(
            COALESCE(rs.external_id, rs.id::text),
            '^[a-z]+_', ''
         )) >= 2;

  v_total         := (SELECT COUNT(*) FROM _candidates);
  v_intersections := (SELECT COUNT(*) FROM _intersection_ids);

  IF NOT p_dry_run THEN
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
