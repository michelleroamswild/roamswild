-- Lazy NAIP-backfill queue. The homepage (and any other surface that wants
-- imagery for spots without it) POSTs spot_ids to the `queue-naip-backfill`
-- edge function, which inserts rows here. A separate Python worker
-- (scripts/naip-imagery/process_queue.py — to be added) consumes the queue,
-- runs the existing fetch_chip.py per row, writes to spot_images, and marks
-- the queue row done.
--
-- Workers claim work atomically with:
--   UPDATE naip_backfill_queue
--   SET status='processing', claimed_at=NOW(), attempts=attempts+1
--   WHERE id IN (
--     SELECT id FROM naip_backfill_queue
--     WHERE status='pending'
--     ORDER BY requested_at
--     FOR UPDATE SKIP LOCKED
--     LIMIT N
--   )
--   RETURNING ...;
-- which is safe across multiple worker processes.

CREATE TABLE naip_backfill_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    spot_id UUID NOT NULL REFERENCES spots(id) ON DELETE CASCADE,

    -- pending → processing → done (terminal) or error (terminal until reset).
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'done', 'error')),

    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,

    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    claimed_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,

    -- Only one queue row per spot. Re-queues for a previously-done spot are
    -- handled by the edge function (it can flip status back to pending).
    CONSTRAINT naip_backfill_queue_spot_id_unique UNIQUE (spot_id)
);

CREATE INDEX idx_naip_queue_status_requested
    ON naip_backfill_queue(status, requested_at)
    WHERE status IN ('pending', 'processing');

ALTER TABLE naip_backfill_queue ENABLE ROW LEVEL SECURITY;

-- No public read/write — all access goes through the edge function with the
-- service role key, plus the Python worker (also service role). End users
-- never touch this table directly.
