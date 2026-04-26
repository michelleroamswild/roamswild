-- Update get_dispersed_spots to surface the new land-entity columns
-- (land_unit_name, land_protect_class, land_protection_title) so they
-- flow back to the frontend on cache hits.

DROP FUNCTION IF EXISTS get_dispersed_spots(NUMERIC, NUMERIC, NUMERIC, TEXT, NUMERIC, BOOLEAN, INTEGER);

CREATE OR REPLACE FUNCTION get_dispersed_spots(
    p_lat NUMERIC,
    p_lng NUMERIC,
    p_radius_miles NUMERIC DEFAULT 10,
    p_vehicle_access TEXT DEFAULT NULL,
    p_min_confidence NUMERIC DEFAULT 0,
    p_include_derived BOOLEAN DEFAULT FALSE,
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
    id UUID,
    lat NUMERIC,
    lng NUMERIC,
    name TEXT,
    spot_type spot_type,
    status spot_status,
    confidence_score NUMERIC,
    road_name TEXT,
    vehicle_access vehicle_access_type,
    managing_agency TEXT,
    derivation_reasons TEXT[],
    is_established_campground BOOLEAN,
    is_road_accessible BOOLEAN,
    is_on_public_land BOOLEAN,
    osm_tags JSONB,
    land_unit_name TEXT,
    land_protect_class TEXT,
    land_protection_title TEXT,
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
        ps.id,
        ps.lat,
        ps.lng,
        ps.name,
        ps.spot_type,
        ps.status,
        ps.confidence_score,
        ps.road_name,
        ps.vehicle_access,
        ps.managing_agency,
        ps.derivation_reasons,
        ps.is_established_campground,
        COALESCE(ps.is_road_accessible, TRUE) as is_road_accessible,
        COALESCE(ps.is_on_public_land, TRUE) as is_on_public_land,
        ps.osm_tags,
        ps.land_unit_name,
        ps.land_protect_class,
        ps.land_protection_title,
        (ST_Distance(ps.location::geography, v_center::geography) / 1609.34)::NUMERIC(6,2) as distance_miles
    FROM potential_spots ps
    WHERE ST_DWithin(ps.location::geography, v_center::geography, v_radius_meters)
      AND ps.confidence_score >= p_min_confidence
      AND (p_include_derived OR ps.status IN ('admin_verified', 'user_confirmed'))
      AND (p_vehicle_access IS NULL OR
           (p_vehicle_access = 'passenger' AND ps.is_passenger_reachable = TRUE) OR
           (p_vehicle_access = 'high_clearance' AND ps.is_high_clearance_reachable = TRUE) OR
           (p_vehicle_access = '4wd'))
    ORDER BY
        CASE WHEN ps.status = 'admin_verified' THEN 0
             WHEN ps.status = 'user_confirmed' THEN 1
             ELSE 2 END,
        ps.confidence_score DESC,
        distance_miles ASC
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_dispersed_spots TO anon, authenticated, service_role;
