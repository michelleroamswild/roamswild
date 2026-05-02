-- Bump the per-call statement timeout for mark_road_intersection_spots so
-- it can finish on Utah scope (~17k derived spots × all road_segments
-- intersection check). The default PostgREST cap is 8s; setting a higher
-- LOCAL timeout inside SECURITY DEFINER lets this single function override
-- it while leaving the broader role default intact.

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
  CREATE TEMP TABLE _intersection_ids ON COMMIT DROP AS
  SELECT s.id
    FROM public.spots s
    JOIN public.road_segments rs
      ON ST_DWithin(rs.geometry, s.geometry, 0.00005)
   WHERE s.sub_kind = 'derived'
     AND s.latitude  BETWEEN p_south AND p_north
     AND s.longitude BETWEEN p_west  AND p_east
   GROUP BY s.id
  HAVING COUNT(DISTINCT COALESCE(rs.external_id, rs.id::text)) >= 2;

  SELECT COUNT(*)::INTEGER INTO v_total
    FROM public.spots s
   WHERE s.sub_kind = 'derived'
     AND s.latitude  BETWEEN p_south AND p_north
     AND s.longitude BETWEEN p_west  AND p_east;

  SELECT COUNT(*)::INTEGER INTO v_intersections FROM _intersection_ids;

  IF NOT p_dry_run AND v_intersections > 0 THEN
    UPDATE public.spots
       SET extra = COALESCE(extra, '{}'::jsonb)
                    || jsonb_build_object('at_road_intersection', TRUE)
     WHERE id IN (SELECT id FROM _intersection_ids);
    GET DIAGNOSTICS v_updated = ROW_COUNT;
  END IF;

  RETURN QUERY SELECT v_total, v_intersections, v_updated;
END;
$$;
