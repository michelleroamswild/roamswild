-- Add is_road_accessible flag to potential_spots
-- This allows Fast mode to filter out backcountry/hike-in camps just like Full mode

-- Add the column
ALTER TABLE potential_spots
ADD COLUMN IF NOT EXISTS is_road_accessible BOOLEAN DEFAULT TRUE;

-- Create index for filtering
CREATE INDEX IF NOT EXISTS idx_potential_spots_road_accessible
ON potential_spots(is_road_accessible)
WHERE spot_type = 'camp_site';

-- Function to check if a point is near any road (within threshold miles)
-- Uses the road_segments table which contains MVUM and OSM roads
CREATE OR REPLACE FUNCTION is_point_near_road(
    p_lat NUMERIC,
    p_lng NUMERIC,
    p_threshold_miles NUMERIC DEFAULT 0.25
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_point GEOMETRY;
    v_threshold_meters NUMERIC;
    v_near_road BOOLEAN;
BEGIN
    v_point := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326);
    v_threshold_meters := p_threshold_miles * 1609.34;

    SELECT EXISTS (
        SELECT 1
        FROM road_segments r
        WHERE ST_DWithin(r.geometry::geography, v_point::geography, v_threshold_meters)
        LIMIT 1
    ) INTO v_near_road;

    RETURN v_near_road;
END;
$$;

-- NOTE: Backfill is skipped during migration to avoid timeout
-- The is_road_accessible flag will be computed automatically during the next import
-- Or you can manually run: SELECT backfill_road_accessibility();

-- Function to manually run backfill after importing roads
-- Call this after importing roads: SELECT backfill_road_accessibility();
CREATE OR REPLACE FUNCTION backfill_road_accessibility()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_updated INTEGER := 0;
BEGIN
    -- Reset all to TRUE first (in case roads were updated)
    UPDATE potential_spots
    SET is_road_accessible = TRUE
    WHERE spot_type = 'camp_site';

    -- Then mark those NOT near roads as FALSE
    UPDATE potential_spots ps
    SET is_road_accessible = FALSE
    WHERE ps.spot_type = 'camp_site'
      AND NOT is_point_near_road(ps.lat, ps.lng, 0.25);

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated;
END;
$$;

-- Update the import_osm_camp_site function to compute is_road_accessible
DROP FUNCTION IF EXISTS import_osm_camp_site(BIGINT, NUMERIC, NUMERIC, TEXT, JSONB, BOOLEAN);

CREATE OR REPLACE FUNCTION import_osm_camp_site(
    p_osm_id BIGINT,
    p_lat NUMERIC,
    p_lng NUMERIC,
    p_name TEXT,
    p_osm_tags JSONB,
    p_is_way_or_area BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_spot_id UUID;
    v_location GEOMETRY;
    v_tags_with_type JSONB;
    v_is_established BOOLEAN;
    v_is_road_accessible BOOLEAN;
    v_score NUMERIC;
    v_reasons TEXT[];
BEGIN
    -- Create location geometry
    v_location := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326);

    -- Add is_way_or_area to tags for scoring
    v_tags_with_type := p_osm_tags || jsonb_build_object('is_way_or_area', p_is_way_or_area);

    -- Compute classification
    v_is_established := compute_is_established_campground(v_tags_with_type, p_name);

    -- Check if near any road (0.25 miles threshold, matching Full mode)
    v_is_road_accessible := is_point_near_road(p_lat, p_lng, 0.25);

    -- Compute score and reasons based on classification
    IF v_is_established THEN
        v_score := 30;
        v_reasons := ARRAY['Established campground'];
    ELSIF p_osm_tags->>'backcountry' = 'yes' OR
          p_osm_tags->>'camp_site' = 'basic' OR
          p_osm_tags->>'camp_type' IN ('wildcamp', 'non_designated') THEN
        v_score := 40;
        v_reasons := ARRAY['Known camp site', 'Backcountry/primitive'];
    ELSIF p_osm_tags->>'leisure' = 'firepit' THEN
        v_score := 35;
        v_reasons := ARRAY['Fire ring/pit (likely camp spot)'];
    ELSIF p_osm_tags->>'tourism' = 'camp_site' THEN
        v_score := 30;
        v_reasons := ARRAY['Known camp site'];
    ELSE
        v_score := 35;
        v_reasons := ARRAY['Mapped camping location'];
    END IF;

    -- Upsert the spot
    INSERT INTO potential_spots (
        location,
        spot_type,
        status,
        confidence_score,
        name,
        osm_camp_site_id,
        osm_tags,
        is_established_campground,
        is_road_accessible,
        derivation_reasons,
        source_type
    ) VALUES (
        v_location,
        'camp_site',
        'derived',
        v_score,
        COALESCE(p_name, 'Camp Site'),
        p_osm_id,
        v_tags_with_type,
        v_is_established,
        v_is_road_accessible,
        v_reasons,
        'osm'
    )
    ON CONFLICT (osm_camp_site_id) WHERE osm_camp_site_id IS NOT NULL
    DO UPDATE SET
        location = EXCLUDED.location,
        name = EXCLUDED.name,
        osm_tags = EXCLUDED.osm_tags,
        is_established_campground = EXCLUDED.is_established_campground,
        is_road_accessible = EXCLUDED.is_road_accessible,
        confidence_score = EXCLUDED.confidence_score,
        derivation_reasons = EXCLUDED.derivation_reasons,
        updated_at = NOW()
    RETURNING id INTO v_spot_id;

    RETURN v_spot_id;
END;
$$;

-- Update get_dispersed_spots to return the is_road_accessible flag
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
    osm_tags JSONB,
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
        ps.osm_tags,
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
