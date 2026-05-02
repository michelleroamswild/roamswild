-- Add a `category` column to `public_lands` so we can distinguish ownership
-- polygons (`Fee` / `Easement`) from designation/proclamation/marine overlay
-- polygons. Without this, querying "what owns this point" returns a stack
-- of admin-region overlays + the actual fee parcel, which is what the
-- explore map ends up rendering.
--
-- Values come straight from PAD-US 4.0's Category field:
--   Fee          — actual ownership/fee parcels (the only thing most
--                  surfaces want to see)
--   Easement     — conservation easements
--   Designation  — protected-area designations on top of fee land
--                  (Wilderness Study Areas, ACECs, etc.)
--   Proclamation — boundary lines of larger units (e.g., a National
--                  Forest's outer boundary, regardless of inholdings)
--   Marine       — marine areas

ALTER TABLE public.public_lands
  ADD COLUMN IF NOT EXISTS category TEXT;

COMMENT ON COLUMN public.public_lands.category IS
'PAD-US Category: Fee | Easement | Designation | Proclamation | Marine. NULL for rows imported before this column existed.';

-- Quick lookup index for the common filter "show me only Fee polygons."
CREATE INDEX IF NOT EXISTS idx_public_lands_category
  ON public.public_lands(category)
  WHERE category IS NOT NULL;

-- Update insert_public_land_simple so the Python importer can pass Category
-- through. Existing callers that don't pass it (the on-demand edge function)
-- still work — the param has a default of NULL.
CREATE OR REPLACE FUNCTION insert_public_land_simple(
    p_external_id TEXT,
    p_source_type TEXT,
    p_name TEXT,
    p_managing_agency TEXT,
    p_land_type TEXT,
    p_boundary_wkt TEXT,
    p_area_acres NUMERIC,
    p_dispersed_camping_allowed BOOLEAN DEFAULT TRUE,
    p_category TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_id UUID;
    v_boundary GEOMETRY;
BEGIN
    v_boundary := ST_GeomFromText(p_boundary_wkt, 4326);

    INSERT INTO public_lands (
        external_id,
        source_type,
        name,
        managing_agency,
        land_type,
        boundary,
        area_acres,
        dispersed_camping_allowed,
        category
    )
    VALUES (
        p_external_id,
        p_source_type::land_source_type,
        p_name,
        p_managing_agency,
        p_land_type,
        v_boundary,
        p_area_acres,
        p_dispersed_camping_allowed,
        p_category
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION insert_public_land_simple(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, BOOLEAN, TEXT) TO anon, authenticated, service_role;

-- Also update get_public_lands_in_bbox to filter by Fee + Easement when
-- requested. Default behavior unchanged (returns all rows so existing
-- callers don't change semantics) — pass `p_fee_only := true` to scope.
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

GRANT EXECUTE ON FUNCTION public.get_public_lands_in_bbox(NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, INT, BOOLEAN) TO anon, authenticated, service_role;

-- Drop the older 6-arg signature so PostgREST doesn't ambiguously route to
-- the wrong overload.
DROP FUNCTION IF EXISTS public.get_public_lands_in_bbox(NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, INT);
