-- Community-sourced camping spots and travel utilities.
--
-- Distinct from:
--   * `potential_spots` — derived/computed by the dispersed pipeline from
--     road junctions, terrain, etc.
--   * user campsites tables — personal lists saved by individual users.

CREATE TABLE community_spots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity
    name TEXT NOT NULL,                 -- cleaned display name
    name_original TEXT,                 -- raw input name (debug/QA only)
    category TEXT NOT NULL,             -- 'wild_camping' | 'informal_campsite' | 'water' | 'showers' | 'laundromat'

    -- Location
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    geometry GEOMETRY(POINT, 4326) GENERATED ALWAYS AS (
        ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
    ) STORED,

    -- Public-land context (null for utility categories)
    public_land_unit TEXT,
    public_land_manager TEXT,           -- 'BLM' | 'USFS' | 'NPS' | 'SLB' | etc.
    public_land_designation TEXT,
    public_access TEXT,                 -- 'OA' | 'RA' | 'UK' | 'XA'

    -- Description
    description TEXT,                   -- short cleaned summary

    -- Amenity tags. Booleans for yes/no, text for varied values like
    -- "Pit Toilets" or "Yes - Slow".
    water TEXT,
    big_rig_friendly BOOLEAN,
    tent_friendly BOOLEAN,
    toilets TEXT,

    -- Future-proofing: extra tags we don't promote to columns yet
    extra_tags JSONB,

    imported_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Spatial index for "spots near point" queries
CREATE INDEX idx_community_spots_geometry ON community_spots USING GIST (geometry);

-- Common filter combinations
CREATE INDEX idx_community_spots_category ON community_spots (category);
CREATE INDEX idx_community_spots_manager ON community_spots (public_land_manager)
    WHERE public_land_manager IS NOT NULL;

-- RLS: read-only public table. Anyone can read; only service role can write.
ALTER TABLE community_spots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read community spots"
    ON community_spots FOR SELECT
    USING (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_community_spots_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_community_spots_updated_at
    BEFORE UPDATE ON community_spots
    FOR EACH ROW EXECUTE FUNCTION update_community_spots_timestamp();
