-- The unified spots table — single source of truth for all spot-like
-- entities (camping, utilities, established campgrounds). Replaces the
-- per-source tables (community_spots, potential_spots, etc.) over time;
-- the old tables stay during transition for safety.
--
-- Three classification dimensions (orthogonal):
--   kind     — the primary type (drives map layer, icon, default panel)
--   sub_kind — finer detail within a kind (display-relevant)
--   source   — provenance / trust signal (which pipeline produced the row)

CREATE TABLE spots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Hierarchy: child sites of an established campground point at their parent
    parent_spot_id UUID REFERENCES spots(id) ON DELETE SET NULL,

    -- Identity
    name TEXT NOT NULL,
    description TEXT,

    -- Location
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    geometry GEOMETRY(POINT, 4326) GENERATED ALWAYS AS (
        ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
    ) STORED,

    -- Classification
    kind TEXT NOT NULL CHECK (kind IN (
        'dispersed_camping',
        'established_campground',
        'campground_site',
        'informal_camping',
        'water',
        'shower',
        'laundromat',
        'dump_station'
    )),
    sub_kind TEXT,                      -- e.g. derived | known | community | parking_lot | roadside | spigot
    source TEXT NOT NULL,               -- community | derived | osm | usfs | blm | nps | mvum | user_added
    source_external_id TEXT,            -- OSM way id, USFS facility id, etc.

    -- Land-of-record context
    public_land_unit TEXT,
    public_land_manager TEXT,            -- BLM | USFS | NPS | FWS | SDOL | CITY | ...
    public_land_designation TEXT,
    public_access TEXT,                  -- OA | RA | UK | XA
    land_type TEXT CHECK (land_type IN ('public', 'private', 'tribal', 'unknown')),

    -- Tags (the unified amenity bag — see spot_kind-specific notes in
    -- scripts/spot-import/README.md)
    amenities JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Source-specific extras that don't generalize (raw OSM tag bag,
    -- derived-spot score, MVUM tags, original name, etc.)
    extra JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- For user-added spots
    created_by_user_id UUID,             -- references auth.users(id)

    -- Provenance
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Spatial index for "spots near point" queries
CREATE INDEX idx_spots_geometry ON spots USING GIST(geometry);

-- Common filter combinations
CREATE INDEX idx_spots_kind ON spots(kind);
CREATE INDEX idx_spots_kind_subkind ON spots(kind, sub_kind);
CREATE INDEX idx_spots_source ON spots(source);
CREATE INDEX idx_spots_land_type ON spots(land_type) WHERE land_type IS NOT NULL;
CREATE INDEX idx_spots_manager ON spots(public_land_manager) WHERE public_land_manager IS NOT NULL;
CREATE INDEX idx_spots_parent ON spots(parent_spot_id) WHERE parent_spot_id IS NOT NULL;

-- Optional dedup index — same external id from same source should be unique
CREATE UNIQUE INDEX idx_spots_source_external_id
    ON spots(source, source_external_id)
    WHERE source_external_id IS NOT NULL;

-- RLS: read public, write service-role only
ALTER TABLE spots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read spots"
    ON spots FOR SELECT
    USING (true);

-- Generic updated_at trigger function (separate from the
-- community_spots-specific one so we don't couple the new table to
-- legacy migration code).
CREATE OR REPLACE FUNCTION update_spots_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_spots_updated_at
    BEFORE UPDATE ON spots
    FOR EACH ROW EXECUTE FUNCTION update_spots_timestamp();


-- ============================================================
-- spot_images — sibling table for satellite + user-uploaded photos
-- ============================================================

CREATE TABLE spot_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    spot_id UUID NOT NULL REFERENCES spots(id) ON DELETE CASCADE,

    image_type TEXT NOT NULL CHECK (image_type IN (
        'satellite',
        'user_upload',
        'street_view',
        'imported'
    )),
    source TEXT,                        -- google_static | mapbox | user | community | osm

    -- Storage
    storage_url TEXT,                   -- direct public URL (CDN, public bucket, or external API URL)
    storage_bucket TEXT,                -- Supabase Storage bucket (for our uploads)
    storage_path TEXT,                  -- key within bucket (for cleanup)

    -- Display
    display_order INTEGER NOT NULL DEFAULT 0,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    caption TEXT,
    width INTEGER,
    height INTEGER,

    -- Provenance
    uploaded_by_user_id UUID,
    uploaded_at TIMESTAMPTZ,
    taken_at TIMESTAMPTZ,                -- imagery date (satellite captures + EXIF)

    -- For satellite: parameters used so we can regen if needed
    satellite_zoom INTEGER,
    satellite_size TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_spot_images_spot ON spot_images(spot_id);
CREATE INDEX idx_spot_images_type ON spot_images(image_type);
-- Enforce at most one primary image per spot
CREATE UNIQUE INDEX idx_spot_images_one_primary
    ON spot_images(spot_id) WHERE is_primary;

ALTER TABLE spot_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read spot images"
    ON spot_images FOR SELECT
    USING (true);

CREATE TRIGGER trigger_spot_images_updated_at
    BEFORE UPDATE ON spot_images
    FOR EACH ROW EXECUTE FUNCTION update_spots_timestamp();
