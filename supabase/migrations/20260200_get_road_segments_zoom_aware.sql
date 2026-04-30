-- Make get_road_segments simplification tolerance scale with map zoom.
-- Less detail when zoomed out (massive payload reduction), full detail when
-- zoomed in (so curves render correctly at street view).
--
-- Tolerance formula: 0.0001 * 2^(15 - zoom), clamped to zoom in [8, 18].
--   zoom 8  → ~1.4 km tolerance  (state-level view)
--   zoom 12 → ~88 m              (default explorer view)
--   zoom 14 → ~22 m              (regional)
--   zoom 16 → ~5.5 m             (local detail)
--   zoom 18 → ~1.4 m             (near full-resolution)

DROP FUNCTION IF EXISTS get_road_segments(NUMERIC, NUMERIC, NUMERIC, TEXT, INTEGER);

CREATE OR REPLACE FUNCTION get_road_segments(
    p_lat NUMERIC,
    p_lng NUMERIC,
    p_radius_miles NUMERIC DEFAULT 10,
    p_source_type TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 500,
    p_zoom INTEGER DEFAULT 14
)
RETURNS TABLE (
    id UUID,
    external_id TEXT,
    name TEXT,
    source_type TEXT,
    vehicle_access TEXT,
    surface_type TEXT,
    seasonal_closure TEXT,
    highway TEXT,
    tracktype TEXT,
    access TEXT,
    four_wd_only BOOLEAN,
    osm_tags JSONB,
    mvum_tags JSONB,
    coordinates JSONB,
    managing_agency TEXT,
    distance_miles NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_center GEOMETRY;
    v_radius_deg NUMERIC;
    v_radius_meters NUMERIC;
    v_zoom INTEGER;
    v_tolerance NUMERIC;
BEGIN
    v_center := ST_SetSRID(ST_Point(p_lng, p_lat), 4326);
    v_radius_meters := p_radius_miles * 1609.34;
    v_radius_deg := (p_radius_miles / 50.0);

    v_zoom := GREATEST(8, LEAST(18, COALESCE(p_zoom, 14)));
    v_tolerance := 0.0001 * power(2, 15 - v_zoom);

    RETURN QUERY
    SELECT
        rs.id,
        rs.external_id,
        rs.name,
        rs.source_type::TEXT,
        rs.vehicle_access::TEXT,
        rs.surface_type,
        rs.seasonal_closure,
        rs.highway,
        rs.tracktype,
        rs.access,
        COALESCE(rs.four_wd_only, FALSE) AS four_wd_only,
        rs.osm_tags,
        rs.mvum_tags,
        (
            SELECT jsonb_agg(
                jsonb_build_object('lat', ST_Y(geom), 'lng', ST_X(geom))
            )
            FROM ST_DumpPoints(ST_SimplifyPreserveTopology(rs.geometry, v_tolerance))
                 AS dp(path, geom)
        ) AS coordinates,
        pl.managing_agency,
        (ST_Distance(rs.geometry::geography, v_center::geography) / 1609.34)::NUMERIC(10,2) AS distance_miles
    FROM road_segments rs
    LEFT JOIN public_lands pl ON rs.public_land_id = pl.id
    WHERE ST_DWithin(rs.geometry, v_center, v_radius_deg)
      AND ST_DWithin(rs.geometry::geography, v_center::geography, v_radius_meters)
      AND (p_source_type IS NULL OR rs.source_type::TEXT = p_source_type)
    ORDER BY distance_miles
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_road_segments TO anon, authenticated, service_role;
