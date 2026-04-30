-- Make `spots` the source of truth for the established-campgrounds read path.
-- Same shape as the old function (no edge fn or frontend changes needed).

CREATE OR REPLACE FUNCTION get_campgrounds_nearby(
    p_lat NUMERIC,
    p_lng NUMERIC,
    p_radius_miles NUMERIC DEFAULT 15
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    lat NUMERIC,
    lng NUMERIC,
    agency_name TEXT,
    is_reservable BOOLEAN,
    recreation_gov_url TEXT,
    distance_miles NUMERIC
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
    v_radius_meters := p_radius_miles * 1609.34;

    RETURN QUERY
    SELECT
        s.id,
        s.name,
        s.latitude AS lat,
        s.longitude AS lng,
        COALESCE(s.public_land_manager, 'Unknown') AS agency_name,
        COALESCE((s.amenities->>'reservation')::BOOLEAN, FALSE) AS is_reservable,
        s.extra->>'recreation_gov_url' AS recreation_gov_url,
        (ST_Distance(s.geometry::geography, v_center::geography) / 1609.34)::NUMERIC(6,2) AS distance_miles
    FROM spots s
    WHERE ST_DWithin(s.geometry::geography, v_center::geography, v_radius_meters)
      AND s.kind = 'established_campground'
    ORDER BY distance_miles
    LIMIT 100;
END;
$$;
