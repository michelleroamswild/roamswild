-- Create user_friends table for friend relationships
CREATE TABLE IF NOT EXISTS user_friends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected', 'blocked')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Prevent duplicate friend requests in either direction
  UNIQUE (requester_id, addressee_id),
  -- Prevent self-friending
  CHECK (requester_id != addressee_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_friends_requester ON user_friends(requester_id, status);
CREATE INDEX IF NOT EXISTS idx_user_friends_addressee ON user_friends(addressee_id, status);

-- Enable RLS
ALTER TABLE user_friends ENABLE ROW LEVEL SECURITY;

-- Users can view their own friend relationships
CREATE POLICY "user_friends_select" ON user_friends FOR SELECT
USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- Users can send friend requests (only as pending)
CREATE POLICY "user_friends_insert" ON user_friends FOR INSERT
WITH CHECK (auth.uid() = requester_id AND status = 'pending');

-- Users can update friendships they're part of
CREATE POLICY "user_friends_update" ON user_friends FOR UPDATE
USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- Users can delete their own friendships
CREATE POLICY "user_friends_delete" ON user_friends FOR DELETE
USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- Update campsites SELECT policy to include friends visibility
-- First drop the existing policy
DROP POLICY IF EXISTS "campsites_select" ON campsites;

-- Create new policy that includes friends visibility
CREATE POLICY "campsites_select" ON campsites FOR SELECT USING (
  user_id = auth.uid()  -- Owner can always see
  OR visibility = 'public'  -- Anyone can see public
  OR (
    -- Friends can see 'friends' visibility campsites
    visibility = 'friends' AND
    EXISTS (
      SELECT 1 FROM user_friends
      WHERE status = 'accepted'
      AND (
        (requester_id = auth.uid() AND addressee_id = campsites.user_id)
        OR
        (addressee_id = auth.uid() AND requester_id = campsites.user_id)
      )
    )
  )
);

-- Update campsite_photos SELECT policy to include friends visibility
DROP POLICY IF EXISTS "campsite_photos_select" ON campsite_photos;

CREATE POLICY "campsite_photos_select" ON campsite_photos FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM campsites
    WHERE campsites.id = campsite_photos.campsite_id
    AND (
      campsites.user_id = auth.uid()
      OR campsites.visibility = 'public'
      OR (
        campsites.visibility = 'friends' AND
        EXISTS (
          SELECT 1 FROM user_friends
          WHERE status = 'accepted'
          AND (
            (requester_id = auth.uid() AND addressee_id = campsites.user_id)
            OR
            (addressee_id = auth.uid() AND requester_id = campsites.user_id)
          )
        )
      )
    )
  )
);
