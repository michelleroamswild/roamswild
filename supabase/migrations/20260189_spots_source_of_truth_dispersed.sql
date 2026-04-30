-- Make `spots` the source of truth for the dispersed-camping read path.
--
-- Two changes:
--   1. Expand the mirror trigger to persist `osm_tags`, `road_name`, and
--      `is_road_accessible` into spots.extra — these are consumed by
--      /dispersed (SpotDetailPanel) but were dropped on the way to spots.
--   2. Backfill those fields onto existing spots that were created from
--      potential_spots (matched by lat/lng).
--   3. Replace the `get_dispersed_spots` RPC to read from `spots` instead
--      of `potential_spots`. Same return shape so the edge function and
--      frontend keep working unchanged.

-- ============================================================
-- 1. Update mirror trigger
-- ============================================================
CREATE OR REPLACE FUNCTION mirror_potential_spot_to_spots()
RETURNS TRIGGER AS $$
DECLARE
    v_sub_kind TEXT;
    v_source TEXT;
    v_source_external_id TEXT := NULL;
    v_amenities JSONB := '{}'::jsonb;
    v_extra JSONB;
    v_name TEXT;
BEGIN
    IF NEW.spot_type = 'camp_site' THEN
        v_sub_kind := 'known';
        v_source   := 'osm';
        IF NEW.osm_camp_site_id IS NOT NULL THEN
            v_source_external_id := NEW.osm_camp_site_id::TEXT;
        END IF;
    ELSE
        v_sub_kind := 'derived';
        v_source   := COALESCE(NEW.source_type::TEXT, 'derived');
    END IF;

    IF NEW.vehicle_access IS NOT NULL THEN
        v_amenities := v_amenities || jsonb_build_object('vehicle_required', NEW.vehicle_access::TEXT);
    END IF;

    -- Now includes osm_tags, road_name, is_road_accessible — needed by /dispersed
    v_extra := jsonb_strip_nulls(jsonb_build_object(
        'confidence_score',           NEW.confidence_score,
        'recommendation_score',       NEW.recommendation_score,
        'derivation_reasons',         NEW.derivation_reasons,
        'is_passenger_reachable',     NEW.is_passenger_reachable,
        'is_high_clearance_reachable',NEW.is_high_clearance_reachable,
        'is_road_accessible',         NEW.is_road_accessible,
        'status',                     NEW.status::TEXT,
        'legacy_potential_spots_id',  NEW.id::TEXT,
        'osm_camp_site_id',           NEW.osm_camp_site_id,
        'osm_tags',                   NEW.osm_tags,
        'road_name',                  NEW.road_name
    ));

    v_name := COALESCE(NEW.name, NEW.road_name,
                       CASE WHEN NEW.spot_type = 'camp_site' THEN 'OSM Campsite' ELSE 'Dispersed spot' END);

    IF v_source_external_id IS NOT NULL THEN
        INSERT INTO spots (
            name, description, latitude, longitude,
            kind, sub_kind, source, source_external_id,
            public_land_unit, public_land_manager, public_land_designation, public_access,
            land_type, amenities, extra
        )
        VALUES (
            v_name, NULL, NEW.lat, NEW.lng,
            'dispersed_camping', v_sub_kind, v_source, v_source_external_id,
            NEW.land_unit_name, NEW.managing_agency, NEW.land_protection_title, NULL,
            _spots_derive_land_type(NEW.managing_agency),
            v_amenities, v_extra
        )
        ON CONFLICT (source, source_external_id) DO NOTHING;
    ELSE
        INSERT INTO spots (
            name, description, latitude, longitude,
            kind, sub_kind, source, source_external_id,
            public_land_unit, public_land_manager, public_land_designation, public_access,
            land_type, amenities, extra
        )
        VALUES (
            v_name, NULL, NEW.lat, NEW.lng,
            'dispersed_camping', v_sub_kind, v_source, NULL,
            NEW.land_unit_name, NEW.managing_agency, NEW.land_protection_title, NULL,
            _spots_derive_land_type(NEW.managing_agency),
            v_amenities, v_extra
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- 2. Backfill existing spots with the new extra fields
-- ============================================================
-- For every spot that has a matching potential_spots row at the same lat/lng,
-- merge in osm_tags, road_name, is_road_accessible if not already present.
UPDATE spots s
SET extra = s.extra || jsonb_strip_nulls(jsonb_build_object(
    'osm_tags',           ps.osm_tags,
    'road_name',          ps.road_name,
    'is_road_accessible', ps.is_road_accessible
))
FROM potential_spots ps
WHERE s.latitude = ps.lat
  AND s.longitude = ps.lng
  AND s.kind = 'dispersed_camping'
  AND (s.extra->>'osm_tags' IS NULL OR s.extra->>'road_name' IS NULL);


-- ============================================================
-- 3. Replace get_dispersed_spots — now reads from spots
-- ============================================================
DROP FUNCTION IF EXISTS get_dispersed_spots(NUMERIC, NUMERIC, NUMERIC, TEXT, NUMERIC, BOOLEAN, INTEGER);

CREATE OR REPLACE FUNCTION get_dispersed_spots(
    p_lat NUMERIC,
    p_lng NUMERIC,
    p_radius_miles NUMERIC DEFAULT 10,
    p_vehicle_access TEXT DEFAULT NULL,
    p_min_confidence NUMERIC DEFAULT 0,
    p_include_derived BOOLEAN DEFAULT FALSE,
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
    id UUID,
    lat NUMERIC,
    lng NUMERIC,
    name TEXT,
    spot_type spot_type,
    status spot_status,
    confidence_score NUMERIC,
    road_name TEXT,
    vehicle_access vehicle_access_type,
    managing_agency TEXT,
    derivation_reasons TEXT[],
    is_established_campground BOOLEAN,
    is_road_accessible BOOLEAN,
    is_on_public_land BOOLEAN,
    osm_tags JSONB,
    land_unit_name TEXT,
    land_protect_class TEXT,
    land_protection_title TEXT,
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
        s.id,
        s.latitude AS lat,
        s.longitude AS lng,
        s.name,
        -- Map kind/sub_kind back to the legacy spot_type enum
        (CASE
            WHEN s.kind = 'dispersed_camping' AND s.sub_kind = 'known' THEN 'camp_site'
            WHEN s.kind = 'established_campground' THEN 'camp_site'
            ELSE 'dead_end'
         END)::spot_type AS spot_type,
        COALESCE((s.extra->>'status')::spot_status, 'derived'::spot_status) AS status,
        COALESCE((s.extra->>'confidence_score')::NUMERIC, 0) AS confidence_score,
        COALESCE(s.extra->>'road_name', s.name) AS road_name,
        (s.amenities->>'vehicle_required')::vehicle_access_type AS vehicle_access,
        s.public_land_manager AS managing_agency,
        ARRAY(SELECT jsonb_array_elements_text(s.extra->'derivation_reasons')) AS derivation_reasons,
        (s.kind = 'established_campground') AS is_established_campground,
        COALESCE((s.extra->>'is_road_accessible')::BOOLEAN, TRUE) AS is_road_accessible,
        (s.land_type = 'public') AS is_on_public_land,
        s.extra->'osm_tags' AS osm_tags,
        s.public_land_unit AS land_unit_name,
        s.public_land_designation AS land_protect_class,
        s.public_land_designation AS land_protection_title,
        (ST_Distance(s.geometry::geography, v_center::geography) / 1609.34)::NUMERIC(6,2) AS distance_miles
    FROM spots s
    WHERE ST_DWithin(s.geometry::geography, v_center::geography, v_radius_meters)
      AND s.kind IN ('dispersed_camping', 'established_campground')
      AND COALESCE((s.extra->>'confidence_score')::NUMERIC, 0) >= p_min_confidence
      AND (p_include_derived OR (s.extra->>'status') IN ('admin_verified', 'user_confirmed'))
      AND (p_vehicle_access IS NULL OR
           (p_vehicle_access = 'passenger' AND COALESCE((s.extra->>'is_passenger_reachable')::BOOLEAN, FALSE) = TRUE) OR
           (p_vehicle_access = 'high_clearance' AND COALESCE((s.extra->>'is_high_clearance_reachable')::BOOLEAN, FALSE) = TRUE) OR
           (p_vehicle_access = '4wd'))
    ORDER BY
        CASE WHEN s.extra->>'status' = 'admin_verified' THEN 0
             WHEN s.extra->>'status' = 'user_confirmed' THEN 1
             ELSE 2 END,
        COALESCE((s.extra->>'confidence_score')::NUMERIC, 0) DESC,
        distance_miles ASC
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_dispersed_spots TO anon, authenticated, service_role;
