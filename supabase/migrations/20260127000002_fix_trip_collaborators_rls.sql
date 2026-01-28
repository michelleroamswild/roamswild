-- Fix overly permissive INSERT policy on trip_collaborators

DROP POLICY IF EXISTS "trip_collaborators_insert" ON public.trip_collaborators;

CREATE POLICY "trip_collaborators_insert" ON public.trip_collaborators
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.saved_trips
      WHERE saved_trips.id = trip_id
      AND (saved_trips.owner_id = auth.uid() OR saved_trips.user_id = auth.uid())
    )
  );
