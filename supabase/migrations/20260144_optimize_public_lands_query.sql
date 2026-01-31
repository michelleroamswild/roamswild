-- Optimize public lands query for performance
-- Use centroid for fast filtering, skip expensive geometry operations

CREATE OR REPLACE FUNCTION get_public_lands_nearby(
    p_lat NUMERIC,
    p_lng NUMERIC,
    p_radius_miles NUMERIC DEFAULT 15,
    p_include_geometry BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    managing_agency TEXT,
    land_type TEXT,
    dispersed_camping_allowed BOOLEAN,
    boundary_simplified GEOMETRY
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_center GEOMETRY;
    v_radius_meters NUMERIC;
    v_expanded_radius NUMERIC;
BEGIN
    v_center := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326);
    v_radius_meters := p_radius_miles * 1609.34;
    -- Use a larger radius for centroid check to catch large polygons
    v_expanded_radius := v_radius_meters * 3;

    RETURN QUERY
    SELECT
        pl.id,
        pl.name,
        pl.managing_agency,
        pl.land_type,
        pl.dispersed_camping_allowed,
        CASE WHEN p_include_geometry
             THEN ST_SimplifyPreserveTopology(pl.boundary, 0.005)  -- More aggressive simplification
             ELSE NULL
        END as boundary_simplified
    FROM public_lands pl
    WHERE ST_DWithin(pl.centroid::geography, v_center::geography, v_expanded_radius)
    ORDER BY
        -- Prioritize larger lands and those closer to search point
        CASE WHEN ST_DWithin(pl.centroid::geography, v_center::geography, v_radius_meters) THEN 0 ELSE 1 END,
        pl.area_acres DESC NULLS LAST
    LIMIT 50;
END;
$$;

-- Also create a faster version that skips geometry entirely for quick checks
CREATE OR REPLACE FUNCTION get_public_lands_names_nearby(
    p_lat NUMERIC,
    p_lng NUMERIC,
    p_radius_miles NUMERIC DEFAULT 15
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    managing_agency TEXT,
    dispersed_camping_allowed BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_center GEOMETRY;
    v_radius_meters NUMERIC;
BEGIN
    v_center := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326);
    v_radius_meters := p_radius_miles * 1609.34 * 2;  -- 2x radius for coverage

    RETURN QUERY
    SELECT
        pl.id,
        pl.name,
        pl.managing_agency,
        pl.dispersed_camping_allowed
    FROM public_lands pl
    WHERE ST_DWithin(pl.centroid::geography, v_center::geography, v_radius_meters)
    ORDER BY pl.area_acres DESC NULLS LAST
    LIMIT 50;
END;
$$;

GRANT EXECUTE ON FUNCTION get_public_lands_names_nearby TO anon;
GRANT EXECUTE ON FUNCTION get_public_lands_names_nearby TO authenticated;
