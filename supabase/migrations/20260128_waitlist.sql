-- Waitlist table for managing early access signups
CREATE TABLE IF NOT EXISTS public.waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  invite_code TEXT UNIQUE,
  used_at TIMESTAMPTZ,
  used_by UUID REFERENCES auth.users(id)
);

-- Index for looking up by email
CREATE INDEX IF NOT EXISTS waitlist_email_idx ON public.waitlist(email);

-- Index for looking up by invite code
CREATE INDEX IF NOT EXISTS waitlist_invite_code_idx ON public.waitlist(invite_code) WHERE invite_code IS NOT NULL;

-- Enable RLS
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (join waitlist) - no auth required
CREATE POLICY "Anyone can join waitlist"
  ON public.waitlist
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only allow reading own waitlist entry by email (for checking status)
-- This is permissive for the signup flow to validate invite codes
CREATE POLICY "Anyone can check invite codes"
  ON public.waitlist
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Function to generate a unique invite code
CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  -- Generate 8 character code (e.g., "ROAM-XXXX")
  FOR i IN 1..6 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN 'ROAM-' || result;
END;
$$;

-- Function to approve a waitlist entry and generate invite code
CREATE OR REPLACE FUNCTION approve_waitlist_entry(waitlist_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_code TEXT;
BEGIN
  -- Generate unique invite code
  LOOP
    new_code := generate_invite_code();
    -- Check if code already exists
    EXIT WHEN NOT EXISTS (SELECT 1 FROM waitlist WHERE invite_code = new_code);
  END LOOP;

  -- Update the waitlist entry
  UPDATE waitlist
  SET invite_code = new_code,
      approved_at = now()
  WHERE email = waitlist_email
    AND invite_code IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Waitlist entry not found or already approved';
  END IF;

  RETURN new_code;
END;
$$;

-- Function to validate and use an invite code during signup
CREATE OR REPLACE FUNCTION use_invite_code(code TEXT, user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE waitlist
  SET used_at = now(),
      used_by = user_id
  WHERE invite_code = upper(code)
    AND used_at IS NULL;

  RETURN FOUND;
END;
$$;

-- Function to check if an invite code is valid (not used)
CREATE OR REPLACE FUNCTION check_invite_code(code TEXT)
RETURNS TABLE(valid BOOLEAN, email TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (w.invite_code IS NOT NULL AND w.used_at IS NULL) as valid,
    w.email
  FROM waitlist w
  WHERE w.invite_code = upper(code);

  -- If no rows returned, return false
  IF NOT FOUND THEN
    RETURN QUERY SELECT false::boolean, null::text;
  END IF;
END;
$$;

-- Function to add email to waitlist (bypasses PostgREST schema cache)
CREATE OR REPLACE FUNCTION add_to_waitlist(p_email TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  INSERT INTO waitlist (email)
  VALUES (lower(trim(p_email)))
  RETURNING json_build_object('id', id, 'email', email) INTO v_result;

  RETURN v_result;
EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('error', 'already_exists');
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION generate_invite_code() TO authenticated;
GRANT EXECUTE ON FUNCTION check_invite_code(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION use_invite_code(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION add_to_waitlist(TEXT) TO anon, authenticated, service_role;
