-- ============================================
-- SURPRISE ME FEATURE SCHEMA
-- ============================================
-- Geographic regions with scoring for "Surprise Me" recommendations

-- ============================================
-- EXTENSIONS
-- ============================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE biome_type AS ENUM (
    'desert',
    'alpine',
    'forest',
    'coastal',
    'grassland'
);

CREATE TYPE data_source_type AS ENUM (
    'pad_us',
    'osm',
    'usfs',
    'blm',
    'nps',
    'ridb',
    'noaa',
    'manual',
    'derived'
);

CREATE TYPE road_surface_type AS ENUM (
    'paved',
    'gravel',
    'dirt',
    '4wd_only',
    'no_vehicle_access'
);

CREATE TYPE run_status AS ENUM (
    'running',
    'completed',
    'failed',
    'partial'
);

-- ============================================
-- TABLE: data_source_runs
-- ============================================

CREATE TABLE data_source_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    source_type data_source_type NOT NULL,
    source_version TEXT,
    source_url TEXT,

    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status run_status NOT NULL DEFAULT 'running',

    geographic_bounds GEOMETRY(POLYGON, 4326),
    regions_created INTEGER DEFAULT 0,
    regions_updated INTEGER DEFAULT 0,
    metrics_updated INTEGER DEFAULT 0,

    error_message TEXT,
    error_details JSONB,
    source_checksum TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_data_source_runs_source ON data_source_runs(source_type);
CREATE INDEX idx_data_source_runs_status ON data_source_runs(status);
CREATE INDEX idx_data_source_runs_started ON data_source_runs(started_at DESC);

-- ============================================
-- TABLE: regions
-- ============================================

CREATE TABLE regions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    tagline TEXT,
    description TEXT,

    bounds GEOMETRY(POLYGON, 4326) NOT NULL,
    center GEOMETRY(POINT, 4326) NOT NULL,
    area_sq_miles NUMERIC(10, 2),

    bbox_north NUMERIC(9, 6) NOT NULL,
    bbox_south NUMERIC(9, 6) NOT NULL,
    bbox_east NUMERIC(9, 6) NOT NULL,
    bbox_west NUMERIC(9, 6) NOT NULL,

    primary_biome biome_type,
    secondary_biomes biome_type[],

    parent_region_id UUID REFERENCES regions(id) ON DELETE SET NULL,
    region_type TEXT DEFAULT 'standard',
    h3_index TEXT,

    created_by_run_id UUID REFERENCES data_source_runs(id),
    last_updated_by_run_id UUID REFERENCES data_source_runs(id),

    is_active BOOLEAN DEFAULT TRUE,
    is_curated BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_regions_bounds_gist ON regions USING GIST(bounds);
