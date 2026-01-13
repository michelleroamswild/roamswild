-- ===========================================
-- RoamsWild Base Schema
-- This creates all tables, RLS policies, and functions from scratch
-- Run this on a fresh Supabase project
-- ===========================================

-- ===========================================
-- PART 1: CREATE ALL TABLES FIRST
-- ===========================================

-- 1. PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. SAVED_TRIPS TABLE
CREATE TABLE IF NOT EXISTS public.saved_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  name text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}',
  days jsonb NOT NULL DEFAULT '[]',
  total_distance text,
  total_driving_time text,
  is_shared boolean DEFAULT false,
  share_token text UNIQUE,
  description text,
  start_date date,
  end_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. TRIP_COLLABORATORS TABLE
CREATE TABLE IF NOT EXISTS public.trip_collaborators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.saved_trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  permission text NOT NULL DEFAULT 'view' CHECK (permission IN ('view', 'edit', 'admin')),
  invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  invited_at timestamptz DEFAULT now(),
  UNIQUE(trip_id, user_id)
);

-- 4. TRIP_SHARE_LINKS TABLE
CREATE TABLE IF NOT EXISTS public.trip_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.saved_trips(id) ON DELETE CASCADE,
  token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  permission text NOT NULL DEFAULT 'view' CHECK (permission IN ('view', 'edit')),
  is_active boolean DEFAULT true,
  expires_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- 5. TRIP_ACTIVITY TABLE
CREATE TABLE IF NOT EXISTS public.trip_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.saved_trips(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb,
  created_at timestamptz DEFAULT now()
);

-- 6. SAVED_LOCATIONS TABLE
CREATE TABLE IF NOT EXISTS public.saved_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  place_id text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  address text,
  type text,
  saved_at timestamptz DEFAULT now()
);

-- 7. CAMPSITES TABLE
CREATE TABLE IF NOT EXISTS public.campsites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  description text,
  type text,
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'shared', 'public')),
  road_access text,
  cell_coverage smallint CHECK (cell_coverage >= 0 AND cell_coverage <= 5),
  water_available boolean,
  fee_required boolean,
  fee_amount text,
  max_vehicles smallint,
  max_stay_days smallint,
  seasonal_access text,
  notes text,
  place_id text,
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 8. CAMPSITE_PHOTOS TABLE
CREATE TABLE IF NOT EXISTS public.campsite_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campsite_id uuid NOT NULL REFERENCES public.campsites(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  url text NOT NULL,
  caption text,
  is_primary boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- ===========================================
-- PART 2: ENABLE RLS ON ALL TABLES
-- ===========================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campsites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campsite_photos ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- PART 3: CREATE ALL RLS POLICIES
-- ===========================================

-- PROFILES POLICIES
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY "Users can view collaborator profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT tc.user_id FROM public.trip_collaborators tc
      JOIN public.saved_trips st ON tc.trip_id = st.id
      WHERE st.user_id = auth.uid() OR st.owner_id = auth.uid()
    )
    OR id IN (
      SELECT COALESCE(st.owner_id, st.user_id) FROM public.saved_trips st
      JOIN public.trip_collaborators tc ON tc.trip_id = st.id
      WHERE tc.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- SAVED_TRIPS POLICIES
CREATE POLICY "Users can view own and shared trips" ON public.saved_trips
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR auth.uid() = owner_id
    OR EXISTS (
      SELECT 1 FROM public.trip_collaborators
      WHERE trip_collaborators.trip_id = saved_trips.id
      AND trip_collaborators.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own trips" ON public.saved_trips
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update trips they can edit" ON public.saved_trips
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    OR auth.uid() = owner_id
    OR EXISTS (
      SELECT 1 FROM public.trip_collaborators
      WHERE trip_collaborators.trip_id = saved_trips.id
      AND trip_collaborators.user_id = auth.uid()
      AND trip_collaborators.permission IN ('edit', 'admin')
    )
  );

CREATE POLICY "Users can delete own trips" ON public.saved_trips
  FOR DELETE TO authenticated USING (auth.uid() = user_id OR auth.uid() = owner_id);

-- TRIP_COLLABORATORS POLICIES
CREATE POLICY "Users can view collaborators for their trips" ON public.trip_collaborators
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.saved_trips
      WHERE saved_trips.id = trip_collaborators.trip_id
      AND (saved_trips.user_id = auth.uid() OR saved_trips.owner_id = auth.uid())
    )
    OR user_id = auth.uid()
  );

