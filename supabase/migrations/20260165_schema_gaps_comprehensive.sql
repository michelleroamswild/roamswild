-- =============================================================================
-- Migration: 20260165_schema_gaps_comprehensive.sql
-- Purpose: Fill schema gaps for provenance, regulations, exclusions, designations
-- Constraints: Additive only, no assumptions about existing data, SRID enforcement
-- =============================================================================

-- =============================================================================
-- SECTION 1: PREREQUISITES - Extensions and Helper Functions
-- =============================================================================

-- Ensure PostGIS is available (should already exist)
CREATE EXTENSION IF NOT EXISTS postgis;

-- Ensure we have UUID generation (built into Postgres 13+, but be safe)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create or replace the updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- =============================================================================
-- SECTION 2: NEW ENUMS (with safe creation pattern)
-- =============================================================================

-- Regulation type enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'regulation_type') THEN
        CREATE TYPE regulation_type AS ENUM (
            'dispersed_camping',
            'fire_restriction',
            'vehicle_restriction',
            'stay_limit',
            'permit_required',
            'seasonal_closure',
            'wilderness_rules',
            'noise_restriction',
            'group_size_limit',
            'other'
        );
    END IF;
END$$;

-- Regulation status enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'regulation_status') THEN
        CREATE TYPE regulation_status AS ENUM (
            'active',
            'seasonal',
            'temporary',
            'pending',
            'expired'
        );
    END IF;
END$$;

-- Exclusion zone type enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'exclusion_type') THEN
        CREATE TYPE exclusion_type AS ENUM (
            'private_property',
            'military',
            'mining_active',
            'mining_abandoned',
            'industrial',
            'hazardous_materials',
            'wildlife_closure',
            'cultural_site',
            'water_protection',
            'urban_boundary',
            'airport',
            'railroad',
            'dam_spillway',
            'firing_range',
            'other'
        );
    END IF;
END$$;

-- Designation type enum (for overlays)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'designation_type') THEN
        CREATE TYPE designation_type AS ENUM (
            'wilderness',
            'wilderness_study_area',
            'national_monument',
            'national_conservation_area',
            'wild_scenic_river',
            'critical_habitat',
            'inventoried_roadless',
            'research_natural_area',
            'area_of_critical_environmental_concern',
            'special_recreation_management_area',
            'other'
        );
    END IF;
END$$;

-- =============================================================================
-- SECTION 3: DATA SOURCES MASTER TABLE (Provenance & Licensing)
-- =============================================================================

CREATE TABLE IF NOT EXISTS data_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identification (using TEXT for source_type to avoid enum dependency issues)
    source_key TEXT NOT NULL UNIQUE,  -- e.g., 'pad_us_3_0', 'osm_2024_01'
    source_type TEXT NOT NULL,        -- Using TEXT to avoid enum conflicts

    -- Naming
    display_name TEXT NOT NULL,
    short_name TEXT,

    -- Versioning
    version TEXT,
    release_date DATE,

    -- Licensing
    license_type TEXT,                -- e.g., 'public_domain', 'cc_by', 'odbl'
    license_url TEXT,
    attribution_text TEXT,
    attribution_required BOOLEAN DEFAULT TRUE,

    -- Access
    source_url TEXT,
    api_endpoint TEXT,

    -- Update schedule
    update_frequency TEXT,            -- e.g., 'annual', 'weekly', 'daily'
    last_checked_at TIMESTAMPTZ,
    next_check_due TIMESTAMPTZ,

    -- Metadata
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for data_sources
CREATE INDEX IF NOT EXISTS idx_data_sources_key ON data_sources(source_key);
CREATE INDEX IF NOT EXISTS idx_data_sources_type ON data_sources(source_type);
CREATE INDEX IF NOT EXISTS idx_data_sources_active ON data_sources(is_active) WHERE is_active = TRUE;

-- RLS for data_sources
ALTER TABLE data_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Data sources readable by all" ON data_sources;
CREATE POLICY "Data sources readable by all" ON data_sources FOR SELECT USING (true);

-- Trigger for data_sources
DROP TRIGGER IF EXISTS data_sources_updated_at ON data_sources;
CREATE TRIGGER data_sources_updated_at
    BEFORE UPDATE ON data_sources
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Link data_source_runs to data_sources (if data_source_runs exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'data_source_runs' AND table_schema = 'public') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'data_source_runs' AND column_name = 'data_source_id') THEN
            ALTER TABLE data_source_runs ADD COLUMN data_source_id UUID REFERENCES data_sources(id);
        END IF;
    END IF;
