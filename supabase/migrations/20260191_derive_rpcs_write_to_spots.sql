-- Redirect the three derive-spot RPCs to write into the unified `spots`
-- table instead of the legacy `potential_spots`. After this migration the
-- import-region edge function (called by the Python bulk-analysis driver
-- run_state.py) populates `spots` directly — no mirror trigger detour.
--
-- Helper functions kept as-is:
--   - compute_is_established_campground (input: tags + name → boolean)
--   - is_point_near_road (input: lat, lng, miles → boolean)
--   - is_near_private_road (input: geometry → boolean)
--
-- Dedup behavior preserved: skip if a spot already exists within ~50m.

-- ============================================================
-- 1. derive_spots_from_linked_roads — main pipeline used in import-region
-- ============================================================
CREATE OR REPLACE FUNCTION derive_spots_from_linked_roads(
    p_north NUMERIC,
    p_south NUMERIC,
    p_east NUMERIC,
    p_west NUMERIC
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_bounds GEOMETRY;
    v_spots_created INTEGER := 0;
    rec RECORD;
    v_score NUMERIC;
    v_land_unit_name TEXT;
    v_source TEXT;
    v_extra JSONB;
BEGIN
    v_bounds := ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326);

    FOR rec IN
        WITH road_endpoints AS (
            SELECT ST_SnapToGrid(rs.start_point, 0.0001) as snapped_point,
                   rs.start_point as actual_point,
                   rs.name as road_name, rs.vehicle_access,
                   rs.source_type, rs.public_land_id
            FROM road_segments rs
            WHERE ST_Intersects(rs.start_point, v_bounds) AND rs.public_land_id IS NOT NULL
            UNION ALL
            SELECT ST_SnapToGrid(rs.end_point, 0.0001),
                   rs.end_point, rs.name, rs.vehicle_access,
                   rs.source_type, rs.public_land_id
            FROM road_segments rs
            WHERE ST_Intersects(rs.end_point, v_bounds) AND rs.public_land_id IS NOT NULL
        ),
        endpoint_counts AS (
            SELECT snapped_point,
                   (array_agg(actual_point))[1] as actual_point,
                   COUNT(*) as connection_count,
                   array_agg(DISTINCT road_name) FILTER (WHERE road_name IS NOT NULL) as road_names,
                   MAX(vehicle_access::text)::vehicle_access_type as best_vehicle_access,
                   (array_agg(source_type))[1] as source_type,
                   (array_agg(public_land_id) FILTER (WHERE public_land_id IS NOT NULL))[1] as public_land_id
            FROM road_endpoints
            GROUP BY snapped_point
        ),
        dead_ends_with_agency AS (
            SELECT ec.*, pl.managing_agency, pl.name as land_unit_name
            FROM endpoint_counts ec
            JOIN public_lands pl ON ec.public_land_id = pl.id
            WHERE ec.connection_count = 1
        )
        SELECT * FROM dead_ends_with_agency
    LOOP
        IF is_near_private_road(rec.actual_point) THEN CONTINUE; END IF;

        -- Skip if any spot (any kind) already exists within 50m
        IF EXISTS (
            SELECT 1 FROM spots
            WHERE ST_DWithin(geometry::geography, rec.actual_point::geography, 50)
        ) THEN CONTINUE; END IF;

        v_score := CASE
            WHEN rec.managing_agency = 'BLM' THEN 35
            WHEN rec.managing_agency IN ('USFS', 'FS') THEN 35
            ELSE 30
        END;

        v_source := COALESCE(rec.source_type::TEXT, 'derived');
        v_land_unit_name := rec.land_unit_name;

        v_extra := jsonb_build_object(
            'confidence_score', v_score,
            'derivation_reasons', ARRAY[
                'Road terminus (dead-end)',
                CASE
                    WHEN rec.managing_agency = 'BLM' THEN 'On BLM land'
                    WHEN rec.managing_agency IN ('USFS', 'FS') THEN 'On National Forest land'
                    ELSE 'On public land'
                END
            ],
            'is_passenger_reachable', rec.best_vehicle_access = 'passenger',
            'is_high_clearance_reachable', rec.best_vehicle_access IN ('passenger', 'high_clearance'),
            'is_road_accessible', TRUE,
            'status', 'derived',
            'road_name', rec.road_names[1]
        );

        INSERT INTO spots (
            name, latitude, longitude,
            kind, sub_kind, source,
            public_land_unit, public_land_manager,
            land_type, amenities, extra
        ) VALUES (
            COALESCE(rec.road_names[1], 'Dispersed spot'),
            ST_Y(rec.actual_point), ST_X(rec.actual_point),
            'dispersed_camping', 'derived', v_source,
            v_land_unit_name, rec.managing_agency,
            'public',
            jsonb_build_object('vehicle_required', rec.best_vehicle_access::text),
            v_extra
        );

        v_spots_created := v_spots_created + 1;
    END LOOP;

    RETURN v_spots_created;
