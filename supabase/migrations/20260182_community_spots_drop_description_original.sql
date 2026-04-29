-- Drop description_original from community_spots. We added this back for
-- the iotest review pass where we needed to compare the AI summary
-- against the raw user-written description. Now that the review pass is
-- complete and the unified `spots` table is the going-forward model, we
-- don't need it anymore.

ALTER TABLE community_spots
    DROP COLUMN IF EXISTS description_original;
