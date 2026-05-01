-- AI-generated region enrichments. Sibling to `regions` so that import
-- pipelines that own the canonical `regions.description` / `regions.tagline`
-- fields don't collide with model-generated copy.
--
-- One row per region. `model` + `prompt_version` track which Claude model and
-- prompt produced the cached output, so bumping prompt_version invalidates
-- the cache without dropping the table:
--   UPDATE region_ai_enrichments SET prompt_version = 0;
-- The edge function regenerates rows whose prompt_version is below CURRENT.

CREATE TABLE region_ai_enrichments (
    region_id UUID PRIMARY KEY REFERENCES regions(id) ON DELETE CASCADE,

    -- Editorial-feel description sourced from Claude. NULL when the model
    -- declined (e.g. obscure BLM block it had no confidence about).
    description TEXT,

    -- Array of {name: string, blurb: string} entries. Empty array when the
    -- model declined to name features. Stored as JSONB so we can index later.
    highlights JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Provenance: which model / prompt produced this row. Used to trigger
    -- regeneration when we change either.
    model TEXT NOT NULL,
    prompt_version INTEGER NOT NULL DEFAULT 1,

    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_region_ai_enrichments_prompt_version
    ON region_ai_enrichments(prompt_version);

ALTER TABLE region_ai_enrichments ENABLE ROW LEVEL SECURITY;

-- Public read — enrichment text is non-sensitive and reading it should not
-- require a function round-trip when the cache is warm.
CREATE POLICY "Region AI enrichments are publicly readable"
    ON region_ai_enrichments FOR SELECT USING (TRUE);

-- Writes happen exclusively through the `enrich-region` edge function using
-- the service role key, so no INSERT/UPDATE policy is required for end-users.
