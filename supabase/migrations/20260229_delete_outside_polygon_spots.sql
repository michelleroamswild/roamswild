-- Bulk-delete derived spots flagged as outside any public-land polygon.
--
-- Triggered after manual review confirmed the `outside_public_land_polygon`
-- flag is reliable: spot-check tours of Long Valley (US-89 corridor), Bears
-- Ears checkerboard, and Aneth-extension Navajo land all matched the flag.
-- Since the flag is set by compute_spot_public_land_edge_distance using
-- ST_Covers against current PAD-US polygons, a TRUE flag means the spot's
-- coords don't fall inside any public-land polygon we have — i.e., almost
-- always private/inholding land where we shouldn't be deriving spots.
--
-- Bbox-scoped so the admin can pilot on a single state before going
-- nationwide. Dry-run mode lets them preview the count without deleting.

CREATE OR REPLACE FUNCTION public.delete_outside_polygon_derived_spots_in_bbox(
    p_west    NUMERIC,
    p_south   NUMERIC,
    p_east    NUMERIC,
    p_north   NUMERIC,
    p_dry_run BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    matched      INTEGER,   -- spots that match the deletion criteria
    deleted_rows INTEGER    -- 0 when dry-run; matched otherwise
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_matched INTEGER := 0;
  v_deleted INTEGER := 0;
BEGIN
  SELECT COUNT(*)::INTEGER INTO v_matched
  FROM public.spots
  WHERE sub_kind = 'derived'
    AND (extra->>'outside_public_land_polygon')::BOOLEAN = TRUE
    AND latitude  BETWEEN p_south AND p_north
    AND longitude BETWEEN p_west  AND p_east;

  IF NOT p_dry_run AND v_matched > 0 THEN
    DELETE FROM public.spots
    WHERE sub_kind = 'derived'
      AND (extra->>'outside_public_land_polygon')::BOOLEAN = TRUE
      AND latitude  BETWEEN p_south AND p_north
      AND longitude BETWEEN p_west  AND p_east;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
  END IF;

  RETURN QUERY SELECT v_matched, v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_outside_polygon_derived_spots_in_bbox TO service_role;

COMMENT ON FUNCTION public.delete_outside_polygon_derived_spots_in_bbox IS
  'Deletes derived spots in bbox where extra.outside_public_land_polygon=true. Dry-run available.';
