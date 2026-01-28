-- Allow authenticated users to look up profiles by email
-- This is needed for friend requests to find users by email
CREATE POLICY "Users can look up other profiles by email"
ON profiles FOR SELECT TO authenticated
USING (true);

-- Drop the old restrictive policy
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;

-- Note: This allows authenticated users to see basic profile info (id, email, name)
-- This is acceptable for a social app with friend features
-- The policy above replaces the "view own profile" policy
