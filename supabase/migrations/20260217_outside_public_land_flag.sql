-- Add a third quality flag: `outside_public_land_polygon`. This catches the
-- nastier case where a spot's metadata claims it's on public land
-- (land_type='public', public_land_manager='BLM', etc.) but no polygon in
-- public_lands actually contains its coordinates — usually because the
-- PAD-US polygon was tightened up after the spot was derived.
--
-- The signal already lives in `meters_from_public_land_edge`: rows the
-- previous backfill wrote with NULL distance are the outside-polygon cases.
-- Two parts:
--   1. Update the chunked backfill function to write all three flags.
--   2. One-shot UPDATE that derives the new flag from existing distances
--      for rows the previous backfill already processed.

CREATE OR REPLACE FUNCTION public.backfill_spot_public_land_edge_distance(p_batch_size INT DEFAULT 500)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_processed INT;
BEGIN
  WITH batch AS (
    SELECT id, geometry
    FROM public.spots
    WHERE kind IN ('dispersed_camping', 'informal_camping', 'established_campground')
      AND NOT (extra ? 'outside_public_land_polygon')
    ORDER BY id
    LIMIT p_batch_size
  ),
  computed AS (
    SELECT
      b.id,
      (
        SELECT MIN(ST_Distance(b.geometry::geography, ST_Boundary(pl.boundary)::geography))
        FROM public.public_lands pl
        WHERE ST_Contains(pl.boundary, b.geometry)
      ) AS dist
    FROM batch b
  )
  UPDATE public.spots s
  SET extra = COALESCE(s.extra, '{}'::jsonb) || jsonb_build_object(
    'meters_from_public_land_edge', c.dist,
    'near_public_land_edge', COALESCE(c.dist < 50, false),
    'outside_public_land_polygon', (c.dist IS NULL)
  )
  FROM computed c
  WHERE s.id = c.id;

  GET DIAGNOSTICS v_processed = ROW_COUNT;
  RETURN v_processed;
END;
$$;

-- Backfill the new flag for rows the previous backfill already touched.
-- These rows have `meters_from_public_land_edge` set (possibly NULL) but
-- no `outside_public_land_polygon`. Cheap — pure JSONB writes, no spatial.
UPDATE public.spots s
SET extra = s.extra || jsonb_build_object(
  'outside_public_land_polygon', ((s.extra->>'meters_from_public_land_edge') IS NULL)
)
WHERE (s.extra ? 'meters_from_public_land_edge')
  AND NOT (s.extra ? 'outside_public_land_polygon');

-- Index supporting "show me only the bad spots" filter without a full scan.
CREATE INDEX IF NOT EXISTS idx_spots_outside_public_land
  ON public.spots ((extra->>'outside_public_land_polygon'))
  WHERE extra->>'outside_public_land_polygon' = 'true';
