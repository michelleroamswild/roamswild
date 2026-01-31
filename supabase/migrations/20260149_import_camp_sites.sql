-- Function to insert OSM camp sites into potential_spots

CREATE OR REPLACE FUNCTION insert_osm_camp_site(
    p_lat NUMERIC,
    p_lng NUMERIC,
    p_name TEXT,
    p_osm_id BIGINT,
    p_score NUMERIC,
    p_reasons TEXT[],
    p_vehicle_access TEXT DEFAULT 'high_clearance'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_id UUID;
    v_location GEOMETRY;
    v_public_land_id UUID;
    v_managing_agency TEXT;
BEGIN
    -- Create point geometry
    v_location := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326);

    -- Find containing public land
    SELECT id, managing_agency INTO v_public_land_id, v_managing_agency
    FROM public_lands
    WHERE ST_Within(v_location, boundary)
      AND dispersed_camping_allowed = TRUE
    ORDER BY area_acres ASC NULLS LAST
    LIMIT 1;

    -- Insert the camp site
    INSERT INTO potential_spots (
        location,
        spot_type,
        status,
        confidence_score,
        road_name,
        vehicle_access,
        is_passenger_reachable,
        is_high_clearance_reachable,
        public_land_id,
        managing_agency,
        derivation_reasons,
        source_type,
        osm_camp_site_id
    )
    VALUES (
        v_location,
        'camp_site',
        'derived',
        p_score,
        p_name,
        p_vehicle_access::vehicle_access_type,
        p_vehicle_access = 'passenger',
        p_vehicle_access IN ('passenger', 'high_clearance'),
        v_public_land_id,
        v_managing_agency,
        p_reasons,
        'osm',
        p_osm_id
    )
    ON CONFLICT (osm_camp_site_id) WHERE osm_camp_site_id IS NOT NULL
    DO UPDATE SET
        road_name = EXCLUDED.road_name,
        confidence_score = EXCLUDED.confidence_score,
        updated_at = NOW()
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION insert_osm_camp_site TO service_role;