END$$;

-- =============================================================================
-- SECTION 4: PROVENANCE LINKS ON CORE TABLES
-- =============================================================================

-- Add data_source_run_id to potential_spots (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'potential_spots' AND table_schema = 'public') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'potential_spots' AND column_name = 'data_source_run_id') THEN
            ALTER TABLE potential_spots ADD COLUMN data_source_run_id UUID;
        END IF;
    END IF;
END$$;

-- Add data_source_run_id to road_segments (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'road_segments' AND table_schema = 'public') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'road_segments' AND column_name = 'data_source_run_id') THEN
            ALTER TABLE road_segments ADD COLUMN data_source_run_id UUID;
        END IF;
    END IF;
END$$;

-- Add data_source_run_id to public_lands (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'public_lands' AND table_schema = 'public') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'public_lands' AND column_name = 'data_source_run_id') THEN
            ALTER TABLE public_lands ADD COLUMN data_source_run_id UUID;
        END IF;
    END IF;
END$$;

-- Add data_source_run_id to established_campgrounds (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'established_campgrounds' AND table_schema = 'public') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'established_campgrounds' AND column_name = 'data_source_run_id') THEN
            ALTER TABLE established_campgrounds ADD COLUMN data_source_run_id UUID;
        END IF;
    END IF;
END$$;

-- Add data_source_run_id to private_road_points (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'private_road_points' AND table_schema = 'public') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'private_road_points' AND column_name = 'data_source_run_id') THEN
            ALTER TABLE private_road_points ADD COLUMN data_source_run_id UUID;
        END IF;
    END IF;
END$$;

-- Indexes for provenance lookups (safe creation)
CREATE INDEX IF NOT EXISTS idx_potential_spots_run ON potential_spots(data_source_run_id);
CREATE INDEX IF NOT EXISTS idx_road_segments_run ON road_segments(data_source_run_id);
CREATE INDEX IF NOT EXISTS idx_public_lands_run ON public_lands(data_source_run_id);
CREATE INDEX IF NOT EXISTS idx_established_campgrounds_run ON established_campgrounds(data_source_run_id);
CREATE INDEX IF NOT EXISTS idx_private_road_points_run ON private_road_points(data_source_run_id);

-- =============================================================================
-- SECTION 5: DERIVATION VERSIONING
-- =============================================================================

-- Add derivation tracking columns to potential_spots
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'potential_spots' AND table_schema = 'public') THEN
        -- Algorithm identifier
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'potential_spots' AND column_name = 'derivation_algorithm') THEN
            ALTER TABLE potential_spots ADD COLUMN derivation_algorithm TEXT;
        END IF;

        -- Algorithm version number
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'potential_spots' AND column_name = 'derivation_version') THEN
            ALTER TABLE potential_spots ADD COLUMN derivation_version INTEGER DEFAULT 1;
        END IF;

        -- When derived
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'potential_spots' AND column_name = 'derived_at') THEN
            ALTER TABLE potential_spots ADD COLUMN derived_at TIMESTAMPTZ;
        END IF;

        -- Link to derivation run (separate from source run)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'potential_spots' AND column_name = 'derivation_run_id') THEN
            ALTER TABLE potential_spots ADD COLUMN derivation_run_id UUID;
        END IF;
    END IF;
END$$;

-- Index for derivation queries (without assuming status values)
CREATE INDEX IF NOT EXISTS idx_potential_spots_derivation_algo
    ON potential_spots(derivation_algorithm, derivation_version);

-- Add algorithm version to region_metrics if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'region_metrics' AND table_schema = 'public') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'region_metrics' AND column_name = 'algorithm_version') THEN
            ALTER TABLE region_metrics ADD COLUMN algorithm_version TEXT;
        END IF;
    END IF;
END$$;

