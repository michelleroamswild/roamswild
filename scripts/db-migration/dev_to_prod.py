#!/usr/bin/env python3
"""
Stream public.* tables from the dev Supabase project to prod via the
PostgREST REST API. Service-role keys do the auth; no Postgres clients
or direct connections required.

For each table:
  1. Truncate on prod (DELETE * via filter on a column that's always set,
     or a custom RPC if available).
  2. Page through dev rows with select=*&offset=X&limit=Y.
  3. Bulk-insert into prod with `Prefer: resolution=merge-duplicates`
     so idempotent re-runs don't error on existing rows.

Idempotent + resumable.

Usage:
  python3 scripts/db-migration/dev_to_prod.py --dry-run    # count only
  python3 scripts/db-migration/dev_to_prod.py --apply      # do it
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import List, Dict, Any

ENV_DEV  = Path(__file__).resolve().parents[2] / '.env'
ENV_PROD = Path(__file__).resolve().parents[2] / '.env.production'

DEV_URL  = 'https://ioseedbzvogywztbtgjd.supabase.co'
PROD_URL = 'https://folbzyweiiklcdleldfa.supabase.co'

# Order matters for FK chains. Insert parents before children.
# Skipping tables that are transient or auth-related.
TABLES = [
    # Reference + parent tables first
    'public_lands',
    'designations',
    'data_sources',
    'data_source_runs',
    'regions',
    'region_metrics',
    'region_ai_enrichments',

    # Spots + everything that depends on them
    'spots',
    'spot_images',
    'spot_analyses',
    'road_segments',

    # User-saved / app data
    'profiles',
    'campsites',
    'saved_locations',
    'saved_trips',
    'recent_searches',
    'loaded_regions',
    'osm_way_history',
    'bulk_analysis_jobs',
    'naip_backfill_queue',

    # Relational / activity
    'surprise_history',
    'trip_collaborators',
    'trip_share_links',
    'user_friends',
    'waitlist',
]

PAGE_SIZE = 1000
INSERT_BATCH = 500

# Tables with heavy geometry/jsonb columns can't ship 1000 rows per HTTP page —
# dev's PostgREST 500s on the response. Override page/batch sizes to stay
# under a few MB per request. Tune down further if 500s recur.
TABLE_OVERRIDES = {
    'public_lands':  {'page': 100, 'batch': 10},   # ST_Polygon boundaries, can be huge — small batch dodges 8s statement timeout
    'road_segments': {'page': 200, 'batch': 200},  # LineString geometry
    'regions':       {'page': 100, 'batch': 100},  # MultiPolygon bounds
}

# Columns Postgres computes itself (GENERATED ALWAYS). Stripped before insert
# so PostgREST doesn't return 400 "cannot insert a non-DEFAULT value".
# Source of truth: information_schema.columns where is_generated='ALWAYS'.
GENERATED_COLS = {
    'public_lands':   {'centroid'},
    'road_segments':  {'start_point', 'end_point'},
    'spot_analyses':  {'lat_key', 'lng_key'},
    'spots':          {'geometry'},
}


def read_env(path: Path, key: str) -> str:
    pat = re.compile(rf'^{re.escape(key)}\s*=\s*"?([^"\n]+)"?\s*$')
    for line in path.read_text().splitlines():
        m = pat.match(line)
        if m: return m.group(1).strip()
    sys.exit(f'Missing {key} in {path}')


def http(method: str, url: str, key: str, body: Any = None, prefer: str = '') -> tuple[int, Any]:
    headers = {
        'apikey': key,
        'Authorization': f'Bearer {key}',
        'Content-Type': 'application/json',
    }
    if prefer:
        headers['Prefer'] = prefer
    data = None
    if body is not None:
        data = json.dumps(body).encode('utf-8')
    req = urllib.request.Request(url, method=method, headers=headers, data=data)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            text = resp.read().decode('utf-8')
            return resp.status, json.loads(text) if text.strip() else None
    except urllib.error.HTTPError as e:
        text = e.read().decode('utf-8')
        return e.code, text


def count_rows(base_url: str, key: str, table: str) -> int:
    headers = {
        'apikey': key,
        'Authorization': f'Bearer {key}',
        'Prefer': 'count=exact',
        'Range': '0-0',
    }
    req = urllib.request.Request(f'{base_url}/rest/v1/{table}?select=id', headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            cr = resp.headers.get('content-range', '0-0/0')
            return int(cr.split('/')[-1])
    except urllib.error.HTTPError as e:
        return -1  # table missing or query failed
    except Exception:
        return -1


def fetch_page(base_url: str, key: str, table: str, offset: int, limit: int) -> List[Dict]:
    url = f'{base_url}/rest/v1/{table}?select=*&order=id&offset={offset}&limit={limit}'
    headers = {'apikey': key, 'Authorization': f'Bearer {key}'}
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read())


def truncate_prod_table(table: str, prod_key: str) -> int:
    """Delete all rows from prod table. Uses a where-true filter via PostgREST.
    Returns count of deleted rows or -1 on error."""
    # PostgREST DELETE without a filter is rejected. We use a filter that
    # always matches: id=neq.00000000-0000-0000-0000-000000000000 — this is
    # uglier than TRUNCATE but works through REST. For tables without an
    # `id` column, this fails and the operator reviews.
    url = f'{PROD_URL}/rest/v1/{table}?id=neq.00000000-0000-0000-0000-000000000000'
    status, body = http('DELETE', url, prod_key, prefer='count=exact')
    if status >= 400:
        print(f'  TRUNCATE failed ({status}): {str(body)[:200]}')
        return -1
    return 0


def insert_batch(table: str, rows: List[Dict], prod_key: str) -> int:
    if not rows: return 0
    drop = GENERATED_COLS.get(table)
    if drop:
        rows = [{k: v for k, v in r.items() if k not in drop} for r in rows]
    url = f'{PROD_URL}/rest/v1/{table}'
    status, body = http('POST', url, prod_key, body=rows,
                        prefer='resolution=merge-duplicates,return=minimal')
    if status >= 400:
        print(f'  INSERT failed ({status}): {str(body)[:300]}')
        return -1
    return len(rows)


def migrate_table(table: str, dev_key: str, prod_key: str, dry_run: bool,
                  max_rows: int = 0, no_truncate: bool = False, start_offset: int = 0):
    dev_count  = count_rows(DEV_URL,  dev_key,  table)
    prod_count = count_rows(PROD_URL, prod_key, table)
    target = min(dev_count, max_rows) if max_rows > 0 else dev_count
    print(f'\n[{table}]  dev={dev_count}  prod={prod_count}  target={target}  start_offset={start_offset}')

    if dev_count == -1:
        print('  skipping — dev query failed')
        return
    if dev_count == 0:
        print('  empty on dev, nothing to copy')
        return

    if dry_run:
        return

    if not no_truncate:
        print(f'  truncating prod...')
        if truncate_prod_table(table, prod_key) == -1:
            print('  bailing on this table')
            return

    # Paginate dev → prod
    override = TABLE_OVERRIDES.get(table, {})
    page_size = override.get('page', PAGE_SIZE)
    insert_batch_size = override.get('batch', INSERT_BATCH)
    started = time.time()
    inserted = 0
    failed = 0
    halted = False
    for offset in range(start_offset, target, page_size):
        page = fetch_page(DEV_URL, dev_key, table, offset, min(page_size, target - offset))
        if not page: break
        for i in range(0, len(page), insert_batch_size):
            batch = page[i:i + insert_batch_size]
            ok = insert_batch(table, batch, prod_key)
            if ok == -1:
                failed += len(batch)
                halted = True
                break
            inserted += ok
        elapsed = time.time() - started
        rate = inserted / elapsed if elapsed > 0 else 0
        print(f'  {inserted}/{target}  rate={rate:.0f}/s  failed={failed}')
        if halted:
            print('  HALTING — first batch failure. Diagnose before continuing.')
            break

    print(f'  done — inserted={inserted}  failed={failed}  in {(time.time()-started):.0f}s')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true', help='Actually write to prod (default: dry-run)')
    parser.add_argument('--only', help='comma-separated table names to migrate (default: all)')
    parser.add_argument('--max-rows', type=int, default=0,
                        help='Limit rows per table (for smoke tests). 0 = no limit.')
    parser.add_argument('--no-truncate', action='store_true',
                        help='Skip truncate (use only when prod table is already empty).')
    parser.add_argument('--start-offset', type=int, default=0,
                        help='Skip the first N rows of each --only table (for resume).')
    args = parser.parse_args()

    dev_key  = read_env(ENV_DEV,  'SUPABASE_SERVICE_ROLE_KEY')
    prod_key = read_env(ENV_PROD, 'SUPABASE_SERVICE_ROLE_KEY')

    only = set(args.only.split(',')) if args.only else None
    tables = [t for t in TABLES if not only or t in only]

    print(f'Dev:  {DEV_URL}')
    print(f'Prod: {PROD_URL}')
    print(f'Mode: {"APPLY (writes to prod)" if args.apply else "DRY RUN (counts only)"}')
    print(f'Tables ({len(tables)}): {", ".join(tables)}')

    for table in tables:
        try:
            migrate_table(table, dev_key, prod_key, dry_run=not args.apply,
                          max_rows=args.max_rows, no_truncate=args.no_truncate,
                          start_offset=args.start_offset)
        except Exception as e:
            print(f'  ERROR on {table}: {type(e).__name__}: {e}')


if __name__ == '__main__':
    main()
