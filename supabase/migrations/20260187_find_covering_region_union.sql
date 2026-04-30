-- Loosen find_covering_region to accept a UNION of overlapping regions.
--
-- Old behavior: required a single saved region whose bbox fully contains the
-- search bbox. This meant deep-linking to a point near the EDGE of any past
-- analysis (where the 10mi search bbox spills outside the saved bbox) caused
-- a cache miss — even though potential_spots data exists for the area —
-- forcing fallback to live Overpass which is rate-limited.
--
-- New behavior: union all loaded_regions intersecting the search bbox; if
-- the union covers it, return the most recent intersecting region as the
-- representative. Tolerates fragmented coverage from many small bulk-pan
-- tiles, which is how the cache actually fills in over time.

CREATE OR REPLACE FUNCTION find_covering_region(
  p_south double precision,
  p_west double precision,
  p_north double precision,
  p_east double precision
) RETURNS TABLE (id uuid, analysed_at timestamptz, spot_count integer)
LANGUAGE sql
STABLE
AS $$
  WITH search_box AS (
    SELECT ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326) AS geom
  ),
  overlapping AS (
    SELECT lr.id, lr.analysed_at, lr.spot_count, lr.bbox
    FROM loaded_regions lr, search_box sb
    WHERE ST_Intersects(lr.bbox, sb.geom)
  ),
  union_cov AS (
    SELECT ST_Union(bbox) AS geom FROM overlapping
  )
  SELECT o.id, o.analysed_at, o.spot_count
  FROM overlapping o, search_box sb, union_cov uc
  WHERE uc.geom IS NOT NULL
    AND ST_Covers(uc.geom, sb.geom)
  ORDER BY o.analysed_at DESC
  LIMIT 1;
$$;
