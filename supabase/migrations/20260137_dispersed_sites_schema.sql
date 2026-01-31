-- Dispersed Sites Database Schema
-- Normalizes public lands, roads, and potential camping spots into PostGIS tables
-- for fast spatial queries and admin verification workflows

-- Ensure PostGIS is enabled (should already be from surprise_me schema)
CREATE EXTENSION IF NOT EXISTS postgis;

-- =============================================================================
-- ENUMS
-- =============================================================================

CREATE TYPE land_source_type AS ENUM ('pad_us', 'blm_sma', 'usfs', 'osm', 'state');
CREATE TYPE road_source_type AS ENUM ('mvum', 'blm', 'osm');
CREATE TYPE vehicle_access_type AS ENUM ('passenger', 'high_clearance', '4wd', 'atv_only', 'closed');
CREATE TYPE spot_type AS ENUM ('dead_end', 'camp_site', 'pullout', 'intersection');
CREATE TYPE spot_status AS ENUM ('derived', 'admin_verified', 'user_confirmed', 'rejected');

-- =============================================================================
-- PUBLIC LANDS TABLE
-- =============================================================================

CREATE TABLE public_lands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identification
    external_id TEXT,
    source_type land_source_type NOT NULL,

    -- Names and Classification
    name TEXT NOT NULL,
    unit_name TEXT,
    managing_agency TEXT NOT NULL,  -- BLM, USFS, NPS, FWS, STATE, TRIB, NGO
    land_type TEXT,  -- national_forest, wilderness, blm_sma, state_park, etc.

    -- Geometry
    boundary GEOMETRY(MULTIPOLYGON, 4326) NOT NULL,
    centroid GEOMETRY(POINT, 4326) GENERATED ALWAYS AS (ST_Centroid(boundary)) STORED,
    area_acres NUMERIC(12, 2),

    -- Camping Rules
    dispersed_camping_allowed BOOLEAN DEFAULT TRUE,
    camping_restrictions TEXT,
    fire_restrictions TEXT,

    -- Metadata
    source_updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Spatial indexes
CREATE INDEX idx_public_lands_boundary ON public_lands USING GIST(boundary);
CREATE INDEX idx_public_lands_centroid ON public_lands USING GIST(centroid);
CREATE INDEX idx_public_lands_agency ON public_lands(managing_agency);
CREATE INDEX idx_public_lands_dispersed ON public_lands(dispersed_camping_allowed)
    WHERE dispersed_camping_allowed = TRUE;

-- =============================================================================
-- ROAD SEGMENTS TABLE
-- =============================================================================

CREATE TABLE road_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identification
    external_id TEXT,
    source_type road_source_type NOT NULL,

    -- Geometry
    geometry GEOMETRY(LINESTRING, 4326) NOT NULL,
    start_point GEOMETRY(POINT, 4326) GENERATED ALWAYS AS (ST_StartPoint(geometry)) STORED,
    end_point GEOMETRY(POINT, 4326) GENERATED ALWAYS AS (ST_EndPoint(geometry)) STORED,
    length_miles NUMERIC(8, 2),

    -- Road Properties
    name TEXT,
    route_number TEXT,
    surface_type TEXT,  -- paved, gravel, dirt, native
    vehicle_access vehicle_access_type NOT NULL DEFAULT 'high_clearance',
    seasonal_closure TEXT,

    -- Network Analysis (precomputed for graph matching)
    start_node_key TEXT,  -- Rounded coords for matching endpoints
    end_node_key TEXT,

    -- Public Land Association
    public_land_id UUID REFERENCES public_lands(id),

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Spatial indexes
CREATE INDEX idx_road_segments_geom ON road_segments USING GIST(geometry);
CREATE INDEX idx_road_segments_start ON road_segments USING GIST(start_point);
CREATE INDEX idx_road_segments_end ON road_segments USING GIST(end_point);
CREATE INDEX idx_road_segments_source ON road_segments(source_type);
CREATE INDEX idx_road_segments_vehicle ON road_segments(vehicle_access);
CREATE INDEX idx_road_segments_nodes ON road_segments(start_node_key, end_node_key);