-- =============================================================================
-- SECTION 6: LAND REGULATIONS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS land_regulations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Links (both nullable for flexibility)
    public_land_id UUID,              -- FK added below if table exists
    region_id UUID,                   -- FK added below if table exists

    -- Classification
    regulation_type regulation_type NOT NULL,
    status regulation_status NOT NULL DEFAULT 'active',

    -- Rule details
    title TEXT NOT NULL,
    description TEXT,
    restriction_level TEXT,           -- e.g., 'prohibited', 'restricted', 'allowed_with_permit'

    -- Temporal validity
    effective_date DATE,
    expiration_date DATE,
    is_recurring BOOLEAN DEFAULT FALSE,
    recurrence_pattern TEXT,          -- e.g., 'may_1_to_oct_31'

    -- Numeric limits
    max_stay_days INTEGER,
    max_group_size INTEGER,
    max_vehicles INTEGER,
    buffer_distance_ft INTEGER,

    -- Authority
    issuing_agency TEXT,
    regulation_code TEXT,             -- Official CFR reference
    source_url TEXT,
    last_verified_at TIMESTAMPTZ,

    -- Location-specific geometry (optional)
    applies_to_geometry GEOMETRY(GEOMETRY, 4326),

    -- Provenance
    data_source_run_id UUID,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- SRID constraint for geometry
    CONSTRAINT land_regulations_geometry_srid_check
        CHECK (applies_to_geometry IS NULL OR ST_SRID(applies_to_geometry) = 4326),
    CONSTRAINT land_regulations_geometry_valid_check
        CHECK (applies_to_geometry IS NULL OR ST_IsValid(applies_to_geometry))
);

-- Add FK constraints if referenced tables exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'public_lands' AND table_schema = 'public') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'land_regulations_public_land_id_fkey'
        ) THEN
            ALTER TABLE land_regulations
                ADD CONSTRAINT land_regulations_public_land_id_fkey
                FOREIGN KEY (public_land_id) REFERENCES public_lands(id);
        END IF;
    END IF;
END$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'regions' AND table_schema = 'public') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'land_regulations_region_id_fkey'
        ) THEN
            ALTER TABLE land_regulations
                ADD CONSTRAINT land_regulations_region_id_fkey
                FOREIGN KEY (region_id) REFERENCES regions(id);
        END IF;
    END IF;
END$$;

-- Indexes for land_regulations
CREATE INDEX IF NOT EXISTS idx_land_regulations_land ON land_regulations(public_land_id);
CREATE INDEX IF NOT EXISTS idx_land_regulations_region ON land_regulations(region_id);
CREATE INDEX IF NOT EXISTS idx_land_regulations_type ON land_regulations(regulation_type);
CREATE INDEX IF NOT EXISTS idx_land_regulations_status ON land_regulations(status);
CREATE INDEX IF NOT EXISTS idx_land_regulations_dates
    ON land_regulations(effective_date, expiration_date);
CREATE INDEX IF NOT EXISTS idx_land_regulations_geom
    ON land_regulations USING GIST(applies_to_geometry);

-- RLS for land_regulations
ALTER TABLE land_regulations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Land regulations readable by all" ON land_regulations;
CREATE POLICY "Land regulations readable by all" ON land_regulations FOR SELECT USING (true);

-- Trigger for land_regulations
DROP TRIGGER IF EXISTS land_regulations_updated_at ON land_regulations;
CREATE TRIGGER land_regulations_updated_at
    BEFORE UPDATE ON land_regulations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- SECTION 7: EXCLUSION ZONES TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS exclusion_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Classification
    exclusion_type exclusion_type NOT NULL,
    severity TEXT NOT NULL DEFAULT 'hard',  -- 'hard' or 'soft'

    -- Identification
    name TEXT,
    external_id TEXT,

    -- Geometry (required)
    boundary GEOMETRY(GEOMETRY, 4326) NOT NULL,
    buffer_meters INTEGER DEFAULT 0,

    -- Details
    reason TEXT,
    hazard_description TEXT,

    -- Temporal (for seasonal closures)
    effective_date DATE,
    expiration_date DATE,
    is_permanent BOOLEAN DEFAULT TRUE,

    -- Source
    source_type TEXT,                 -- Using TEXT to avoid enum dependency
    source_url TEXT,
    data_source_run_id UUID,
    last_verified_at TIMESTAMPTZ,

    -- Metadata
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Geometry constraints
    CONSTRAINT exclusion_zones_boundary_srid_check
        CHECK (ST_SRID(boundary) = 4326),
    CONSTRAINT exclusion_zones_boundary_valid_check
        CHECK (ST_IsValid(boundary))
);

-- Indexes for exclusion_zones
CREATE INDEX IF NOT EXISTS idx_exclusion_zones_boundary
    ON exclusion_zones USING GIST(boundary);