CREATE INDEX idx_regions_center_gist ON regions USING GIST(center);
CREATE INDEX idx_regions_slug ON regions(slug);
CREATE INDEX idx_regions_biome ON regions(primary_biome);
CREATE INDEX idx_regions_active ON regions(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_regions_curated ON regions(is_curated) WHERE is_curated = TRUE;
CREATE INDEX idx_regions_name_trgm ON regions USING GIN(name gin_trgm_ops);
CREATE INDEX idx_regions_parent ON regions(parent_region_id);

-- ============================================
-- TABLE: region_metrics
-- ============================================

CREATE TABLE region_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    region_id UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,

    -- Public Land
    public_land_pct NUMERIC(5, 2),
    public_land_score NUMERIC(5, 2),
    land_manager_breakdown JSONB,

    -- Trails
    trail_count INTEGER DEFAULT 0,
    trail_total_miles NUMERIC(8, 2),
    trail_density_per_sq_mile NUMERIC(6, 3),
    trail_density_score NUMERIC(5, 2),
    trail_diversity_index NUMERIC(4, 3),
    trail_types JSONB,

    -- Campsites
    campsite_count INTEGER DEFAULT 0,
    dispersed_camping_allowed BOOLEAN DEFAULT FALSE,
    campsite_density_score NUMERIC(5, 2),
    campsite_types JSONB,

    -- Popularity
    review_count INTEGER DEFAULT 0,
    monthly_bookings INTEGER DEFAULT 0,
    wiki_presence_score NUMERIC(3, 2),
    raw_popularity NUMERIC(6, 3),
    popularity_percentile NUMERIC(5, 4),
    popularity_score NUMERIC(5, 2),

    -- Remoteness
    distance_to_town_10k_miles NUMERIC(6, 2),
    distance_to_interstate_miles NUMERIC(6, 2),
    remoteness_score NUMERIC(5, 2),

    -- Elevation
    elevation_min_ft INTEGER,
    elevation_max_ft INTEGER,
    elevation_avg_ft INTEGER,
    elevation_gain_total_ft INTEGER,

    -- Seasonal Access
    typical_season_start INTEGER,
    typical_season_end INTEGER,
    current_snow_cover_pct NUMERIC(5, 2),
    current_snowline_ft INTEGER,
    seasonal_access_score NUMERIC(5, 2),
    seasonal_last_updated TIMESTAMPTZ,

    -- Road Access
    best_road_surface road_surface_type,
    has_paved_access BOOLEAN DEFAULT FALSE,
    road_access_score NUMERIC(5, 2),

    -- Connectivity
    cell_coverage_pct NUMERIC(5, 2),
    has_cell_coverage BOOLEAN DEFAULT FALSE,

    -- Composite
    quality_score NUMERIC(5, 2),
    score_breakdown JSONB,
    score_computed_at TIMESTAMPTZ,

    -- Lineage
    metrics_version INTEGER DEFAULT 1,
    last_updated_by_run_id UUID REFERENCES data_source_runs(id),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(region_id)
);

CREATE INDEX idx_region_metrics_region ON region_metrics(region_id);
CREATE INDEX idx_region_metrics_quality ON region_metrics(quality_score DESC);
CREATE INDEX idx_region_metrics_popularity ON region_metrics(popularity_score);
CREATE INDEX idx_region_metrics_seasonal ON region_metrics(seasonal_access_score);
CREATE INDEX idx_region_metrics_trails ON region_metrics(trail_count);
CREATE INDEX idx_region_metrics_filters ON region_metrics(
    public_land_pct,
    trail_count,
    seasonal_access_score
) WHERE public_land_pct >= 25 AND trail_count >= 3;

-- ============================================
-- TABLE: surprise_history
-- ============================================

CREATE TABLE surprise_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id TEXT,

    region_id UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
    region_name TEXT NOT NULL,
    region_biome biome_type,

    request_params JSONB,
    user_lat NUMERIC(9, 6),
    user_lng NUMERIC(9, 6),
    distance_miles NUMERIC(6, 2),

    score_at_selection NUMERIC(5, 2),
    score_breakdown JSONB,
    candidates_count INTEGER,
    selection_attempt INTEGER,
    was_fallback BOOLEAN DEFAULT FALSE,

    clicked_through BOOLEAN DEFAULT FALSE,
    saved_to_trips BOOLEAN DEFAULT FALSE,

    recommended_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    clicked_at TIMESTAMPTZ,

    CONSTRAINT user_or_session CHECK (user_id IS NOT NULL OR session_id IS NOT NULL)
);

CREATE INDEX idx_surprise_history_user_recent ON surprise_history(
    user_id,
    recommended_at DESC
) WHERE user_id IS NOT NULL;

CREATE INDEX idx_surprise_history_session_recent ON surprise_history(
    session_id,
    recommended_at DESC
) WHERE session_id IS NOT NULL;

CREATE INDEX idx_surprise_history_region ON surprise_history(region_id);
CREATE INDEX idx_surprise_history_biome ON surprise_history(user_id, region_biome);
CREATE INDEX idx_surprise_history_date ON surprise_history(recommended_at DESC);

-- ============================================
-- TABLE: region_features
-- ============================================

