-- Fix mutable search_path on functions
-- Functions should have an explicit search_path to prevent search_path manipulation attacks

-- ============================================
-- FUNCTION: update_timestamp (trigger function)
-- ============================================
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- ============================================
-- FUNCTION: get_regions_within_distance
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
)
LANGUAGE plpgsql
STABLE
SET search_path = public, extensions
AS $$
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
$$;

-- ============================================
-- FUNCTION: get_user_recent_biomes
-- ============================================
CREATE OR REPLACE FUNCTION get_user_recent_biomes(
    p_user_id UUID,
    p_limit INTEGER DEFAULT 5
)
RETURNS biome_type[]
LANGUAGE plpgsql
STABLE
SET search_path = public, extensions
AS $$
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
$$;

-- ============================================
-- FUNCTION: get_diversity_multiplier
-- ============================================
CREATE OR REPLACE FUNCTION get_diversity_multiplier(
    p_biome biome_type,
    p_recent_biomes biome_type[]
)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, extensions
AS $$
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
$$;

-- ============================================
-- FUNCTION: get_snowline_ft
-- ============================================
CREATE OR REPLACE FUNCTION get_snowline_ft(
    lat NUMERIC,
    month_num INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, extensions
AS $$
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
$$;

-- ============================================
-- FUNCTION: get_recent_anchor_centers
-- ============================================
CREATE OR REPLACE FUNCTION get_recent_anchor_centers(
    p_user_id UUID DEFAULT NULL,
    p_session_id TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
    anchor_lat NUMERIC,
    anchor_lng NUMERIC,
    recommended_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SET search_path = public, extensions
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ST_Y(sh.anchor_center)::NUMERIC as anchor_lat,
        ST_X(sh.anchor_center)::NUMERIC as anchor_lng,
        sh.recommended_at
    FROM surprise_history sh
    WHERE sh.anchor_center IS NOT NULL
      AND (
          (p_user_id IS NOT NULL AND sh.user_id = p_user_id)
          OR
          (p_session_id IS NOT NULL AND sh.session_id = p_session_id)
      )
    ORDER BY sh.recommended_at DESC
    LIMIT p_limit;
END;
$$;

-- ============================================
-- FUNCTION: check_anchor_distance
-- ============================================
CREATE OR REPLACE FUNCTION check_anchor_distance(
    p_candidate_lat NUMERIC,
    p_candidate_lng NUMERIC,
    p_user_id UUID DEFAULT NULL,
    p_session_id TEXT DEFAULT NULL,
    p_min_distance_miles NUMERIC DEFAULT 300,
    p_recent_count INTEGER DEFAULT 5
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = public, extensions
AS $$
DECLARE
    v_candidate_point GEOMETRY;
    v_min_found_distance NUMERIC;
BEGIN
    -- Create candidate point
    v_candidate_point := ST_SetSRID(ST_MakePoint(p_candidate_lng, p_candidate_lat), 4326);

    -- Find minimum distance to any recent anchor
    SELECT MIN(
        ST_Distance(
            sh.anchor_center::geography,
            v_candidate_point::geography
        ) / 1609.34  -- Convert meters to miles
    )
    INTO v_min_found_distance
    FROM surprise_history sh
    WHERE sh.anchor_center IS NOT NULL
      AND (
          (p_user_id IS NOT NULL AND sh.user_id = p_user_id)
          OR
          (p_session_id IS NOT NULL AND sh.session_id = p_session_id)
      )
      AND sh.recommended_at > NOW() - INTERVAL '90 days'
    ORDER BY sh.recommended_at DESC
    LIMIT p_recent_count;

    -- If no recent anchors, always pass
    IF v_min_found_distance IS NULL THEN
        RETURN TRUE;
    END IF;

    RETURN v_min_found_distance >= p_min_distance_miles;
END;
$$;

-- ============================================
-- FUNCTION: insert_region_with_geometry
-- ============================================
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
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
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
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_regions_within_distance TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION get_user_recent_biomes TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION get_diversity_multiplier TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION get_snowline_ft TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION get_recent_anchor_centers TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION check_anchor_distance TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION insert_region_with_geometry TO service_role;
