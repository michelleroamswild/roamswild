-- ===========================================
-- Fix RLS Security for trip_activity table
-- ===========================================

-- Enable RLS on the table
ALTER TABLE trip_activity ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies to start fresh
DROP POLICY IF EXISTS "Users can view trip activity" ON trip_activity;
DROP POLICY IF EXISTS "Users can insert trip activity" ON trip_activity;
DROP POLICY IF EXISTS "trip_activity_select_policy" ON trip_activity;
DROP POLICY IF EXISTS "trip_activity_insert_policy" ON trip_activity;

-- Policy: Users can view activity for trips they own or collaborate on
CREATE POLICY "Users can view trip activity"
ON trip_activity FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM saved_trips
    WHERE saved_trips.id = trip_activity.trip_id
    AND (
      saved_trips.user_id = auth.uid()
      OR saved_trips.owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM trip_collaborators
        WHERE trip_collaborators.trip_id = saved_trips.id
        AND trip_collaborators.user_id = auth.uid()
      )
    )
  )
);

-- Policy: Users can insert activity for trips they own or collaborate on
CREATE POLICY "Users can insert trip activity"
ON trip_activity FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM saved_trips
    WHERE saved_trips.id = trip_activity.trip_id
    AND (
      saved_trips.user_id = auth.uid()
      OR saved_trips.owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM trip_collaborators
        WHERE trip_collaborators.trip_id = saved_trips.id
        AND trip_collaborators.user_id = auth.uid()
      )
    )
  )
);

-- Activity logs are typically immutable - no update/delete policies needed
-- If you need to allow deletion, add a policy here

-- Revoke public access
REVOKE ALL ON trip_activity FROM anon;
REVOKE ALL ON trip_activity FROM public;
GRANT SELECT, INSERT ON trip_activity TO authenticated;
