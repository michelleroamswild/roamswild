-- ===========================================
-- Security Functions for Trip Access Control
-- (Using CREATE OR REPLACE to avoid dropping dependencies)
-- ===========================================

-- ===========================================
-- is_trip_owner: Check if current user owns the trip
-- ===========================================
CREATE OR REPLACE FUNCTION is_trip_owner(trip_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM saved_trips
    WHERE id = trip_id
    AND (user_id = auth.uid() OR owner_id = auth.uid())
  );
$$;

-- ===========================================
-- is_trip_collaborator: Check if current user is a collaborator
-- ===========================================
CREATE OR REPLACE FUNCTION is_trip_collaborator(trip_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM trip_collaborators
    WHERE trip_collaborators.trip_id = $1
    AND trip_collaborators.user_id = auth.uid()
  );
$$;

-- ===========================================
-- can_edit_trip: Check if current user can edit the trip
-- ===========================================
CREATE OR REPLACE FUNCTION can_edit_trip(trip_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT (
    -- User is owner
    EXISTS (
      SELECT 1 FROM saved_trips
      WHERE id = trip_id
      AND (user_id = auth.uid() OR owner_id = auth.uid())
    )
    OR
    -- User is collaborator with edit permission
    EXISTS (
      SELECT 1 FROM trip_collaborators
      WHERE trip_collaborators.trip_id = $1
      AND trip_collaborators.user_id = auth.uid()
      AND trip_collaborators.permission IN ('edit', 'admin')
    )
  );
$$;

-- ===========================================
-- get_trip_members: Get all members of a trip
-- ===========================================
CREATE OR REPLACE FUNCTION get_trip_members(p_trip_id uuid)
RETURNS TABLE (
  user_id uuid,
  email text,
  name text,
  permission text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  -- Verify caller has access to this trip
  IF NOT (
    EXISTS (SELECT 1 FROM saved_trips WHERE id = p_trip_id AND (user_id = auth.uid() OR owner_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM trip_collaborators WHERE trip_id = p_trip_id AND trip_collaborators.user_id = auth.uid())
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
  FROM saved_trips st
  JOIN profiles p ON p.id = COALESCE(st.owner_id, st.user_id)
  WHERE st.id = p_trip_id

  UNION ALL

  -- Collaborators
  SELECT
    p.id as user_id,
    p.email,
    p.name,
    tc.permission
  FROM trip_collaborators tc
  JOIN profiles p ON p.id = tc.user_id
  WHERE tc.trip_id = p_trip_id;
END;
$$;

-- ===========================================
-- get_trip_preview_by_token: Get trip preview for share link (no auth required)
-- ===========================================
CREATE OR REPLACE FUNCTION get_trip_preview_by_token(share_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
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
    'stops_count', (SELECT COUNT(*) FROM trip_stops WHERE trip_id = st.id)
  ) INTO result
  FROM saved_trips st
  LEFT JOIN profiles p ON p.id = COALESCE(st.owner_id, st.user_id)
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
CREATE OR REPLACE FUNCTION join_trip_by_share_link(share_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
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
  FROM saved_trips
  WHERE saved_trips.share_token = $1
  AND is_shared = true;

  IF v_trip_id IS NULL THEN
    RAISE EXCEPTION 'Trip not found or not shared';
  END IF;

  -- Check if user is already owner
  IF EXISTS (
    SELECT 1 FROM saved_trips
    WHERE id = v_trip_id
    AND (user_id = v_user_id OR owner_id = v_user_id)
  ) THEN
    RETURN json_build_object('status', 'already_owner', 'trip_id', v_trip_id);
  END IF;

  -- Check if already a collaborator
  IF EXISTS (
    SELECT 1 FROM trip_collaborators
    WHERE trip_id = v_trip_id
    AND user_id = v_user_id
  ) THEN
    RETURN json_build_object('status', 'already_member', 'trip_id', v_trip_id);
  END IF;

  -- Add as collaborator with view permission
  INSERT INTO trip_collaborators (trip_id, user_id, permission, invited_by)
  VALUES (v_trip_id, v_user_id, 'view', (
    SELECT COALESCE(owner_id, user_id) FROM saved_trips WHERE id = v_trip_id
  ));

  -- Log the activity
  INSERT INTO trip_activity (trip_id, user_id, action, details)
  VALUES (v_trip_id, v_user_id, 'joined', json_build_object('via', 'share_link'));

  RETURN json_build_object('status', 'joined', 'trip_id', v_trip_id);
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION is_trip_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION is_trip_collaborator(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION can_edit_trip(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_trip_members(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_trip_preview_by_token(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION join_trip_by_share_link(text) TO authenticated;
