-- Add a new quality flag for derived spots that sit at a road intersection
-- rather than at a true dead-end. Surfaces in extra as
-- `at_road_intersection` so the admin review UI can filter on it.
--
-- Background: the dead-end detector counts how many road *endpoints* snap
-- to the same grid cell. It misses T-intersections where one road's
-- endpoint lands mid-segment of a longer road — that longer road's
-- geometry passes through the point but doesn't have an endpoint there.
-- Death Ridge Road (Henry Mountains, UT) is the canonical example: 21
-- short tracks branched off a continuous BLM dirt road, and each
-- branch's endpoint became a "dispersed spot" even though every one of
-- them was actually a T-intersection with Death Ridge Road.
--
-- The fix here is two-step:
--   1. This migration's RPC scans existing derived spots and flags ones
--      sitting on top of multiple road geometries as intersections.
--   2. A follow-up migration (separately discussed) updates the derive
--      functions to skip these candidates at insert time so we don't
--      keep producing them.
--
-- Threshold: 5m. OSM coordinates can drift, but two roads meeting at the
-- same point are usually mapped within a meter or two. 5m gives a small
-- safety margin without sweeping in nearby-but-not-touching tracks.
--
-- Distinct-by-external_id is used so the road_segments duplicates we
-- discovered earlier don't inflate the count.

CREATE OR REPLACE FUNCTION public.mark_road_intersection_spots(
    p_west    NUMERIC,
    p_south   NUMERIC,
    p_east    NUMERIC,
    p_north   NUMERIC,
    p_dry_run BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    derived_total      INTEGER,   -- derived spots scanned
    intersections      INTEGER,   -- number of those at a road intersection
    updated_rows       INTEGER    -- 0 when dry-run; intersections otherwise
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
  -- Compute the set of intersection-spot ids in the bbox. Two roads are
  -- considered "meeting" if their geometries are within 5m of the spot's
  -- coords AND they have distinct external_ids (or, for rows lacking an
  -- external_id, distinct row ids — falling back so MVUM-only rows aren't
  -- silently merged).
  CREATE TEMP TABLE _intersection_ids ON COMMIT DROP AS
  SELECT s.id
  FROM public.spots s
  WHERE s.sub_kind = 'derived'
    AND s.latitude  BETWEEN p_south AND p_north
    AND s.longitude BETWEEN p_west  AND p_east
    AND (
      SELECT COUNT(DISTINCT COALESCE(rs.external_id, rs.id::text))
      FROM public.road_segments rs
      WHERE ST_DWithin(rs.geometry::geography, s.geometry::geography, 5)
    ) >= 2;

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

GRANT EXECUTE ON FUNCTION public.mark_road_intersection_spots TO service_role;

COMMENT ON FUNCTION public.mark_road_intersection_spots IS
  'Sets extra.at_road_intersection=true on derived spots within bbox that lie within 5m of 2+ distinct road segments (T-intersection false positives).';