CREATE INDEX IF NOT EXISTS idx_exclusion_zones_type
    ON exclusion_zones(exclusion_type);
CREATE INDEX IF NOT EXISTS idx_exclusion_zones_active
    ON exclusion_zones(is_active);
CREATE INDEX IF NOT EXISTS idx_exclusion_zones_severity
    ON exclusion_zones(severity);

-- RLS for exclusion_zones
ALTER TABLE exclusion_zones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Exclusion zones readable by all" ON exclusion_zones;
CREATE POLICY "Exclusion zones readable by all" ON exclusion_zones FOR SELECT USING (true);

-- Trigger for exclusion_zones
DROP TRIGGER IF EXISTS exclusion_zones_updated_at ON exclusion_zones;
CREATE TRIGGER exclusion_zones_updated_at
    BEFORE UPDATE ON exclusion_zones
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- SECTION 8: DESIGNATION OVERLAYS (Wilderness, Monuments, Habitat)
-- =============================================================================

-- Wilderness Areas
CREATE TABLE IF NOT EXISTS wilderness_areas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identification
    external_id TEXT,                 -- USGS/PAD-US ID
    name TEXT NOT NULL,

    -- Classification
    designation_type designation_type NOT NULL DEFAULT 'wilderness',
    designating_authority TEXT,       -- 'congress', 'blm', 'usfs'
    designation_date DATE,
    designation_act TEXT,             -- e.g., 'Wilderness Act of 1964'

    -- Geometry
    boundary GEOMETRY(MULTIPOLYGON, 4326) NOT NULL,
    area_acres NUMERIC(12, 2),

    -- Managing agency
    managing_agency TEXT,
    admin_unit TEXT,                  -- e.g., 'Manti-La Sal National Forest'

    -- Camping rules in wilderness
    camping_allowed BOOLEAN DEFAULT TRUE,
    permit_required BOOLEAN DEFAULT FALSE,
    permit_url TEXT,
    group_size_limit INTEGER,

    -- Special regulations
    no_mechanized_travel BOOLEAN DEFAULT TRUE,
    no_motorized_travel BOOLEAN DEFAULT TRUE,
    fire_restrictions TEXT,
    special_rules TEXT,

    -- Provenance
    source_type TEXT,
    source_url TEXT,
    data_source_run_id UUID,

    -- Metadata
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT wilderness_areas_boundary_srid_check
        CHECK (ST_SRID(boundary) = 4326),
    CONSTRAINT wilderness_areas_boundary_valid_check
        CHECK (ST_IsValid(boundary))
);

-- Indexes for wilderness_areas
CREATE INDEX IF NOT EXISTS idx_wilderness_areas_boundary
    ON wilderness_areas USING GIST(boundary);
CREATE INDEX IF NOT EXISTS idx_wilderness_areas_name
    ON wilderness_areas(name);
CREATE INDEX IF NOT EXISTS idx_wilderness_areas_agency
    ON wilderness_areas(managing_agency);
CREATE INDEX IF NOT EXISTS idx_wilderness_areas_external
    ON wilderness_areas(external_id);

-- RLS for wilderness_areas
ALTER TABLE wilderness_areas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Wilderness areas readable by all" ON wilderness_areas;
CREATE POLICY "Wilderness areas readable by all" ON wilderness_areas FOR SELECT USING (true);

-- Trigger for wilderness_areas
DROP TRIGGER IF EXISTS wilderness_areas_updated_at ON wilderness_areas;
CREATE TRIGGER wilderness_areas_updated_at
    BEFORE UPDATE ON wilderness_areas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- National Monuments and Conservation Areas
CREATE TABLE IF NOT EXISTS national_monuments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identification
    external_id TEXT,
    name TEXT NOT NULL,

    -- Classification
    designation_type designation_type NOT NULL DEFAULT 'national_monument',
    designating_authority TEXT,       -- 'president', 'congress'
    designation_date DATE,
    proclamation_number TEXT,

    -- Geometry
    boundary GEOMETRY(MULTIPOLYGON, 4326) NOT NULL,
    area_acres NUMERIC(12, 2),

    -- Management
    managing_agency TEXT,             -- 'BLM', 'NPS', 'USFS', 'joint'
    admin_unit TEXT,

    -- Camping info
    dispersed_camping_allowed BOOLEAN,
    camping_restrictions TEXT,

    -- Provenance
    source_type TEXT,
    source_url TEXT,
    data_source_run_id UUID,

    -- Metadata
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT national_monuments_boundary_srid_check
        CHECK (ST_SRID(boundary) = 4326),
    CONSTRAINT national_monuments_boundary_valid_check
        CHECK (ST_IsValid(boundary))
);

