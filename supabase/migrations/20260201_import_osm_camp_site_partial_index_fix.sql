-- The unique index `idx_spots_source_external_id` is partial (WHERE
-- source_external_id IS NOT NULL). For ON CONFLICT to use a partial index,
-- the conflict target must include the same WHERE clause. Without it,
-- Postgres can't infer which index applies and raises:
--   "there is no unique or exclusion constraint matching the ON CONFLICT spec"
--
-- Fix: specify the WHERE clause inline so the index inference matches.

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
    -- Index inference must include the partial WHERE clause to match
    -- idx_spots_source_external_id (WHERE source_external_id IS NOT NULL).
    ON CONFLICT (source, source_external_id) WHERE source_external_id IS NOT NULL
    DO UPDATE SET
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
