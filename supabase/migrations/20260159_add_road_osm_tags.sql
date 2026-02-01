-- Add OSM tags storage to road_segments for detailed road info display
-- This allows Fast mode to show the same road details as Full mode

-- Add columns for common OSM road tags
ALTER TABLE road_segments
ADD COLUMN IF NOT EXISTS highway TEXT,
ADD COLUMN IF NOT EXISTS tracktype TEXT,
ADD COLUMN IF NOT EXISTS access TEXT,
ADD COLUMN IF NOT EXISTS four_wd_only BOOLEAN DEFAULT FALSE;

-- Create index for highway type queries
CREATE INDEX IF NOT EXISTS idx_road_segments_highway ON road_segments(highway);

-- Update the insert function to accept new fields
DROP FUNCTION IF EXISTS insert_road_segment_simple(TEXT, road_source_type, TEXT, TEXT, TEXT, vehicle_access_type, TEXT);

CREATE OR REPLACE FUNCTION insert_road_segment_simple(
    p_external_id TEXT,
    p_source_type road_source_type,
    p_geometry_wkt TEXT,
    p_name TEXT,
    p_surface_type TEXT,
    p_vehicle_access vehicle_access_type,
    p_seasonal_closure TEXT,
    p_highway TEXT DEFAULT NULL,
    p_tracktype TEXT DEFAULT NULL,
    p_access TEXT DEFAULT NULL,
    p_four_wd_only BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_id UUID;
    v_geom GEOMETRY;
BEGIN
    v_geom := ST_GeomFromText(p_geometry_wkt, 4326);

    INSERT INTO road_segments (
        external_id,
        source_type,
        geometry,
        name,
        surface_type,
        vehicle_access,
        seasonal_closure,
        highway,
        tracktype,
        access,
        four_wd_only,
        length_miles
    ) VALUES (
        p_external_id,
        p_source_type,
        v_geom,
        p_name,
        p_surface_type,
        p_vehicle_access,
        p_seasonal_closure,
        p_highway,
        p_tracktype,
        p_access,
        p_four_wd_only,
        (ST_Length(v_geom::geography) / 1609.34)::NUMERIC(8,2)
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- Update the get_roads_near_point function to return new fields
DROP FUNCTION IF EXISTS get_roads_near_point(NUMERIC, NUMERIC, NUMERIC, INTEGER);

CREATE OR REPLACE FUNCTION get_roads_near_point(
    p_lat NUMERIC,
    p_lng NUMERIC,
    p_radius_miles NUMERIC DEFAULT 10,
    p_limit INTEGER DEFAULT 500
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    source_type road_source_type,
    vehicle_access vehicle_access_type,
    surface_type TEXT,
    highway TEXT,
    tracktype TEXT,
    access TEXT,
    four_wd_only BOOLEAN,
    coordinates JSON,
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
    v_radius_meters NUMERIC;
BEGIN
    v_center := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326);
    v_radius_meters := p_radius_miles * 1609.34;

    RETURN QUERY
    SELECT
        rs.id,
        rs.name,
        rs.source_type,
        rs.vehicle_access,
        rs.surface_type,
        rs.highway,
        rs.tracktype,
        rs.access,
        COALESCE(rs.four_wd_only, FALSE) as four_wd_only,
        (SELECT json_agg(json_build_object('lat', ST_Y(geom), 'lng', ST_X(geom)))
         FROM ST_DumpPoints(rs.geometry) AS dp(path, geom)) as coordinates,
        pl.managing_agency,
        (ST_Distance(rs.geometry::geography, v_center::geography) / 1609.34)::NUMERIC(6,2) as distance_miles
    FROM road_segments rs
    LEFT JOIN public_lands pl ON rs.public_land_id = pl.id
    WHERE ST_DWithin(rs.geometry::geography, v_center::geography, v_radius_meters)
    ORDER BY distance_miles ASC
    LIMIT p_limit;
END;
$$;