END;
$$;


-- ============================================================
-- 2. derive_blm_spots — fallback path for BLM land
-- ============================================================
CREATE OR REPLACE FUNCTION derive_blm_spots(
    p_north NUMERIC,
    p_south NUMERIC,
    p_east NUMERIC,
    p_west NUMERIC
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_bounds GEOMETRY;
    v_spots_created INTEGER := 0;
    rec RECORD;
    v_score NUMERIC;
BEGIN
    v_bounds := ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326);

    FOR rec IN
        WITH blm_lands AS (
            SELECT id, boundary, name FROM public_lands
            WHERE managing_agency = 'BLM'
              AND ST_Intersects(boundary, v_bounds)
              AND dispersed_camping_allowed = TRUE
        ),
        road_endpoints AS (
            SELECT ST_SnapToGrid(rs.start_point, 0.0001) as point,
                   rs.name as road_name, rs.vehicle_access,
                   bl.id as blm_land_id, bl.name as blm_land_name
            FROM road_segments rs
            INNER JOIN blm_lands bl ON ST_Within(rs.start_point, bl.boundary)
            WHERE rs.source_type = 'osm' AND ST_Intersects(rs.geometry, v_bounds)
            UNION ALL
            SELECT ST_SnapToGrid(rs.end_point, 0.0001),
                   rs.name, rs.vehicle_access,
                   bl.id, bl.name
            FROM road_segments rs
            INNER JOIN blm_lands bl ON ST_Within(rs.end_point, bl.boundary)
            WHERE rs.source_type = 'osm' AND ST_Intersects(rs.geometry, v_bounds)
        ),
        endpoint_counts AS (
            SELECT point,
                   COUNT(*) as connection_count,
                   array_agg(DISTINCT road_name) FILTER (WHERE road_name IS NOT NULL) as road_names,
                   MAX(vehicle_access::text)::vehicle_access_type as best_vehicle_access,
                   (array_agg(blm_land_id))[1] as public_land_id,
                   (array_agg(blm_land_name))[1] as land_unit_name
            FROM road_endpoints
            GROUP BY point
        )
        SELECT * FROM endpoint_counts WHERE connection_count = 1
    LOOP
        IF EXISTS (
            SELECT 1 FROM spots
            WHERE ST_DWithin(geometry::geography, rec.point::geography, 50)
        ) THEN CONTINUE; END IF;

        v_score := 25
            + CASE WHEN rec.best_vehicle_access IN ('high_clearance', '4wd') THEN 10 ELSE 0 END
            + CASE WHEN rec.road_names IS NOT NULL AND array_length(rec.road_names, 1) > 0 THEN 5 ELSE 0 END;

        INSERT INTO spots (
            name, latitude, longitude,
            kind, sub_kind, source,
            public_land_unit, public_land_manager,
            land_type, amenities, extra
        ) VALUES (
            COALESCE(rec.road_names[1], 'Unnamed Road'),
            ST_Y(rec.point), ST_X(rec.point),
            'dispersed_camping', 'derived', 'osm',
            rec.land_unit_name, 'BLM',
            'public',
            jsonb_build_object('vehicle_required', rec.best_vehicle_access::text),
            jsonb_build_object(
                'confidence_score', v_score,
                'score_breakdown', jsonb_build_object(
                    'base', 25,
                    'vehicle_bonus', CASE WHEN rec.best_vehicle_access IN ('high_clearance', '4wd') THEN 10 ELSE 0 END,
                    'name_bonus', CASE WHEN rec.road_names IS NOT NULL AND array_length(rec.road_names, 1) > 0 THEN 5 ELSE 0 END
                ),
                'derivation_reasons', ARRAY['Road terminus (dead-end)', 'On BLM land'],
                'is_passenger_reachable', rec.best_vehicle_access = 'passenger',
                'is_high_clearance_reachable', rec.best_vehicle_access IN ('passenger', 'high_clearance'),
                'is_road_accessible', TRUE,
                'status', 'derived',
                'road_name', rec.road_names[1]
            )
        );

        v_spots_created := v_spots_created + 1;
    END LOOP;

    RETURN v_spots_created;