-- =============================================================================
-- POTENTIAL SPOTS TABLE
-- =============================================================================

CREATE TABLE potential_spots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Location (PostGIS geometry with generated lat/lng for convenience)
    location GEOMETRY(POINT, 4326) NOT NULL,
    lat NUMERIC(9, 6) GENERATED ALWAYS AS (ST_Y(location)) STORED,
    lng NUMERIC(9, 6) GENERATED ALWAYS AS (ST_X(location)) STORED,

    -- Classification
    spot_type spot_type NOT NULL,
    status spot_status NOT NULL DEFAULT 'derived',

    -- Scoring
    confidence_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
    recommendation_score NUMERIC(5, 2),
    score_breakdown JSONB,

    -- Road Access (denormalized for query speed)
    road_segment_id UUID REFERENCES road_segments(id),
    road_name TEXT,
    vehicle_access vehicle_access_type,
    is_passenger_reachable BOOLEAN DEFAULT FALSE,
    is_high_clearance_reachable BOOLEAN DEFAULT TRUE,

    -- Public Land (denormalized for query speed)
    public_land_id UUID REFERENCES public_lands(id),
    managing_agency TEXT,

    -- Derivation Metadata
    derivation_reasons TEXT[],
    source_type road_source_type,
    osm_camp_site_id BIGINT,  -- If from OSM tourism=camp_site

    -- Admin Workflow
    admin_verified_by UUID REFERENCES auth.users(id),
    admin_verified_at TIMESTAMPTZ,
    admin_rejection_reason TEXT,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Spatial and status indexes
CREATE INDEX idx_potential_spots_location ON potential_spots USING GIST(location);
CREATE INDEX idx_potential_spots_status ON potential_spots(status);
CREATE INDEX idx_potential_spots_score ON potential_spots(confidence_score DESC);
CREATE INDEX idx_potential_spots_vehicle ON potential_spots(vehicle_access);
CREATE INDEX idx_potential_spots_agency ON potential_spots(managing_agency);

-- Index for verified/confirmed spots (most common query)
CREATE INDEX idx_potential_spots_verified ON potential_spots USING GIST(location)
    WHERE status IN ('admin_verified', 'user_confirmed');

-- Index for admin queue (derived spots needing review)
CREATE INDEX idx_potential_spots_admin_queue ON potential_spots(confidence_score DESC)
    WHERE status = 'derived';

-- Unique constraint for OSM camp sites to prevent duplicates
CREATE UNIQUE INDEX idx_potential_spots_osm ON potential_spots(osm_camp_site_id)
    WHERE osm_camp_site_id IS NOT NULL;

-- =============================================================================
-- ESTABLISHED CAMPGROUNDS TABLE
-- =============================================================================

CREATE TABLE established_campgrounds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- External IDs (for deduplication)
    ridb_facility_id TEXT,
    usfs_rec_area_id TEXT,
    osm_id BIGINT,

    -- Location
    location GEOMETRY(POINT, 4326) NOT NULL,
    lat NUMERIC(9, 6) GENERATED ALWAYS AS (ST_Y(location)) STORED,
    lng NUMERIC(9, 6) GENERATED ALWAYS AS (ST_X(location)) STORED,

    -- Properties
    name TEXT NOT NULL,
    description TEXT,
    facility_type TEXT,  -- campground, day_use, trailhead
    agency_name TEXT,
    forest_name TEXT,

    -- Availability
    is_reservable BOOLEAN DEFAULT FALSE,
    recreation_gov_url TEXT,

    -- Fees
    has_fee BOOLEAN,
    fee_description TEXT,

    -- Amenities
    has_toilets BOOLEAN,
    has_water BOOLEAN,
    has_showers BOOLEAN,

    -- Public Land Association
    public_land_id UUID REFERENCES public_lands(id),

    -- Metadata
    source_type land_source_type NOT NULL,
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Spatial index
CREATE INDEX idx_established_campgrounds_location ON established_campgrounds USING GIST(location);
CREATE INDEX idx_established_campgrounds_ridb ON established_campgrounds(ridb_facility_id);
CREATE INDEX idx_established_campgrounds_agency ON established_campgrounds(agency_name);

