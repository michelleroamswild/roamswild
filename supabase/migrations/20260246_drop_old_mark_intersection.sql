-- 20260245 added a new mark_road_intersection_spots overload with a
-- p_threshold_meters arg, but the old 5-arg signature was never dropped.
-- PostgREST sees both and refuses to route (PGRST203). Drop the old one
-- explicitly.

DROP FUNCTION IF EXISTS public.mark_road_intersection_spots(
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, BOOLEAN
);
