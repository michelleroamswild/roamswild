-- Add OSM tags storage and established campground classification to potential_spots
-- This allows Fast mode to match Full mode's classification logic

-- Add is_established_campground boolean for quick classification lookup
ALTER TABLE potential_spots
ADD COLUMN IF NOT EXISTS is_established_campground BOOLEAN DEFAULT FALSE;

-- Add osm_tags JSONB column for storing raw OSM tags
-- This allows flexibility for future features (filtering by amenities, showing fee info, etc.)
ALTER TABLE potential_spots
ADD COLUMN IF NOT EXISTS osm_tags JSONB;

-- Add name column if it doesn't exist (for OSM camp site names)
ALTER TABLE potential_spots
ADD COLUMN IF NOT EXISTS name TEXT;

-- Create index for quick lookups of established vs dispersed sites
CREATE INDEX IF NOT EXISTS idx_potential_spots_established
ON potential_spots(is_established_campground)
WHERE spot_type = 'camp_site';

-- Create index for JSONB tag queries (for future filtering)
CREATE INDEX IF NOT EXISTS idx_potential_spots_osm_tags
ON potential_spots USING GIN(osm_tags);

-- Drop and recreate the get_dispersed_spots function to add new return fields
-- (Can't change return type of existing function with CREATE OR REPLACE)
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

-- Function to compute is_established_campground from OSM tags
-- Uses the same scoring logic as Full mode (use-dispersed-roads.ts)
CREATE OR REPLACE FUNCTION compute_is_established_campground(p_osm_tags JSONB, p_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_score INTEGER := 0;
    v_is_backcountry BOOLEAN;
    v_has_strong_indicator BOOLEAN;
    v_is_way_or_area BOOLEAN;
    v_has_fee BOOLEAN;
    v_has_amenities BOOLEAN;
    v_has_capacity BOOLEAN;
    v_name_indicates_campground BOOLEAN;
    v_is_individual_site BOOLEAN;
BEGIN
    IF p_osm_tags IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Check backcountry indicators
    v_is_backcountry := (
        p_osm_tags->>'backcountry' = 'yes' OR
        p_osm_tags->>'camp_site' = 'basic' OR
        p_osm_tags->>'camp_type' = 'wildcamp' OR
        p_osm_tags->>'camp_type' = 'non_designated'
    );

    -- If backcountry, definitely not established
    IF v_is_backcountry THEN
        RETURN FALSE;
    END IF;

    -- Check indicators
    v_is_way_or_area := COALESCE((p_osm_tags->>'is_way_or_area')::boolean, FALSE);
    v_has_fee := p_osm_tags->>'fee' = 'yes';
    v_has_amenities := (
        p_osm_tags->>'toilets' IS NOT NULL OR
        p_osm_tags->>'drinking_water' IS NOT NULL OR
        p_osm_tags->>'shower' IS NOT NULL OR
        p_osm_tags->>'power_supply' IS NOT NULL OR
        p_osm_tags->>'internet_access' IS NOT NULL
    );
    v_has_capacity := (p_osm_tags->>'capacity')::integer > 5;
    v_name_indicates_campground := p_name ~* '(campground|camp\s|camping|rv\s*park|yurt)';
    v_is_individual_site := p_name ~* '^Site\s*\d' OR p_osm_tags->>'tourism' = 'camp_pitch';

    -- Compute score
    IF v_is_way_or_area THEN v_score := v_score + 1; END IF;
    IF v_has_fee THEN v_score := v_score + 2; END IF;
    IF v_has_amenities THEN v_score := v_score + 2; END IF;
    IF v_has_capacity THEN v_score := v_score + 1; END IF;
    IF v_name_indicates_campground THEN v_score := v_score + 2; END IF;
    IF v_is_individual_site THEN v_score := v_score - 1; END IF;

    -- Check for strong indicator
    v_has_strong_indicator := v_name_indicates_campground OR v_has_fee OR v_has_amenities;

    -- Return classification
    RETURN v_score >= 3 AND v_has_strong_indicator;
END;
$$;

-- Function to import OSM camp sites with proper classification
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
    v_score NUMERIC;
    v_reasons TEXT[];
BEGIN
    -- Create location geometry
    v_location := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326);

    -- Add is_way_or_area to tags for scoring
    v_tags_with_type := p_osm_tags || jsonb_build_object('is_way_or_area', p_is_way_or_area);

    -- Compute classification
    v_is_established := compute_is_established_campground(v_tags_with_type, p_name);

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
        v_reasons,
        'osm'
    )
    ON CONFLICT (osm_camp_site_id) WHERE osm_camp_site_id IS NOT NULL
    DO UPDATE SET
        location = EXCLUDED.location,
        name = EXCLUDED.name,
        osm_tags = EXCLUDED.osm_tags,
        is_established_campground = EXCLUDED.is_established_campground,
        confidence_score = EXCLUDED.confidence_score,
        derivation_reasons = EXCLUDED.derivation_reasons,
        updated_at = NOW()
    RETURNING id INTO v_spot_id;

    RETURN v_spot_id;
END;
$$;
