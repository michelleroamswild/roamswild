-- Add unique constraint on external_id for road_segments table
-- This enables proper upsert behavior when importing roads

-- First, remove any duplicates (keep the first one)
DELETE FROM road_segments a
USING road_segments b
WHERE a.id > b.id
  AND a.external_id = b.external_id
  AND a.external_id IS NOT NULL;

-- Add unique constraint
ALTER TABLE road_segments
ADD CONSTRAINT road_segments_external_id_unique UNIQUE (external_id);
