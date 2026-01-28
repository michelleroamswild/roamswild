-- Friend invites table for tracking invitations to non-users
CREATE TABLE friend_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  invited_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(requester_id, invited_email)
);

-- Index for looking up invites by email (for when user signs up)
CREATE INDEX idx_friend_invites_email ON friend_invites(invited_email, status);

-- RLS policies
ALTER TABLE friend_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own invites" ON friend_invites FOR SELECT
  USING (auth.uid() = requester_id);

CREATE POLICY "Users can create invites" ON friend_invites FOR INSERT
  WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "Users can delete own invites" ON friend_invites FOR DELETE
  USING (auth.uid() = requester_id);

-- Trigger: auto-create friend request when invited user signs up
CREATE OR REPLACE FUNCTION process_friend_invites()
RETURNS TRIGGER AS $$
BEGIN
  -- Create pending friend requests for all invites matching this email
  INSERT INTO user_friends (requester_id, addressee_id, status)
  SELECT fi.requester_id, NEW.id, 'pending'
  FROM friend_invites fi
  WHERE LOWER(fi.invited_email) = LOWER(NEW.email)
    AND fi.status = 'pending';

  -- Mark those invites as accepted
  UPDATE friend_invites
  SET status = 'accepted'
  WHERE LOWER(invited_email) = LOWER(NEW.email)
    AND status = 'pending';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_profile_created_process_invites
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION process_friend_invites();
