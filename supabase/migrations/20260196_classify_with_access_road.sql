-- Extend classify_spots_access_difficulty to also persist the worst-scoring
-- nearby road's tag bag onto spots.extra.access_road. That lets the
-- frontend show *why* a spot is rated extreme (e.g. tracktype=grade5,
-- smoothness=very_horrible) without re-querying road_segments at panel time.

DROP FUNCTION IF EXISTS classify_spots_access_difficulty(NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC);

CREATE OR REPLACE FUNCTION classify_spots_access_difficulty(
    p_south NUMERIC, p_west NUMERIC, p_north NUMERIC, p_east NUMERIC,
    p_max_distance_deg NUMERIC DEFAULT 0.001
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

    WITH classified AS (
        SELECT s.id,
               COALESCE(wr.score, 0) AS score,
               wr.road_name,
               wr.tracktype,
               wr.surface,
               wr.smoothness,
               wr.four_wd_only,
               wr.osm_tags
        FROM spots s
        LEFT JOIN LATERAL (
            SELECT
                score,
                rs.name AS road_name,
                rs.tracktype,
                rs.surface_type AS surface,
                rs.osm_tags->>'smoothness' AS smoothness,
                rs.four_wd_only,
                rs.osm_tags
            FROM road_segments rs
            CROSS JOIN LATERAL (SELECT (
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
                END
            ) AS score) sc
            WHERE ST_DWithin(rs.geometry, s.geometry, p_max_distance_deg)
            ORDER BY sc.score DESC
            LIMIT 1
        ) wr ON TRUE
        WHERE s.kind IN ('dispersed_camping','established_campground')
          AND ST_Within(s.geometry, v_bounds)
    ),
    -- Build difficulty + access_road JSON per spot
    enriched AS (
        SELECT id,
               CASE score
                   WHEN 4 THEN 'extreme'
                   WHEN 3 THEN 'hard'
                   WHEN 2 THEN 'moderate'
                   WHEN 1 THEN 'easy'
                   ELSE 'unknown'
               END AS difficulty,
               CASE WHEN road_name IS NOT NULL OR tracktype IS NOT NULL OR smoothness IS NOT NULL
                   THEN jsonb_strip_nulls(jsonb_build_object(
                       'road_name',    road_name,
                       'tracktype',    tracktype,
                       'smoothness',   smoothness,
                       'surface',      surface,
                       'four_wd_only', four_wd_only
                   ))
                   ELSE NULL
               END AS access_road
        FROM classified
    ),
    updated AS (
        UPDATE spots s
        SET extra = (s.extra
                     - 'access_difficulty' - 'access_road')
                    || jsonb_strip_nulls(jsonb_build_object(
                        'access_difficulty', e.difficulty,
                        'access_road',       e.access_road
                    ))
        FROM enriched e
        WHERE s.id = e.id
        RETURNING e.difficulty
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
