-- Pause the bulk-analysis cron jobs to free up disk IO. Use cron.unschedule
-- (rather than DROP FUNCTION) so we keep the picker / finalizer / retry
-- functions in place — re-enabling later is just `cron.schedule(...)` calls.

SELECT cron.unschedule('bulk-analysis-process-1');
SELECT cron.unschedule('bulk-analysis-process-2');
SELECT cron.unschedule('bulk-analysis-finalize');
SELECT cron.unschedule('bulk-analysis-stale-reset');
SELECT cron.unschedule('bulk-analysis-retry-transient');
