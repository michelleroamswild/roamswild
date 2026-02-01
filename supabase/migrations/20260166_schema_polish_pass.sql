-- =============================================================================
-- Migration: 20260166_schema_polish_pass.sql
-- Purpose: Future-proofing polish pass - additive columns and unified view
-- Constraints: All nullable, no renames/drops, simple types only
-- =============================================================================

-- =============================================================================
-- SECTION 1: UNIFIED SOURCE RECORD IDENTIFIER
-- A single consistent column for external record lookup across all feature tables
-- =============================================================================

-- potential_spots
ALTER TABLE potential_spots
    ADD COLUMN IF NOT EXISTS source_record_id TEXT;

-- road_segments
ALTER TABLE road_segments
    ADD COLUMN IF NOT EXISTS source_record_id TEXT;

-- public_lands
ALTER TABLE public_lands
    ADD COLUMN IF NOT EXISTS source_record_id TEXT;

-- established_campgrounds
ALTER TABLE established_campgrounds
    ADD COLUMN IF NOT EXISTS source_record_id TEXT;

-- private_road_points
ALTER TABLE private_road_points
    ADD COLUMN IF NOT EXISTS source_record_id TEXT;

-- Non-unique indexes for lookup/debugging
CREATE INDEX IF NOT EXISTS idx_potential_spots_source_record
    ON potential_spots(source_record_id);
CREATE INDEX IF NOT EXISTS idx_road_segments_source_record
    ON road_segments(source_record_id);
CREATE INDEX IF NOT EXISTS idx_public_lands_source_record
    ON public_lands(source_record_id);
CREATE INDEX IF NOT EXISTS idx_established_campgrounds_source_record
    ON established_campgrounds(source_record_id);
CREATE INDEX IF NOT EXISTS idx_private_road_points_source_record
    ON private_road_points(source_record_id);

-- =============================================================================
-- SECTION 2: VALIDITY / SOFT-DELETE LIFECYCLE FIELDS
-- For change tracking and historical audits
-- =============================================================================

-- potential_spots
ALTER TABLE potential_spots
    ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ;
ALTER TABLE potential_spots
    ADD COLUMN IF NOT EXISTS valid_to TIMESTAMPTZ;
-- deleted_at already added in previous migration, but be safe
ALTER TABLE potential_spots
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- road_segments
ALTER TABLE road_segments
    ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ;
ALTER TABLE road_segments
    ADD COLUMN IF NOT EXISTS valid_to TIMESTAMPTZ;
ALTER TABLE road_segments
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- public_lands
ALTER TABLE public_lands
    ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ;
ALTER TABLE public_lands
    ADD COLUMN IF NOT EXISTS valid_to TIMESTAMPTZ;
ALTER TABLE public_lands
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- established_campgrounds
ALTER TABLE established_campgrounds
    ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ;
ALTER TABLE established_campgrounds
    ADD COLUMN IF NOT EXISTS valid_to TIMESTAMPTZ;
ALTER TABLE established_campgrounds
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- private_road_points
ALTER TABLE private_road_points
    ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ;
ALTER TABLE private_road_points
    ADD COLUMN IF NOT EXISTS valid_to TIMESTAMPTZ;
