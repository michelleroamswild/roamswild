-- RPC for fetching spots near a point. Mirrors `nearby_points_of_interest`
-- but for the multi-source `spots` table (dispersed sites, established
-- campgrounds, water/laundry/shower amenities, etc.). Used by the trip
-- planner to score campsite candidates against a day's anchor.
--
-- Filters server-side by `kind` and `source` so callers can scope to e.g.
-- dispersed-only or campground-only without shipping irrelevant rows.

CREATE OR REPLACE FUNCTION nearby_spots(
    p_lat double precision,
    p_lng double precision,
    p_radius_miles double precision DEFAULT 50,
    p_kinds text[] DEFAULT NULL,
    p_sources text[] DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    name text,
    description text,
    lat double precision,
    lng double precision,
    distance_miles double precision,
    kind text,
    sub_kind text,
    source text,
    public_land_unit text,
    public_land_manager text,
    public_land_designation text,
    public_access text,
    land_type text,
    amenities jsonb,
    extra jsonb
)
LANGUAGE sql
STABLE
AS $$
    WITH center AS (
        SELECT ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography AS g
    )
    SELECT
        s.id,
        s.name,
        s.description,
        s.latitude::double precision    AS lat,
        s.longitude::double precision   AS lng,
        (ST_Distance(s.geometry::geography, c.g) / 1609.344)::double precision AS distance_miles,
        s.kind,
        s.sub_kind,
        s.source,
        s.public_land_unit,
        s.public_land_manager,
        s.public_land_designation,
        s.public_access,
        s.land_type,
        s.amenities,
        s.extra
    FROM spots s, center c
    WHERE ST_DWithin(s.geometry::geography, c.g, p_radius_miles * 1609.344)
      AND (p_kinds   IS NULL OR s.kind   = ANY(p_kinds))
      AND (p_sources IS NULL OR s.source = ANY(p_sources))
    ORDER BY s.geometry::geography <-> c.g
$$;

GRANT EXECUTE ON FUNCTION nearby_spots(double precision, double precision, double precision, text[], text[])
    TO anon, authenticated;

COMMENT ON FUNCTION nearby_spots IS
    'Returns spots within p_radius_miles of (p_lat, p_lng), optionally filtered by kind/source. Used by the trip planner to score campsite candidates.';
