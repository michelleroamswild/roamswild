-- Server-side ownership-polygon gate for the save-derived-spots edge
-- function. Two filters in one RPC because they share the expensive
-- bbox-wide ST_Union(public_lands.boundary) prefix:
--
--   1. Spots whose lat/lng isn't ST_Covered by any ownership polygon.
--      Belt-and-suspenders for the case where the client's polygon
--      fetch race-failed and let through a junk spot. The derive_*
--      RPCs already enforce this for their own outputs, but
--      save-derived-spots inserts what the CLIENT computed, bypassing
--      that gate.
--
--   2. OSM tracks (LINESTRING WKTs) whose geometry doesn't ST_Intersect
--      any ownership polygon. Today every track Overpass returns gets
--      upserted into road_segments — including urban streets and
--      residential roads — bloating the table and producing noise on
--      every road overlay render. This filter keeps the gate-aware
--      tracks (the ones that actually connect dispersed camping) and
--      drops the rest.
--
-- Ownership filter mirrors compute_spot_public_land_edge_distance:
-- Fee + Easement + tribal Proclamation + NULL category. Designations
-- are excluded so we don't accidentally accept a spot that's only
-- inside a Wilderness/NM overlay but not on its parent Fee polygon.
--
-- Returns indices (1-based for clarity in JSON, but TS wraps it back
-- to 0-based on its end) of inputs that pass. Empty arrays for inputs
-- that didn't pass — caller filters its local arrays accordingly.

CREATE OR REPLACE FUNCTION public.filter_inputs_by_ownership(
    p_west   NUMERIC,
    p_south  NUMERIC,
    p_east   NUMERIC,
    p_north  NUMERIC,
    p_points JSONB DEFAULT '[]'::jsonb,  -- [{idx: int, lat: num, lng: num}, ...]
    p_tracks JSONB DEFAULT '[]'::jsonb   -- [{idx: int, wkt: text}, ...]
)
RETURNS TABLE (
    point_idx_passing INTEGER[],
    track_idx_passing INTEGER[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
SET statement_timeout = '60s'
AS $$
DECLARE
  v_bbox   GEOMETRY;
  v_union  GEOMETRY;
  v_pts    INTEGER[] := ARRAY[]::INTEGER[];
  v_trks   INTEGER[] := ARRAY[]::INTEGER[];
BEGIN
  v_bbox := ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326);

  -- One bbox-wide union of ownership polygons. ST_MakeValid handles the
  -- dirty PAD-US polygons that broke earlier ST_Union attempts (Henry
  -- Mountains coincident-polygon case in migration 20260241).
  SELECT ST_Union(ST_CollectionExtract(ST_MakeValid(boundary), 3))
    INTO v_union
    FROM public.public_lands
   WHERE ST_Intersects(boundary, v_bbox)
     AND (
       category IN ('Fee', 'Easement')
       OR (managing_agency = 'TRIB' AND category = 'Proclamation')
       OR category IS NULL
     );

  -- No ownership polygons → nothing passes. Return empty arrays so the
  -- caller skips inserts entirely instead of falling back to "save
  -- everything."
  IF v_union IS NULL THEN
    RETURN QUERY SELECT v_pts, v_trks;
    RETURN;
  END IF;

  SELECT COALESCE(
           array_agg((elem->>'idx')::INTEGER ORDER BY (elem->>'idx')::INTEGER),
           ARRAY[]::INTEGER[]
         )
    INTO v_pts
    FROM jsonb_array_elements(p_points) AS elem
   WHERE ST_Covers(
           v_union,
           ST_SetSRID(ST_MakePoint(
             (elem->>'lng')::NUMERIC,
             (elem->>'lat')::NUMERIC
           ), 4326)
         );

  SELECT COALESCE(
           array_agg((elem->>'idx')::INTEGER ORDER BY (elem->>'idx')::INTEGER),
           ARRAY[]::INTEGER[]
         )
    INTO v_trks
    FROM jsonb_array_elements(p_tracks) AS elem
   -- ST_GeomFromEWKT accepts the "SRID=4326;LINESTRING(...)" prefix that
   -- the edge function's buildLineStringWKT helper emits. Plain
   -- ST_GeomFromText would reject the SRID= header.
   WHERE ST_Intersects(v_union, ST_GeomFromEWKT(elem->>'wkt'));

  RETURN QUERY SELECT v_pts, v_trks;
END;
$$;

GRANT EXECUTE ON FUNCTION public.filter_inputs_by_ownership(
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, JSONB, JSONB
) TO service_role;
