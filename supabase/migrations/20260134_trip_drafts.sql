-- Trip drafts table for auto-saving trip creation progress
-- Each user can have one draft at a time

CREATE TABLE IF NOT EXISTS trip_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wizard_state JSONB NOT NULL,
  current_step INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Each user can only have one active draft
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE trip_drafts ENABLE ROW LEVEL SECURITY;

-- Users can only access their own drafts
CREATE POLICY "Users can view own drafts"
  ON trip_drafts FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own drafts"
  ON trip_drafts FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own drafts"
  ON trip_drafts FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own drafts"
  ON trip_drafts FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Index for faster lookups
CREATE INDEX idx_trip_drafts_user_id ON trip_drafts(user_id);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_trip_draft_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger to auto-update updated_at
CREATE TRIGGER trip_drafts_updated_at
  BEFORE UPDATE ON trip_drafts
  FOR EACH ROW
  EXECUTE FUNCTION update_trip_draft_updated_at();
