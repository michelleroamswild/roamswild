-- pg_cron-based driver for bulk-analysis tiles. Replaces the laptop-bound
-- run_state.py loop with a self-perpetuating Supabase-native pipeline.
--
-- Architecture:
--   - bulk_analysis_jobs table holds pending tiles (already exists)
--   - process_next_pending_tile() picks one tile per call, fires the
--     import-region edge function async via pg_net, stores the request id
--   - finalize_completed_jobs() polls net._http_response for finished
--     requests, marks tiles done/failed
--   - reset_stale_running_jobs() recovers tiles stuck in 'running' for
--     too long (HTTP request was lost or worker crashed mid-flight)
--   - cron.schedule fires the picker frequently and the finalizer slower
--
-- The whole thing runs inside Supabase, so no laptop or VM needed.

-- Required extensions (pg_cron + pg_net are pre-installed on Supabase but
-- need to be ENABLED in the database).
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Track the in-flight pg_net request id per running job so the finalizer
-- can match responses back to jobs.
ALTER TABLE bulk_analysis_jobs
    ADD COLUMN IF NOT EXISTS net_request_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_bulk_analysis_jobs_net_request_id
    ON bulk_analysis_jobs(net_request_id)
    WHERE net_request_id IS NOT NULL;


-- ============================================================
-- Picker: claim one pending tile and fire the import-region call
-- ============================================================
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
BEGIN
    -- Atomically pick + claim the next pending tile. SKIP LOCKED lets
    -- multiple cron ticks run concurrently without grabbing the same job.
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

    -- Fire async HTTP. import-region has verify_jwt=false so no auth needed.
    SELECT INTO v_request_id net.http_post(
        url := v_supabase_url,
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object(
            'regionName', format('%s tile (%s,%s)', v_job.state_code, v_job.tile_x, v_job.tile_y),
            'bounds', jsonb_build_object(
                'north', v_job.north,
                'south', v_job.south,
                'east',  v_job.east,
                'west',  v_job.west
            ),
            'importPublicLands', true,
            'importRoads', true,
            'deriveSpots', true
        ),
        timeout_milliseconds := 150000
    );

    UPDATE bulk_analysis_jobs
    SET net_request_id = v_request_id
    WHERE id = v_job.id;

    RETURN v_job.id;
END;
$$;


-- ============================================================
-- Finalizer: match completed pg_net responses back to running jobs
-- ============================================================
CREATE OR REPLACE FUNCTION finalize_completed_jobs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net
AS $$
DECLARE
    v_count INTEGER := 0;
    v_job RECORD;
    v_status_code INTEGER;
    v_content TEXT;
BEGIN
    FOR v_job IN
        SELECT id, net_request_id
        FROM bulk_analysis_jobs
        WHERE status = 'running'
          AND net_request_id IS NOT NULL
    LOOP
        SELECT status_code, content
        INTO v_status_code, v_content
        FROM net._http_response
        WHERE id = v_job.net_request_id;

        -- pg_net hasn't logged a response yet — try again next tick
        CONTINUE WHEN v_status_code IS NULL;

        IF v_status_code BETWEEN 200 AND 299 THEN
            UPDATE bulk_analysis_jobs SET
                status = 'done',
                finished_at = NOW(),
                result = (CASE
                    WHEN v_content IS NOT NULL THEN v_content::jsonb
                    ELSE NULL
                END),
                net_request_id = NULL
            WHERE id = v_job.id;
        ELSE
            UPDATE bulk_analysis_jobs SET
                status = 'failed',
                finished_at = NOW(),
                error_message = format('HTTP %s: %s', v_status_code, LEFT(COALESCE(v_content, ''), 500)),
                net_request_id = NULL
            WHERE id = v_job.id;
        END IF;
        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;


-- ============================================================
-- Stale-running recovery: jobs with no response for >10 minutes
-- get reset so they can be retried.
-- ============================================================
CREATE OR REPLACE FUNCTION reset_stale_running_jobs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE bulk_analysis_jobs
    SET status = 'pending',
        started_at = NULL,
        net_request_id = NULL,
        error_message = format('reset after stale running (was at %s)', started_at)
    WHERE status = 'running'
      AND started_at < NOW() - INTERVAL '10 minutes';

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;


-- ============================================================
-- Schedules
-- ============================================================
-- Run twice every minute (5s and 35s offsets) for ~2 tiles/min.
-- pg_cron only supports minute granularity in cron expressions, so we
-- schedule two separate jobs to get sub-minute frequency.
SELECT cron.schedule(
    'bulk-analysis-process-1',
    '* * * * *',
    'SELECT process_next_pending_tile();'
);

-- Finalizer runs every minute, picks up everything that responded.
SELECT cron.schedule(
    'bulk-analysis-finalize',
    '* * * * *',
    'SELECT finalize_completed_jobs();'
);

-- Stale recovery every 5 min.
SELECT cron.schedule(
    'bulk-analysis-stale-reset',
    '*/5 * * * *',
    'SELECT reset_stale_running_jobs();'
);
