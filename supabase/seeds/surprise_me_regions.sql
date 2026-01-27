-- ============================================
-- SEED DATA: Sample Western US Regions
-- ============================================
-- Run this after the schema migration to test the Surprise Me feature

SET search_path TO public, extensions;

-- ============================================
-- Insert sample regions
-- ============================================

INSERT INTO regions (name, slug, tagline, description, bounds, center, area_sq_miles, bbox_north, bbox_south, bbox_east, bbox_west, primary_biome, is_active, is_curated) VALUES

-- DESERT REGIONS
(
    'Owyhee Canyonlands',
    'owyhee-canyonlands',
    'Remote desert canyons on the Oregon-Idaho border',
    'A vast wilderness of slot canyons, hot springs, and solitude. One of the most remote areas in the lower 48.',
    ST_GeomFromText('POLYGON((-117.5 42.0, -117.5 43.2, -116.3 43.2, -116.3 42.0, -117.5 42.0))', 4326),
    ST_GeomFromText('POINT(-116.9 42.6)', 4326),
    2800,
    43.2, 42.0, -116.3, -117.5,
    'desert',
    TRUE, TRUE
),
(
    'Anza-Borrego Desert',
    'anza-borrego',
    'California desert wildflowers and palm oases',
    'The largest state park in California featuring badlands, slot canyons, and spectacular spring wildflower blooms.',
    ST_GeomFromText('POLYGON((-116.5 32.8, -116.5 33.4, -115.8 33.4, -115.8 32.8, -116.5 32.8))', 4326),
    ST_GeomFromText('POINT(-116.15 33.1)', 4326),
    920,
    33.4, 32.8, -115.8, -116.5,
    'desert',
    TRUE, TRUE
),
(
    'Valley of the Gods',
    'valley-of-the-gods',
    'Monument Valley''s quieter sibling',
    'Towering red rock formations and a scenic dirt road loop, without the crowds of its famous neighbor.',
    ST_GeomFromText('POLYGON((-110.2 37.2, -110.2 37.4, -109.8 37.4, -109.8 37.2, -110.2 37.2))', 4326),
    ST_GeomFromText('POINT(-110.0 37.3)', 4326),
    45,
    37.4, 37.2, -109.8, -110.2,
    'desert',
    TRUE, TRUE
),

-- ALPINE REGIONS
(
    'Sawtooth Wilderness',
    'sawtooth-wilderness',
    'Idaho''s crown jewel of jagged peaks',
    'Over 50 peaks rising above 10,000 feet, 300+ alpine lakes, and world-class backpacking.',
    ST_GeomFromText('POLYGON((-115.2 43.8, -115.2 44.3, -114.5 44.3, -114.5 43.8, -115.2 43.8))', 4326),
    ST_GeomFromText('POINT(-114.85 44.05)', 4326),
    350,
    44.3, 43.8, -114.5, -115.2,
    'alpine',
    TRUE, TRUE
),
(
    'Wind River Range',
    'wind-river-range',
    'Wyoming''s remote alpine paradise',
    'Home to Wyoming''s highest peaks, massive glaciers, and hundreds of pristine alpine lakes.',
    ST_GeomFromText('POLYGON((-109.8 42.6, -109.8 43.4, -109.0 43.4, -109.0 42.6, -109.8 42.6))', 4326),
    ST_GeomFromText('POINT(-109.4 43.0)', 4326),
    600,
    43.4, 42.6, -109.0, -109.8,
    'alpine',
    TRUE, TRUE
),
(
    'Wallowa Mountains',
    'wallowa-mountains',
    'Oregon''s Little Switzerland',
    'Glacially carved peaks, crystal-clear lakes, and the deepest canyon in North America nearby.',
    ST_GeomFromText('POLYGON((-117.6 45.0, -117.6 45.5, -116.8 45.5, -116.8 45.0, -117.6 45.0))', 4326),
    ST_GeomFromText('POINT(-117.2 45.25)', 4326),
    360,
    45.5, 45.0, -116.8, -117.6,
    'alpine',
    TRUE, TRUE
),

