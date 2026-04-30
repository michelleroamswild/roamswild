-- Drop empty/orphaned tables identified in the 2026-04-29 audit.
--
-- All 11 tables have zero rows. The only code references are in the
-- auto-generated src/integrations/supabase/types.ts (which regenerates
-- from the live schema) and one audit script (scripts/validate_schema_gaps.sql)
-- updated alongside this migration.
--
-- Categories:
--   - Stub tables that never got data imported (critical_habitat,
--     exclusion_zones, land_regulations, national_monuments, roadless_areas,
--     wilderness_areas, designations) — overlapping classifications already
--     covered by public_lands.
--   - Pre-unified-spots leftovers (campsite_photos — superseded by spot_images).
--   - Always-empty placeholders (region_features, road_closures,
--     seasonal_conditions).
--
-- CASCADE handles FK dependents (which are zero in practice since the tables
-- are empty, but keeps the migration robust against any policies/views).

DROP TABLE IF EXISTS campsite_photos CASCADE;
DROP TABLE IF EXISTS critical_habitat CASCADE;
DROP TABLE IF EXISTS designations CASCADE;
DROP TABLE IF EXISTS exclusion_zones CASCADE;
DROP TABLE IF EXISTS land_regulations CASCADE;
DROP TABLE IF EXISTS national_monuments CASCADE;
DROP TABLE IF EXISTS region_features CASCADE;
DROP TABLE IF EXISTS road_closures CASCADE;
DROP TABLE IF EXISTS roadless_areas CASCADE;
DROP TABLE IF EXISTS seasonal_conditions CASCADE;
DROP TABLE IF EXISTS wilderness_areas CASCADE;
