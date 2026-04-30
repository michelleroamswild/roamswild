#!/usr/bin/env python3
"""
Bulk dispersed-spot analysis driver, one state at a time.

Walks through 0.25° bbox tiles intersecting a state polygon, calls the
existing `import-region` edge function for each tile, and tracks status
in `bulk_analysis_jobs` for resume-on-crash.

The new `spots` table auto-populates via the trigger we added in
20260184 (mirror_potential_spot_to_spots), so no extra glue needed here.

Setup:
  - TIGER state shapefile: /Users/michelletaylor/Desktop/_Michelle Roams Wild/RoamsWild/PADUS4_0Geodatabase/tl_2022_us_state.shp
  - .env with SUPABASE_SERVICE_ROLE_KEY

Usage:
  python3 run_state.py UT --plan       # generate tiles, insert as pending
  python3 run_state.py UT --run        # process pending tiles
  python3 run_state.py UT --status     # show progress

Run with caffeinate -i to keep your laptop awake:
  caffeinate -i python3 run_state.py UT --run
"""

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import geopandas as gpd
from shapely.geometry import box

PROJECT_ROOT = Path(__file__).parent.parent.parent
SUPABASE_URL = 'https://ioseedbzvogywztbtgjd.supabase.co'
TIGER_SHP = Path('/Users/michelletaylor/Desktop/_Michelle Roams Wild/RoamsWild/PADUS4_0Geodatabase/tl_2022_us_state.shp')
TILE_SIZE_DEG = 0.25       # ~17 mi at mid-latitudes; small enough to stay under Overpass page caps
THROTTLE_S = 8             # delay between tile calls; Overpass rate-limits ~1 req/sec
TIMEOUT_S = 180            # import-region can take 30-90s per tile

# Map USPS state code → STUSPS in TIGER
STATE_USPS = {  # USPS → expected STUSPS in shapefile
    'UT': 'UT', 'CA': 'CA', 'NV': 'NV', 'AZ': 'AZ', 'CO': 'CO',
    'NM': 'NM', 'ID': 'ID', 'MT': 'MT', 'WY': 'WY', 'OR': 'OR',
    'WA': 'WA', 'TX': 'TX', 'OK': 'OK', 'KS': 'KS', 'NE': 'NE',
    'SD': 'SD', 'ND': 'ND', 'MN': 'MN', 'AK': 'AK',
}


# --- Env / API helpers ----------------------------------------------------
def read_env(key: str) -> str:
    env_path = PROJECT_ROOT / '.env'
    pat = re.compile(rf'^{re.escape(key)}\s*=\s*"?([^"\n]+)"?\s*$')
    with open(env_path) as f:
        for line in f:
            m = pat.match(line.rstrip())
            if m:
                return m.group(1).strip()
    raise SystemExit(f'Missing {key} in {env_path}')


