-- Weekly Sync Functions for Dispersed Sites
-- Note: MVUM roads must be synced locally (USFS blocks cloud requests)

-- Enable http extension for calling Edge Functions from pg_cron
CREATE EXTENSION IF NOT EXISTS http;

-- Create type for region definitions
CREATE TYPE region_definition AS (
    name TEXT,
    south NUMERIC,
    north NUMERIC,
    west NUMERIC,
    east NUMERIC
);

-- Function to sync public lands for a region
CREATE OR REPLACE FUNCTION sync_public_lands(p_region region_definition)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_response http_response;
    v_result JSONB;
BEGIN
    -- Call the import-region Edge Function
    SELECT * INTO v_response FROM http((
        'POST',
        current_setting('app.supabase_url') || '/functions/v1/import-region',
        ARRAY[http_header('Content-Type', 'application/json')],
        'application/json',
        jsonb_build_object(
            'regionName', p_region.name,
            'bounds', jsonb_build_object(
                'north', p_region.north,
                'south', p_region.south,
                'east', p_region.east,
                'west', p_region.west
            ),
            'importPublicLands', true,
            'importRoads', false,
            'deriveSpots', false
        )::TEXT
    )::http_request);

    IF v_response.status = 200 THEN
        v_result := v_response.content::JSONB;
    ELSE
        v_result := jsonb_build_object('error', v_response.status, 'body', v_response.content);
    END IF;

    RETURN v_result;
END;
$$;

-- Function to sync campgrounds for a region
CREATE OR REPLACE FUNCTION sync_campgrounds(p_region region_definition)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_response http_response;
    v_result JSONB;
BEGIN
    SELECT * INTO v_response FROM http((
        'POST',
        current_setting('app.supabase_url') || '/functions/v1/import-campgrounds',
        ARRAY[http_header('Content-Type', 'application/json')],
        'application/json',
        jsonb_build_object(
            'regionName', p_region.name,
            'bounds', jsonb_build_object(
                'north', p_region.north,
                'south', p_region.south,
                'east', p_region.east,
                'west', p_region.west
            )
        )::TEXT
    )::http_request);

    IF v_response.status = 200 THEN
        v_result := v_response.content::JSONB;
    ELSE
        v_result := jsonb_build_object('error', v_response.status, 'body', v_response.content);
    END IF;

    RETURN v_result;
END;
$$;

-- Function to run weekly sync for all priority regions (public lands + campgrounds only)
CREATE OR REPLACE FUNCTION run_weekly_sync()
RETURNS TABLE(region TEXT, public_lands_result JSONB, campgrounds_result JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_regions region_definition[] := ARRAY[
        ROW('Moab', 38.4, 38.8, -109.8, -109.3)::region_definition,
        ROW('Colorado Front Range', 39.5, 40.5, -106.0, -105.0)::region_definition,
        ROW('Eastern Sierras', 37.0, 38.5, -119.5, -118.0)::region_definition,
        ROW('Sedona', 34.5, 35.2, -112.2, -111.5)::region_definition,
        ROW('Flagstaff', 34.8, 35.5, -112.0, -111.2)::region_definition,
        ROW('Bend Oregon', 43.5, 44.5, -122.0, -121.0)::region_definition
    ];
    v_region region_definition;
BEGIN
    FOREACH v_region IN ARRAY v_regions
    LOOP
        region := v_region.name;
        public_lands_result := sync_public_lands(v_region);
        campgrounds_result := sync_campgrounds(v_region);
        RETURN NEXT;
    END LOOP;
END;
$$;

-- Note: pg_cron job to be created via Supabase Dashboard or SQL:
-- SELECT cron.schedule('weekly-dispersed-sync', '0 3 * * 0', 'SELECT run_weekly_sync()');
-- This runs every Sunday at 3 AM UTC

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION sync_public_lands TO service_role;
GRANT EXECUTE ON FUNCTION sync_campgrounds TO service_role;
GRANT EXECUTE ON FUNCTION run_weekly_sync TO service_role;