-- FOREST REGIONS
(
    'Olympic Rainforest',
    'olympic-rainforest',
    'Temperate rainforest draped in moss',
    'The wettest place in the continental US, with ancient trees, Roosevelt elk, and mystical valleys.',
    ST_GeomFromText('POLYGON((-124.2 47.4, -124.2 48.0, -123.4 48.0, -123.4 47.4, -124.2 47.4))', 4326),
    ST_GeomFromText('POINT(-123.8 47.7)', 4326),
    480,
    48.0, 47.4, -123.4, -124.2,
    'forest',
    TRUE, TRUE
),
(
    'Gifford Pinchot National Forest',
    'gifford-pinchot',
    'Volcanic landscapes and old-growth forests',
    'From Mount St. Helens to ancient forests, waterfalls, and hidden hot springs.',
    ST_GeomFromText('POLYGON((-122.5 45.8, -122.5 46.6, -121.4 46.6, -121.4 45.8, -122.5 45.8))', 4326),
    ST_GeomFromText('POINT(-121.95 46.2)', 4326),
    1100,
    46.6, 45.8, -121.4, -122.5,
    'forest',
    TRUE, TRUE
),
(
    'Klamath-Siskiyou',
    'klamath-siskiyou',
    'Botanical wonderland of rare species',
    'One of the most biodiverse temperate regions on Earth, where the Cascades meet the Coast Range.',
    ST_GeomFromText('POLYGON((-124.0 41.5, -124.0 42.5, -122.5 42.5, -122.5 41.5, -124.0 41.5))', 4326),
    ST_GeomFromText('POINT(-123.25 42.0)', 4326),
    1800,
    42.5, 41.5, -122.5, -124.0,
    'forest',
    TRUE, TRUE
),

-- COASTAL REGIONS
(
    'Lost Coast',
    'lost-coast',
    'California''s wildest coastline',
    'The longest stretch of undeveloped coastline in California, where the King Range meets the sea.',
    ST_GeomFromText('POLYGON((-124.4 39.9, -124.4 40.4, -123.9 40.4, -123.9 39.9, -124.4 39.9))', 4326),
    ST_GeomFromText('POINT(-124.15 40.15)', 4326),
    120,
    40.4, 39.9, -123.9, -124.4,
    'coastal',
    TRUE, TRUE
),
(
    'Olympic Coast',
    'olympic-coast',
    'Sea stacks and tide pools',
    'Dramatic sea stacks, pristine tide pools, and wilderness beaches accessible only on foot.',
    ST_GeomFromText('POLYGON((-124.8 47.3, -124.8 48.2, -124.2 48.2, -124.2 47.3, -124.8 47.3))', 4326),
    ST_GeomFromText('POINT(-124.5 47.75)', 4326),
    180,
    48.2, 47.3, -124.2, -124.8,
    'coastal',
    TRUE, TRUE
),
(
    'Point Reyes',
    'point-reyes',
    'Coastal wilderness an hour from SF',
    'Tule elk, dramatic cliffs, secluded beaches, and stunning coastal hiking.',
    ST_GeomFromText('POLYGON((-123.1 37.9, -123.1 38.2, -122.7 38.2, -122.7 37.9, -123.1 37.9))', 4326),
    ST_GeomFromText('POINT(-122.9 38.05)', 4326),
    110,
    38.2, 37.9, -122.7, -123.1,
    'coastal',
    TRUE, TRUE
),

-- GRASSLAND REGIONS
(
    'Carrizo Plain',
    'carrizo-plain',
    'California''s Serengeti',
    'The largest remaining native grassland in California, with pronghorn, wildflowers, and painted rocks.',
    ST_GeomFromText('POLYGON((-120.2 35.0, -120.2 35.5, -119.5 35.5, -119.5 35.0, -120.2 35.0))', 4326),
    ST_GeomFromText('POINT(-119.85 35.25)', 4326),
    400,
    35.5, 35.0, -119.5, -120.2,
    'grassland',
    TRUE, TRUE
),
(
    'Palouse Prairie',
    'palouse-prairie',
    'Rolling hills of the Inland Northwest',
    'Undulating wheat fields and remnant native prairie, with stunning light at golden hour.',
    ST_GeomFromText('POLYGON((-118.0 46.4, -118.0 47.2, -116.8 47.2, -116.8 46.4, -118.0 46.4))', 4326),
    ST_GeomFromText('POINT(-117.4 46.8)', 4326),
    950,
    47.2, 46.4, -116.8, -118.0,
    'grassland',
    TRUE, TRUE
),
(
    'Hart Mountain',
    'hart-mountain',
    'High desert antelope refuge',
    'Pronghorn herds, hot springs, and vast sagebrush steppe in Oregon''s outback.',
    ST_GeomFromText('POLYGON((-120.0 42.2, -120.0 42.8, -119.3 42.8, -119.3 42.2, -120.0 42.2))', 4326),
    ST_GeomFromText('POINT(-119.65 42.5)', 4326),
    420,
    42.8, 42.2, -119.3, -120.0,
    'grassland',
    TRUE, TRUE
);