ALTER TABLE private_road_points
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Partial indexes for active records (not soft-deleted)
-- Some may already exist from previous migration
CREATE INDEX IF NOT EXISTS idx_potential_spots_not_deleted
    ON potential_spots(id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_road_segments_not_deleted
    ON road_segments(id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_public_lands_not_deleted
    ON public_lands(id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_established_campgrounds_not_deleted
    ON established_campgrounds(id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_private_road_points_not_deleted
    ON private_road_points(id) WHERE deleted_at IS NULL;

-- Indexes on valid_to for temporal queries (can't use NOW() in partial index)
CREATE INDEX IF NOT EXISTS idx_potential_spots_valid_to
    ON potential_spots(valid_to)
    WHERE valid_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_road_segments_valid_to
    ON road_segments(valid_to)
    WHERE valid_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_public_lands_valid_to
    ON public_lands(valid_to)
    WHERE valid_to IS NOT NULL;

-- =============================================================================
-- SECTION 3: ATTRIBUTION DISPLAY HELPERS
-- Pre-formatted attribution for easy client rendering
-- =============================================================================

ALTER TABLE data_sources
    ADD COLUMN IF NOT EXISTS attribution_short TEXT;

ALTER TABLE data_sources
    ADD COLUMN IF NOT EXISTS attribution_html TEXT;

-- =============================================================================
-- SECTION 4: REGULATION AUTHORITY / CONFIDENCE
-- Distinguish official orders from inferred guidance
-- =============================================================================

-- authority_level: 'official', 'agency_guidance', 'inferred', etc.
ALTER TABLE land_regulations
    ADD COLUMN IF NOT EXISTS authority_level TEXT;

-- confidence_score: 0.0 to 1.0 (nullable)
ALTER TABLE land_regulations
    ADD COLUMN IF NOT EXISTS confidence_score NUMERIC;

-- Index for filtering by authority level
CREATE INDEX IF NOT EXISTS idx_land_regulations_authority
    ON land_regulations(authority_level);

-- =============================================================================
-- SECTION 5: UNIFIED DESIGNATIONS VIEW
-- Read-only union of all overlay tables with normalized columns
-- =============================================================================

-- Drop and recreate to ensure latest definition
DROP VIEW IF EXISTS designations;

CREATE VIEW designations AS

-- Wilderness Areas
SELECT
    id,
    'wilderness'::TEXT AS designation_type,
    name,
    boundary::GEOMETRY AS boundary,
    managing_agency,
    source_type,
    area_acres,
    designation_date,
    is_active,
    created_at,
    updated_at
FROM wilderness_areas

UNION ALL

-- Roadless Areas
SELECT
    id,
    'roadless_area'::TEXT AS designation_type,
    COALESCE(name, 'Inventoried Roadless Area') AS name,
    boundary::GEOMETRY AS boundary,
    NULL AS managing_agency,
    source_type,
    area_acres,
    NULL AS designation_date,
    is_active,
    created_at,
    updated_at
FROM roadless_areas

UNION ALL

-- National Monuments
SELECT
    id,
    'national_monument'::TEXT AS designation_type,
    name,
    boundary::GEOMETRY AS boundary,
    managing_agency,
    source_type,
    area_acres,
    designation_date,
    is_active,
    created_at,
    updated_at
FROM national_monuments

UNION ALL

-- Critical Habitat
SELECT
    id,
    'critical_habitat'::TEXT AS designation_type,
    species_name AS name,
    boundary::GEOMETRY AS boundary,
    NULL AS managing_agency,
    source_type,
    area_acres,
    effective_date AS designation_date,
    is_active,
    created_at,
    updated_at
FROM critical_habitat;

-- Add comment to view
COMMENT ON VIEW designations IS
    'Unified read-only view of all land designation overlays (wilderness, monuments, habitat, roadless areas)';

-- =============================================================================
-- VALIDATION QUERY
-- Run this after migration to confirm new columns/views exist
-- =============================================================================

/*
-- Copy and run in SQL Editor to validate:

SELECT 'source_record_id columns' AS check_type,
       table_name,
       '✓' AS status
FROM information_schema.columns
WHERE column_name = 'source_record_id'
  AND table_schema = 'public'
ORDER BY table_name;

SELECT 'valid_from columns' AS check_type,
       table_name,
       '✓' AS status
FROM information_schema.columns
WHERE column_name = 'valid_from'
  AND table_schema = 'public'
ORDER BY table_name;

SELECT 'attribution columns' AS check_type,
       column_name,
       '✓' AS status
FROM information_schema.columns
WHERE table_name = 'data_sources'
  AND column_name IN ('attribution_short', 'attribution_html');

SELECT 'regulation columns' AS check_type,
       column_name,
       '✓' AS status
FROM information_schema.columns
WHERE table_name = 'land_regulations'
  AND column_name IN ('authority_level', 'confidence_score');

SELECT 'designations view' AS check_type,
       table_name,
       table_type,
       '✓' AS status
FROM information_schema.tables
WHERE table_name = 'designations'
  AND table_schema = 'public';

-- Test the view returns data structure (will be empty if tables are empty)
SELECT designation_type, COUNT(*)
FROM designations
GROUP BY designation_type;
*/
