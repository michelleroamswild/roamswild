#!/usr/bin/env python3
"""
Stage 6: Load the four cleaned JSON files into the cloud `community_spots`
table via Supabase REST API. Uses the service role key, batched inserts.

Run: python3 06_load_to_supabase.py [--dry-run]
"""

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent
PROJECT_ROOT = HERE.parent.parent

# Map source category name -> schema enum-style value. Stage 1 already
# emits the new names ('dispersed_camping', 'stealth_camping') so those
# are pass-throughs.
CATEGORY_MAP = {
    'Wild Camping': 'dispersed_camping',         # legacy fallback
    'Informal Campsite': 'stealth_camping',      # legacy fallback
    'dispersed_camping': 'dispersed_camping',
    'stealth_camping': 'stealth_camping',
    'Water': 'water',
    'Showers': 'showers',
    'Laundromat': 'laundromat',
}

INPUT_FILES = [
    'nation_filtered_clean.json',
    'nation_informal_clean.json',
    'nation_water_clean.json',
    'nation_showers_clean.json',
    'nation_laundromats_clean.json',
]

BATCH_SIZE = 500
TABLE = 'community_spots'


def read_env(key: str) -> str:
    env_path = PROJECT_ROOT / '.env'
    pat = re.compile(rf'^{re.escape(key)}\s*=\s*"?([^"\n]+)"?\s*$')
    with open(env_path) as f:
        for line in f:
            m = pat.match(line.rstrip())
            if m:
                return m.group(1).strip()
    raise SystemExit(f'Missing {key} in {env_path}')


def to_bool(value):
    """For the boolean columns. Accept Python bool, 'Yes'/'No' strings, or None."""
    if value is None or value == '':
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        s = value.strip().lower()
        if s in ('yes', 'true'):
            return True
        if s in ('no', 'false'):
            return False
    return None


def to_text(value):
    """For TEXT columns where source might be a bool from normalization.
    Maps 'Unknown' (placeholder used by the source data) to None."""
    if value is None or value == '':
        return None
    if value is True:
        return 'Yes'
    if value is False:
        return 'No'
    s = str(value).strip()
    if not s or s.lower() == 'unknown':
        return None
    return s


def map_entry(entry: dict) -> dict:
    cat_raw = entry.get('category') or ''
    category = CATEGORY_MAP.get(cat_raw, cat_raw.lower().replace(' ', '_'))

    description = (entry.get('description_summary')
                   or entry.get('description')
                   or None)
    if description:
        description = description.strip() or None

    return {
        'name': entry.get('name_clean') or entry.get('name') or 'Unnamed',
        'name_original': entry.get('name_original'),
        'category': category,
        'latitude': float(entry['lat']),
        'longitude': float(entry['lng']),
        'public_land_unit': entry.get('public_land_unit'),
        'public_land_manager': entry.get('public_land_manager'),
        'public_land_designation': entry.get('public_land_designation'),
        'public_access': entry.get('public_access'),
        'description': description,
        'water': to_text(entry.get('water')),
        'big_rig_friendly': to_bool(entry.get('big_rig_friendly')),
        'tent_friendly': to_bool(entry.get('tent_friendly')),
        'toilets': to_text(entry.get('toilets')),
        'spot_type': to_text(entry.get('spot_type')),
        # Phase 2 amenities
        'pet_friendly': to_bool(entry.get('pet_friendly')),
        'wifi': to_text(entry.get('wifi')),
        'electricity': to_text(entry.get('electricity')),
        'showers_amenity': to_text(entry.get('showers_amenity')),
        'dump_station': to_text(entry.get('dump_station')),
        'water_potability': to_text(entry.get('water_potability')),
        'road_surface': to_text(entry.get('road_surface')),
        'surroundings': to_text(entry.get('surroundings')),
        # Description-derived (Stage 6)
        'cell_service': entry.get('cell_service'),       # JSONB or null
        'vehicle_required': to_text(entry.get('vehicle_required')),
    }


def truncate_table(supabase_url: str, key: str):
    """Delete all rows from community_spots before reload."""
    # PostgREST DELETE on the collection requires a filter; use 'gte' on
    # imported_at with epoch as a 'match all' pattern, or 'neq' on a
    # never-null column. We use latitude!=null trick.
    req = urllib.request.Request(
        f'{supabase_url}/rest/v1/{TABLE}?id=not.is.null',
        method='DELETE',
        headers={
            'apikey': key,
            'Authorization': f'Bearer {key}',
            'Prefer': 'return=minimal',
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.status


def post_batch(supabase_url: str, key: str, rows: list):
    body = json.dumps(rows).encode('utf-8')
    req = urllib.request.Request(
        f'{supabase_url}/rest/v1/{TABLE}',
        data=body,
        method='POST',
        headers={
            'apikey': key,
            'Authorization': f'Bearer {key}',
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')
        print(f'  HTTPError {e.code}: {body[:500]}')
        raise


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true', help='Map and validate without inserting')
    parser.add_argument('--truncate', action='store_true',
                        help='Delete all existing rows in community_spots before insert')
    args = parser.parse_args()

    supabase_url = read_env('SUPABASE_URL') if False else 'https://ioseedbzvogywztbtgjd.supabase.co'
    service_key = read_env('SUPABASE_SERVICE_ROLE_KEY')

    all_rows = []
    for fname in INPUT_FILES:
        path = HERE / fname
        if not path.exists():
            print(f'  [skip] {fname} not found')
            continue
        with open(path) as f:
            entries = json.load(f)
        mapped = [map_entry(e) for e in entries]
        # Validate required fields
        for r in mapped:
            assert r['name'], r
            assert r['latitude'] and r['longitude'], r
            assert r['category'], r
        print(f'  {fname}: {len(mapped)} rows mapped')
        all_rows.extend(mapped)

    print(f'\nTotal rows to insert: {len(all_rows)}')

    if args.dry_run:
        print('\nDRY RUN — first row preview:')
        print(json.dumps(all_rows[0], indent=2, default=str))
        return

    if args.truncate:
        print('\nTruncating existing rows in community_spots...')
        truncate_table(supabase_url, service_key)
        print('  Done.')

    print(f'\nInserting in batches of {BATCH_SIZE}...')
    inserted = 0
    for i in range(0, len(all_rows), BATCH_SIZE):
        batch = all_rows[i:i + BATCH_SIZE]
        post_batch(supabase_url, service_key, batch)
        inserted += len(batch)
        print(f'  [{inserted}/{len(all_rows)}] inserted')

    print(f'\nDone. Inserted {inserted} rows into {TABLE}.')


if __name__ == '__main__':
    main()
