-- Add universal access code ROAM-4789 that works for anyone

-- Update check_invite_code to accept the universal code
CREATE OR REPLACE FUNCTION check_invite_code(code TEXT)
RETURNS TABLE(valid BOOLEAN, email TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check for universal access code first
  IF upper(code) = 'ROAM-4789' THEN
    RETURN QUERY SELECT true::boolean, null::text;
    RETURN;
  END IF;

  -- Otherwise check the waitlist table
  RETURN QUERY
  SELECT
    (w.invite_code IS NOT NULL AND w.used_at IS NULL) as valid,
    w.email
  FROM waitlist w
  WHERE w.invite_code = upper(code);
END;
$$;

-- Update use_invite_code to handle the universal code (just return true, don't update anything)
CREATE OR REPLACE FUNCTION use_invite_code(code TEXT, user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Universal code - always valid, no need to update anything
  IF upper(code) = 'ROAM-4789' THEN
    RETURN true;
  END IF;

  -- Otherwise update the waitlist entry
  UPDATE waitlist
  SET used_at = now(),
      used_by = user_id
  WHERE invite_code = upper(code)
    AND used_at IS NULL;

  RETURN FOUND;
END;
$$;
