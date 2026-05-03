-- Bulk-delete derived spots flagged as near a public-land edge OR at a
-- road intersection. Companion to delete_outside_polygon_derived_spots_in_bbox
-- (20260229) and delete_rough_intersection_spots_in_bbox (20260239).
--
-- Use case: the per-spot compute / mark-intersection passes flagged a lot
-- of derived spots, and triaging them one-by-one isn't practical. The
-- user judged that the flagged set has more false-positives than real
-- spots, so this nukes them in one shot.
--
-- Scoped by bbox so it can be run state-by-state. Dry-run returns counts
-- (broken out by which flag matched) without deleting.

CREATE OR REPLACE FUNCTION public.delete_flagged_edge_intersection_spots_in_bbox(
    p_west    NUMERIC,
    p_south   NUMERIC,
    p_east    NUMERIC,
    p_north   NUMERIC,
    p_dry_run BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    matched_edge          INTEGER,  -- has near_public_land_edge=true (regardless of intersection flag)
    matched_intersection  INTEGER,  -- has at_road_intersection=true (regardless of edge flag)
    matched_either        INTEGER,  -- distinct rows matching at least one flag
    deleted_rows          INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
SET statement_timeout = '300s'
AS $$
DECLARE
  v_edge          INTEGER := 0;
  v_intersection  INTEGER := 0;
  v_either        INTEGER := 0;
  v_deleted       INTEGER := 0;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE (extra->>'near_public_land_edge')::BOOLEAN = TRUE),
    COUNT(*) FILTER (WHERE (extra->>'at_road_intersection')::BOOLEAN  = TRUE),
    COUNT(*) FILTER (WHERE
         (extra->>'near_public_land_edge')::BOOLEAN = TRUE
      OR (extra->>'at_road_intersection')::BOOLEAN  = TRUE
    )
    INTO v_edge, v_intersection, v_either
    FROM public.spots
   WHERE sub_kind = 'derived'
     AND latitude  BETWEEN p_south AND p_north
     AND longitude BETWEEN p_west  AND p_east
     AND (
          (extra->>'near_public_land_edge')::BOOLEAN = TRUE
       OR (extra->>'at_road_intersection')::BOOLEAN  = TRUE
     );

  IF NOT p_dry_run AND v_either > 0 THEN
    DELETE FROM public.spots
     WHERE sub_kind = 'derived'
       AND latitude  BETWEEN p_south AND p_north
       AND longitude BETWEEN p_west  AND p_east
       AND (
            (extra->>'near_public_land_edge')::BOOLEAN = TRUE
         OR (extra->>'at_road_intersection')::BOOLEAN  = TRUE
       );
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
  END IF;

  RETURN QUERY SELECT v_edge, v_intersection, v_either, v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_flagged_edge_intersection_spots_in_bbox TO service_role;

COMMENT ON FUNCTION public.delete_flagged_edge_intersection_spots_in_bbox IS
  'Deletes derived spots in bbox flagged near_public_land_edge=true OR at_road_intersection=true. Returns counts per-flag and total deleted. Dry-run available.';