-- Indexes for national_monuments
CREATE INDEX IF NOT EXISTS idx_national_monuments_boundary
    ON national_monuments USING GIST(boundary);
CREATE INDEX IF NOT EXISTS idx_national_monuments_name
    ON national_monuments(name);
CREATE INDEX IF NOT EXISTS idx_national_monuments_agency
    ON national_monuments(managing_agency);

-- RLS for national_monuments
ALTER TABLE national_monuments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "National monuments readable by all" ON national_monuments;
CREATE POLICY "National monuments readable by all" ON national_monuments FOR SELECT USING (true);

-- Trigger for national_monuments
DROP TRIGGER IF EXISTS national_monuments_updated_at ON national_monuments;
CREATE TRIGGER national_monuments_updated_at
    BEFORE UPDATE ON national_monuments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- Critical Habitat Areas (ESA)
CREATE TABLE IF NOT EXISTS critical_habitat (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identification
    external_id TEXT,                 -- USFWS ID
    species_name TEXT NOT NULL,       -- Common name
    scientific_name TEXT,
    listing_status TEXT,              -- 'endangered', 'threatened'

    -- Geometry
    boundary GEOMETRY(MULTIPOLYGON, 4326) NOT NULL,
    area_acres NUMERIC(12, 2),

    -- Regulatory info
    federal_register_citation TEXT,
    effective_date DATE,

    -- Impact on camping
    camping_restrictions TEXT,
    seasonal_restrictions TEXT,

    -- Provenance
    source_type TEXT,
    source_url TEXT,
    data_source_run_id UUID,

    -- Metadata
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT critical_habitat_boundary_srid_check
        CHECK (ST_SRID(boundary) = 4326),
    CONSTRAINT critical_habitat_boundary_valid_check
        CHECK (ST_IsValid(boundary))
);

-- Indexes for critical_habitat
CREATE INDEX IF NOT EXISTS idx_critical_habitat_boundary
    ON critical_habitat USING GIST(boundary);
CREATE INDEX IF NOT EXISTS idx_critical_habitat_species
    ON critical_habitat(species_name);
CREATE INDEX IF NOT EXISTS idx_critical_habitat_status
    ON critical_habitat(listing_status);

-- RLS for critical_habitat
ALTER TABLE critical_habitat ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Critical habitat readable by all" ON critical_habitat;
CREATE POLICY "Critical habitat readable by all" ON critical_habitat FOR SELECT USING (true);

-- Trigger for critical_habitat
DROP TRIGGER IF EXISTS critical_habitat_updated_at ON critical_habitat;
CREATE TRIGGER critical_habitat_updated_at
    BEFORE UPDATE ON critical_habitat
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- Inventoried Roadless Areas (USFS)
CREATE TABLE IF NOT EXISTS roadless_areas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identification
    external_id TEXT,
    name TEXT,
    ira_id TEXT,                      -- Inventoried Roadless Area ID

    -- Geometry
    boundary GEOMETRY(MULTIPOLYGON, 4326) NOT NULL,
    area_acres NUMERIC(12, 2),

    -- Management
    forest_name TEXT,
    ranger_district TEXT,
    state TEXT,

    -- Characteristics
    roadless_rule_applies BOOLEAN DEFAULT TRUE,

    -- Provenance
    source_type TEXT,
    source_url TEXT,
    data_source_run_id UUID,

    -- Metadata
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT roadless_areas_boundary_srid_check
        CHECK (ST_SRID(boundary) = 4326),
    CONSTRAINT roadless_areas_boundary_valid_check
        CHECK (ST_IsValid(boundary))
);

-- Indexes for roadless_areas
CREATE INDEX IF NOT EXISTS idx_roadless_areas_boundary
    ON roadless_areas USING GIST(boundary);
CREATE INDEX IF NOT EXISTS idx_roadless_areas_forest
    ON roadless_areas(forest_name);
CREATE INDEX IF NOT EXISTS idx_roadless_areas_ira
    ON roadless_areas(ira_id);

