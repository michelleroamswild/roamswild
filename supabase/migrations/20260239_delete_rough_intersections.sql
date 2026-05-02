-- Targeted delete for false-positive intersection spots that sit on tracks
-- nobody camps on. After backfilling at_road_intersection=true on derived
-- spots, the user spot-checked Moab-area trails (Hells Revenge, Cliffhanger,
-- etc.) and found a clear pattern: the *real* dispersed-camping intersections
-- are at junctions of moderately-rough roads where pulling off + camping is
-- plausible. The false positives are at junctions on extreme 4WD trails
-- (grade5 slickrock, very_horrible smoothness, 4wd-only) where there's no
-- actual camp surface.
--
-- The signal we already have for that is `extra.access_difficulty` — set by
-- the access-difficulty classifier from a combination of tracktype,
-- smoothness, four_wd_only, and surface tags. Targeting
-- `at_road_intersection=true AND access_difficulty IN (..)` lets us bulk
-- clean a class of obvious junk in one shot.
--
-- Bbox-scoped + dry-run, same shape as the other cleanup RPCs.

CREATE OR REPLACE FUNCTION public.delete_rough_intersection_spots_in_bbox(
    p_west          NUMERIC,
    p_south         NUMERIC,
    p_east          NUMERIC,
    p_north         NUMERIC,
    p_difficulties  TEXT[] DEFAULT ARRAY['extreme','hard'],
    p_dry_run       BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    matched      INTEGER,
    deleted_rows INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
SET statement_timeout = '120s'
AS $$
DECLARE
  v_matched INTEGER := 0;
  v_deleted INTEGER := 0;
BEGIN
  SELECT COUNT(*)::INTEGER INTO v_matched
    FROM public.spots
   WHERE sub_kind = 'derived'
     AND (extra->>'at_road_intersection')::BOOLEAN = TRUE
     AND (extra->>'access_difficulty') = ANY(p_difficulties)
     AND latitude  BETWEEN p_south AND p_north
     AND longitude BETWEEN p_west  AND p_east;

  IF NOT p_dry_run AND v_matched > 0 THEN
    DELETE FROM public.spots
     WHERE sub_kind = 'derived'
       AND (extra->>'at_road_intersection')::BOOLEAN = TRUE
       AND (extra->>'access_difficulty') = ANY(p_difficulties)
       AND latitude  BETWEEN p_south AND p_north
       AND longitude BETWEEN p_west  AND p_east;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
  END IF;

  RETURN QUERY SELECT v_matched, v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_rough_intersection_spots_in_bbox TO service_role;

COMMENT ON FUNCTION public.delete_rough_intersection_spots_in_bbox IS
  'Deletes derived spots in bbox where at_road_intersection=true AND access_difficulty IN p_difficulties. Default difficulties: extreme,hard.';
