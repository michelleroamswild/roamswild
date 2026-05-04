-- 20260248's track gate calls ST_GeomFromText(wkt, 4326), but the edge
-- function's buildLineStringWKT helper emits EWKT with the SRID prefix
-- ("SRID=4326;LINESTRING(...)"). ST_GeomFromText would reject that
-- header and the gate would return empty for every track. Swap to
-- ST_GeomFromEWKT, which parses the prefix natively.

CREATE OR REPLACE FUNCTION public.filter_inputs_by_ownership(
    p_west   NUMERIC,
    p_south  NUMERIC,
    p_east   NUMERIC,
    p_north  NUMERIC,
    p_points JSONB DEFAULT '[]'::jsonb,
    p_tracks JSONB DEFAULT '[]'::jsonb
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

  SELECT ST_Union(ST_CollectionExtract(ST_MakeValid(boundary), 3))
    INTO v_union
    FROM public.public_lands
   WHERE ST_Intersects(boundary, v_bbox)
     AND (
       category IN ('Fee', 'Easement')
       OR (managing_agency = 'TRIB' AND category = 'Proclamation')
       OR category IS NULL
     );

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
   WHERE ST_Intersects(v_union, ST_GeomFromEWKT(elem->>'wkt'));

  RETURN QUERY SELECT v_pts, v_trks;
END;
$$;
