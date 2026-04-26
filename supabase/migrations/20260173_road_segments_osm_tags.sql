-- Persist the raw OSM tag bag for road segments so the road detail panel
-- can show smoothness, motor_vehicle, ref, operator, oneway, ford, etc.
-- without re-querying Overpass on cache hits. The curated columns
-- (highway, tracktype, surface_type, access, four_wd_only) stay as-is for
-- fast filtering; this column is the long tail.

ALTER TABLE road_segments
  ADD COLUMN IF NOT EXISTS osm_tags JSONB;

-- Update get_road_segments RPC to return osm_tags alongside everything else.
DROP FUNCTION IF EXISTS get_road_segments(NUMERIC, NUMERIC, NUMERIC, TEXT, INTEGER);

CREATE OR REPLACE FUNCTION get_road_segments(
    p_lat NUMERIC,
    p_lng NUMERIC,
    p_radius_miles NUMERIC DEFAULT 10,
    p_source_type TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 500
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    source_type TEXT,
    vehicle_access TEXT,
    surface_type TEXT,
    highway TEXT,
    tracktype TEXT,
    access TEXT,
    four_wd_only BOOLEAN,
    osm_tags JSONB,
    coordinates JSONB,
    managing_agency TEXT,
    distance_miles NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_center GEOMETRY;
    v_radius_meters NUMERIC;
BEGIN
    v_center := ST_SetSRID(ST_Point(p_lng, p_lat), 4326);
    v_radius_meters := p_radius_miles * 1609.34;

    RETURN QUERY
    SELECT
        rs.id,
        rs.name,
        rs.source_type::TEXT,
        rs.vehicle_access::TEXT,
        rs.surface_type,
        rs.highway,
        rs.tracktype,
        rs.access,
        COALESCE(rs.four_wd_only, FALSE) as four_wd_only,
        rs.osm_tags,
        (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'lat', ST_Y(geom),
                    'lng', ST_X(geom)
                )
            )
            FROM ST_DumpPoints(rs.geometry) AS dp(path, geom)
        ) as coordinates,
        pl.managing_agency,
        (ST_Distance(rs.geometry::geography, v_center::geography) / 1609.34)::NUMERIC(10,2) as distance_miles
    FROM road_segments rs
    LEFT JOIN public_lands pl ON rs.public_land_id = pl.id
    WHERE ST_DWithin(rs.geometry::geography, v_center::geography, v_radius_meters)
      AND (p_source_type IS NULL OR rs.source_type::TEXT = p_source_type)
    ORDER BY distance_miles
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_road_segments TO anon, authenticated, service_role;
