-- Recent searches table for logged-in users
CREATE TABLE IF NOT EXISTS recent_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  place_id TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  searched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, place_id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_recent_searches_user_id ON recent_searches(user_id);
CREATE INDEX IF NOT EXISTS idx_recent_searches_searched_at ON recent_searches(user_id, searched_at DESC);

-- RLS policies
ALTER TABLE recent_searches ENABLE ROW LEVEL SECURITY;

-- Users can only see their own searches
CREATE POLICY "Users can view own recent searches"
  ON recent_searches FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own searches
CREATE POLICY "Users can insert own recent searches"
  ON recent_searches FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own searches (for timestamp updates)
CREATE POLICY "Users can update own recent searches"
  ON recent_searches FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own searches
CREATE POLICY "Users can delete own recent searches"
  ON recent_searches FOR DELETE
  USING (auth.uid() = user_id);
