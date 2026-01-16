-- Add columns to existing campsites table for confirmation tracking

-- Source type to track how the campsite was added
-- 'manual' = user added directly, 'explorer' = confirmed from dispersed explorer
ALTER TABLE campsites ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'manual';

-- For explorer spots: tracks how many users confirmed this location
ALTER TABLE campsites ADD COLUMN IF NOT EXISTS confirmation_count INTEGER DEFAULT 0;

-- true if confirmation_count >= 3 OR source_type = 'manual'
ALTER TABLE campsites ADD COLUMN IF NOT EXISTS is_confirmed BOOLEAN DEFAULT false;

-- For explorer spots: stores original PotentialSpot data { score, reasons, roadName }
ALTER TABLE campsites ADD COLUMN IF NOT EXISTS original_spot_data JSONB;

-- Set is_confirmed = true for all existing manual campsites
UPDATE campsites SET is_confirmed = true WHERE source_type = 'manual' OR source_type IS NULL;

-- Create index for source_type queries
CREATE INDEX IF NOT EXISTS idx_campsites_source_type ON campsites (source_type);
CREATE INDEX IF NOT EXISTS idx_campsites_is_confirmed ON campsites (is_confirmed);

-- Track which users confirmed which spots (many-to-many)
CREATE TABLE IF NOT EXISTS spot_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campsite_id UUID NOT NULL REFERENCES campsites(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(campsite_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_spot_confirmations_campsite ON spot_confirmations(campsite_id);
CREATE INDEX IF NOT EXISTS idx_spot_confirmations_user ON spot_confirmations(user_id);

-- Enable RLS on spot_confirmations
ALTER TABLE spot_confirmations ENABLE ROW LEVEL SECURITY;

-- RLS policies for spot_confirmations
-- Users can see all confirmations (for counting)
CREATE POLICY "spot_confirmations_select" ON spot_confirmations FOR SELECT USING (true);

-- Users can only insert their own confirmations
CREATE POLICY "spot_confirmations_insert" ON spot_confirmations FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can only delete their own confirmations
CREATE POLICY "spot_confirmations_delete" ON spot_confirmations FOR DELETE
USING (auth.uid() = user_id);

-- Update campsites SELECT policy to include confirmed explorer spots
DROP POLICY IF EXISTS "campsites_select" ON campsites;
CREATE POLICY "campsites_select" ON campsites FOR SELECT USING (
  user_id = auth.uid()  -- Owner can always see
  OR visibility = 'public'  -- Anyone can see public
  OR (source_type = 'explorer' AND is_confirmed = true)  -- Anyone can see confirmed explorer spots
);

-- Function to update confirmation count and is_confirmed status
CREATE OR REPLACE FUNCTION update_campsite_confirmation_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE campsites
    SET confirmation_count = confirmation_count + 1,
        is_confirmed = CASE WHEN confirmation_count + 1 >= 3 THEN true ELSE is_confirmed END
    WHERE id = NEW.campsite_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE campsites
    SET confirmation_count = GREATEST(0, confirmation_count - 1),
        is_confirmed = CASE
          WHEN source_type = 'manual' THEN true  -- Manual spots stay confirmed
          WHEN confirmation_count - 1 >= 3 THEN true
          ELSE false
        END
    WHERE id = OLD.campsite_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Trigger to auto-update confirmation count
DROP TRIGGER IF EXISTS trigger_update_confirmation_count ON spot_confirmations;
CREATE TRIGGER trigger_update_confirmation_count
  AFTER INSERT OR DELETE ON spot_confirmations
  FOR EACH ROW
  EXECUTE FUNCTION update_campsite_confirmation_count();
