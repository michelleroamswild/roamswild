-- Optimize RLS policies by wrapping auth.uid() in SELECT
-- This prevents re-evaluation for each row, improving query performance at scale

-- =============================================
-- PROFILES POLICIES
-- =============================================
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;

CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = id);

CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = id);

-- =============================================
-- SAVED_LOCATIONS POLICIES
-- =============================================
DROP POLICY IF EXISTS "saved_locations_select" ON public.saved_locations;
DROP POLICY IF EXISTS "saved_locations_insert" ON public.saved_locations;
DROP POLICY IF EXISTS "saved_locations_update" ON public.saved_locations;
DROP POLICY IF EXISTS "saved_locations_delete" ON public.saved_locations;

CREATE POLICY "saved_locations_select" ON public.saved_locations
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "saved_locations_insert" ON public.saved_locations
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "saved_locations_update" ON public.saved_locations
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "saved_locations_delete" ON public.saved_locations
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- =============================================
-- CAMPSITES POLICIES
-- =============================================
DROP POLICY IF EXISTS "campsites_select" ON public.campsites;
DROP POLICY IF EXISTS "campsites_insert" ON public.campsites;
DROP POLICY IF EXISTS "campsites_update" ON public.campsites;
DROP POLICY IF EXISTS "campsites_delete" ON public.campsites;
DROP POLICY IF EXISTS "Users can view own campsites" ON public.campsites;
DROP POLICY IF EXISTS "Users can insert own campsites" ON public.campsites;
DROP POLICY IF EXISTS "Users can update own campsites" ON public.campsites;
DROP POLICY IF EXISTS "Users can delete own campsites" ON public.campsites;

CREATE POLICY "campsites_select" ON public.campsites
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR visibility = 'public'
  );

CREATE POLICY "campsites_insert" ON public.campsites
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "campsites_update" ON public.campsites
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "campsites_delete" ON public.campsites
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- =============================================
-- CAMPSITE_PHOTOS POLICIES
-- =============================================
DROP POLICY IF EXISTS "Users can view photos for accessible campsites" ON public.campsite_photos;
DROP POLICY IF EXISTS "Users can insert photos for own campsites" ON public.campsite_photos;
DROP POLICY IF EXISTS "Users can delete own photos" ON public.campsite_photos;
DROP POLICY IF EXISTS "campsite_photos_select" ON public.campsite_photos;
DROP POLICY IF EXISTS "campsite_photos_insert" ON public.campsite_photos;
DROP POLICY IF EXISTS "campsite_photos_delete" ON public.campsite_photos;
DROP POLICY IF EXISTS "Photos follow campsite visibility" ON public.campsite_photos;

CREATE POLICY "campsite_photos_select" ON public.campsite_photos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campsites
      WHERE campsites.id = campsite_photos.campsite_id
      AND (campsites.user_id = (SELECT auth.uid()) OR campsites.visibility = 'public')
    )
  );

CREATE POLICY "campsite_photos_insert" ON public.campsite_photos
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "campsite_photos_delete" ON public.campsite_photos
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- =============================================
-- TRIP_COLLABORATORS POLICIES
-- =============================================
DROP POLICY IF EXISTS "trip_collaborators_select" ON public.trip_collaborators;
DROP POLICY IF EXISTS "trip_collaborators_update" ON public.trip_collaborators;
DROP POLICY IF EXISTS "trip_collaborators_delete" ON public.trip_collaborators;

CREATE POLICY "trip_collaborators_select" ON public.trip_collaborators
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "trip_collaborators_update" ON public.trip_collaborators
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "trip_collaborators_delete" ON public.trip_collaborators
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- =============================================
-- RECENT_SEARCHES POLICIES
-- =============================================
DROP POLICY IF EXISTS "recent_searches_select" ON public.recent_searches;
DROP POLICY IF EXISTS "recent_searches_insert" ON public.recent_searches;
DROP POLICY IF EXISTS "recent_searches_update" ON public.recent_searches;
DROP POLICY IF EXISTS "recent_searches_delete" ON public.recent_searches;

CREATE POLICY "recent_searches_select" ON public.recent_searches
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "recent_searches_insert" ON public.recent_searches
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "recent_searches_update" ON public.recent_searches
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "recent_searches_delete" ON public.recent_searches
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- =============================================
-- SURPRISE_HISTORY POLICIES
-- =============================================
DROP POLICY IF EXISTS "surprise_history_select" ON public.surprise_history;
DROP POLICY IF EXISTS "surprise_history_insert" ON public.surprise_history;
DROP POLICY IF EXISTS "surprise_history_delete" ON public.surprise_history;

CREATE POLICY "surprise_history_select" ON public.surprise_history
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "surprise_history_insert" ON public.surprise_history
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id OR user_id IS NULL);

CREATE POLICY "surprise_history_delete" ON public.surprise_history
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);
