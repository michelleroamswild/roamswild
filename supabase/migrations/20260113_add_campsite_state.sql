-- Add state column to campsites table
ALTER TABLE campsites ADD COLUMN IF NOT EXISTS state TEXT;

-- Create index for filtering by state
CREATE INDEX IF NOT EXISTS idx_campsites_state ON campsites (state);
