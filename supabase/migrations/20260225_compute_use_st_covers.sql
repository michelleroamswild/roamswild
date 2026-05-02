-- Switch the compute function from ST_Contains → ST_Covers. ST_Contains
-- is "strict interior" — points exactly on the polygon boundary return
-- FALSE. After import-time simplification (~1m tolerance) some polygon
-- edges shifted enough to cross spots that should be inside, marking them
-- "outside_public_land_polygon=true" even though the spot really is on
-- public land. Detected via the Utah validation sample.
--
-- ST_Covers returns TRUE for both interior and boundary points, which is
-- what we want — a spot exactly on a BLM boundary line still counts as
-- BLM. Same in the chunked backfill function so future runs stay
-- consistent.

CREATE OR REPLACE FUNCTION public.compute_spot_public_land_edge_distance(p_spot_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  v_distance NUMERIC;
  v_geometry GEOMETRY;
BEGIN
  SELECT geometry INTO v_geometry
  FROM public.spots
  WHERE id = p_spot_id;

  IF v_geometry IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT
    MIN(ST_Distance(v_geometry::geography, ST_Boundary(boundary)::geography))
    INTO v_distance
  FROM public.public_lands
  WHERE ST_Covers(boundary, v_geometry);  -- was ST_Contains

  RETURN v_distance;
END;
$$;

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
    WHERE sub_kind = 'derived'
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
        WHERE ST_Covers(pl.boundary, b.geometry)  -- was ST_Contains
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