CREATE POLICY "Trip owners can manage collaborators" ON public.trip_collaborators
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.saved_trips
      WHERE saved_trips.id = trip_collaborators.trip_id
      AND (saved_trips.user_id = auth.uid() OR saved_trips.owner_id = auth.uid())
    )
  );

-- TRIP_SHARE_LINKS POLICIES
CREATE POLICY "Trip owners can manage share links" ON public.trip_share_links
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.saved_trips
      WHERE saved_trips.id = trip_share_links.trip_id
      AND (saved_trips.user_id = auth.uid() OR saved_trips.owner_id = auth.uid())
    )
  );

-- TRIP_ACTIVITY POLICIES
CREATE POLICY "Users can view trip activity" ON public.trip_activity
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.saved_trips
      WHERE saved_trips.id = trip_activity.trip_id
      AND (
        saved_trips.user_id = auth.uid()
        OR saved_trips.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.trip_collaborators
          WHERE trip_collaborators.trip_id = saved_trips.id
          AND trip_collaborators.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can insert trip activity" ON public.trip_activity
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.saved_trips
      WHERE saved_trips.id = trip_activity.trip_id
      AND (
        saved_trips.user_id = auth.uid()
        OR saved_trips.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.trip_collaborators
          WHERE trip_collaborators.trip_id = saved_trips.id
          AND trip_collaborators.user_id = auth.uid()
        )
      )
    )
  );

-- SAVED_LOCATIONS POLICIES
CREATE POLICY "Users can view own locations" ON public.saved_locations
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own locations" ON public.saved_locations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own locations" ON public.saved_locations
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own locations" ON public.saved_locations
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- CAMPSITES POLICIES
CREATE POLICY "Users can view own campsites" ON public.campsites
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR visibility = 'public');

CREATE POLICY "Users can insert own campsites" ON public.campsites
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own campsites" ON public.campsites
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own campsites" ON public.campsites
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- CAMPSITE_PHOTOS POLICIES
CREATE POLICY "Users can view photos for accessible campsites" ON public.campsite_photos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campsites
      WHERE campsites.id = campsite_photos.campsite_id
      AND (campsites.user_id = auth.uid() OR campsites.visibility = 'public')
    )
  );

CREATE POLICY "Users can insert photos for own campsites" ON public.campsite_photos
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.campsites
      WHERE campsites.id = campsite_photos.campsite_id
      AND campsites.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own photos" ON public.campsite_photos
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ===========================================
-- PART 4: GRANT PERMISSIONS
-- ===========================================

REVOKE ALL ON public.profiles FROM anon;
GRANT SELECT, UPDATE, INSERT ON public.profiles TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_trips TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_collaborators TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_share_links TO authenticated;

REVOKE ALL ON public.trip_activity FROM anon;
GRANT SELECT, INSERT ON public.trip_activity TO authenticated;

REVOKE ALL ON public.saved_locations FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_locations TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campsites TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.campsite_photos TO authenticated;

-- ===========================================
-- PART 5: SECURITY FUNCTIONS (with search_path fix)
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

