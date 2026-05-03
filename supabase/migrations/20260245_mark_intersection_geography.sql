-- Tighten / widen the intersection detector. Two changes to
-- mark_road_intersection_spots:
--
--   1. Use ST_DWithin against ::geography instead of geometry. The old
--      0.00005-degree threshold (~5.5m at 37°N latitude, ~4.4m in
--      longitude) was both too tight AND asymmetric — T-intersections
--      where the main road is more than ~5m from the spot's coords
--      slipped through. Geography gives proper meters and is symmetric.
--
--   2. Bump the threshold from ~5m → 15m. Most T-intersections we miss
--      today are 6–12m off because of OSM coordinate precision (way
--      points snapped to grid, simplification at import). 15m catches
--      those without picking up too many real dead-ends near (but not
--      on) intersections.
--
-- Caller-driven so a future tuning session can pass a different value
-- without a new migration.

-- Drop the old 5-arg signature first so PostgREST's function resolver
-- doesn't see two candidates and 503 with PGRST203.
DROP FUNCTION IF EXISTS public.mark_road_intersection_spots(NUMERIC, NUMERIC, NUMERIC, NUMERIC, BOOLEAN);

CREATE OR REPLACE FUNCTION public.mark_road_intersection_spots(
    p_west             NUMERIC,
    p_south            NUMERIC,
    p_east             NUMERIC,
    p_north            NUMERIC,
    p_dry_run          BOOLEAN DEFAULT FALSE,
    p_threshold_meters NUMERIC DEFAULT 15
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
      ON ST_DWithin(rs.geometry::geography, c.geometry::geography, p_threshold_meters)
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