END;
$$;


-- ============================================================
-- 3. import_osm_camp_site — OSM tagged camp_sites/camp_pitches
-- ============================================================
CREATE OR REPLACE FUNCTION import_osm_camp_site(
    p_osm_id BIGINT,
    p_lat NUMERIC,
    p_lng NUMERIC,
    p_name TEXT,
    p_osm_tags JSONB,
    p_is_way_or_area BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_spot_id UUID;
    v_tags_with_type JSONB;
    v_is_established BOOLEAN;
    v_is_road_accessible BOOLEAN;
    v_score NUMERIC;
    v_reasons TEXT[];
    v_kind TEXT;
    v_sub_kind TEXT;
    v_amenities JSONB := '{}'::jsonb;
BEGIN
    v_tags_with_type := p_osm_tags || jsonb_build_object('is_way_or_area', p_is_way_or_area);

    v_is_established := compute_is_established_campground(v_tags_with_type, p_name);
    v_is_road_accessible := is_point_near_road(p_lat, p_lng, 0.25);

    IF v_is_established THEN
        v_score := 30;
        v_reasons := ARRAY['Established campground'];
        v_kind := 'established_campground';
        v_sub_kind := 'campground';
    ELSIF p_osm_tags->>'backcountry' = 'yes' OR
          p_osm_tags->>'camp_site' = 'basic' OR
          p_osm_tags->>'camp_type' IN ('wildcamp', 'non_designated') THEN
        v_score := 40;
        v_reasons := ARRAY['Known camp site', 'Backcountry/primitive'];
        v_kind := 'dispersed_camping';
        v_sub_kind := 'known';
    ELSIF p_osm_tags->>'leisure' = 'firepit' THEN
        v_score := 35;
        v_reasons := ARRAY['Fire ring/pit (likely camp spot)'];
        v_kind := 'dispersed_camping';
        v_sub_kind := 'known';
    ELSIF p_osm_tags->>'tourism' = 'camp_site' THEN
        v_score := 30;
        v_reasons := ARRAY['Known camp site'];
        v_kind := 'dispersed_camping';
        v_sub_kind := 'known';
    ELSE
        v_score := 35;
        v_reasons := ARRAY['Mapped camping location'];
        v_kind := 'dispersed_camping';
        v_sub_kind := 'known';
    END IF;

    -- Surface common OSM amenity tags into amenities JSONB
    IF p_osm_tags->>'toilets' IS NOT NULL THEN
        v_amenities := v_amenities || jsonb_build_object('toilets', p_osm_tags->>'toilets');
    END IF;
    IF p_osm_tags->>'drinking_water' IS NOT NULL THEN
        v_amenities := v_amenities || jsonb_build_object('drinking_water', p_osm_tags->>'drinking_water');
    END IF;
    IF p_osm_tags->>'shower' IS NOT NULL THEN
        v_amenities := v_amenities || jsonb_build_object('shower', p_osm_tags->>'shower');
    END IF;
    IF p_osm_tags->>'fee' IS NOT NULL THEN
        v_amenities := v_amenities || jsonb_build_object('fee', p_osm_tags->>'fee');
    END IF;

    INSERT INTO spots (
        name, latitude, longitude,
        kind, sub_kind, source, source_external_id,
        amenities, extra
    ) VALUES (
        COALESCE(p_name, 'Camp Site'),
        p_lat, p_lng,
        v_kind, v_sub_kind, 'osm', p_osm_id::text,
        v_amenities,
        jsonb_build_object(
            'confidence_score', v_score,
            'derivation_reasons', v_reasons,
            'is_road_accessible', v_is_road_accessible,
            'is_established_campground', v_is_established,
            'status', 'derived',
            'osm_tags', v_tags_with_type
        )
    )
    ON CONFLICT (source, source_external_id) DO UPDATE SET
        name = EXCLUDED.name,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        kind = EXCLUDED.kind,
        sub_kind = EXCLUDED.sub_kind,
        amenities = EXCLUDED.amenities,
        extra = EXCLUDED.extra,
        updated_at = NOW()
    RETURNING id INTO v_spot_id;

    RETURN v_spot_id;
END;
$$;
