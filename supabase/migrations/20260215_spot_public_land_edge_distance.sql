-- Compute, for every dispersed/derived spot, how many meters lie between the
-- spot and the nearest public-land polygon BOUNDARY. Spots that sit very
-- close to the boundary are at high risk of being on a private inholding
-- (PAD-US polygons routinely overlap private parcels near edges).
--
-- We store two values inside `spots.extra`:
--   meters_from_public_land_edge  number (NULL when no containing land found)
--   near_public_land_edge         boolean (true when distance < 50m)
--
-- The 50m threshold is conservative — most real PAD-US polygon errors
-- happen within ~30m of the marked edge, so 50m gives a safety buffer.
-- Tunable via the constant in the function.

CREATE OR REPLACE FUNCTION public.compute_spot_public_land_edge_distance(p_spot_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  v_distance NUMERIC;
  v_geometry GEOMETRY;
  v_land_geom GEOMETRY;
BEGIN
  SELECT geometry INTO v_geometry
  FROM public.spots
  WHERE id = p_spot_id;

  IF v_geometry IS NULL THEN
    RETURN NULL;
  END IF;

  -- Find the public-land polygon that contains this spot. If multiple
  -- overlap (state + federal), pick the closest-edge match — that's the
  -- one whose error budget matters for inholding risk.
  SELECT
    -- ST_Distance with geography casts returns meters across geodesic
    -- distance, which is what we want (lat/lng polygon edges are not
    -- straight lines on the globe).
    MIN(ST_Distance(v_geometry::geography, ST_Boundary(boundary)::geography))
    INTO v_distance
  FROM public.public_lands
  WHERE ST_Contains(boundary, v_geometry);

  RETURN v_distance;
END;
$$;

COMMENT ON FUNCTION public.compute_spot_public_land_edge_distance(UUID) IS
'Returns meters from the spot to the nearest boundary of its containing public-land polygon. NULL when no polygon contains the spot.';

-- Chunked backfill RPC. The full table backfill exceeded Supabase's
-- statement timeout when run as a single UPDATE, so we expose a function
-- that processes N spots at a time and let an external caller (admin
-- script, edge function, or pg_cron) drive it to completion.
--
-- Skips spots that already have meters_from_public_land_edge set so it's
-- safe to call repeatedly — each call advances the unprocessed set.
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
      AND NOT (extra ? 'meters_from_public_land_edge')
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
    'near_public_land_edge', COALESCE(c.dist < 50, false)
  )
  FROM computed c
  WHERE s.id = c.id;

  GET DIAGNOSTICS v_processed = ROW_COUNT;
  RETURN v_processed;
END;
$$;

COMMENT ON FUNCTION public.backfill_spot_public_land_edge_distance(INT) IS
'Processes a batch of unflagged spots. Returns the number of rows updated. Call repeatedly until it returns 0.';

-- Index supports queries like "show me only the flagged spots" without a
-- full scan when the dataset grows.
CREATE INDEX IF NOT EXISTS idx_spots_near_public_land_edge
  ON public.spots ((extra->>'near_public_land_edge'))
  WHERE extra->>'near_public_land_edge' = 'true';
