-- Bump get_public_lands_in_bbox's statement timeout to 60s. After importing
-- Designation rows (Grand Staircase ~1.9M acres, Bears Ears ~1.4M acres,
-- etc.), ST_SimplifyPreserveTopology on the bbox-result set occasionally
-- exceeds PostgREST's default 8s cap. The simplification work scales with
-- vertex count of the largest polygons, not row count.

CREATE OR REPLACE FUNCTION public.get_public_lands_in_bbox(
    p_west NUMERIC,
    p_south NUMERIC,
    p_east NUMERIC,
    p_north NUMERIC,
    p_simplify_degrees NUMERIC DEFAULT 0.0003,
    p_limit INT DEFAULT 5000,
    p_fee_only BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    managing_agency TEXT,
    source_type TEXT,
    category TEXT,
    geojson JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
SET statement_timeout = '60s'
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
    pl.category,
    ST_AsGeoJSON(
      ST_SimplifyPreserveTopology(pl.boundary, p_simplify_degrees)
    )::jsonb AS geojson
  FROM public.public_lands pl
  WHERE ST_Intersects(pl.boundary, v_bbox)
    AND (NOT p_fee_only OR pl.category IN ('Fee', 'Easement'))
  ORDER BY ST_Area(pl.boundary) DESC
  LIMIT p_limit;
END;
$$;
