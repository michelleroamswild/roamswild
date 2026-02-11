-- Fix designations view: use SECURITY INVOKER instead of SECURITY DEFINER
-- This ensures RLS policies of the querying user are enforced

DROP VIEW IF EXISTS designations;

CREATE VIEW designations
WITH (security_invoker = true) AS

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

COMMENT ON VIEW designations IS
    'Unified read-only view of all land designation overlays (wilderness, monuments, habitat, roadless areas)';
