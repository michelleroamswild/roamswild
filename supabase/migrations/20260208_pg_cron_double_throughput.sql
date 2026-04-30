-- Add a second tile-processor cron job. Both fire every minute and pick
-- different jobs (FOR UPDATE SKIP LOCKED), so we get ~2 tiles/min started.
-- With each tile taking 50-90s, this puts steady ~2 concurrent edge-fn
-- calls in flight without overwhelming Overpass.

SELECT cron.schedule(
    'bulk-analysis-process-2',
    '* * * * *',
    'SELECT process_next_pending_tile();'
);
