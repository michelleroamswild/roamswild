-- Add tags column to campsites table (array of text)
ALTER TABLE campsites ADD COLUMN IF NOT EXISTS tags TEXT[];

-- Create GIN index for efficient array queries
CREATE INDEX IF NOT EXISTS idx_campsites_tags ON campsites USING GIN (tags);
