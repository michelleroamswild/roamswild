-- Adds the resolved public-land entity metadata directly onto each spot
-- so the detail panel and filters can show "this is in San Juan National
-- Forest, IUCN class VI" without re-running point-in-polygon checks.
-- These fields are populated at save time by the browser cache pipeline
-- using whatever boundary data was loaded (OSM boundary=protected_area,
-- USA Federal Lands ArcGIS, or PAD-US). Nullable: older rows and rows
-- saved without polygons loaded simply don't have it.

ALTER TABLE potential_spots
  ADD COLUMN IF NOT EXISTS land_unit_name TEXT,
  ADD COLUMN IF NOT EXISTS land_protect_class TEXT,
  ADD COLUMN IF NOT EXISTS land_protection_title TEXT;

CREATE INDEX IF NOT EXISTS idx_potential_spots_land_unit
  ON potential_spots(land_unit_name);
