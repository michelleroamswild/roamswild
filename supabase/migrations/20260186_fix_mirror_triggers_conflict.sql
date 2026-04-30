-- Fix: the mirror_potential_spot_to_spots trigger uses
--   ON CONFLICT (source, source_external_id) DO NOTHING
-- but the unique index on those columns is partial:
--   WHERE source_external_id IS NOT NULL
-- which means Postgres can't match the index when source_external_id IS NULL —
-- it errors with "there is no unique or exclusion constraint matching".
-- Most derived spots have NULL external id, so every insert was failing,
-- which made the explorer's save-derived-spots edge function 500 and
-- prevented the entire save flow.
--
-- Fix: branch the INSERT — use ON CONFLICT only when external id is set.

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

    v_extra := jsonb_strip_nulls(jsonb_build_object(
        'confidence_score',           NEW.confidence_score,
        'recommendation_score',       NEW.recommendation_score,
        'derivation_reasons',         NEW.derivation_reasons,
        'is_passenger_reachable',     NEW.is_passenger_reachable,
        'is_high_clearance_reachable',NEW.is_high_clearance_reachable,
        'status',                     NEW.status::TEXT,
        'legacy_potential_spots_id',  NEW.id::TEXT,
        'osm_camp_site_id',           NEW.osm_camp_site_id
    ));

    v_name := COALESCE(NEW.name, NEW.road_name,
                       CASE WHEN NEW.spot_type = 'camp_site' THEN 'OSM Campsite' ELSE 'Dispersed spot' END);

    -- Branch on external_id presence — only use ON CONFLICT when the
    -- partial index applies.
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


-- Same fix for established_campgrounds trigger
CREATE OR REPLACE FUNCTION mirror_established_campground_to_spots()
RETURNS TRIGGER AS $$
DECLARE
    v_source TEXT := 'unknown';
    v_source_external_id TEXT := NULL;
    v_amenities JSONB := '{}'::jsonb;
    v_extra JSONB;
    v_description TEXT;
BEGIN
    IF LOWER(COALESCE(NEW.facility_type, '')) IN ('day use', 'day_use', 'trailhead') THEN
        RETURN NEW;
    END IF;

    IF NEW.ridb_facility_id IS NOT NULL THEN
        v_source := 'ridb';
        v_source_external_id := NEW.ridb_facility_id;
    ELSIF NEW.osm_id IS NOT NULL THEN
        v_source := 'osm';
        v_source_external_id := NEW.osm_id::TEXT;
    ELSIF NEW.usfs_rec_area_id IS NOT NULL THEN
        v_source := 'usfs';
        v_source_external_id := NEW.usfs_rec_area_id;
    END IF;

    IF NEW.has_toilets   IS TRUE THEN v_amenities := v_amenities || jsonb_build_object('toilets', 'yes'); END IF;
    IF NEW.has_water     IS TRUE THEN v_amenities := v_amenities || jsonb_build_object('water', 'yes'); END IF;
    IF NEW.has_showers   IS TRUE THEN v_amenities := v_amenities || jsonb_build_object('showers_amenity', 'yes'); END IF;
    IF NEW.is_reservable IS TRUE THEN v_amenities := v_amenities || jsonb_build_object('reservation', true); END IF;
    IF NEW.has_fee       IS TRUE THEN v_amenities := v_amenities || jsonb_build_object('fee', 'paid');
    ELSIF NEW.has_fee    IS FALSE THEN v_amenities := v_amenities || jsonb_build_object('fee', 'free');
    END IF;
    IF NEW.fee_description IS NOT NULL THEN
        v_amenities := v_amenities || jsonb_build_object('fee_description', NEW.fee_description);
    END IF;

    v_extra := jsonb_strip_nulls(jsonb_build_object(
        'forest_name',                  NEW.forest_name,
        'recreation_gov_url',           NEW.recreation_gov_url,
        'last_synced_at',               NEW.last_synced_at,
        'legacy_established_campgrounds_id', NEW.id::TEXT
    ));

    v_description := NEW.description;
    IF v_description IS NOT NULL THEN
        v_description := regexp_replace(v_description, '<[^>]+>', ' ', 'g');
        v_description := regexp_replace(v_description, '\s+', ' ', 'g');
        v_description := trim(v_description);
        IF length(v_description) > 600 THEN
            v_description := substring(v_description from 1 for 600) || '…';
        END IF;
    END IF;

    IF v_source_external_id IS NOT NULL THEN
        INSERT INTO spots (
            name, description, latitude, longitude,
            kind, sub_kind, source, source_external_id,
            public_land_unit, public_land_manager, public_land_designation, public_access,
            land_type, amenities, extra
        )
        VALUES (
            COALESCE(NEW.name, 'Unnamed campground'),
            v_description, NEW.lat, NEW.lng,
            'established_campground', 'campground', v_source, v_source_external_id,
            NULL, NULLIF(NEW.agency_name, 'Unknown'), NULL, NULL,
            _spots_derive_land_type(NULLIF(NEW.agency_name, 'Unknown')),
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
            COALESCE(NEW.name, 'Unnamed campground'),
            v_description, NEW.lat, NEW.lng,
            'established_campground', 'campground', v_source, NULL,
            NULL, NULLIF(NEW.agency_name, 'Unknown'), NULL, NULL,
            _spots_derive_land_type(NULLIF(NEW.agency_name, 'Unknown')),
            v_amenities, v_extra
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
