-- =============================================================================
-- Seed: 001_data_sources.sql
-- Purpose: Register all data sources with licensing and attribution info
-- =============================================================================

INSERT INTO data_sources (
    source_key,
    source_type,
    display_name,
    short_name,
    version,
    license_type,
    license_url,
    attribution_text,
    attribution_short,
    attribution_html,
    source_url,
    update_frequency,
    is_active
) VALUES

-- OpenStreetMap
(
    'osm',
    'osm',
    'OpenStreetMap',
    'OSM',
    NULL,  -- Continuously updated
    'odbl',
    'https://opendatacommons.org/licenses/odbl/',
    'Data © OpenStreetMap contributors, licensed under the Open Data Commons Open Database License (ODbL).',
    '© OpenStreetMap contributors',
    '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>',
    'https://overpass-api.de/',
    'daily',
    TRUE
),

-- PAD-US (Protected Areas Database)
(
    'pad_us_3',
    'pad_us',
    'Protected Areas Database of the United States (PAD-US) 3.0',
    'PAD-US',
    '3.0',
    'public_domain',
    'https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits',
    'U.S. Geological Survey (USGS) Gap Analysis Project (GAP), Protected Areas Database of the United States (PAD-US) 3.0.',
    'USGS PAD-US',
    '<a href="https://www.usgs.gov/programs/gap-analysis-project/science/pad-us-data-download">USGS PAD-US</a>',
    'https://www.usgs.gov/programs/gap-analysis-project/science/pad-us-data-download',
    'annual',
    TRUE
),

-- USFS Motor Vehicle Use Maps
(
    'mvum',
    'usfs',
    'USDA Forest Service Motor Vehicle Use Maps',
    'MVUM',
    NULL,
    'public_domain',
    'https://www.fs.usda.gov/about-agency/regulations-policies',
    'USDA Forest Service Motor Vehicle Use Maps (MVUM). Public domain.',
    'USDA Forest Service',
    '<a href="https://www.fs.usda.gov/visit/maps">USDA Forest Service</a>',
    'https://data.fs.usda.gov/geodata/edw/datasets.php',
    'annual',
    TRUE
),

-- BLM Ground Transportation
(
    'blm_gtrn',
    'blm',
    'BLM Ground Transportation Linear Features',
    'BLM Roads',
    NULL,
    'public_domain',
    'https://www.blm.gov/about/data',
    'Bureau of Land Management Ground Transportation data. Public domain.',
    'BLM',
    '<a href="https://www.blm.gov/">Bureau of Land Management</a>',
    'https://gbp-blm-egis.hub.arcgis.com/',
    'quarterly',
    TRUE
),

-- Recreation.gov / RIDB
(
    'ridb',
    'ridb',
    'Recreation Information Database (RIDB)',
    'Recreation.gov',
    NULL,
    'public_domain',
    'https://ridb.recreation.gov/docs',
    'Recreation.gov RIDB API. Public domain.',
    'Recreation.gov',
    '<a href="https://www.recreation.gov/">Recreation.gov</a>',
    'https://ridb.recreation.gov/',
    'daily',
    TRUE
),

-- NOAA Weather
(
    'noaa',
    'noaa',
    'NOAA National Weather Service',
    'NOAA',
    NULL,
    'public_domain',
    'https://www.weather.gov/disclaimer',
    'NOAA National Weather Service. Public domain.',
    'NOAA',
    '<a href="https://www.weather.gov/">NOAA</a>',
    'https://api.weather.gov/',
    'hourly',
    TRUE
),

-- Wilderness.net (for wilderness boundaries)
(
    'wilderness_net',
    'usfs',
    'Wilderness.net / National Wilderness Preservation System',
    'NWPS',
    NULL,
    'public_domain',
    NULL,
    'National Wilderness Preservation System via Wilderness.net. Public domain.',
    'Wilderness.net',
    '<a href="https://wilderness.net/">Wilderness.net</a>',
    'https://wilderness.net/visit-wilderness/gis.php',
    'annual',
    TRUE
),

-- NPS (National Park Service)
(
    'nps',
    'nps',
    'National Park Service',
    'NPS',
    NULL,
    'public_domain',
    'https://www.nps.gov/aboutus/disclaimer.htm',
    'National Park Service. Public domain.',
    'NPS',
    '<a href="https://www.nps.gov/">National Park Service</a>',
    'https://public-nps.opendata.arcgis.com/',
    'quarterly',
    TRUE
),

-- Derived data (internal)
(
    'derived',
    'derived',
    'RoamSwild Derived Data',
    'Derived',
    '1.0',
    'proprietary',
    NULL,
    'Derived by RoamSwild algorithms from public data sources.',
    'RoamSwild',
    NULL,
    NULL,
    'continuous',
    TRUE
)

ON CONFLICT (source_key) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    license_type = EXCLUDED.license_type,
    attribution_text = EXCLUDED.attribution_text,
    attribution_short = EXCLUDED.attribution_short,
    attribution_html = EXCLUDED.attribution_html,
    updated_at = NOW();
