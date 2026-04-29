-- Add the rest of the CSV amenity columns. These line up with the
-- unified tag set documented in scripts/spot-import/README.md so
-- community_spots and potential_spots can render the same amenity
-- badges in the explorer.

ALTER TABLE community_spots
    ADD COLUMN pet_friendly BOOLEAN,
    ADD COLUMN wifi TEXT,
    ADD COLUMN electricity TEXT,
    ADD COLUMN showers_amenity TEXT,        -- in-spot shower amenity (separate from the showers category)
    ADD COLUMN dump_station TEXT,
    ADD COLUMN water_potability TEXT,
    ADD COLUMN road_surface TEXT,
    ADD COLUMN surroundings TEXT;           -- terrain hint
