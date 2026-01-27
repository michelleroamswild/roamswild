-- ============================================
-- SURPRISE HISTORY: ANCHOR CENTER SUPPORT
-- ============================================
-- Adds anchor center tracking for sporadic recommendation behavior

-- Add anchor_center column to track where anchors were placed
ALTER TABLE surprise_history
ADD COLUMN IF NOT EXISTS anchor_center GEOMETRY(POINT, 4326);

-- Add index for spatial queries on anchor centers
CREATE INDEX IF NOT EXISTS idx_surprise_history_anchor_center
ON surprise_history USING GIST(anchor_center);

-- Add compound index for recent anchor lookups by user
CREATE INDEX IF NOT EXISTS idx_surprise_history_user_anchor_recent
ON surprise_history(user_id, recommended_at DESC)
WHERE user_id IS NOT NULL AND anchor_center IS NOT NULL;

-- Add compound index for recent anchor lookups by session
CREATE INDEX IF NOT EXISTS idx_surprise_history_session_anchor_recent
ON surprise_history(session_id, recommended_at DESC)
WHERE session_id IS NOT NULL AND anchor_center IS NOT NULL;

-- ============================================
-- FUNCTION: get_recent_anchor_centers
-- ============================================
-- Returns the last N anchor centers for a user or session

CREATE OR REPLACE FUNCTION get_recent_anchor_centers(
    p_user_id UUID DEFAULT NULL,
    p_session_id TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
    anchor_lat NUMERIC,
    anchor_lng NUMERIC,
    recommended_at TIMESTAMPTZ
) AS $$
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
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- FUNCTION: check_anchor_distance
-- ============================================
-- Checks if a candidate anchor is at least min_distance_miles from all recent anchors

CREATE OR REPLACE FUNCTION check_anchor_distance(
    p_candidate_lat NUMERIC,
    p_candidate_lng NUMERIC,
    p_user_id UUID DEFAULT NULL,
    p_session_id TEXT DEFAULT NULL,
    p_min_distance_miles NUMERIC DEFAULT 300,
    p_recent_count INTEGER DEFAULT 5
)
RETURNS BOOLEAN AS $$
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
      AND sh.recommended_at > NOW() - INTERVAL '90 days'  -- Only consider last 90 days
    ORDER BY sh.recommended_at DESC
    LIMIT p_recent_count;

    -- If no recent anchors, always pass
    IF v_min_found_distance IS NULL THEN
        RETURN TRUE;
    END IF;

    RETURN v_min_found_distance >= p_min_distance_miles;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_recent_anchor_centers TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION check_anchor_distance TO authenticated, anon, service_role;
