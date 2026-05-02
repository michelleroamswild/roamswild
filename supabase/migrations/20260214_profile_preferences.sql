-- Add user-preference columns to the existing profiles table. Lets the
-- /profile page persist a "home base" + vehicle setup that other surfaces
-- (trip wizard, surprise me, near-you) can pre-fill from instead of asking
-- the user to re-pick every time.
--
-- All fields nullable — existing rows keep working unchanged. RLS is
-- already in place via the base schema (`Users can update own profile`),
-- so no policy changes are needed.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS home_lat NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS home_lng NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS home_name TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_type TEXT,
  ADD COLUMN IF NOT EXISTS drivetrain TEXT,
  ADD COLUMN IF NOT EXISTS clearance TEXT;

-- Enum-style CHECK constraints. Using TEXT + CHECK rather than Postgres
-- ENUM types so future values can be added without a migration cascade.
-- 'truck' is included on top of the trip-level taxonomy (sedan|suv|4wd|rv)
-- because most overlanding users have one and want it as their default.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_vehicle_type_check,
  ADD CONSTRAINT profiles_vehicle_type_check
    CHECK (vehicle_type IS NULL OR vehicle_type IN ('sedan', 'suv', 'truck', '4wd', 'rv'));

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_drivetrain_check,
  ADD CONSTRAINT profiles_drivetrain_check
    CHECK (drivetrain IS NULL OR drivetrain IN ('fwd', 'awd', '4wd_part_time', '4wd_full_time'));

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_clearance_check,
  ADD CONSTRAINT profiles_clearance_check
    CHECK (clearance IS NULL OR clearance IN ('standard', 'high', 'extra_high'));
