-- Surface spots.extra->access_road in get_dispersed_spots so /dispersed
-- can show why a spot is rated extreme/hard (the worst nearby road's tags).

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
    access_difficulty TEXT,
    access_road JSONB,
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
        s.latitude AS lat,
        s.longitude AS lng,
        s.name,
        (CASE
            WHEN s.kind = 'dispersed_camping' AND s.sub_kind = 'known' THEN 'camp_site'
            WHEN s.kind = 'established_campground' THEN 'camp_site'
            ELSE 'dead_end'
         END)::spot_type AS spot_type,
        COALESCE((s.extra->>'status')::spot_status, 'derived'::spot_status) AS status,
        COALESCE((s.extra->>'confidence_score')::NUMERIC, 0) AS confidence_score,
        COALESCE(s.extra->>'road_name', s.name) AS road_name,
        (s.amenities->>'vehicle_required')::vehicle_access_type AS vehicle_access,
        s.public_land_manager AS managing_agency,
        ARRAY(SELECT jsonb_array_elements_text(s.extra->'derivation_reasons')) AS derivation_reasons,
        (s.kind = 'established_campground') AS is_established_campground,
        COALESCE((s.extra->>'is_road_accessible')::BOOLEAN, TRUE) AS is_road_accessible,
        (s.land_type = 'public') AS is_on_public_land,
        s.extra->'osm_tags' AS osm_tags,
        s.public_land_unit AS land_unit_name,
        s.public_land_designation AS land_protect_class,
        s.public_land_designation AS land_protection_title,
        s.extra->>'access_difficulty' AS access_difficulty,
        s.extra->'access_road' AS access_road,
        (ST_Distance(s.geometry::geography, v_center::geography) / 1609.34)::NUMERIC(6,2) AS distance_miles
    FROM spots s
    WHERE ST_DWithin(s.geometry::geography, v_center::geography, v_radius_meters)
      AND s.kind IN ('dispersed_camping', 'established_campground')
      AND COALESCE((s.extra->>'confidence_score')::NUMERIC, 0) >= p_min_confidence
      AND (p_include_derived OR (s.extra->>'status') IN ('admin_verified', 'user_confirmed'))
      AND (p_vehicle_access IS NULL OR
           (p_vehicle_access = 'passenger' AND COALESCE((s.extra->>'is_passenger_reachable')::BOOLEAN, FALSE) = TRUE) OR
           (p_vehicle_access = 'high_clearance' AND COALESCE((s.extra->>'is_high_clearance_reachable')::BOOLEAN, FALSE) = TRUE) OR
           (p_vehicle_access = '4wd'))
    ORDER BY
        CASE WHEN s.extra->>'status' = 'admin_verified' THEN 0
             WHEN s.extra->>'status' = 'user_confirmed' THEN 1
             ELSE 2 END,
        COALESCE((s.extra->>'confidence_score')::NUMERIC, 0) DESC,
        distance_miles ASC
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_dispersed_spots TO anon, authenticated, service_role;