-- ============================================
-- Insert metrics for each region
-- ============================================

INSERT INTO region_metrics (
    region_id,
    public_land_pct, public_land_score,
    trail_count, trail_total_miles, trail_density_score,
    campsite_count, dispersed_camping_allowed, campsite_density_score,
    popularity_score, popularity_percentile,
    remoteness_score,
    elevation_min_ft, elevation_avg_ft, elevation_max_ft,
    seasonal_access_score,
    best_road_surface, has_paved_access, road_access_score,
    cell_coverage_pct, has_cell_coverage,
    quality_score
)
SELECT
    r.id,
    -- Metrics vary by region
    CASE r.slug
        WHEN 'owyhee-canyonlands' THEN 85
        WHEN 'anza-borrego' THEN 95
        WHEN 'valley-of-the-gods' THEN 80
        WHEN 'sawtooth-wilderness' THEN 100
        WHEN 'wind-river-range' THEN 98
        WHEN 'wallowa-mountains' THEN 95
        WHEN 'olympic-rainforest' THEN 100
        WHEN 'gifford-pinchot' THEN 92
        WHEN 'klamath-siskiyou' THEN 75
        WHEN 'lost-coast' THEN 88
        WHEN 'olympic-coast' THEN 100
        WHEN 'point-reyes' THEN 95
        WHEN 'carrizo-plain' THEN 90
        WHEN 'palouse-prairie' THEN 25
        WHEN 'hart-mountain' THEN 95
        ELSE 50
    END as public_land_pct,

    CASE r.slug
        WHEN 'owyhee-canyonlands' THEN 80
        WHEN 'anza-borrego' THEN 90
        WHEN 'valley-of-the-gods' THEN 75
        WHEN 'sawtooth-wilderness' THEN 95
        WHEN 'wind-river-range' THEN 92
        WHEN 'wallowa-mountains' THEN 88
        WHEN 'olympic-rainforest' THEN 95
        WHEN 'gifford-pinchot' THEN 85
        WHEN 'klamath-siskiyou' THEN 70
        WHEN 'lost-coast' THEN 82
        WHEN 'olympic-coast' THEN 95
        WHEN 'point-reyes' THEN 90
        WHEN 'carrizo-plain' THEN 85
        WHEN 'palouse-prairie' THEN 30
        WHEN 'hart-mountain' THEN 90
        ELSE 50
    END as public_land_score,

    -- Trail count
    CASE r.slug
        WHEN 'owyhee-canyonlands' THEN 8
        WHEN 'anza-borrego' THEN 25
        WHEN 'valley-of-the-gods' THEN 4
        WHEN 'sawtooth-wilderness' THEN 45
        WHEN 'wind-river-range' THEN 38
        WHEN 'wallowa-mountains' THEN 32
        WHEN 'olympic-rainforest' THEN 28
        WHEN 'gifford-pinchot' THEN 55
        WHEN 'klamath-siskiyou' THEN 42
        WHEN 'lost-coast' THEN 12
        WHEN 'olympic-coast' THEN 18
        WHEN 'point-reyes' THEN 35
        WHEN 'carrizo-plain' THEN 6
        WHEN 'palouse-prairie' THEN 5
        WHEN 'hart-mountain' THEN 7
        ELSE 10
    END as trail_count,

    -- Trail total miles
    CASE r.slug
        WHEN 'owyhee-canyonlands' THEN 45
        WHEN 'anza-borrego' THEN 120
        WHEN 'valley-of-the-gods' THEN 15
        WHEN 'sawtooth-wilderness' THEN 350
        WHEN 'wind-river-range' THEN 280
        WHEN 'wallowa-mountains' THEN 220
        WHEN 'olympic-rainforest' THEN 180
        WHEN 'gifford-pinchot' THEN 400
        WHEN 'klamath-siskiyou' THEN 320
        WHEN 'lost-coast' THEN 65
        WHEN 'olympic-coast' THEN 95
        WHEN 'point-reyes' THEN 150
        WHEN 'carrizo-plain' THEN 25
        WHEN 'palouse-prairie' THEN 20
        WHEN 'hart-mountain' THEN 35
        ELSE 50
    END as trail_total_miles,

    -- Trail density score
    CASE r.slug
        WHEN 'owyhee-canyonlands' THEN 35
        WHEN 'anza-borrego' THEN 65
        WHEN 'valley-of-the-gods' THEN 45
        WHEN 'sawtooth-wilderness' THEN 90
        WHEN 'wind-river-range' THEN 85
        WHEN 'wallowa-mountains' THEN 82
        WHEN 'olympic-rainforest' THEN 78
        WHEN 'gifford-pinchot' THEN 72
        WHEN 'klamath-siskiyou' THEN 68
        WHEN 'lost-coast' THEN 70
        WHEN 'olympic-coast' THEN 75
        WHEN 'point-reyes' THEN 88
        WHEN 'carrizo-plain' THEN 40
        WHEN 'palouse-prairie' THEN 30
        WHEN 'hart-mountain' THEN 38
        ELSE 50
    END as trail_density_score,

    -- Campsite count
    CASE r.slug
        WHEN 'owyhee-canyonlands' THEN 3
        WHEN 'anza-borrego' THEN 12
        WHEN 'valley-of-the-gods' THEN 1
        WHEN 'sawtooth-wilderness' THEN 18
        WHEN 'wind-river-range' THEN 8
        WHEN 'wallowa-mountains' THEN 15
        WHEN 'olympic-rainforest' THEN 22
        WHEN 'gifford-pinchot' THEN 35
        WHEN 'klamath-siskiyou' THEN 28
        WHEN 'lost-coast' THEN 5
        WHEN 'olympic-coast' THEN 8
        WHEN 'point-reyes' THEN 4
        WHEN 'carrizo-plain' THEN 2
        WHEN 'palouse-prairie' THEN 2
        WHEN 'hart-mountain' THEN 2
        ELSE 5
    END as campsite_count,

    -- Dispersed camping allowed
    CASE r.slug
        WHEN 'owyhee-canyonlands' THEN TRUE
        WHEN 'anza-borrego' THEN TRUE
        WHEN 'valley-of-the-gods' THEN TRUE
        WHEN 'sawtooth-wilderness' THEN TRUE
        WHEN 'wind-river-range' THEN TRUE
        WHEN 'wallowa-mountains' THEN TRUE
        WHEN 'olympic-rainforest' THEN FALSE
        WHEN 'gifford-pinchot' THEN TRUE
        WHEN 'klamath-siskiyou' THEN TRUE
        WHEN 'lost-coast' THEN FALSE
        WHEN 'olympic-coast' THEN FALSE
        WHEN 'point-reyes' THEN FALSE
        WHEN 'carrizo-plain' THEN TRUE
        WHEN 'palouse-prairie' THEN FALSE
        WHEN 'hart-mountain' THEN TRUE
        ELSE TRUE
    END as dispersed_camping_allowed,

    -- Campsite density score
    CASE r.slug
        WHEN 'owyhee-canyonlands' THEN 55
        WHEN 'anza-borrego' THEN 70
        WHEN 'valley-of-the-gods' THEN 60
        WHEN 'sawtooth-wilderness' THEN 75
        WHEN 'wind-river-range' THEN 65
        WHEN 'wallowa-mountains' THEN 72
        WHEN 'olympic-rainforest' THEN 68
        WHEN 'gifford-pinchot' THEN 78
        WHEN 'klamath-siskiyou' THEN 72
        WHEN 'lost-coast' THEN 58
        WHEN 'olympic-coast' THEN 55
        WHEN 'point-reyes' THEN 50
        WHEN 'carrizo-plain' THEN 62
        WHEN 'palouse-prairie' THEN 35
        WHEN 'hart-mountain' THEN 65
        ELSE 50
    END as campsite_density_score,

    -- Popularity score (sweet spot curve applied - higher is "known but not crowded")
    CASE r.slug
        WHEN 'owyhee-canyonlands' THEN 92  -- Known to adventurers, not crowded
        WHEN 'anza-borrego' THEN 78        -- More popular
        WHEN 'valley-of-the-gods' THEN 88  -- Hidden gem
        WHEN 'sawtooth-wilderness' THEN 75 -- Getting popular
        WHEN 'wind-river-range' THEN 85    -- Known but remote
        WHEN 'wallowa-mountains' THEN 90   -- Sweet spot
        WHEN 'olympic-rainforest' THEN 55  -- Very popular
        WHEN 'gifford-pinchot' THEN 82     -- Good balance
        WHEN 'klamath-siskiyou' THEN 88    -- Under the radar
        WHEN 'lost-coast' THEN 72          -- Gaining popularity
        WHEN 'olympic-coast' THEN 65       -- Popular destination
        WHEN 'point-reyes' THEN 45         -- Very crowded
        WHEN 'carrizo-plain' THEN 95       -- Truly hidden
        WHEN 'palouse-prairie' THEN 92     -- Off the radar
        WHEN 'hart-mountain' THEN 94       -- Remote gem
        ELSE 70
    END as popularity_score,

    -- Popularity percentile
    CASE r.slug
        WHEN 'owyhee-canyonlands' THEN 0.25
        WHEN 'anza-borrego' THEN 0.65
        WHEN 'valley-of-the-gods' THEN 0.35
        WHEN 'sawtooth-wilderness' THEN 0.70
        WHEN 'wind-river-range' THEN 0.55
        WHEN 'wallowa-mountains' THEN 0.40
        WHEN 'olympic-rainforest' THEN 0.85
        WHEN 'gifford-pinchot' THEN 0.50
        WHEN 'klamath-siskiyou' THEN 0.38
        WHEN 'lost-coast' THEN 0.58
        WHEN 'olympic-coast' THEN 0.72
        WHEN 'point-reyes' THEN 0.92
        WHEN 'carrizo-plain' THEN 0.15
        WHEN 'palouse-prairie' THEN 0.20
        WHEN 'hart-mountain' THEN 0.18
        ELSE 0.50
    END as popularity_percentile,

    -- Remoteness score
    CASE r.slug
        WHEN 'owyhee-canyonlands' THEN 95
        WHEN 'anza-borrego' THEN 65
        WHEN 'valley-of-the-gods' THEN 85
        WHEN 'sawtooth-wilderness' THEN 80
        WHEN 'wind-river-range' THEN 90
        WHEN 'wallowa-mountains' THEN 85
        WHEN 'olympic-rainforest' THEN 70
        WHEN 'gifford-pinchot' THEN 55
        WHEN 'klamath-siskiyou' THEN 72
        WHEN 'lost-coast' THEN 78
        WHEN 'olympic-coast' THEN 75
        WHEN 'point-reyes' THEN 25
        WHEN 'carrizo-plain' THEN 82
        WHEN 'palouse-prairie' THEN 60
        WHEN 'hart-mountain' THEN 92
        ELSE 60
    END as remoteness_score,

    -- Elevation min
    CASE r.slug
        WHEN 'owyhee-canyonlands' THEN 2800
        WHEN 'anza-borrego' THEN 200
        WHEN 'valley-of-the-gods' THEN 4800
        WHEN 'sawtooth-wilderness' THEN 5500
        WHEN 'wind-river-range' THEN 7500
        WHEN 'wallowa-mountains' THEN 4000
        WHEN 'olympic-rainforest' THEN 500
        WHEN 'gifford-pinchot' THEN 1200
        WHEN 'klamath-siskiyou' THEN 800
        WHEN 'lost-coast' THEN 0
        WHEN 'olympic-coast' THEN 0
        WHEN 'point-reyes' THEN 0
        WHEN 'carrizo-plain' THEN 1800
        WHEN 'palouse-prairie' THEN 1500
        WHEN 'hart-mountain' THEN 4500
        ELSE 2000
    END as elevation_min_ft,

    -- Elevation avg
    CASE r.slug
        WHEN 'owyhee-canyonlands' THEN 4500
        WHEN 'anza-borrego' THEN 1500
        WHEN 'valley-of-the-gods' THEN 5200
        WHEN 'sawtooth-wilderness' THEN 8500
        WHEN 'wind-river-range' THEN 10500
        WHEN 'wallowa-mountains' THEN 7500
        WHEN 'olympic-rainforest' THEN 2000
        WHEN 'gifford-pinchot' THEN 3500
        WHEN 'klamath-siskiyou' THEN 4000
        WHEN 'lost-coast' THEN 1500
        WHEN 'olympic-coast' THEN 200
        WHEN 'point-reyes' THEN 400
        WHEN 'carrizo-plain' THEN 2200
        WHEN 'palouse-prairie' THEN 2500
        WHEN 'hart-mountain' THEN 6000
        ELSE 4000
    END as elevation_avg_ft,

    -- Elevation max
    CASE r.slug
        WHEN 'owyhee-canyonlands' THEN 6800
        WHEN 'anza-borrego' THEN 6500
        WHEN 'valley-of-the-gods' THEN 5800
        WHEN 'sawtooth-wilderness' THEN 10751
        WHEN 'wind-river-range' THEN 13804
        WHEN 'wallowa-mountains' THEN 9838
        WHEN 'olympic-rainforest' THEN 4500
        WHEN 'gifford-pinchot' THEN 8365
        WHEN 'klamath-siskiyou' THEN 9002
        WHEN 'lost-coast' THEN 4088
        WHEN 'olympic-coast' THEN 650
        WHEN 'point-reyes' THEN 1407
        WHEN 'carrizo-plain' THEN 5106
        WHEN 'palouse-prairie' THEN 3800
        WHEN 'hart-mountain' THEN 8065
        ELSE 6000
    END as elevation_max_ft,

    -- Seasonal access score (current month: January)
    CASE r.slug
        WHEN 'owyhee-canyonlands' THEN 75  -- Some snow at elevation
        WHEN 'anza-borrego' THEN 95        -- Perfect winter
        WHEN 'valley-of-the-gods' THEN 85  -- Can be cold
        WHEN 'sawtooth-wilderness' THEN 25 -- Snowed in
        WHEN 'wind-river-range' THEN 15    -- Deep snow
        WHEN 'wallowa-mountains' THEN 30   -- Snowed in
        WHEN 'olympic-rainforest' THEN 70  -- Rainy but accessible
        WHEN 'gifford-pinchot' THEN 45     -- Snow at elevation
        WHEN 'klamath-siskiyou' THEN 65    -- Variable
        WHEN 'lost-coast' THEN 75          -- Rainy but OK
        WHEN 'olympic-coast' THEN 70       -- Rainy
        WHEN 'point-reyes' THEN 85         -- Great winter
        WHEN 'carrizo-plain' THEN 90       -- Excellent
        WHEN 'palouse-prairie' THEN 50     -- Cold/snow
        WHEN 'hart-mountain' THEN 55       -- Snow possible
        ELSE 60
    END as seasonal_access_score,

    -- Best road surface
    CASE r.slug
        WHEN 'owyhee-canyonlands' THEN 'dirt'::road_surface_type
        WHEN 'anza-borrego' THEN 'paved'::road_surface_type
        WHEN 'valley-of-the-gods' THEN 'gravel'::road_surface_type
        WHEN 'sawtooth-wilderness' THEN 'paved'::road_surface_type
        WHEN 'wind-river-range' THEN 'gravel'::road_surface_type
        WHEN 'wallowa-mountains' THEN 'paved'::road_surface_type
        WHEN 'olympic-rainforest' THEN 'paved'::road_surface_type
        WHEN 'gifford-pinchot' THEN 'paved'::road_surface_type
        WHEN 'klamath-siskiyou' THEN 'gravel'::road_surface_type
        WHEN 'lost-coast' THEN 'gravel'::road_surface_type
        WHEN 'olympic-coast' THEN 'paved'::road_surface_type
        WHEN 'point-reyes' THEN 'paved'::road_surface_type
        WHEN 'carrizo-plain' THEN 'gravel'::road_surface_type
        WHEN 'palouse-prairie' THEN 'paved'::road_surface_type
        WHEN 'hart-mountain' THEN 'gravel'::road_surface_type
        ELSE 'gravel'::road_surface_type
    END as best_road_surface,

    -- Has paved access
    CASE r.slug
        WHEN 'owyhee-canyonlands' THEN FALSE
        WHEN 'anza-borrego' THEN TRUE
        WHEN 'valley-of-the-gods' THEN FALSE
        WHEN 'sawtooth-wilderness' THEN TRUE
        WHEN 'wind-river-range' THEN FALSE
        WHEN 'wallowa-mountains' THEN TRUE
        WHEN 'olympic-rainforest' THEN TRUE
        WHEN 'gifford-pinchot' THEN TRUE
        WHEN 'klamath-siskiyou' THEN FALSE
        WHEN 'lost-coast' THEN FALSE
        WHEN 'olympic-coast' THEN TRUE
        WHEN 'point-reyes' THEN TRUE
        WHEN 'carrizo-plain' THEN FALSE
        WHEN 'palouse-prairie' THEN TRUE
        WHEN 'hart-mountain' THEN FALSE
        ELSE FALSE
    END as has_paved_access,

    -- Road access score
    CASE r.slug
        WHEN 'owyhee-canyonlands' THEN 45
        WHEN 'anza-borrego' THEN 90
        WHEN 'valley-of-the-gods' THEN 70
        WHEN 'sawtooth-wilderness' THEN 85
        WHEN 'wind-river-range' THEN 65
        WHEN 'wallowa-mountains' THEN 80
        WHEN 'olympic-rainforest' THEN 90
        WHEN 'gifford-pinchot' THEN 85
        WHEN 'klamath-siskiyou' THEN 60
        WHEN 'lost-coast' THEN 55
        WHEN 'olympic-coast' THEN 85
        WHEN 'point-reyes' THEN 95
        WHEN 'carrizo-plain' THEN 65
        WHEN 'palouse-prairie' THEN 90
        WHEN 'hart-mountain' THEN 60
        ELSE 70
    END as road_access_score,

    -- Cell coverage pct
    CASE r.slug
        WHEN 'owyhee-canyonlands' THEN 5
        WHEN 'anza-borrego' THEN 35
        WHEN 'valley-of-the-gods' THEN 15
        WHEN 'sawtooth-wilderness' THEN 10
        WHEN 'wind-river-range' THEN 5
        WHEN 'wallowa-mountains' THEN 15
        WHEN 'olympic-rainforest' THEN 20
        WHEN 'gifford-pinchot' THEN 30
        WHEN 'klamath-siskiyou' THEN 25
        WHEN 'lost-coast' THEN 10
        WHEN 'olympic-coast' THEN 25
        WHEN 'point-reyes' THEN 60
        WHEN 'carrizo-plain' THEN 20
        WHEN 'palouse-prairie' THEN 45
        WHEN 'hart-mountain' THEN 5
        ELSE 25
    END as cell_coverage_pct,

    -- Has cell coverage
    CASE r.slug
        WHEN 'owyhee-canyonlands' THEN FALSE
        WHEN 'anza-borrego' THEN TRUE
        WHEN 'valley-of-the-gods' THEN FALSE
        WHEN 'sawtooth-wilderness' THEN FALSE
        WHEN 'wind-river-range' THEN FALSE
        WHEN 'wallowa-mountains' THEN FALSE
        WHEN 'olympic-rainforest' THEN FALSE
        WHEN 'gifford-pinchot' THEN TRUE
        WHEN 'klamath-siskiyou' THEN FALSE
        WHEN 'lost-coast' THEN FALSE
        WHEN 'olympic-coast' THEN FALSE
        WHEN 'point-reyes' THEN TRUE
        WHEN 'carrizo-plain' THEN FALSE
        WHEN 'palouse-prairie' THEN TRUE
        WHEN 'hart-mountain' THEN FALSE
        ELSE FALSE
    END as has_cell_coverage,

    -- Quality score (computed from components)
    CASE r.slug
        WHEN 'owyhee-canyonlands' THEN 72
        WHEN 'anza-borrego' THEN 78
        WHEN 'valley-of-the-gods' THEN 70
        WHEN 'sawtooth-wilderness' THEN 82
        WHEN 'wind-river-range' THEN 80
        WHEN 'wallowa-mountains' THEN 81
        WHEN 'olympic-rainforest' THEN 75
        WHEN 'gifford-pinchot' THEN 74
        WHEN 'klamath-siskiyou' THEN 73
        WHEN 'lost-coast' THEN 71
        WHEN 'olympic-coast' THEN 72
        WHEN 'point-reyes' THEN 68
        WHEN 'carrizo-plain' THEN 74
        WHEN 'palouse-prairie' THEN 52
        WHEN 'hart-mountain' THEN 76
        ELSE 65
    END as quality_score

