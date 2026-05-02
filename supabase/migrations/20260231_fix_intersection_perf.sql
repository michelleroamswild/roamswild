-- Performance fix for mark_road_intersection_spots: the previous body did
-- a per-spot subquery with `ST_DWithin(geography, geography, 5)`, which
-- defeated the GIST index because the geography cast forces materialization
-- of every candidate before distance is computed. On 17k derived spots ×
-- ~100k road_segments that timed out at the cloud's statement-timeout cap.
--
-- New body uses a single bulk JOIN with planar `ST_DWithin(geometry, geometry, 0.00005)`
-- — `0.00005` degrees ≈ 4.4–5.6m depending on latitude, which is fine for
-- "two roads meeting at the same point" detection. Planar distance keeps
-- the spatial index in play for both sides of the join, and bbox filtering
-- on the spots side limits the candidate pool.

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
      ON ST_DWithin(rs.geometry, s.geometry, 0.00005)  -- ~5m in degrees
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
