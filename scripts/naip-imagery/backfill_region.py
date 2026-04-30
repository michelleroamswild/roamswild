#!/usr/bin/env python3
"""
Backfill NAIP imagery for spots in a bbox.

Idempotent: skips spots that already have a NAIP image. Resumable on crash.
Uses ThreadPoolExecutor for concurrent COG reads.

Usage:
  python3 backfill_region.py --bbox 38.4,-109.9,38.9,-109.3 --limit 20    # smoke test
  python3 backfill_region.py --bbox 38.4,-109.9,38.9,-109.3 --workers 4    # real run
  python3 backfill_region.py --bbox 38.4,-109.9,38.9,-109.3 --dry-run      # count only

bbox order: south,west,north,east (min-lat, min-lng, max-lat, max-lng)
"""
import argparse
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from fetch_chip import (
    SUPABASE_URL,
    fetch_chip,
    find_naip_item,
    http_get,
    insert_spot_image,
    load_env,
    upload_to_r2,
)


def list_spots_in_bbox(bbox, key, max_total=None):
    south, west, north, east = bbox
    PAGE = 1000
    offset = 0
    rows = []
    headers = {'apikey': key, 'Authorization': f'Bearer {key}'}
    while True:
        if max_total and len(rows) >= max_total:
            break
        q = (
            f'select=id,name,latitude,longitude'
            f'&latitude=gte.{south}&latitude=lte.{north}'
            f'&longitude=gte.{west}&longitude=lte.{east}'
            f'&order=id&limit={PAGE}&offset={offset}'
        )
        page = http_get(f'{SUPABASE_URL}/rest/v1/spots?{q}', headers)
        if not page:
            break
        rows.extend(page)
        if len(page) < PAGE:
            break
        offset += PAGE
    if max_total:
        rows = rows[:max_total]
    return rows


def has_naip_image_set(spot_ids, key):
    """Bulk lookup: returns the set of spot_ids that already have a NAIP image."""
    out = set()
    headers = {'apikey': key, 'Authorization': f'Bearer {key}'}
    CHUNK = 200
    for i in range(0, len(spot_ids), CHUNK):
        ids = spot_ids[i:i + CHUNK]
        ids_csv = ','.join(ids)
        q = f'select=spot_id&source=eq.naip&spot_id=in.({ids_csv})'
        rows = http_get(f'{SUPABASE_URL}/rest/v1/spot_images?{q}', headers)
        for r in rows:
            out.add(r['spot_id'])
    return out


def process_spot(spot, supa_key):
    """Returns (outcome, message)."""
    spot_id = spot['id']
    try:
        item = find_naip_item(float(spot['latitude']), float(spot['longitude']))
        if not item:
            return 'no_scene', 'no NAIP coverage'
        jpeg, size = fetch_chip(item, float(spot['latitude']), float(spot['longitude']))
        storage_key = f'naip/{spot_id}.jpg'
        url = upload_to_r2(jpeg, storage_key)
        status = insert_spot_image(spot_id, url, storage_key, item, size, supa_key)
        if 200 <= status < 300:
            return 'ok', f'{len(jpeg) // 1024}KB'
        return 'error', f'insert HTTP {status}'
    except Exception as e:
        return 'error', f'{type(e).__name__}: {str(e)[:160]}'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--bbox', required=True, help='south,west,north,east')
    parser.add_argument('--limit', type=int, help='process at most N spots')
    parser.add_argument('--workers', type=int, default=4)
    parser.add_argument('--dry-run', action='store_true', help='count only, no work')
    args = parser.parse_args()

    bbox = tuple(float(x) for x in args.bbox.split(','))
    if len(bbox) != 4:
        sys.exit('bbox must be south,west,north,east')

    load_env()
    os.environ.setdefault('GDAL_DISABLE_READDIR_ON_OPEN', 'EMPTY_DIR')

    supa_key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    if not supa_key:
        sys.exit('SUPABASE_SERVICE_ROLE_KEY missing')

    spots = list_spots_in_bbox(bbox, supa_key, args.limit)
    print(f'spots in bbox: {len(spots)}')

    # Filter out already-done spots in bulk
    done_set = has_naip_image_set([s['id'] for s in spots], supa_key)
    todo = [s for s in spots if s['id'] not in done_set]
    print(f'  already done: {len(done_set)}')
    print(f'  to process:   {len(todo)}')

    if args.dry_run or not todo:
        return

    started = time.time()
    counts = {'ok': 0, 'no_scene': 0, 'error': 0}
    bytes_total = 0

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(process_spot, s, supa_key): s for s in todo}
        for i, fut in enumerate(as_completed(futures), 1):
            spot = futures[fut]
            outcome, msg = fut.result()
            counts[outcome] = counts.get(outcome, 0) + 1
            if outcome == 'ok':
                try:
                    bytes_total += int(msg.replace('KB', '')) * 1024
                except Exception:
                    pass
            name = (spot['name'] or '')[:38]
            print(f'[{i:4}/{len(todo)}] {outcome:8} {name:38} ({msg})')

    elapsed = time.time() - started
    rate = len(todo) / elapsed if elapsed > 0 else 0
    print(f'\n=== Done in {elapsed/60:.1f} min ({rate:.1f} spots/s) ===')
    print(
        f'  ok: {counts.get("ok", 0)}  '
        f'no_scene: {counts.get("no_scene", 0)}  '
        f'error: {counts.get("error", 0)}'
    )
    print(f'  bytes uploaded to R2: {bytes_total / 1024 / 1024:.1f} MB')


if __name__ == '__main__':
    main()
