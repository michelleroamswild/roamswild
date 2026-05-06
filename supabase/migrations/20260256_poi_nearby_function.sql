-- RPC for fetching POIs near a point. Wraps PostGIS so the JS client
-- doesn't need raw SQL access. Returns lat/lng extracted from geom plus a
-- distance_miles column for client-side scoring.
--
-- Apply to Dev (CLI is linked to prod, so do not `db push`):
--   psql "$DEV_POOLER_URL" -f supabase/migrations/20260256_poi_nearby_function.sql

CREATE OR REPLACE FUNCTION nearby_points_of_interest(
    p_lat double precision,
    p_lng double precision,
    p_radius_miles double precision DEFAULT 30
)
RETURNS TABLE (
    id uuid,
    canonical_name text,
    poi_type text,
    lat double precision,
    lng double precision,
    distance_miles double precision,
    source_count integer,
    photo_count integer,
    is_hidden_gem boolean,
    locationscout_endorsed boolean,
    metadata_tags jsonb,
    sources jsonb
)
LANGUAGE sql
STABLE
AS $$
    WITH center AS (
        SELECT ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography AS g
    )
    SELECT
        p.id,
        p.canonical_name,
        p.poi_type,
        ST_Y(p.geom)::double precision AS lat,
        ST_X(p.geom)::double precision AS lng,
        (ST_Distance(p.geom::geography, c.g) / 1609.344)::double precision AS distance_miles,
        p.source_count,
        p.photo_count,
        p.is_hidden_gem,
        p.locationscout_endorsed,
        p.metadata_tags,
        p.sources
    FROM points_of_interest p, center c
    WHERE ST_DWithin(p.geom::geography, c.g, p_radius_miles * 1609.344)
    ORDER BY p.geom::geography <-> c.g
$$;

GRANT EXECUTE ON FUNCTION nearby_points_of_interest(double precision, double precision, double precision)
    TO anon, authenticated;

COMMENT ON FUNCTION nearby_points_of_interest IS
    'Returns POIs within p_radius_miles of (p_lat, p_lng), sorted by distance. Used by the trip-planner to score candidate activities for a day.';
