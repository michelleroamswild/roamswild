-- Add spot_type to community_spots so the imported data can preserve the
-- "Spot type" tag from source CSV ("Natural Setting", "Roadside",
-- "Parking Lot", "Walk-in Only"). Unknown / blank rows store NULL.

ALTER TABLE community_spots
    ADD COLUMN spot_type TEXT;
