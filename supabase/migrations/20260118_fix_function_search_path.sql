-- ===========================================
-- Fix Function Search Path Security Issues
-- Adding SET search_path = '' to all SECURITY DEFINER functions
-- This prevents potential privilege escalation attacks
-- ===========================================

-- ===========================================
-- is_trip_owner: Check if current user owns the trip
-- ===========================================
CREATE OR REPLACE FUNCTION public.is_trip_owner(trip_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.saved_trips
    WHERE id = trip_id
    AND (user_id = auth.uid() OR owner_id = auth.uid())
  );
$$;

-- ===========================================
-- is_trip_collaborator: Check if current user is a collaborator
-- ===========================================
CREATE OR REPLACE FUNCTION public.is_trip_collaborator(trip_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trip_collaborators
    WHERE public.trip_collaborators.trip_id = $1
    AND public.trip_collaborators.user_id = auth.uid()
  );
$$;

-- ===========================================
-- can_edit_trip: Check if current user can edit the trip
-- ===========================================
CREATE OR REPLACE FUNCTION public.can_edit_trip(trip_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT (
    -- User is owner
    EXISTS (
      SELECT 1 FROM public.saved_trips
      WHERE id = trip_id
      AND (user_id = auth.uid() OR owner_id = auth.uid())
    )
    OR
    -- User is collaborator with edit permission
    EXISTS (
      SELECT 1 FROM public.trip_collaborators
      WHERE public.trip_collaborators.trip_id = $1
      AND public.trip_collaborators.user_id = auth.uid()
      AND public.trip_collaborators.permission IN ('edit', 'admin')
    )
  );
$$;

-- ===========================================
-- get_trip_members: Get all members of a trip
-- ===========================================
CREATE OR REPLACE FUNCTION public.get_trip_members(p_trip_id uuid)
RETURNS TABLE (
  user_id uuid,
  email text,
  name text,
  permission text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
BEGIN
  -- Verify caller has access to this trip
  IF NOT (
    EXISTS (SELECT 1 FROM public.saved_trips WHERE id = p_trip_id AND (user_id = auth.uid() OR owner_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM public.trip_collaborators WHERE trip_id = p_trip_id AND public.trip_collaborators.user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  -- Owner
  SELECT
    p.id as user_id,
    p.email,
    p.name,
    'owner'::text as permission
  FROM public.saved_trips st
  JOIN public.profiles p ON p.id = COALESCE(st.owner_id, st.user_id)
  WHERE st.id = p_trip_id

  UNION ALL

  -- Collaborators
  SELECT
    p.id as user_id,
    p.email,
    p.name,
    tc.permission
  FROM public.trip_collaborators tc
  JOIN public.profiles p ON p.id = tc.user_id
  WHERE tc.trip_id = p_trip_id;
END;
$$;

-- ===========================================
-- get_trip_preview_by_token: Get trip preview for share link (no auth required)
-- ===========================================
CREATE OR REPLACE FUNCTION public.get_trip_preview_by_token(share_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'id', st.id,
    'name', st.name,
    'description', st.description,
    'start_date', st.start_date,
    'end_date', st.end_date,
    'owner_name', p.name,
    'stops_count', (SELECT COUNT(*) FROM public.trip_stops WHERE trip_id = st.id)
  ) INTO result
  FROM public.saved_trips st
  LEFT JOIN public.profiles p ON p.id = COALESCE(st.owner_id, st.user_id)
  WHERE st.share_token = $1
  AND st.is_shared = true;

  IF result IS NULL THEN
    RAISE EXCEPTION 'Trip not found or not shared';
  END IF;

  RETURN result;
END;
$$;

-- ===========================================
-- join_trip_by_share_link: Join a trip using share token
-- ===========================================
CREATE OR REPLACE FUNCTION public.join_trip_by_share_link(share_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_trip_id uuid;
  v_user_id uuid;
  result json;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Find the trip
  SELECT id INTO v_trip_id
  FROM public.saved_trips
  WHERE public.saved_trips.share_token = $1
  AND is_shared = true;

  IF v_trip_id IS NULL THEN
    RAISE EXCEPTION 'Trip not found or not shared';
  END IF;

  -- Check if user is already owner
  IF EXISTS (
    SELECT 1 FROM public.saved_trips
    WHERE id = v_trip_id
    AND (user_id = v_user_id OR owner_id = v_user_id)
  ) THEN
    RETURN json_build_object('status', 'already_owner', 'trip_id', v_trip_id);
  END IF;

  -- Check if already a collaborator
  IF EXISTS (
    SELECT 1 FROM public.trip_collaborators
    WHERE trip_id = v_trip_id
    AND user_id = v_user_id
  ) THEN
    RETURN json_build_object('status', 'already_member', 'trip_id', v_trip_id);
  END IF;

  -- Add as collaborator with view permission
  INSERT INTO public.trip_collaborators (trip_id, user_id, permission, invited_by)
  VALUES (v_trip_id, v_user_id, 'view', (
    SELECT COALESCE(owner_id, user_id) FROM public.saved_trips WHERE id = v_trip_id
  ));

  -- Log the activity
  INSERT INTO public.trip_activity (trip_id, user_id, action, details)
  VALUES (v_trip_id, v_user_id, 'joined', json_build_object('via', 'share_link'));

  RETURN json_build_object('status', 'joined', 'trip_id', v_trip_id);
END;
$$;

-- ===========================================
-- handle_new_user: Trigger function for new user signup
-- This function is typically created by Supabase for auth triggers
-- ===========================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$;

-- Ensure the trigger exists (won't error if already exists)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Re-grant execute permissions
GRANT EXECUTE ON FUNCTION public.is_trip_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_trip_collaborator(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_trip(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trip_members(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trip_preview_by_token(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.join_trip_by_share_link(text) TO authenticated;
