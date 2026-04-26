-- Cache the version history of individual OSM ways so we can show how
-- their key tags (tracktype, 4wd_only) have changed over time. Used by
-- the road detail panel to surface "grade 3-5 across 4 edits" ranges
-- when the current grade is suspect.

CREATE TABLE IF NOT EXISTS osm_way_history (
  way_id BIGINT PRIMARY KEY,
  -- Sorted, oldest → newest. Parallel arrays for fast range queries.
  grades_seen TEXT[] NOT NULL DEFAULT '{}',
  fwd_only_seen BOOLEAN[] NOT NULL DEFAULT '{}',
  current_grade TEXT,
  current_fwd_only BOOLEAN,
  versions_count INTEGER NOT NULL DEFAULT 0,
  first_version_at TIMESTAMPTZ,
  last_edit_at TIMESTAMPTZ,
  -- Raw response from OSM /api/0.6/way/{id}/history.json for future use
  raw_history JSONB,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_osm_way_history_fetched_at
  ON osm_way_history(fetched_at);

ALTER TABLE osm_way_history ENABLE ROW LEVEL SECURITY;

-- Anyone can read (cache hits go through anon)
CREATE POLICY "Anyone can read osm way history"
  ON osm_way_history FOR SELECT USING (true);

-- Service role (edge function) populates rows
CREATE POLICY "Service role can manage osm way history"
  ON osm_way_history FOR ALL USING (true);