FROM regions r;

-- ============================================
-- Insert sample features for a few regions
-- ============================================

-- Owyhee Canyonlands features
INSERT INTO region_features (region_id, feature_type, name, description, location, metadata, popularity_rank)
SELECT
    r.id,
    'trail',
    'Three Forks Hot Springs',
    'Remote hot springs at the confluence of three forks of the Owyhee River',
    ST_GeomFromText('POINT(-116.85 42.45)', 4326),
    '{"length_miles": 0.5, "difficulty": "easy", "features": ["hot springs", "river"]}',
    1
FROM regions r WHERE r.slug = 'owyhee-canyonlands';

INSERT INTO region_features (region_id, feature_type, name, description, location, metadata, popularity_rank)
SELECT
    r.id,
    'campsite',
    'Three Forks Campground',
    'Primitive BLM campground near the hot springs',
    ST_GeomFromText('POINT(-116.84 42.46)', 4326),
    '{"site_count": 8, "fee": false, "amenities": ["vault toilet"]}',
    1
FROM regions r WHERE r.slug = 'owyhee-canyonlands';

-- Sawtooth Wilderness features
INSERT INTO region_features (region_id, feature_type, name, description, location, metadata, popularity_rank)
SELECT
    r.id,
    'trail',
    'Alice-Toxaway Loop',
    'Classic alpine lake loop through the heart of the Sawtooths',
    ST_GeomFromText('POINT(-114.95 43.95)', 4326),
    '{"length_miles": 19.5, "difficulty": "moderate", "elevation_gain": 3200, "features": ["alpine lakes", "mountain views"]}',
    1
