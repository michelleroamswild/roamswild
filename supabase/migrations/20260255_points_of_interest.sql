-- Points of interest: outdoor highlights, viewpoints, hidden gems, hikes,
-- arches, overlooks, etc. Built by the utah-trip-engine pipeline locally,
-- then bulk-loaded into this table region by region.
--
-- Mirrors the local `master_places` table minus internal-only columns
-- (`member_poi_ids` — uuid[] pointing at raw source rows that don't exist
-- in production).
--
-- RLS: public read, writes blocked from anon/authenticated clients (same
-- pattern as `spots`). Refresh path: drop + recreate via pg_dump.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE points_of_interest (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_name          TEXT NOT NULL,
    geom                    GEOMETRY(Point, 4326) NOT NULL,
    poi_type                TEXT NOT NULL,
    source_count            INTEGER NOT NULL DEFAULT 1,
    sources                 JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_hidden_gem           BOOLEAN NOT NULL DEFAULT false,
    photo_count             INTEGER NOT NULL DEFAULT 0,
    locationscout_endorsed  BOOLEAN NOT NULL DEFAULT false,
    metadata_tags           JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_points_of_interest_geom ON points_of_interest USING GIST (geom);
CREATE INDEX idx_points_of_interest_poi_type ON points_of_interest (poi_type);
CREATE INDEX idx_points_of_interest_source_count ON points_of_interest (source_count);
CREATE INDEX idx_points_of_interest_photo_count ON points_of_interest (photo_count);
CREATE INDEX idx_points_of_interest_hidden_gem ON points_of_interest (is_hidden_gem) WHERE is_hidden_gem = true;

ALTER TABLE points_of_interest ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read points_of_interest"
    ON points_of_interest FOR SELECT
    USING (true);

CREATE OR REPLACE FUNCTION update_points_of_interest_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_points_of_interest_updated_at
    BEFORE UPDATE ON points_of_interest
    FOR EACH ROW EXECUTE FUNCTION update_points_of_interest_timestamp();

COMMENT ON TABLE points_of_interest IS
    'Deduplicated outdoor POIs (highlights, viewpoints, hidden gems, hikes, arches, overlooks). Loaded from the utah-trip-engine pipeline. Refreshed by drop + recreate.';
COMMENT ON COLUMN points_of_interest.sources IS
    'Array of {source, source_external_id, source_url} confirming this POI. source_count = length(sources).';
COMMENT ON COLUMN points_of_interest.metadata_tags IS
    'Free-form enrichment: activity_tags, crowdedness, derived_gem, sun_ephemeris, nearby, vision_data, etc.';
