-- Return public_lands polygons inside a bbox as GeoJSON, with optional
-- topology-preserving simplification. Used by surfaces that want to draw
-- the polygons (admin spot-review map, eventually the explore map once
-- we cut over from live Esri calls).
--
-- The simplification tolerance is in degrees. ~0.0003 ≈ 33m at the
-- equator, plenty for visualization at admin/state-level zooms while
-- keeping the JSON payload small.

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
  WHERE pl.boundary && v_bbox
  ORDER BY ST_Area(pl.boundary) DESC  -- Big polygons first; helps z-ordering
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_lands_in_bbox TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_public_lands_in_bbox IS
'Returns public_lands polygons intersecting bbox as simplified GeoJSON. Used by admin/explore map overlays.';
