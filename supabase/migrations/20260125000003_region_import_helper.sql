-- Helper function for importing regions with PostGIS geometry
-- Used by scripts/import-regions.ts

CREATE OR REPLACE FUNCTION insert_region_with_geometry(
  p_name TEXT,
  p_slug TEXT,
  p_description TEXT,
  p_bbox_north NUMERIC,
  p_bbox_south NUMERIC,
  p_bbox_east NUMERIC,
  p_bbox_west NUMERIC,
  p_center_lat NUMERIC,
  p_center_lng NUMERIC,
  p_primary_biome TEXT,
  p_area_sq_miles NUMERIC,
  p_run_id UUID
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO regions (
    name, slug, description,
    bbox_north, bbox_south, bbox_east, bbox_west,
    bounds, center,
    primary_biome, area_sq_miles,
    created_by_run_id
  ) VALUES (
    p_name, p_slug, p_description,
    p_bbox_north, p_bbox_south, p_bbox_east, p_bbox_west,
    ST_MakeEnvelope(p_bbox_west, p_bbox_south, p_bbox_east, p_bbox_north, 4326),
    ST_SetSRID(ST_MakePoint(p_center_lng, p_center_lat), 4326),
    p_primary_biome::biome_type, p_area_sq_miles,
    p_run_id
  )
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    bbox_north = EXCLUDED.bbox_north,
    bbox_south = EXCLUDED.bbox_south,
    bbox_east = EXCLUDED.bbox_east,
    bbox_west = EXCLUDED.bbox_west,
    bounds = EXCLUDED.bounds,
    center = EXCLUDED.center,
    primary_biome = EXCLUDED.primary_biome,
    area_sq_miles = EXCLUDED.area_sq_miles,
    last_updated_by_run_id = EXCLUDED.created_by_run_id,
    updated_at = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION insert_region_with_geometry TO service_role;