FROM regions r WHERE r.slug = 'sawtooth-wilderness';

INSERT INTO region_features (region_id, feature_type, name, description, location, metadata, popularity_rank)
SELECT
    r.id,
    'trail',
    'Sawtooth Lake Trail',
    'Stunning day hike to an iconic alpine lake beneath jagged peaks',
    ST_GeomFromText('POINT(-114.88 44.12)', 4326),
    '{"length_miles": 10, "difficulty": "moderate", "elevation_gain": 1800, "features": ["alpine lake", "peak views"]}',
    2
FROM regions r WHERE r.slug = 'sawtooth-wilderness';

-- Lost Coast features
INSERT INTO region_features (region_id, feature_type, name, description, location, metadata, popularity_rank)
SELECT
    r.id,
    'trail',
    'Lost Coast Trail',
    'Epic 25-mile beach backpacking route along California''s wildest shore',
    ST_GeomFromText('POINT(-124.25 40.05)', 4326),
    '{"length_miles": 25, "difficulty": "hard", "features": ["beach", "wilderness", "tidal"]}',
    1
FROM regions r WHERE r.slug = 'lost-coast';

-- Carrizo Plain features
INSERT INTO region_features (region_id, feature_type, name, description, location, metadata, popularity_rank)
SELECT
    r.id,
    'poi',
    'Painted Rock',
    'Ancient Chumash pictograph site in a natural sandstone amphitheater',
    ST_GeomFromText('POINT(-119.88 35.12)', 4326),
    '{"category": "cultural site", "access": "guided tours only March-May"}',
    1
FROM regions r WHERE r.slug = 'carrizo-plain';

INSERT INTO region_features (region_id, feature_type, name, description, location, metadata, popularity_rank)
SELECT
    r.id,
    'poi',
    'Soda Lake',
    'Seasonal alkaline lake that hosts thousands of sandhill cranes in winter',
    ST_GeomFromText('POINT(-119.82 35.22)', 4326),
    '{"category": "wildlife viewing", "best_season": "winter"}',
    2
FROM regions r WHERE r.slug = 'carrizo-plain';

-- ============================================
-- Verify data
-- ============================================

SELECT
    r.name,
    r.primary_biome,
    m.quality_score,
    m.popularity_score,
    m.seasonal_access_score,
    m.trail_count,
    m.best_road_surface
FROM regions r
JOIN region_metrics m ON r.id = m.region_id
ORDER BY m.quality_score DESC;
