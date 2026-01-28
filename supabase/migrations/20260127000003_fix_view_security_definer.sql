-- Fix SECURITY DEFINER on views
-- Views should use SECURITY INVOKER to respect RLS policies of the querying user

-- Recreate regions_with_metrics view with SECURITY INVOKER
DROP VIEW IF EXISTS regions_with_metrics;

CREATE VIEW regions_with_metrics
WITH (security_invoker = true)
AS
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

-- Recreate region_current_conditions view with SECURITY INVOKER
DROP VIEW IF EXISTS region_current_conditions;

CREATE VIEW region_current_conditions
WITH (security_invoker = true)
AS
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

-- Grant SELECT on views to authenticated users
GRANT SELECT ON regions_with_metrics TO authenticated;
GRANT SELECT ON region_current_conditions TO authenticated;
