-- Clear the cached edge-flag keys (`meters_from_public_land_edge`,
-- `near_public_land_edge`, `outside_public_land_polygon`) from spot rows
-- whose containing public_lands polygon set may have just changed —
-- typically after a PAD-US bulk import drops new polygons into a region.
--
-- The chunked backfill function only processes spots that don't already
-- have these keys, so clearing them lets it re-flag the affected subset
-- without churning the rest of the table.

CREATE OR REPLACE FUNCTION public.clear_spot_edge_flags_in_bbox(
    p_west NUMERIC,
    p_south NUMERIC,
    p_east NUMERIC,
    p_north NUMERIC
)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE public.spots
  SET extra = extra - 'meters_from_public_land_edge'
                    - 'near_public_land_edge'
                    - 'outside_public_land_polygon'
  WHERE latitude BETWEEN p_south AND p_north
    AND longitude BETWEEN p_west AND p_east
    AND kind IN ('dispersed_camping', 'informal_camping', 'established_campground')
    AND (extra ? 'meters_from_public_land_edge'
         OR extra ? 'near_public_land_edge'
         OR extra ? 'outside_public_land_polygon');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
