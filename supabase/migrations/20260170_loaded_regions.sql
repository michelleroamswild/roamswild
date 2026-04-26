-- Tracks which map regions have been analysed and cached in potential_spots.
-- When a user searches an area, we query this table to see if a previous
-- analysis covers the current bbox; if so, we skip re-running the client-side
-- derivation and serve results from potential_spots instead.

CREATE TABLE loaded_regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bbox geometry(Polygon, 4326) NOT NULL,
  analysed_at timestamptz NOT NULL DEFAULT now(),
  spot_count integer NOT NULL DEFAULT 0,
  analysis_version text NOT NULL DEFAULT '1.0',
  source text NOT NULL DEFAULT 'browser'
);

CREATE INDEX idx_loaded_regions_bbox ON loaded_regions USING GIST(bbox);

ALTER TABLE loaded_regions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read loaded regions"
  ON loaded_regions FOR SELECT USING (true);

CREATE POLICY "Service role can manage loaded regions"
  ON loaded_regions FOR ALL USING (true);

-- RPC: find a previously-analysed region whose bbox fully contains the
-- requested area. Returns the newest match, or empty if none.
-- Called from the frontend via supabase.rpc('find_covering_region', {...}).
CREATE OR REPLACE FUNCTION find_covering_region(
  p_south double precision,
  p_west double precision,
  p_north double precision,
  p_east double precision
) RETURNS TABLE (id uuid, analysed_at timestamptz, spot_count integer)
LANGUAGE sql
STABLE
AS $$
  SELECT id, analysed_at, spot_count
  FROM loaded_regions
  WHERE ST_Covers(bbox, ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326))
  ORDER BY analysed_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION find_covering_region(double precision, double precision, double precision, double precision) TO anon, authenticated, service_role;
