-- Phase 1B of the DispersedExplorer DB-backed-polygons cutover.
-- Adds protect_class (PAD-US IUCN_Cat) to public_lands so the explorer's
-- spot-detail panel can show "IUCN 1b · Wilderness Area" without re-
-- fetching from external ArcGIS endpoints.
--
-- Also includes:
--   * insert_public_land_simple RPC accepts p_protect_class (NULL default
--     so the on-demand edge function and existing callers don't break).
--   * get_public_lands_in_bbox returns it.
--   * backfill_public_lands_protect_class RPC for bulk-patching existing
--     rows by external_id from a JSONB array of {external_id, protect_
--     class} pairs. The backfill script reads PAD-US 4.0 locally and
--     calls this RPC in chunks.

-- ============================================================
-- 1. Add the column
-- ============================================================
ALTER TABLE public.public_lands
  ADD COLUMN IF NOT EXISTS protect_class TEXT;

COMMENT ON COLUMN public.public_lands.protect_class IS
'PAD-US IUCN_Cat — IUCN protected-area class (Ia, Ib, II, III, IV, V, VI) or "Other Conservation Area". NULL when unknown / not classified (most blm_sma rows, easements without IUCN, etc.).';

-- ============================================================
-- 2. insert_public_land_simple — accept p_protect_class
-- ============================================================
CREATE OR REPLACE FUNCTION insert_public_land_simple(
    p_external_id TEXT,
    p_source_type TEXT,
    p_name TEXT,
    p_managing_agency TEXT,
    p_land_type TEXT,
    p_boundary_wkt TEXT,
    p_area_acres NUMERIC,
    p_dispersed_camping_allowed BOOLEAN DEFAULT TRUE,
    p_category TEXT DEFAULT NULL,
    p_protect_class TEXT DEFAULT NULL
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
        category,
        protect_class
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
        p_category,
        p_protect_class
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION insert_public_land_simple(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, BOOLEAN, TEXT, TEXT
) TO anon, authenticated, service_role;

-- ============================================================
-- 3. get_public_lands_in_bbox — return protect_class
-- ============================================================
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
    protect_class             TEXT,
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
    pl.protect_class,
    pl.area_acres,
    pl.dispersed_camping_allowed,
    ST_AsGeoJSON(pl.centroid)::jsonb AS centroid_geojson,
    ST_AsGeoJSON(
      ST_SimplifyPreserveTopology(pl.boundary, p_simplify_degrees)
    )::jsonb AS geojson
  FROM public.public_lands pl
  WHERE ST_Intersects(pl.boundary, v_bbox)
    AND (NOT p_fee_only OR pl.category IN ('Fee', 'Easement'))
  ORDER BY ST_Area(pl.boundary) DESC, pl.id
  LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_lands_in_bbox TO anon, authenticated, service_role;

-- ============================================================
-- 4. backfill_public_lands_protect_class — bulk-update RPC
-- ============================================================
-- Takes a JSONB array of {external_id, protect_class} objects and applies
-- the matching protect_class to each row. Updates only rows whose value
-- actually changes (IS DISTINCT FROM) so re-runs are cheap. Returns the
-- number of rows updated.
--
-- The backfill driver reads PAD-US locally and calls this in chunks of
-- ~500 — one round-trip per chunk vs. one per row.

CREATE OR REPLACE FUNCTION backfill_public_lands_protect_class(p_updates JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_updated INTEGER := 0;
BEGIN
  WITH src AS (
    SELECT
      (elem->>'external_id')::TEXT AS external_id,
      NULLIF(elem->>'protect_class', '')::TEXT AS protect_class
    FROM jsonb_array_elements(p_updates) AS elem
  )
  UPDATE public.public_lands pl
     SET protect_class = src.protect_class
    FROM src
   WHERE pl.external_id = src.external_id
     AND pl.protect_class IS DISTINCT FROM src.protect_class;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION backfill_public_lands_protect_class(JSONB) TO service_role;
