-- Add p_osm_tags parameter to insert_road_segment_simple so the OSM road
-- import path persists the full tag bag into road_segments.osm_tags. Without
-- it, the difficulty classifier can't see smoothness/tracktype on roads
-- imported via this path.

DROP FUNCTION IF EXISTS insert_road_segment_simple(
    TEXT, road_source_type, TEXT, TEXT, TEXT, vehicle_access_type, TEXT,
    TEXT, TEXT, TEXT, BOOLEAN
);

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
    p_four_wd_only BOOLEAN DEFAULT FALSE,
    p_osm_tags JSONB DEFAULT NULL
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
        external_id, source_type, geometry, name,
        surface_type, vehicle_access, seasonal_closure,
        highway, tracktype, access, four_wd_only,
        osm_tags, length_miles
    ) VALUES (
        p_external_id, p_source_type, v_geom, p_name,
        p_surface_type, p_vehicle_access, p_seasonal_closure,
        p_highway, p_tracktype, p_access, p_four_wd_only,
        p_osm_tags,
        (ST_Length(v_geom::geography) / 1609.34)::NUMERIC(8,2)
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;