CREATE OR REPLACE FUNCTION public.can_edit_trip(trip_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT (
    EXISTS (
      SELECT 1 FROM public.saved_trips
      WHERE id = trip_id
      AND (user_id = auth.uid() OR owner_id = auth.uid())
    )
    OR
    EXISTS (
      SELECT 1 FROM public.trip_collaborators
      WHERE public.trip_collaborators.trip_id = $1
      AND public.trip_collaborators.user_id = auth.uid()
      AND public.trip_collaborators.permission IN ('edit', 'admin')
    )
  );
$$;

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
  IF NOT (
    EXISTS (SELECT 1 FROM public.saved_trips WHERE id = p_trip_id AND (user_id = auth.uid() OR owner_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM public.trip_collaborators WHERE trip_id = p_trip_id AND public.trip_collaborators.user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT p.id as user_id, p.email, p.name, 'owner'::text as permission
  FROM public.saved_trips st
  JOIN public.profiles p ON p.id = COALESCE(st.owner_id, st.user_id)
  WHERE st.id = p_trip_id
  UNION ALL
  SELECT p.id as user_id, p.email, p.name, tc.permission
  FROM public.trip_collaborators tc
  JOIN public.profiles p ON p.id = tc.user_id
  WHERE tc.trip_id = p_trip_id;
END;
$$;

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
    'owner_name', p.name
  ) INTO result
  FROM public.saved_trips st
  LEFT JOIN public.profiles p ON p.id = COALESCE(st.owner_id, st.user_id)
  WHERE st.share_token = $1 AND st.is_shared = true;

  IF result IS NULL THEN
    RAISE EXCEPTION 'Trip not found or not shared';
  END IF;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_trip_by_share_link(share_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_trip_id uuid;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT id INTO v_trip_id FROM public.saved_trips
  WHERE public.saved_trips.share_token = $1 AND is_shared = true;

  IF v_trip_id IS NULL THEN
    RAISE EXCEPTION 'Trip not found or not shared';
  END IF;

  IF EXISTS (SELECT 1 FROM public.saved_trips WHERE id = v_trip_id AND (user_id = v_user_id OR owner_id = v_user_id)) THEN
    RETURN json_build_object('status', 'already_owner', 'trip_id', v_trip_id);
  END IF;

  IF EXISTS (SELECT 1 FROM public.trip_collaborators WHERE trip_id = v_trip_id AND user_id = v_user_id) THEN
    RETURN json_build_object('status', 'already_member', 'trip_id', v_trip_id);
  END IF;

  INSERT INTO public.trip_collaborators (trip_id, user_id, permission, invited_by)
  VALUES (v_trip_id, v_user_id, 'view', (SELECT COALESCE(owner_id, user_id) FROM public.saved_trips WHERE id = v_trip_id));

  INSERT INTO public.trip_activity (trip_id, user_id, action, details)
  VALUES (v_trip_id, v_user_id, 'joined', json_build_object('via', 'share_link'));

  RETURN json_build_object('status', 'joined', 'trip_id', v_trip_id);
END;
$$;

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

-- Create trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Grant function permissions
GRANT EXECUTE ON FUNCTION public.is_trip_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_trip_collaborator(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_trip(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trip_members(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trip_preview_by_token(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.join_trip_by_share_link(text) TO authenticated;

-- ===========================================
-- PART 6: INDEXES FOR PERFORMANCE
-- ===========================================
CREATE INDEX IF NOT EXISTS idx_saved_trips_user_id ON public.saved_trips(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_trips_owner_id ON public.saved_trips(owner_id);
CREATE INDEX IF NOT EXISTS idx_saved_trips_share_token ON public.saved_trips(share_token) WHERE share_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trip_collaborators_trip_id ON public.trip_collaborators(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_collaborators_user_id ON public.trip_collaborators(user_id);
CREATE INDEX IF NOT EXISTS idx_trip_activity_trip_id ON public.trip_activity(trip_id);
CREATE INDEX IF NOT EXISTS idx_campsites_user_id ON public.campsites(user_id);
CREATE INDEX IF NOT EXISTS idx_campsites_visibility ON public.campsites(visibility);
CREATE INDEX IF NOT EXISTS idx_saved_locations_user_id ON public.saved_locations(user_id);
