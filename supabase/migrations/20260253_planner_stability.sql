-- Planner stability for high-churn tables.
--
-- Symptom we keep hitting: heavy bulk writes (community import, Ollama
-- PATCH cycles, road backfill, derived-spot deletes) invalidate Postgres's
-- table-level stats. Auto-analyze only triggers after ~10% row change by
-- default; until it fires the planner runs queries on stale stats and
-- sometimes flips to slow plans → 8-second statement_timeout → 500.
--
-- Two durable fixes here:
--
-- 1. Tighter auto-analyze on the three tables that drive the explorer.
--    5% threshold instead of 10% means Postgres re-stats them sooner
--    after bulk writes, before the next explorer query lands.
--
-- 2. Partial GIST index on road_segments(geometry) WHERE public_land_id
--    IS NOT NULL. Mirrors the predicate get_road_segments uses (INNER
--    JOIN to public_lands implies non-NULL public_land_id), so the
--    planner can scan the index directly instead of probing the larger
--    full geometry index. ~50k rows in the partial index vs ~78k in the
--    full one. Stays performant even when stats go stale.

-- ============================================================
-- 1. Auto-analyze tuning
-- ============================================================

ALTER TABLE public.spots
    SET (autovacuum_analyze_scale_factor = 0.05);

ALTER TABLE public.road_segments
    SET (autovacuum_analyze_scale_factor = 0.05);

ALTER TABLE public.public_lands
    SET (autovacuum_analyze_scale_factor = 0.05);

-- ============================================================
-- 2. Partial GIST index for the get_road_segments hot path
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_road_segments_geometry_public_land
    ON public.road_segments
    USING GIST (geometry)
    WHERE public_land_id IS NOT NULL;

COMMENT ON INDEX idx_road_segments_geometry_public_land IS
    'Partial GIST index used by get_road_segments — covers only roads on dispersed-camping-allowed public land (matches the INNER JOIN predicate).';

-- Refresh stats now so the planner sees the new index immediately.
ANALYZE public.spots;
ANALYZE public.road_segments;
ANALYZE public.public_lands;
