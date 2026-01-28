-- Add 'friends' to the allowed visibility values for campsites

-- Drop the old constraint
ALTER TABLE campsites DROP CONSTRAINT IF EXISTS campsites_visibility_check;

-- Add the new constraint with 'friends' included
ALTER TABLE campsites ADD CONSTRAINT campsites_visibility_check
  CHECK (visibility = ANY (ARRAY['private'::text, 'shared'::text, 'public'::text, 'friends'::text]));
