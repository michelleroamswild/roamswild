-- Edge functions require an Authorization header even when verify_jwt=false.
-- Update process_next_pending_tile to send the project anon key as Bearer
-- (anon key is public — same one the frontend uses).

CREATE OR REPLACE FUNCTION process_next_pending_tile()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net
AS $$
DECLARE
    v_job bulk_analysis_jobs;
    v_request_id BIGINT;
    v_supabase_url TEXT := 'https://ioseedbzvogywztbtgjd.supabase.co/functions/v1/import-region';
    v_anon_key TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlvc2VlZGJ6dm9neXd6dGJ0Z2pkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5MjY3ODUsImV4cCI6MjA4MzUwMjc4NX0.7x4z3OlI7OmI8g9wcDL_08lun0yDPCU9TUwuFqo-tNM';
BEGIN
    UPDATE bulk_analysis_jobs
    SET status = 'running', started_at = NOW(), error_message = NULL
    WHERE id = (
        SELECT id FROM bulk_analysis_jobs
        WHERE status = 'pending'
        ORDER BY tile_y, tile_x
        LIMIT 1
        FOR UPDATE SKIP LOCKED
    )
    RETURNING * INTO v_job;

    IF v_job.id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT INTO v_request_id net.http_post(
        url := v_supabase_url,
        headers := jsonb_build_object(
            'Content-Type',   'application/json',
            'apikey',         v_anon_key,
            'Authorization',  'Bearer ' || v_anon_key
        ),
        body := jsonb_build_object(
            'regionName', format('%s tile (%s,%s)', v_job.state_code, v_job.tile_x, v_job.tile_y),
            'bounds', jsonb_build_object(
                'north', v_job.north,
                'south', v_job.south,
                'east',  v_job.east,
                'west',  v_job.west
            ),
            'importPublicLands', true,
            'importRoads',       true,
            'deriveSpots',       true
        ),
        timeout_milliseconds := 150000
    );

    UPDATE bulk_analysis_jobs
    SET net_request_id = v_request_id
    WHERE id = v_job.id;

    RETURN v_job.id;
END;
$$;