-- RLS for roadless_areas
ALTER TABLE roadless_areas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Roadless areas readable by all" ON roadless_areas;
CREATE POLICY "Roadless areas readable by all" ON roadless_areas FOR SELECT USING (true);

-- Trigger for roadless_areas
DROP TRIGGER IF EXISTS roadless_areas_updated_at ON roadless_areas;
CREATE TRIGGER roadless_areas_updated_at
    BEFORE UPDATE ON roadless_areas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- SECTION 9: ENSURE SPATIAL INDEXES ON EXISTING TABLES
-- =============================================================================

-- potential_spots
CREATE INDEX IF NOT EXISTS idx_potential_spots_location_gist
    ON potential_spots USING GIST(location);

-- road_segments
CREATE INDEX IF NOT EXISTS idx_road_segments_geometry_gist
    ON road_segments USING GIST(geometry);
CREATE INDEX IF NOT EXISTS idx_road_segments_start_gist
    ON road_segments USING GIST(start_point);
CREATE INDEX IF NOT EXISTS idx_road_segments_end_gist
    ON road_segments USING GIST(end_point);

-- public_lands
CREATE INDEX IF NOT EXISTS idx_public_lands_boundary_gist
    ON public_lands USING GIST(boundary);
CREATE INDEX IF NOT EXISTS idx_public_lands_centroid_gist
    ON public_lands USING GIST(centroid);

-- private_road_points
CREATE INDEX IF NOT EXISTS idx_private_road_points_location_gist
    ON private_road_points USING GIST(location);

-- established_campgrounds
CREATE INDEX IF NOT EXISTS idx_established_campgrounds_location_gist
    ON established_campgrounds USING GIST(location);

-- regions (if exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'regions' AND table_schema = 'public') THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_regions_bounds_gist ON regions USING GIST(bounds)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_regions_center_gist ON regions USING GIST(center)';
    END IF;
END$$;

-- road_closures (if exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'road_closures' AND table_schema = 'public') THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_road_closures_location_gist ON road_closures USING GIST(closure_location)';
    END IF;
END$$;

-- region_features (if exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'region_features' AND table_schema = 'public') THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_region_features_location_gist ON region_features USING GIST(location)';
    END IF;
END$$;

-- =============================================================================
-- SECTION 10: JSONB INDEXES FOR score_breakdown
-- =============================================================================

-- GIN index for general JSONB queries on potential_spots.score_breakdown
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'potential_spots'
        AND column_name = 'score_breakdown'
        AND table_schema = 'public'
    ) THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_potential_spots_score_breakdown_gin
            ON potential_spots USING GIN(score_breakdown)';
    END IF;
END$$;

-- GIN index for region_metrics.score_breakdown
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'region_metrics'
        AND column_name = 'score_breakdown'
        AND table_schema = 'public'
    ) THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_region_metrics_score_breakdown_gin
            ON region_metrics USING GIN(score_breakdown)';
    END IF;
END$$;

-- Expression index for common score_breakdown queries (e.g., filtering by a specific score component)
-- This indexes a specific path for faster equality/range queries
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'potential_spots'
        AND column_name = 'score_breakdown'
        AND table_schema = 'public'
    ) THEN
        -- Index for public_land_score component (common filter)
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_potential_spots_score_public_land
            ON potential_spots(((score_breakdown->>''public_land_score'')::numeric))
            WHERE score_breakdown IS NOT NULL';

        -- Index for road_access_score component
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_potential_spots_score_road_access
            ON potential_spots(((score_breakdown->>''road_access_score'')::numeric))
            WHERE score_breakdown IS NOT NULL';
    END IF;
END$$;

-- =============================================================================
-- SECTION 11: SRID ENFORCEMENT CONSTRAINTS (Additive, on new data only)
-- =============================================================================

-- Note: We cannot easily add CHECK constraints to existing tables with data
-- that might violate them. Instead, we create validation functions and
-- add constraints only to new tables (already done above).

-- Function to validate geometry SRID
CREATE OR REPLACE FUNCTION validate_geometry_srid_4326(geom GEOMETRY)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    IF geom IS NULL THEN
        RETURN TRUE;
    END IF;
    RETURN ST_SRID(geom) = 4326;
END;
$$;

-- Function to validate geometry is valid
CREATE OR REPLACE FUNCTION validate_geometry_valid(geom GEOMETRY)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    IF geom IS NULL THEN
        RETURN TRUE;
    END IF;
    RETURN ST_IsValid(geom);
