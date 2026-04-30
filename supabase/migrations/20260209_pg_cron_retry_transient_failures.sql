-- Auto-retry tiles that failed with transient errors (worker resource limits,
-- gateway timeouts, network blips). Permanent failures (4xx with bad input)
-- stay failed. This runs every 5 min alongside the stale-running reset.

CREATE OR REPLACE FUNCTION retry_transient_failed_jobs()
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
        finished_at = NULL,
        error_message = format('retry after transient failure: %s', LEFT(error_message, 200))
    WHERE status = 'failed'
      AND error_message IS NOT NULL
      AND (
          error_message LIKE '%WORKER_RESOURCE_LIMIT%'
          OR error_message LIKE '%504%'
          OR error_message LIKE '%502%'
          OR error_message LIKE '%503%'
          OR error_message LIKE '%timeout%'
          OR error_message LIKE '%Connection refused%'
          OR error_message LIKE '%UNAUTHORIZED_NO_AUTH_HEADER%'
      );

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

SELECT cron.schedule(
    'bulk-analysis-retry-transient',
    '*/5 * * * *',
    'SELECT retry_transient_failed_jobs();'
);
