-- Classify each spot's access difficulty from the worst nearby road segment.
--
-- For each spot, look at all road segments within 100m and pick the worst
-- one's difficulty score. The score reflects how rough the road is, derived
-- from OSM tags:
--   4 = extreme   tracktype=grade5  OR  smoothness∈(very_horrible,horrible,impassable)
--   3 = hard      tracktype=grade4  OR  four_wd_only=true  OR  smoothness∈(very_bad,bad)
--   2 = moderate  tracktype=grade3  OR  vehicle_access=high_clearance
--   1 = easy      tracktype∈(grade1,grade2)  OR  surface∈(asphalt,paved,concrete)
--
-- Stored in spots.extra->>access_difficulty as one of:
--   'extreme' / 'hard' / 'moderate' / 'easy'
--
-- This is a per-segment classifier — does NOT account for spots that sit on
-- a calm road but are only reachable through an extreme one upstream.
-- That's a separate network-reachability pass we can layer on later.

CREATE OR REPLACE FUNCTION classify_spots_access_difficulty(
    p_south NUMERIC, p_west NUMERIC, p_north NUMERIC, p_east NUMERIC,
    p_max_distance_m NUMERIC DEFAULT 100
)
RETURNS TABLE (
    extreme_count INTEGER,
    hard_count INTEGER,
    moderate_count INTEGER,
    easy_count INTEGER,
    unknown_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_bounds GEOMETRY;
    v_extreme INT := 0; v_hard INT := 0; v_moderate INT := 0;
    v_easy INT := 0; v_unknown INT := 0;
BEGIN
    v_bounds := ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326);

    WITH spot_set AS (
        SELECT id, geometry
        FROM spots
        WHERE kind IN ('dispersed_camping', 'established_campground')
          AND ST_Within(geometry, v_bounds)
    ),
    -- Score each road segment by its OSM-tag difficulty
    road_scores AS (
        SELECT rs.id, rs.geometry,
            CASE
                WHEN rs.tracktype = 'grade5' THEN 4
                WHEN rs.osm_tags->>'smoothness' IN ('very_horrible','horrible','impassable') THEN 4
                WHEN rs.tracktype = 'grade4' THEN 3
                WHEN rs.four_wd_only = TRUE THEN 3
                WHEN rs.osm_tags->>'smoothness' IN ('very_bad','bad') THEN 3
                WHEN rs.tracktype = 'grade3' THEN 2
                WHEN rs.vehicle_access = 'high_clearance' THEN 2
                WHEN rs.tracktype IN ('grade1','grade2') THEN 1
                WHEN rs.surface_type IN ('asphalt','paved','concrete') THEN 1
                ELSE 1
            END AS score
        FROM road_segments rs
        WHERE ST_Intersects(rs.geometry, ST_Buffer(v_bounds::geography, p_max_distance_m)::geometry)
    ),
    -- Worst score among nearby roads, per spot
    spot_worst AS (
        SELECT s.id,
               COALESCE(MAX(rs.score), 0) AS worst
        FROM spot_set s
        LEFT JOIN road_scores rs
            ON ST_DWithin(rs.geometry::geography, s.geometry::geography, p_max_distance_m)
        GROUP BY s.id
    ),
    classified AS (
        SELECT id,
               CASE worst
                   WHEN 4 THEN 'extreme'
                   WHEN 3 THEN 'hard'
                   WHEN 2 THEN 'moderate'
                   WHEN 1 THEN 'easy'
                   ELSE 'unknown'
               END AS difficulty
        FROM spot_worst
    ),
    updated AS (
        UPDATE spots s
        SET extra = s.extra || jsonb_build_object('access_difficulty', c.difficulty)
        FROM classified c
        WHERE s.id = c.id
        RETURNING c.difficulty
    )
    SELECT
        SUM((difficulty='extreme')::int)::int,
        SUM((difficulty='hard')::int)::int,
        SUM((difficulty='moderate')::int)::int,
        SUM((difficulty='easy')::int)::int,
        SUM((difficulty='unknown')::int)::int
    INTO v_extreme, v_hard, v_moderate, v_easy, v_unknown
    FROM updated;

    RETURN QUERY SELECT v_extreme, v_hard, v_moderate, v_easy, v_unknown;
END;
$$;

GRANT EXECUTE ON FUNCTION classify_spots_access_difficulty TO service_role;
