-- Resume-tracking for bulk dispersed-spot analysis jobs.
-- Each row is one bbox tile within a state, with a status field that lets
-- the driver script crash and resume.

CREATE TABLE bulk_analysis_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Region identification
    state_code TEXT NOT NULL,           -- USPS code: UT, CA, NV, etc.
    tile_x INTEGER NOT NULL,            -- integer grid index (lng * 1/tile_size)
    tile_y INTEGER NOT NULL,
    tile_size_deg NUMERIC(6, 3) NOT NULL DEFAULT 0.25,

    -- Bbox
    north NUMERIC(9, 6) NOT NULL,
    south NUMERIC(9, 6) NOT NULL,
    east NUMERIC(9, 6) NOT NULL,
    west NUMERIC(9, 6) NOT NULL,

    -- Status
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'done', 'failed', 'skipped')),

    -- Last attempt
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    error_message TEXT,

    -- Result snapshot (from import-region response)
    result JSONB,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bulk_analysis_jobs_status ON bulk_analysis_jobs(status);
CREATE INDEX idx_bulk_analysis_jobs_state_status ON bulk_analysis_jobs(state_code, status);
CREATE UNIQUE INDEX idx_bulk_analysis_jobs_unique
    ON bulk_analysis_jobs(state_code, tile_x, tile_y, tile_size_deg);

ALTER TABLE bulk_analysis_jobs ENABLE ROW LEVEL SECURITY;
-- service-role only — admin tooling, no public reads
