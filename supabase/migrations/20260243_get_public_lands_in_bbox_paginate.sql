-- Phase 1A of the DispersedExplorer DB-backed-polygons cutover.
-- Two changes to get_public_lands_in_bbox, both backwards-additive:
--
--   1. Add p_offset for client-side pagination. PostgREST silently caps
--      RPC results at 1000 rows; combined with our internal p_limit of
--      5000 and dense states like UT (post-Designation import), some
--      smaller polygons get truncated. Pagination lets the client page
--      through until a partial page comes back.
--
--   2. Widen the return shape with the columns the explorer needs to
--      replace the live-fetched ArcGIS / Overpass / BLM-proxy data:
--        - unit_name           (NPS unit-type matching for restricted areas)
--        - land_type           (PAD-US designation label, ≈ protectionTitle)
--        - area_acres          (display + rendering decisions)
--        - dispersed_camping_allowed (camping legality signal already on table)
--        - centroid_geojson    (cheap point + distance computations client-side)
--
--      The existing { id, name, managing_agency, source_type, category,
--      geojson } columns are preserved unchanged so AdminSpotReview's
--      polygon loader keeps working without modification.
--
-- DROP-then-CREATE because adding columns to RETURNS TABLE isn't allowed
-- via CREATE OR REPLACE. CASCADE clears any historical overloads PostgREST
-- might have cached.

DROP FUNCTION IF EXISTS public.get_public_lands_in_bbox CASCADE;

CREATE OR REPLACE FUNCTION public.get_public_lands_in_bbox(
    p_west             NUMERIC,
    p_south            NUMERIC,
    p_east             NUMERIC,
    p_north            NUMERIC,
    p_simplify_degrees NUMERIC DEFAULT 0.0003,
    p_limit            INT     DEFAULT 5000,
    p_fee_only         BOOLEAN DEFAULT FALSE,
    p_offset           INT     DEFAULT 0
)
RETURNS TABLE (
    id                        UUID,
    name                      TEXT,
    unit_name                 TEXT,
    managing_agency           TEXT,
    source_type               TEXT,
    category                  TEXT,
    land_type                 TEXT,
    area_acres                NUMERIC,
    dispersed_camping_allowed BOOLEAN,
    centroid_geojson          JSONB,
    geojson                   JSONB
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
    pl.unit_name,
    pl.managing_agency,
    pl.source_type::TEXT AS source_type,
    pl.category,
    pl.land_type,
    pl.area_acres,
    pl.dispersed_camping_allowed,
    ST_AsGeoJSON(pl.centroid)::jsonb AS centroid_geojson,
    ST_AsGeoJSON(
      ST_SimplifyPreserveTopology(pl.boundary, p_simplify_degrees)
    )::jsonb AS geojson
  FROM public.public_lands pl
  WHERE ST_Intersects(pl.boundary, v_bbox)
    AND (NOT p_fee_only OR pl.category IN ('Fee', 'Easement'))
  -- Tiebreaker on id makes pagination stable when multiple polygons
  -- have identical ST_Area.
  ORDER BY ST_Area(pl.boundary) DESC, pl.id
  LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_lands_in_bbox TO anon, authenticated, service_role;
