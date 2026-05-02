-- Switch get_public_lands_in_bbox from envelope-only intersects (`&&`) to
-- true geometric intersects (`ST_Intersects`). The bbox-only filter
-- returned polygons whose rectangular envelope overlapped the viewport
-- even when the polygon's actual shape didn't — making irregular polygons
-- like Capitol Reef NP appear at points many miles outside the park.
--
-- ST_Intersects still uses the GIST index for the cheap pass; only
-- candidates passing that get the precise geometry test, so the perf
-- penalty is small.

CREATE OR REPLACE FUNCTION public.get_public_lands_in_bbox(
    p_west NUMERIC,
    p_south NUMERIC,
    p_east NUMERIC,
    p_north NUMERIC,
    p_simplify_degrees NUMERIC DEFAULT 0.0003,
    p_limit INT DEFAULT 5000
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    managing_agency TEXT,
    source_type TEXT,
    geojson JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_bbox GEOMETRY;
BEGIN
  v_bbox := ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326);

  RETURN QUERY
  SELECT
    pl.id,
    pl.name,
    pl.managing_agency,
    pl.source_type::TEXT AS source_type,
    ST_AsGeoJSON(
      ST_SimplifyPreserveTopology(pl.boundary, p_simplify_degrees)
    )::jsonb AS geojson
  FROM public.public_lands pl
  WHERE ST_Intersects(pl.boundary, v_bbox)  -- True geometry intersect (was &&)
  ORDER BY ST_Area(pl.boundary) DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_lands_in_bbox TO anon, authenticated, service_role;
