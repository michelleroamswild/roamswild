-- ===========================================
-- Fix RLS for shared trips visibility
-- ===========================================

-- Drop existing SELECT policy on saved_trips if it exists
DROP POLICY IF EXISTS "Users can view own trips" ON saved_trips;
DROP POLICY IF EXISTS "Users can view trips" ON saved_trips;
DROP POLICY IF EXISTS "saved_trips_select_policy" ON saved_trips;

-- Create new SELECT policy that allows:
-- 1. Users to see their own trips (owner)
-- 2. Users to see trips shared with them (via trip_collaborators)
CREATE POLICY "Users can view own and shared trips"
ON saved_trips FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM trip_collaborators
    WHERE trip_collaborators.trip_id = saved_trips.id
    AND trip_collaborators.user_id = auth.uid()
  )
);

-- Ensure other CRUD policies exist for owned trips only
DROP POLICY IF EXISTS "Users can insert own trips" ON saved_trips;
CREATE POLICY "Users can insert own trips"
ON saved_trips FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own trips" ON saved_trips;
DROP POLICY IF EXISTS "Users can update trips they can edit" ON saved_trips;
CREATE POLICY "Users can update trips they can edit"
ON saved_trips FOR UPDATE TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM trip_collaborators
    WHERE trip_collaborators.trip_id = saved_trips.id
    AND trip_collaborators.user_id = auth.uid()
    AND trip_collaborators.permission = 'edit'
  )
);

DROP POLICY IF EXISTS "Users can delete own trips" ON saved_trips;
CREATE POLICY "Users can delete own trips"
ON saved_trips FOR DELETE TO authenticated
USING (auth.uid() = user_id);
