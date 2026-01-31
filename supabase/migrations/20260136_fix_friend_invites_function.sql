-- Fix process_friend_invites function to use proper search_path
-- This migration was applied remotely from feature/mytripupdates branch

CREATE OR REPLACE FUNCTION public.process_friend_invites()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_friends (requester_id, addressee_id, status)
  SELECT fi.requester_id, NEW.id, 'pending'
  FROM public.friend_invites fi
  WHERE LOWER(fi.invited_email) = LOWER(NEW.email)
    AND fi.status = 'pending';

  UPDATE public.friend_invites
  SET status = 'accepted'
  WHERE LOWER(invited_email) = LOWER(NEW.email)
    AND status = 'pending';

  RETURN NEW;
END;
$$;