-- =============================================================================
-- MODIFY EXISTING CAMPSITES TABLE
-- =============================================================================

-- Add PostGIS geometry column
ALTER TABLE campsites ADD COLUMN IF NOT EXISTS location GEOMETRY(POINT, 4326);

-- Add link to potential_spots (for explorer-derived campsites)
ALTER TABLE campsites ADD COLUMN IF NOT EXISTS potential_spot_id UUID REFERENCES potential_spots(id);

-- Populate location from existing lat/lng
UPDATE campsites
SET location = ST_SetSRID(ST_MakePoint(lng::double precision, lat::double precision), 4326)
WHERE location IS NULL AND lat IS NOT NULL AND lng IS NOT NULL;

-- Create spatial index
CREATE INDEX IF NOT EXISTS idx_campsites_location_geom ON campsites USING GIST(location);

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to get verified/confirmed spots within radius
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
    spot_type spot_type,
    status spot_status,
    confidence_score NUMERIC,
    road_name TEXT,
    vehicle_access vehicle_access_type,
    managing_agency TEXT,
    derivation_reasons TEXT[],
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
        ps.spot_type,
        ps.status,
        ps.confidence_score,
        ps.road_name,
        ps.vehicle_access,
        ps.managing_agency,
        ps.derivation_reasons,
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

-- Function to get public lands within radius (simplified geometry for rendering)
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
BEGIN
    v_center := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326);
    v_radius_meters := p_radius_miles * 1609.34;

    RETURN QUERY
    SELECT
        pl.id,
        pl.name,
        pl.managing_agency,
        pl.land_type,
        pl.dispersed_camping_allowed,
        CASE WHEN p_include_geometry
             THEN ST_SimplifyPreserveTopology(pl.boundary, 0.001)
             ELSE NULL
        END as boundary_simplified
    FROM public_lands pl
    WHERE ST_DWithin(pl.centroid::geography, v_center::geography, v_radius_meters)
    ORDER BY ST_Distance(pl.centroid, v_center)
    LIMIT 50;
END;
$$;

-- Function to get established campgrounds within radius
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
        ec.id,
        ec.name,
        ec.lat,
        ec.lng,
        ec.agency_name,
        ec.is_reservable,
        ec.recreation_gov_url,
        (ST_Distance(ec.location::geography, v_center::geography) / 1609.34)::NUMERIC(6,2) as distance_miles
    FROM established_campgrounds ec
    WHERE ST_DWithin(ec.location::geography, v_center::geography, v_radius_meters)
    ORDER BY distance_miles
    LIMIT 100;
END;
$$;

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

-- Public lands: readable by everyone (public data)
ALTER TABLE public_lands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public lands are readable by everyone" ON public_lands
    FOR SELECT USING (true);

-- Road segments: readable by everyone (public data)
ALTER TABLE road_segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Road segments are readable by everyone" ON road_segments
    FOR SELECT USING (true);

-- Potential spots: readable by everyone, but only verified/confirmed show by default
ALTER TABLE potential_spots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Potential spots are readable by everyone" ON potential_spots
    FOR SELECT USING (true);

-- Only admins can insert/update/delete (will add admin check later)
CREATE POLICY "Admin can manage potential spots" ON potential_spots
    FOR ALL USING (true);  -- TODO: Add proper admin role check

-- Established campgrounds: readable by everyone
ALTER TABLE established_campgrounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Campgrounds are readable by everyone" ON established_campgrounds
    FOR SELECT USING (true);

-- =============================================================================
-- TRIGGERS FOR UPDATED_AT
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER public_lands_updated_at
    BEFORE UPDATE ON public_lands
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER road_segments_updated_at
    BEFORE UPDATE ON road_segments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER potential_spots_updated_at
    BEFORE UPDATE ON potential_spots
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER established_campgrounds_updated_at
    BEFORE UPDATE ON established_campgrounds
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
