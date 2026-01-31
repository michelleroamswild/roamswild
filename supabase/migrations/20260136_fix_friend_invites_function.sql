-- Fix process_friend_invites function to use proper search_path
-- The original function lacked SET search_path, causing "relation user_friends does not exist" errors

CREATE OR REPLACE FUNCTION public.process_friend_invites()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create pending friend requests for all invites matching this email
  INSERT INTO public.user_friends (requester_id, addressee_id, status)
  SELECT fi.requester_id, NEW.id, 'pending'
  FROM public.friend_invites fi
  WHERE LOWER(fi.invited_email) = LOWER(NEW.email)
    AND fi.status = 'pending';

  -- Mark those invites as accepted
  UPDATE public.friend_invites
  SET status = 'accepted'
  WHERE LOWER(invited_email) = LOWER(NEW.email)
    AND status = 'pending';

  RETURN NEW;
END;
$$;