CREATE TABLE region_features (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    region_id UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,

    feature_type TEXT NOT NULL,
    external_id TEXT,

    name TEXT NOT NULL,
    description TEXT,

    location GEOMETRY(POINT, 4326),

    metadata JSONB,

    popularity_rank INTEGER,
    quality_rank INTEGER,

    source_type data_source_type,
    last_updated_by_run_id UUID REFERENCES data_source_runs(id),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_region_features_region ON region_features(region_id);
CREATE INDEX idx_region_features_type ON region_features(region_id, feature_type);
CREATE INDEX idx_region_features_location ON region_features USING GIST(location);
CREATE INDEX idx_region_features_ranking ON region_features(region_id, feature_type, popularity_rank);

-- ============================================
-- TABLE: seasonal_conditions
-- ============================================

CREATE TABLE seasonal_conditions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    region_id UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,

    recorded_date DATE NOT NULL,

    snow_cover_pct NUMERIC(5, 2),
    snowline_ft INTEGER,
    snow_depth_inches NUMERIC(5, 1),

    roads_open_pct NUMERIC(5, 2),
    primary_access_open BOOLEAN,

    temp_high_f INTEGER,
    temp_low_f INTEGER,
    precip_chance_pct INTEGER,

    active_alerts JSONB,

    source_type data_source_type,
    data_source_run_id UUID REFERENCES data_source_runs(id),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(region_id, recorded_date)
);

CREATE INDEX idx_seasonal_conditions_region_date ON seasonal_conditions(region_id, recorded_date DESC);
CREATE INDEX idx_seasonal_conditions_date ON seasonal_conditions(recorded_date DESC);

-- ============================================
-- TABLE: road_closures
-- ============================================

CREATE TABLE road_closures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    region_id UUID REFERENCES regions(id) ON DELETE CASCADE,

    road_name TEXT NOT NULL,
    road_segment TEXT,
    road_osm_id BIGINT,

    closure_type TEXT,
    is_full_closure BOOLEAN DEFAULT TRUE,
    affects_primary_access BOOLEAN DEFAULT FALSE,

    closure_location GEOMETRY(LINESTRING, 4326),

    start_date DATE,
    expected_end_date DATE,
    is_indefinite BOOLEAN DEFAULT FALSE,

    source_url TEXT,
    source_agency TEXT,
    last_verified_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_road_closures_region ON road_closures(region_id);
CREATE INDEX idx_road_closures_active ON road_closures(start_date, expected_end_date)
    WHERE expected_end_date IS NULL OR expected_end_date >= CURRENT_DATE;
CREATE INDEX idx_road_closures_location ON road_closures USING GIST(closure_location);

-- ============================================
-- TRIGGER: updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER regions_updated_at
    BEFORE UPDATE ON regions
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER region_metrics_updated_at
    BEFORE UPDATE ON region_metrics
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER region_features_updated_at
    BEFORE UPDATE ON region_features
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER road_closures_updated_at
    BEFORE UPDATE ON road_closures
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- ============================================
-- VIEWS
-- ============================================

CREATE VIEW regions_with_metrics AS
SELECT
    r.*,
    m.public_land_pct,
    m.public_land_score,
    m.trail_count,
    m.trail_density_score,
    m.campsite_count,
    m.dispersed_camping_allowed,
    m.campsite_density_score,
    m.popularity_score,
    m.popularity_percentile,
    m.remoteness_score,
    m.elevation_min_ft,
    m.elevation_avg_ft,
    m.elevation_max_ft,
    m.seasonal_access_score,
    m.best_road_surface,
    m.cell_coverage_pct,
    m.has_cell_coverage,
    m.quality_score
FROM regions r
LEFT JOIN region_metrics m ON r.id = m.region_id
WHERE r.is_active = TRUE;

CREATE VIEW region_current_conditions AS
SELECT DISTINCT ON (region_id)
    region_id,
    recorded_date,
    snow_cover_pct,
    snowline_ft,
    roads_open_pct,
    primary_access_open,
    active_alerts
FROM seasonal_conditions
ORDER BY region_id, recorded_date DESC;

-- ============================================
-- FUNCTIONS
-- ============================================

