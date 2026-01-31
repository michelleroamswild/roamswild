-- Relax public lands query to show all lands, not just those with dispersed camping
-- Users need to see NPS lands too (to know where NOT to camp)

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
    v_search_area GEOMETRY;
    v_radius_meters NUMERIC;
BEGIN
    v_center := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326);
    v_radius_meters := p_radius_miles * 1609.34;

    -- Create a circular search area
    v_search_area := ST_Buffer(v_center::geography, v_radius_meters)::geometry;

    RETURN QUERY
    SELECT
        pl.id,
        pl.name,
        pl.managing_agency,
        pl.land_type,
        pl.dispersed_camping_allowed,
        CASE WHEN p_include_geometry
             THEN ST_SimplifyPreserveTopology(
                 ST_MakeValid(pl.boundary),
                 0.001
             )
             ELSE NULL
        END as boundary_simplified
    FROM public_lands pl
    WHERE ST_Intersects(ST_MakeValid(pl.boundary), v_search_area)
    ORDER BY
        pl.area_acres DESC NULLS LAST
    LIMIT 100;
END;
$$;
