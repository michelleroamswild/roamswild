-- Helper functions for importing dispersed sites data
-- These are called by the import-region Edge Function

-- =============================================================================
-- INSERT PUBLIC LAND (Simple version without ON CONFLICT)
-- =============================================================================

CREATE OR REPLACE FUNCTION insert_public_land_simple(
    p_external_id TEXT,
    p_source_type TEXT,
    p_name TEXT,
    p_managing_agency TEXT,
    p_land_type TEXT,
    p_boundary_wkt TEXT,
    p_area_acres NUMERIC,
    p_dispersed_camping_allowed BOOLEAN DEFAULT TRUE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_id UUID;
    v_boundary GEOMETRY;
BEGIN
    -- Parse WKT to geometry
    v_boundary := ST_GeomFromText(p_boundary_wkt, 4326);

    -- Simple insert (caller should check for duplicates first)
    INSERT INTO public_lands (
        external_id,
        source_type,
        name,
        managing_agency,
        land_type,
        boundary,
        area_acres,
        dispersed_camping_allowed
    )
    VALUES (
        p_external_id,
        p_source_type::land_source_type,
        p_name,
        p_managing_agency,
        p_land_type,
        v_boundary,
        p_area_acres,
        p_dispersed_camping_allowed
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- =============================================================================
-- INSERT PUBLIC LAND (with ON CONFLICT - requires unique constraint)
-- =============================================================================

CREATE OR REPLACE FUNCTION insert_public_land(
    p_external_id TEXT,
    p_source_type TEXT,
    p_name TEXT,
    p_managing_agency TEXT,
    p_land_type TEXT,
    p_boundary_wkt TEXT,
    p_area_acres NUMERIC,
    p_dispersed_camping_allowed BOOLEAN DEFAULT TRUE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_id UUID;
    v_boundary GEOMETRY;
BEGIN
    -- Parse WKT to geometry
    v_boundary := ST_GeomFromText(p_boundary_wkt, 4326);

    -- Upsert based on external_id
    INSERT INTO public_lands (
        external_id,
        source_type,
        name,
        managing_agency,
        land_type,
        boundary,
        area_acres,
        dispersed_camping_allowed
    )
    VALUES (
        p_external_id,
        p_source_type::land_source_type,
        p_name,
        p_managing_agency,
        p_land_type,
        v_boundary,
        p_area_acres,
        p_dispersed_camping_allowed
    )
    ON CONFLICT (external_id) DO UPDATE SET
        name = EXCLUDED.name,
        boundary = EXCLUDED.boundary,
        area_acres = EXCLUDED.area_acres,
        updated_at = NOW()
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- Add unique constraint on external_id for upsert
-- Must be a proper UNIQUE CONSTRAINT (not partial index) for ON CONFLICT to work
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'public_lands_external_id_key'
    ) THEN
        ALTER TABLE public_lands ADD CONSTRAINT public_lands_external_id_key UNIQUE (external_id);
    END IF;
END $$;

-- =============================================================================
-- INSERT ROAD SEGMENT
-- =============================================================================

CREATE OR REPLACE FUNCTION insert_road_segment(
    p_external_id TEXT,
    p_source_type TEXT,
    p_geometry_wkt TEXT,
    p_name TEXT,
    p_surface_type TEXT,
    p_vehicle_access TEXT,
    p_seasonal_closure TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_id UUID;
    v_geometry GEOMETRY;
    v_start_key TEXT;
    v_end_key TEXT;
    v_length_miles NUMERIC;
    v_public_land_id UUID;
BEGIN
    -- Parse WKT to geometry
    v_geometry := ST_GeomFromText(p_geometry_wkt, 4326);

    -- Calculate length in miles
    v_length_miles := ST_Length(v_geometry::geography) / 1609.34;

    -- Generate node keys for network matching (rounded to ~10m precision)
    v_start_key := ROUND(ST_X(ST_StartPoint(v_geometry))::numeric, 4)::text || ',' ||
                   ROUND(ST_Y(ST_StartPoint(v_geometry))::numeric, 4)::text;
    v_end_key := ROUND(ST_X(ST_EndPoint(v_geometry))::numeric, 4)::text || ',' ||
                 ROUND(ST_Y(ST_EndPoint(v_geometry))::numeric, 4)::text;

    -- Find containing public land (optional, may be NULL)
    SELECT id INTO v_public_land_id
    FROM public_lands
    WHERE ST_Intersects(boundary, v_geometry)
      AND dispersed_camping_allowed = TRUE
    LIMIT 1;

    -- Upsert based on external_id
    INSERT INTO road_segments (
        external_id,
        source_type,
        geometry,
        length_miles,
        name,
        surface_type,
        vehicle_access,
        seasonal_closure,
        start_node_key,
        end_node_key,
        public_land_id
    )
    VALUES (
        p_external_id,
        p_source_type::road_source_type,
        v_geometry,
        v_length_miles,
        p_name,
        p_surface_type,
        p_vehicle_access::vehicle_access_type,
        p_seasonal_closure,
        v_start_key,
        v_end_key,
        v_public_land_id
    )
    ON CONFLICT (external_id) DO UPDATE SET
        geometry = EXCLUDED.geometry,
        length_miles = EXCLUDED.length_miles,
        name = EXCLUDED.name,
        vehicle_access = EXCLUDED.vehicle_access,
        public_land_id = EXCLUDED.public_land_id,
        updated_at = NOW()
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- Add unique constraint on external_id for upsert
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'road_segments_external_id_key'
    ) THEN
        ALTER TABLE road_segments ADD CONSTRAINT road_segments_external_id_key UNIQUE (external_id);
    END IF;
END $$;

-- =============================================================================
-- DERIVE DEAD-END SPOTS
-- =============================================================================

CREATE OR REPLACE FUNCTION derive_dead_end_spots(
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
BEGIN
    -- Create bounding box
    v_bounds := ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326);

    -- Find all road endpoints within bounds
    -- Count how many roads meet at each endpoint
    -- Endpoints with count=1 are dead-ends (potential camping spots)
    FOR rec IN
        WITH endpoints AS (
            -- Collect start points
            SELECT
                ST_SnapToGrid(start_point, 0.0001) as point,
                id as road_id,
                name as road_name,
                source_type,
                vehicle_access,
                public_land_id
            FROM road_segments
            WHERE ST_Intersects(geometry, v_bounds)

            UNION ALL

            -- Collect end points
            SELECT
                ST_SnapToGrid(end_point, 0.0001) as point,
                id as road_id,
                name as road_name,
                source_type,
                vehicle_access,
                public_land_id
            FROM road_segments
            WHERE ST_Intersects(geometry, v_bounds)
        ),
        endpoint_counts AS (
            SELECT
                point,
                COUNT(*) as connection_count,
                array_agg(DISTINCT road_name) FILTER (WHERE road_name IS NOT NULL) as road_names,
                MAX(vehicle_access::text)::vehicle_access_type as best_vehicle_access,
                MAX(public_land_id) as public_land_id,
                MAX(source_type::text)::road_source_type as source_type
            FROM endpoints
            GROUP BY point
        )
        SELECT
            ec.*,
            pl.managing_agency
        FROM endpoint_counts ec
        LEFT JOIN public_lands pl ON ec.public_land_id = pl.id
        WHERE ec.connection_count = 1  -- True dead ends only
          AND ec.public_land_id IS NOT NULL  -- Must be on public land
    LOOP
        -- Skip if spot already exists nearby (within ~50m)
        IF NOT EXISTS (
            SELECT 1 FROM potential_spots
            WHERE ST_DWithin(location::geography, rec.point::geography, 50)
        ) THEN
            -- Calculate confidence score
            -- Base: 25 for dead-end on public land
            -- +10 if high clearance required (more remote)
            -- +5 for having a road name
            INSERT INTO potential_spots (
                location,
                spot_type,
                status,
                confidence_score,
                score_breakdown,
                road_name,
                vehicle_access,
                is_passenger_reachable,
                is_high_clearance_reachable,
                public_land_id,
                managing_agency,
                derivation_reasons,
                source_type
            )
            VALUES (
                rec.point,
                'dead_end',
                'derived',
                25 +
                    CASE WHEN rec.best_vehicle_access IN ('high_clearance', '4wd') THEN 10 ELSE 0 END +
                    CASE WHEN rec.road_names IS NOT NULL AND array_length(rec.road_names, 1) > 0 THEN 5 ELSE 0 END,
                jsonb_build_object(
                    'base', 25,
                    'vehicle_bonus', CASE WHEN rec.best_vehicle_access IN ('high_clearance', '4wd') THEN 10 ELSE 0 END,
                    'name_bonus', CASE WHEN rec.road_names IS NOT NULL AND array_length(rec.road_names, 1) > 0 THEN 5 ELSE 0 END
                ),
                COALESCE(rec.road_names[1], 'Unnamed Road'),
                rec.best_vehicle_access,
                rec.best_vehicle_access = 'passenger',
                rec.best_vehicle_access IN ('passenger', 'high_clearance'),
                rec.public_land_id,
                rec.managing_agency,
                ARRAY['Road terminus (dead-end)', 'On public land: ' || COALESCE(rec.managing_agency, 'Unknown')],
                rec.source_type
            );

            v_spots_created := v_spots_created + 1;
        END IF;
    END LOOP;

    RETURN v_spots_created;
END;
$$;
