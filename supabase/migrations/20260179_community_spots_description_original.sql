-- Re-add description_original so the iotest review surface can show the
-- raw user-written description alongside the AI summary. Lets the
-- reviewer see what the source said when judging summary accuracy or
-- mis-classification.
ALTER TABLE community_spots
    ADD COLUMN description_original TEXT;
