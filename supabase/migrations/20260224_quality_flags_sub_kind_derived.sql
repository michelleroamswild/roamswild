-- Fix: the previous migration filtered on `source = 'derived'`, but the
-- spots table uses `source` for data-origin (osm/mvum/community/unknown)
-- and `sub_kind` for the spot's nature (derived/known/community/campground).
-- The discriminator we want is `sub_kind = 'derived'`.

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
    WHERE sub_kind = 'derived'  -- Only derived dead-end candidates need quality review
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

-- The prior migration also cleared flags from `source <> 'derived'`. Since
-- no rows have `source='derived'` (it's `sub_kind='derived'`), that cleared
-- everyone. The flags need to be recomputed for derived spots — the chunked
-- backfill will pick them up because their `extra` no longer has the keys.
-- No additional UPDATE needed here.

-- Belt-and-suspenders: clear any flags that may still be lingering on
-- non-derived rows (the prior cleanup ran but if anything got re-flagged
-- between then and now, scrub them).
UPDATE public.spots
SET extra = extra - 'meters_from_public_land_edge'
                  - 'near_public_land_edge'
                  - 'outside_public_land_polygon'
WHERE sub_kind <> 'derived'
  AND (extra ? 'meters_from_public_land_edge'
       OR extra ? 'near_public_land_edge'
       OR extra ? 'outside_public_land_polygon');
