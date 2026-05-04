-- One-off ANALYZE helper.
--
-- Postgres planner went unstable on the spots + road_segments queries
-- after the recent 707-row delete + Ollama PATCH writes — queries were
-- flipping between fast (GIST geometry index) and slow (sequential scan
-- → statement_timeout). Refreshing planner statistics with ANALYZE
-- usually settles it.
--
-- Wrapped as SECURITY DEFINER so the service role can invoke it via
-- PostgREST RPC. Idempotent — safe to call as often as needed.

CREATE OR REPLACE FUNCTION public.run_analyze_spots_tables()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    ANALYZE public.spots;
    ANALYZE public.road_segments;
    RETURN 'analyzed';
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_analyze_spots_tables TO service_role;

COMMENT ON FUNCTION public.run_analyze_spots_tables IS
  'Refresh Postgres planner stats on spots + road_segments. Call after large bulk write/delete cycles.';