def http(method: str, url: str, key: str, body=None, timeout=TIMEOUT_S):
    data = json.dumps(body).encode('utf-8') if body is not None else None
    req = urllib.request.Request(
        url, data=data, method=method,
        headers={
            'apikey': key,
            'Authorization': f'Bearer {key}',
            'Content-Type': 'application/json',
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        text = resp.read()
        return resp.status, json.loads(text) if text else None


def db_select(key: str, table: str, query: str = '*'):
    _, data = http('GET', f'{SUPABASE_URL}/rest/v1/{table}?{query}', key)
    return data or []


def db_insert(key: str, table: str, rows: list):
    if not rows:
        return
    status, _ = http(
        'POST',
        f'{SUPABASE_URL}/rest/v1/{table}',
        key,
        body=rows,
    )
    return status


def db_patch(key: str, table: str, row_id: str, fields: dict):
    return http('PATCH', f'{SUPABASE_URL}/rest/v1/{table}?id=eq.{row_id}', key, body=fields)


# --- Tile generation ------------------------------------------------------
def load_state_polygon(state_code: str):
    print(f'Loading TIGER state shapefile...')
    states = gpd.read_file(TIGER_SHP)
    if states.crs is None or states.crs.to_epsg() != 4326:
        states = states.to_crs(4326)
    code = STATE_USPS.get(state_code.upper(), state_code.upper())
    row = states[states['STUSPS'] == code]
    if len(row) == 0:
        raise SystemExit(f'State {state_code!r} not found in TIGER shapefile')
    return row.iloc[0].geometry


def generate_tiles(state_geom, tile_size: float = TILE_SIZE_DEG):
    """Generate (tile_x, tile_y, bbox) tuples covering the state polygon."""
    minx, miny, maxx, maxy = state_geom.bounds
    # Quantize to multiples of tile_size for stable indices
    x_start = int(minx / tile_size)
    x_end   = int(maxx / tile_size) + 1
    y_start = int(miny / tile_size)
    y_end   = int(maxy / tile_size) + 1
    tiles = []
    for x in range(x_start, x_end):
        for y in range(y_start, y_end):
            west  = x * tile_size
            east  = (x + 1) * tile_size
            south = y * tile_size
            north = (y + 1) * tile_size
            tile_box = box(west, south, east, north)
            if not state_geom.intersects(tile_box):
                continue
            tiles.append((x, y, north, south, east, west))
    return tiles


# --- Operations ----------------------------------------------------------
def cmd_plan(state_code: str, key: str):
    geom = load_state_polygon(state_code)
    tiles = generate_tiles(geom)
    print(f'Generated {len(tiles)} tiles for {state_code}')
    # Skip tiles already in the table
    existing = db_select(key, 'bulk_analysis_jobs',
                         f'select=tile_x,tile_y&state_code=eq.{state_code}')
    seen = {(r['tile_x'], r['tile_y']) for r in existing}
    new_rows = []
    for x, y, n, s, e, w in tiles:
        if (x, y) in seen:
            continue
        new_rows.append({
            'state_code': state_code,
            'tile_x': x, 'tile_y': y,
            'tile_size_deg': TILE_SIZE_DEG,
            'north': n, 'south': s, 'east': e, 'west': w,
            'status': 'pending',
        })
    print(f'  {len(seen)} already in jobs table, {len(new_rows)} new to insert')
    BATCH = 500
    for i in range(0, len(new_rows), BATCH):
        db_insert(key, 'bulk_analysis_jobs', new_rows[i:i + BATCH])
    print('Done.')


def cmd_status(state_code: str, key: str):
    rows = db_select(key, 'bulk_analysis_jobs',
                     f'select=status&state_code=eq.{state_code}&limit=10000')
    from collections import Counter
    c = Counter(r['status'] for r in rows)
    print(f'{state_code}: {dict(c)}  total={len(rows)}')


def cmd_run(state_code: str, key: str, limit: int = None):
    started = time.time()
    processed = 0
    while True:
        # Grab next pending tile (one at a time so multiple drivers don't collide)
        pending = db_select(key, 'bulk_analysis_jobs',
                            f'select=*&state_code=eq.{state_code}&status=eq.pending&order=tile_y,tile_x&limit=1')
        if not pending:
            break
        if limit is not None and processed >= limit:
            print(f'Hit limit {limit}, stopping')
            break
        job = pending[0]
        job_id = job['id']
        bounds = {'north': job['north'], 'south': job['south'],
                  'east':  job['east'],  'west':  job['west']}
        region_name = f"{state_code} tile ({job['tile_x']},{job['tile_y']})"
        print(f"[{processed+1}] {region_name}  N {bounds['north']:.3f} W {bounds['west']:.3f}")

        # Mark running
        db_patch(key, 'bulk_analysis_jobs', job_id, {
            'status': 'running',
            'started_at': 'now()',
            'error_message': None,
        })

        # Call import-region edge function
        try:
            t0 = time.time()
            status, result = http(
                'POST',
                f'{SUPABASE_URL}/functions/v1/import-region',
                key,
                body={
                    'regionName': region_name,
                    'bounds': bounds,
                    'importPublicLands': True,
                    'importRoads': True,
                    'deriveSpots': True,
                },
                timeout=TIMEOUT_S,
            )
            elapsed = time.time() - t0
            if status >= 200 and status < 300:
                db_patch(key, 'bulk_analysis_jobs', job_id, {
                    'status': 'done',
                    'finished_at': 'now()',
                    'result': result,
                })
                spots_n = (result or {}).get('spotsDerive', 0) if isinstance(result, dict) else 0
                print(f'  ✓ {elapsed:.0f}s  spots derived: {spots_n}')
            else:
                db_patch(key, 'bulk_analysis_jobs', job_id, {
                    'status': 'failed',
                    'finished_at': 'now()',
                    'error_message': f'HTTP {status}: {result}',
                })
                print(f'  ✗ HTTP {status}')
        except Exception as exc:
            db_patch(key, 'bulk_analysis_jobs', job_id, {
                'status': 'failed',
                'finished_at': 'now()',
                'error_message': str(exc)[:1000],
            })
            print(f'  ✗ {exc}')

        processed += 1
        # Throttle (Overpass + ArcGIS rate limits)
        time.sleep(THROTTLE_S)

    total = time.time() - started
    print(f'\nProcessed {processed} tiles in {total/60:.1f} min')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('state', help='USPS state code, e.g. UT')
    parser.add_argument('--plan', action='store_true', help='Generate tiles into bulk_analysis_jobs')
    parser.add_argument('--run', action='store_true', help='Process pending tiles')
    parser.add_argument('--status', action='store_true', help='Show progress')
    parser.add_argument('--limit', type=int, help='Stop after N tiles')
    args = parser.parse_args()

    state_code = args.state.upper()
    key = read_env('SUPABASE_SERVICE_ROLE_KEY')

    if args.plan:
        cmd_plan(state_code, key)
    elif args.status:
        cmd_status(state_code, key)
    elif args.run:
        cmd_run(state_code, key, limit=args.limit)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == '__main__':
    main()
