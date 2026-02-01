-- =============================================================================
-- VALIDATION QUERIES FOR 20260165_schema_gaps_comprehensive.sql
-- Run after migration to confirm schema is complete
-- =============================================================================

-- =============================================================================
-- 1. VERIFY NEW TABLES EXIST
-- =============================================================================
SELECT
    'NEW TABLES' as check_category,
    expected.table_name,
    CASE WHEN t.table_name IS NOT NULL THEN '✓ EXISTS' ELSE '✗ MISSING' END as status
FROM (VALUES
    ('data_sources'),
    ('land_regulations'),
    ('exclusion_zones'),
    ('wilderness_areas'),
    ('national_monuments'),
    ('critical_habitat'),
    ('roadless_areas')
) AS expected(table_name)
LEFT JOIN information_schema.tables t
    ON t.table_name = expected.table_name
    AND t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
ORDER BY expected.table_name;

-- =============================================================================
-- 2. VERIFY NEW ENUMS EXIST
-- =============================================================================
SELECT
    'ENUMS' as check_category,
    expected.enum_name,
    CASE WHEN t.typname IS NOT NULL THEN '✓ EXISTS' ELSE '✗ MISSING' END as status
FROM (VALUES
    ('regulation_type'),
    ('regulation_status'),
    ('exclusion_type'),
    ('designation_type')
) AS expected(enum_name)
LEFT JOIN pg_type t ON t.typname = expected.enum_name
LEFT JOIN pg_namespace n ON n.oid = t.typnamespace AND n.nspname = 'public'
ORDER BY expected.enum_name;

-- =============================================================================
-- 3. VERIFY PROVENANCE COLUMNS ON CORE TABLES
-- =============================================================================
SELECT
    'PROVENANCE COLUMNS' as check_category,
    expected.table_name,
    expected.column_name,
    CASE WHEN c.column_name IS NOT NULL THEN '✓ EXISTS' ELSE '✗ MISSING' END as status
FROM (VALUES
    ('potential_spots', 'data_source_run_id'),
    ('potential_spots', 'derivation_algorithm'),
    ('potential_spots', 'derivation_version'),
    ('potential_spots', 'derived_at'),
    ('potential_spots', 'derivation_run_id'),
    ('potential_spots', 'deleted_at'),
    ('road_segments', 'data_source_run_id'),
    ('road_segments', 'deleted_at'),
    ('public_lands', 'data_source_run_id'),
    ('public_lands', 'deleted_at'),
    ('established_campgrounds', 'data_source_run_id'),
    ('private_road_points', 'data_source_run_id'),
    ('region_metrics', 'algorithm_version')
) AS expected(table_name, column_name)
LEFT JOIN information_schema.columns c
    ON c.table_name = expected.table_name
    AND c.column_name = expected.column_name
    AND c.table_schema = 'public'
ORDER BY expected.table_name, expected.column_name;

-- =============================================================================
-- 4. VERIFY SPATIAL INDEXES (GIST)
-- =============================================================================
SELECT
    'SPATIAL INDEXES' as check_category,
    tablename,
    indexname,
    '✓ EXISTS' as status
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexdef LIKE '%GIST%'
ORDER BY tablename, indexname;

-- =============================================================================
-- 5. VERIFY JSONB INDEXES
-- =============================================================================
SELECT
    'JSONB INDEXES' as check_category,
    tablename,
    indexname,
    '✓ EXISTS' as status
FROM pg_indexes
WHERE schemaname = 'public'
  AND (indexdef LIKE '%GIN%' OR indexdef LIKE '%score_breakdown%')
ORDER BY tablename, indexname;

-- =============================================================================
-- 6. VERIFY RLS POLICIES
-- =============================================================================
SELECT
    'RLS POLICIES' as check_category,
    tablename,
    policyname,
    '✓ EXISTS' as status
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'data_sources',
    'land_regulations',
    'exclusion_zones',
    'wilderness_areas',
    'national_monuments',
    'critical_habitat',
    'roadless_areas'
  )
ORDER BY tablename;

-- =============================================================================
-- 7. VERIFY FUNCTIONS EXIST
-- =============================================================================
SELECT
    'FUNCTIONS' as check_category,
    expected.function_name,
    CASE WHEN r.routine_name IS NOT NULL THEN '✓ EXISTS' ELSE '✗ MISSING' END as status
FROM (VALUES
    ('update_updated_at_column'),
    ('validate_geometry_srid_4326'),
    ('validate_geometry_valid'),
    ('is_in_exclusion_zone'),
    ('is_in_wilderness'),
    ('get_regulations_at_location')
) AS expected(function_name)
LEFT JOIN information_schema.routines r
    ON r.routine_name = expected.function_name
    AND r.routine_schema = 'public'
ORDER BY expected.function_name;

-- =============================================================================
-- 8. VERIFY GEOMETRY CONSTRAINTS ON NEW TABLES
-- =============================================================================
SELECT
    'GEOMETRY CONSTRAINTS' as check_category,
    tc.table_name,
    tc.constraint_name,
    '✓ EXISTS' as status
FROM information_schema.table_constraints tc
WHERE tc.table_schema = 'public'
  AND tc.constraint_type = 'CHECK'
  AND (tc.constraint_name LIKE '%srid%' OR tc.constraint_name LIKE '%valid%')
ORDER BY tc.table_name, tc.constraint_name;

-- =============================================================================
-- 9. NEW TABLE ROW COUNTS (should all be 0 initially)
-- =============================================================================
SELECT 'ROW COUNTS' as check_category, 'data_sources' as table_name, COUNT(*) as row_count FROM data_sources
UNION ALL
SELECT 'ROW COUNTS', 'land_regulations', COUNT(*) FROM land_regulations
UNION ALL
SELECT 'ROW COUNTS', 'exclusion_zones', COUNT(*) FROM exclusion_zones
UNION ALL
SELECT 'ROW COUNTS', 'wilderness_areas', COUNT(*) FROM wilderness_areas
UNION ALL
SELECT 'ROW COUNTS', 'national_monuments', COUNT(*) FROM national_monuments
UNION ALL
SELECT 'ROW COUNTS', 'critical_habitat', COUNT(*) FROM critical_habitat
UNION ALL
SELECT 'ROW COUNTS', 'roadless_areas', COUNT(*) FROM roadless_areas;

-- =============================================================================
-- 10. VERIFY TRIGGERS
-- =============================================================================
SELECT
    'TRIGGERS' as check_category,
    event_object_table as table_name,
    trigger_name,
    '✓ EXISTS' as status
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name LIKE '%updated_at%'
  AND event_object_table IN (
    'data_sources',
    'land_regulations',
    'exclusion_zones',
    'wilderness_areas',
    'national_monuments',
    'critical_habitat',
    'roadless_areas'
  )
ORDER BY event_object_table;

-- =============================================================================
-- 11. SRID CONSISTENCY CHECK (all geometry columns should be 4326)
-- =============================================================================
SELECT
    'SRID CHECK' as check_category,
    f_table_name as table_name,
    f_geometry_column as column_name,
    srid,
    CASE WHEN srid = 4326 THEN '✓ CORRECT' ELSE '✗ WRONG SRID' END as status
FROM geometry_columns
WHERE f_table_schema = 'public'
ORDER BY f_table_name, f_geometry_column;

-- =============================================================================
-- SUMMARY
-- =============================================================================
SELECT '========================================' as summary;
SELECT 'Migration validation complete.' as summary;
SELECT 'All items marked ✓ are correctly configured.' as summary;
SELECT 'Any items marked ✗ need investigation.' as summary;
SELECT '========================================' as summary;
