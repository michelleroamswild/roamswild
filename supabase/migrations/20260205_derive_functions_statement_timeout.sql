-- Bump statement_timeout for the derive RPCs. PostgREST's default
-- (~8s) is too tight for a tile-sized derive across road_segments that
-- now has tens of thousands of rows. 90s gives generous headroom while
-- still catching truly stuck queries.

ALTER FUNCTION derive_spots_from_linked_roads(NUMERIC, NUMERIC, NUMERIC, NUMERIC)
    SET statement_timeout = '90s';

ALTER FUNCTION derive_blm_spots(NUMERIC, NUMERIC, NUMERIC, NUMERIC)
    SET statement_timeout = '90s';

ALTER FUNCTION derive_dead_end_spots(NUMERIC, NUMERIC, NUMERIC, NUMERIC)
    SET statement_timeout = '90s';

-- Same for the access-difficulty classifier — runs after derive in
-- import-region and operates over the same tile.
ALTER FUNCTION classify_spots_access_difficulty(NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC)
    SET statement_timeout = '90s';

-- And the road backfill that links roads to public_lands
ALTER FUNCTION backfill_road_public_lands(NUMERIC, NUMERIC, NUMERIC, NUMERIC)
    SET statement_timeout = '90s';
