-- Restrict the spot-quality edge flags to `source='derived'` rows. Community
-- spots come from a curated import pipeline (scripts/spot-import/01_filter.py)
-- where PAD-US containment was already checked at import time. Other sources
-- (osm, usfs, blm, nps, mvum, user_added) are similarly trustworthy or
-- explicit user choices. Only the derive functions produce dead-end candidates
-- that legitimately need quality review.
--
-- Two changes:
--   1. backfill function only processes source='derived' going forward
--   2. one-shot UPDATE clears existing flags from non-derived spots so they
--      stop appearing in the admin review page

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
    WHERE source = 'derived'  -- ONLY derived spots get the quality flag
      AND kind IN ('dispersed_camping', 'informal_camping', 'established_campground')
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

-- One-shot cleanup: drop the three flag keys from non-derived spots that
-- were processed before this restriction was in place. They stay queryable
-- for code that still reads them, but they no longer surface as flagged in
-- the admin review.
UPDATE public.spots
SET extra = extra - 'meters_from_public_land_edge'
                  - 'near_public_land_edge'
                  - 'outside_public_land_polygon'
WHERE source <> 'derived'
  AND (extra ? 'meters_from_public_land_edge'
       OR extra ? 'near_public_land_edge'
       OR extra ? 'outside_public_land_polygon');
