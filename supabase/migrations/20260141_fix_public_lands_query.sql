-- Fix get_public_lands_nearby to use boundary intersection instead of centroid distance
-- This ensures large polygons are returned even if their centroid is far from the search point

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
                 -- Clip the boundary to the search area for better performance
                 ST_Intersection(pl.boundary, v_search_area),
                 0.0005  -- Slightly less aggressive simplification
             )
             ELSE NULL
        END as boundary_simplified
    FROM public_lands pl
    WHERE ST_Intersects(pl.boundary, v_search_area)
      AND pl.dispersed_camping_allowed = TRUE  -- Only show lands where camping is allowed
    ORDER BY
        -- Prioritize by how much of the polygon overlaps the search area
        ST_Area(ST_Intersection(pl.boundary, v_search_area)) DESC
    LIMIT 100;  -- Increased limit for better coverage
END;
$$;

-- Grant execute to anon and authenticated roles
GRANT EXECUTE ON FUNCTION get_public_lands_nearby TO anon;
GRANT EXECUTE ON FUNCTION get_public_lands_nearby TO authenticated;