END;
$$;

-- =============================================================================
-- SECTION 12: SOFT DELETE SUPPORT (Optional Audit Trail)
-- =============================================================================

-- Add deleted_at to core tables for soft delete support
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'potential_spots' AND table_schema = 'public') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'potential_spots' AND column_name = 'deleted_at') THEN
            ALTER TABLE potential_spots ADD COLUMN deleted_at TIMESTAMPTZ;
        END IF;
    END IF;
END$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'road_segments' AND table_schema = 'public') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'road_segments' AND column_name = 'deleted_at') THEN
            ALTER TABLE road_segments ADD COLUMN deleted_at TIMESTAMPTZ;
        END IF;
    END IF;
END$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'public_lands' AND table_schema = 'public') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'public_lands' AND column_name = 'deleted_at') THEN
            ALTER TABLE public_lands ADD COLUMN deleted_at TIMESTAMPTZ;
        END IF;
    END IF;
END$$;

-- Partial indexes for active records only (excludes soft-deleted)
CREATE INDEX IF NOT EXISTS idx_potential_spots_active
    ON potential_spots(id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_road_segments_active
    ON road_segments(id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_public_lands_active
    ON public_lands(id) WHERE deleted_at IS NULL;

-- =============================================================================
-- SECTION 13: HELPER FUNCTIONS
-- =============================================================================

-- Check if a point is within an exclusion zone
CREATE OR REPLACE FUNCTION is_in_exclusion_zone(
    p_location GEOMETRY,
    p_buffer_meters NUMERIC DEFAULT 0
)
RETURNS TABLE (
    is_excluded BOOLEAN,
    zone_type TEXT,
    zone_name TEXT,
    reason TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    RETURN QUERY
    SELECT
        TRUE as is_excluded,
        ez.exclusion_type::TEXT as zone_type,
        ez.name as zone_name,
        ez.reason
    FROM exclusion_zones ez
    WHERE ez.is_active = TRUE
      AND (ez.expiration_date IS NULL OR ez.expiration_date > CURRENT_DATE)
      AND ST_DWithin(
          ez.boundary::geography,
          p_location::geography,
          COALESCE(ez.buffer_meters, 0) + p_buffer_meters
      )
    LIMIT 1;

    -- Return false if no exclusion found
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    END IF;
END;
$$;

-- Check if a point is within wilderness
CREATE OR REPLACE FUNCTION is_in_wilderness(
    p_location GEOMETRY
)
RETURNS TABLE (
    is_wilderness BOOLEAN,
    wilderness_name TEXT,
    managing_agency TEXT,
    permit_required BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    RETURN QUERY
    SELECT
        TRUE as is_wilderness,
        wa.name as wilderness_name,
        wa.managing_agency,
        wa.permit_required
    FROM wilderness_areas wa
    WHERE wa.is_active = TRUE
      AND ST_Contains(wa.boundary, p_location)
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::TEXT, NULL::BOOLEAN;
    END IF;
END;
$$;

-- Get active regulations for a location
CREATE OR REPLACE FUNCTION get_regulations_at_location(
    p_location GEOMETRY,
    p_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    regulation_id UUID,
    regulation_type TEXT,
    title TEXT,
    description TEXT,
    restriction_level TEXT,
    issuing_agency TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    RETURN QUERY
    SELECT
        lr.id as regulation_id,
        lr.regulation_type::TEXT,
        lr.title,
        lr.description,
        lr.restriction_level,
        lr.issuing_agency
    FROM land_regulations lr
    WHERE lr.status IN ('active', 'seasonal', 'temporary')
      AND (lr.effective_date IS NULL OR lr.effective_date <= p_date)
      AND (lr.expiration_date IS NULL OR lr.expiration_date >= p_date)
      AND (
          -- Geometry-based match
          (lr.applies_to_geometry IS NOT NULL AND ST_Contains(lr.applies_to_geometry, p_location))
          OR
          -- Land-based match (via public_lands)
          (lr.public_land_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM public_lands pl
              WHERE pl.id = lr.public_land_id
              AND ST_Contains(pl.boundary, p_location)
          ))
      )
    ORDER BY
        CASE lr.regulation_type
            WHEN 'dispersed_camping' THEN 1
            WHEN 'fire_restriction' THEN 2
            WHEN 'permit_required' THEN 3
            ELSE 10
        END;
END;
$$;

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
