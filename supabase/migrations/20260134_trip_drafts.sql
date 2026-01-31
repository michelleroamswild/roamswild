-- Trip drafts table for auto-saving wizard progress
-- Note: This migration was applied remotely from feature/mytripupdates branch

CREATE TABLE IF NOT EXISTS trip_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wizard_state JSONB NOT NULL,
  current_step INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE trip_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own drafts" ON trip_drafts FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own drafts" ON trip_drafts FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own drafts" ON trip_drafts FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own drafts" ON trip_drafts FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_trip_drafts_user_id ON trip_drafts(user_id);
