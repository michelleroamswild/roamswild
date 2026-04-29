-- Description-derived tags. These are extracted by a regex parser from
-- the raw user-written description (not the AI summary). Stored as
-- separate columns so they're queryable.

ALTER TABLE community_spots
    ADD COLUMN cell_service JSONB,         -- {"verizon": 4, "att": 3, "tmobile": null} or {"none": true}
    ADD COLUMN vehicle_required TEXT;      -- 'passenger' | 'high_clearance' | '4wd' | null
