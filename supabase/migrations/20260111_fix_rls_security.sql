-- ===========================================
-- Fix RLS Security for profiles table
-- ===========================================

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies to start fresh
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Anyone can view profiles" ON profiles;
DROP POLICY IF EXISTS "profiles_select_policy" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;

-- Recreate secure policies
CREATE POLICY "Users can view own profile"
ON profiles FOR SELECT TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
ON profiles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = id);

-- Revoke public access
REVOKE ALL ON profiles FROM anon;
REVOKE ALL ON profiles FROM public;
GRANT SELECT, UPDATE, INSERT ON profiles TO authenticated;

-- ===========================================
-- Fix RLS Security for saved_locations table
-- ===========================================

-- Enable RLS
ALTER TABLE saved_locations ENABLE ROW LEVEL SECURITY;

-- Drop any existing public access policies
DROP POLICY IF EXISTS "Public locations are viewable by everyone" ON saved_locations;
DROP POLICY IF EXISTS "Anyone can view locations" ON saved_locations;
DROP POLICY IF EXISTS "saved_locations_select_policy" ON saved_locations;
DROP POLICY IF EXISTS "Users can view own locations" ON saved_locations;
DROP POLICY IF EXISTS "Users can insert own locations" ON saved_locations;
DROP POLICY IF EXISTS "Users can update own locations" ON saved_locations;
DROP POLICY IF EXISTS "Users can delete own locations" ON saved_locations;

-- Recreate secure policies (users can only access their own locations)
CREATE POLICY "Users can view own locations"
ON saved_locations FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own locations"
ON saved_locations FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own locations"
ON saved_locations FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own locations"
ON saved_locations FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- Revoke public access
REVOKE ALL ON saved_locations FROM anon;
REVOKE ALL ON saved_locations FROM public;
GRANT SELECT, INSERT, UPDATE, DELETE ON saved_locations TO authenticated;