CREATE OR REPLACE FUNCTION get_regions_within_distance(
    user_lat NUMERIC,
    user_lng NUMERIC,
    max_distance_miles NUMERIC,
    min_distance_miles NUMERIC DEFAULT 0
)
RETURNS TABLE (
    region_id UUID,
    distance_miles NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        r.id as region_id,
        (ST_Distance(
            r.center::geography,
            ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography
        ) / 1609.34)::NUMERIC(8,2) as distance_miles
    FROM regions r
    WHERE r.is_active = TRUE
      AND ST_DWithin(
          r.center::geography,
          ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography,
          max_distance_miles * 1609.34
      )
      AND ST_Distance(
          r.center::geography,
          ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography
      ) >= min_distance_miles * 1609.34
    ORDER BY distance_miles;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION get_user_recent_biomes(
    p_user_id UUID,
    p_limit INTEGER DEFAULT 5
)
RETURNS biome_type[] AS $$
BEGIN
    RETURN ARRAY(
        SELECT region_biome
        FROM surprise_history
        WHERE user_id = p_user_id
          AND region_biome IS NOT NULL
        ORDER BY recommended_at DESC
        LIMIT p_limit
    );
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION get_diversity_multiplier(
    p_biome biome_type,
    p_recent_biomes biome_type[]
)
RETURNS NUMERIC AS $$
DECLARE
    biome_count INTEGER;
BEGIN
    IF p_recent_biomes IS NULL OR array_length(p_recent_biomes, 1) IS NULL THEN
        RETURN 1.15;
    END IF;

    SELECT COUNT(*) INTO biome_count
    FROM unnest(p_recent_biomes) AS b
    WHERE b = p_biome;

    RETURN CASE
        WHEN biome_count = 0 THEN 1.15
        WHEN biome_count = 1 THEN 1.05
        WHEN biome_count = 2 THEN 1.00
        ELSE 0.85
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Get snowline estimate by latitude and month
CREATE OR REPLACE FUNCTION get_snowline_ft(
    lat NUMERIC,
    month_num INTEGER
)
RETURNS INTEGER AS $$
DECLARE
    base_snowline INTEGER;
    lat_adjustment INTEGER;
BEGIN
    -- Base snowline by month (for ~40°N latitude)
    base_snowline := CASE month_num
        WHEN 1 THEN 4500
        WHEN 2 THEN 4500
        WHEN 3 THEN 5500
        WHEN 4 THEN 6500
        WHEN 5 THEN 7500
        WHEN 6 THEN 9000
        WHEN 7 THEN 10500
        WHEN 8 THEN 10500
        WHEN 9 THEN 10500
        WHEN 10 THEN 8000
        WHEN 11 THEN 6000
        WHEN 12 THEN 4500
        ELSE 6000
    END;

    -- Adjust for latitude (higher lat = lower snowline)
    -- ~200ft lower per degree north of 40°N
    lat_adjustment := ((40 - lat) * 200)::INTEGER;

    RETURN base_snowline + lat_adjustment;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE region_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE region_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasonal_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE road_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE surprise_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_source_runs ENABLE ROW LEVEL SECURITY;

-- Public read for region data
CREATE POLICY "Regions are publicly readable"
    ON regions FOR SELECT USING (is_active = TRUE);

CREATE POLICY "Region metrics are publicly readable"
    ON region_metrics FOR SELECT USING (TRUE);

CREATE POLICY "Region features are publicly readable"
    ON region_features FOR SELECT USING (TRUE);

CREATE POLICY "Seasonal conditions are publicly readable"
    ON seasonal_conditions FOR SELECT USING (TRUE);

CREATE POLICY "Road closures are publicly readable"
    ON road_closures FOR SELECT USING (TRUE);

CREATE POLICY "Data source runs are publicly readable"
    ON data_source_runs FOR SELECT USING (TRUE);

-- Surprise history: users see their own
CREATE POLICY "Users can view own surprise history"
    ON surprise_history FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own surprise history"
    ON surprise_history FOR INSERT
    WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can update own surprise history"
    ON surprise_history FOR UPDATE
    USING (auth.uid() = user_id);

-- Service role can do everything (for edge functions)
CREATE POLICY "Service role full access to regions"
    ON regions FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to region_metrics"
    ON region_metrics FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to region_features"
    ON region_features FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to seasonal_conditions"
    ON seasonal_conditions FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to road_closures"
    ON road_closures FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to data_source_runs"
    ON data_source_runs FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to surprise_history"
    ON surprise_history FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');
