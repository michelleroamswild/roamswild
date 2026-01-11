-- Create campsites table
CREATE TABLE IF NOT EXISTS campsites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Core location data
  name TEXT NOT NULL,
  lat NUMERIC NOT NULL,
  lng NUMERIC NOT NULL,
  place_id TEXT,  -- Optional Google Place ID if imported

  -- Classification
  type TEXT DEFAULT 'dispersed',  -- dispersed, established, blm, usfs, private

  -- Details
  description TEXT,
  notes TEXT,  -- Private notes (only visible to owner)

  -- Conditions
  road_access TEXT,  -- 2wd, 4wd_easy, 4wd_moderate, 4wd_hard
  cell_coverage INTEGER,  -- 0-5 rating (0 = none, 5 = full bars)
  water_available BOOLEAN,
  fee_required BOOLEAN,
  fee_amount TEXT,  -- "$10/night" or "Free"

  -- Availability
  seasonal_access TEXT,  -- year_round, summer_only, etc.
  max_vehicles INTEGER,
  max_stay_days INTEGER,

  -- Visibility
  visibility TEXT NOT NULL DEFAULT 'private',  -- private, public, friends

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- For future extensibility
  metadata JSONB DEFAULT '{}'
);

-- Create indexes for campsites
CREATE INDEX IF NOT EXISTS idx_campsites_location ON campsites (lat, lng);
CREATE INDEX IF NOT EXISTS idx_campsites_user ON campsites (user_id);
CREATE INDEX IF NOT EXISTS idx_campsites_visibility ON campsites (visibility);

-- Create campsite_photos table
CREATE TABLE IF NOT EXISTS campsite_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campsite_id UUID NOT NULL REFERENCES campsites(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  url TEXT NOT NULL,  -- Supabase Storage URL
  caption TEXT,
  is_primary BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campsite_photos_campsite ON campsite_photos (campsite_id);

-- Enable RLS
ALTER TABLE campsites ENABLE ROW LEVEL SECURITY;
ALTER TABLE campsite_photos ENABLE ROW LEVEL SECURITY;

-- Campsites: SELECT policy
-- Can see if: owner OR public
CREATE POLICY "campsites_select" ON campsites FOR SELECT USING (
  user_id = auth.uid()  -- Owner can always see
  OR visibility = 'public'  -- Anyone can see public
);

-- Campsites: INSERT - only own records
CREATE POLICY "campsites_insert" ON campsites FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Campsites: UPDATE - only own records
CREATE POLICY "campsites_update" ON campsites FOR UPDATE
USING (auth.uid() = user_id);

-- Campsites: DELETE - only own records
CREATE POLICY "campsites_delete" ON campsites FOR DELETE
USING (auth.uid() = user_id);

-- Photos: SELECT - Follow campsite visibility
CREATE POLICY "campsite_photos_select" ON campsite_photos FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM campsites
    WHERE campsites.id = campsite_photos.campsite_id
    AND (campsites.user_id = auth.uid() OR campsites.visibility = 'public')
  )
);

-- Photos: INSERT - only own records
CREATE POLICY "campsite_photos_insert" ON campsite_photos FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Photos: DELETE - only own records
CREATE POLICY "campsite_photos_delete" ON campsite_photos FOR DELETE
USING (auth.uid() = user_id);
