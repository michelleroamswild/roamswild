-- Repair: Ensure trip_drafts trigger exists
-- This migration was applied remotely from feature/mytripupdates branch

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

DROP TRIGGER IF EXISTS trip_drafts_updated_at ON trip_drafts;
CREATE TRIGGER trip_drafts_updated_at
  BEFORE UPDATE ON trip_drafts
  FOR EACH ROW
  EXECUTE FUNCTION update_trip_draft_updated_at();
