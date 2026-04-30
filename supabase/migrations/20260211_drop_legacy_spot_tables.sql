-- Drop the legacy spot data sources now that the unified `spots` table is
-- the single source of truth, and drop private_road_points which we only
-- needed for one-time derivation filtering.
--
-- Pre-conditions verified earlier this session:
--   - community_spots:        24,367 rows → all in spots (source=community)
--   - potential_spots:        13,229 rows → in spots (source ∈ osm/mvum/blm/derived)
--   - established_campgrounds:    400 rows → 391 in spots (9 day-use/trailheads
--                                            intentionally skipped by mirror trigger)
--   - All read/write paths cut over to `spots`. Mirror triggers no longer
--     fire because nothing inserts into the legacy tables anymore.
--
-- Storage recovered: ~50-100 MB across these tables, plus indexes.
-- This frees disk-IO budget on Supabase Free.

-- =================================================================
-- 1. Neutralize is_near_private_road — derive_spots_from_linked_roads
-- still calls it. Returning FALSE means no spots get filtered as
-- "near private road" anymore. Future bulk-pan campaigns can re-add
-- private_road_points + restore the function body if filtering matters.
-- =================================================================
CREATE OR REPLACE FUNCTION is_near_private_road(p_point GEOMETRY)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    RETURN FALSE;
END;
$$;

-- =================================================================
-- 2. Drop the data tables. CASCADE handles their triggers, indexes,
-- RLS policies, and any forgotten dependents.
-- =================================================================
DROP TABLE IF EXISTS private_road_points CASCADE;
DROP TABLE IF EXISTS community_spots CASCADE;
DROP TABLE IF EXISTS potential_spots CASCADE;
DROP TABLE IF EXISTS established_campgrounds CASCADE;

-- =================================================================
-- 3. Drop the mirror trigger functions — they have nothing to fire on
-- now that the source tables are gone, but the function definitions
-- linger in the catalog otherwise.
-- =================================================================
DROP FUNCTION IF EXISTS mirror_potential_spot_to_spots() CASCADE;
DROP FUNCTION IF EXISTS mirror_established_campground_to_spots() CASCADE;
