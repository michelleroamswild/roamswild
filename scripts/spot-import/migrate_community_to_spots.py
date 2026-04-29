#!/usr/bin/env python3
"""
Data migration: copy community_spots rows into the unified spots table.

Mapping rules (community → spots):

  category=dispersed_camping → kind=dispersed_camping, sub_kind=community, source=community
  category=informal_camping  → kind=informal_camping,  sub_kind=<spot_type-derived>, source=community
  category=water             → kind=water,    sub_kind=fill_station (default), source=community
  category=showers           → kind=shower,   sub_kind=public (default),       source=community
  category=laundromat        → kind=laundromat, sub_kind=standalone (default),  source=community

  land_type:
    public  if public_land_manager IS NOT NULL AND manager not in {'CITY','LOC'}
    private if public_land_manager IS NULL or manager in {'CITY','LOC'}

  amenities (JSONB) — built from the column-level amenities + cell_service +
  vehicle_required + extra_tags.also (combined facilities).

  extra (JSONB) — name_original, source-specific scraps.

By default this is a DRY RUN. Pass --apply to actually write to the spots table.

Usage:
  python3 migrate_community_to_spots.py            # dry run, prints stats
  python3 migrate_community_to_spots.py --apply    # actually run the insert
  python3 migrate_community_to_spots.py --apply --truncate  # wipe spots first
"""

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent
SUPABASE_URL = 'https://ioseedbzvogywztbtgjd.supabase.co'
BATCH_SIZE = 500


def read_env(key: str) -> str:
    env_path = PROJECT_ROOT / '.env'
    pat = re.compile(rf'^{re.escape(key)}\s*=\s*"?([^"\n]+)"?\s*$')
    with open(env_path) as f:
        for line in f:
            m = pat.match(line.rstrip())
            if m:
                return m.group(1).strip()
    raise SystemExit(f'Missing {key} in {env_path}')


# --- Mapping helpers ------------------------------------------------------

INFORMAL_SUBKIND_MAP = {
    'parking lot':   'parking_lot',
    'roadside':      'roadside',
    'natural setting': 'unspecified',
    'walk-in only':  'walk_in',
}

KIND_MAP = {
    'dispersed_camping': ('dispersed_camping', 'community'),
    'informal_camping':  ('informal_camping',  None),  # sub_kind from spot_type
    'water':             ('water',     'fill_station'),
    'showers':           ('shower',    'public'),
    'laundromat':        ('laundromat','standalone'),
}

# Aux tag from extra_tags.also indicates a combined facility
def derive_sub_kind(row, kind):
    if kind == 'informal_camping':
        st = (row.get('spot_type') or '').strip().lower()
        return INFORMAL_SUBKIND_MAP.get(st, 'unspecified')
    if kind == 'shower':
        # combined shower+laundry → 'combined'
        also = ((row.get('extra_tags') or {}).get('also') or [])
        if 'laundromat' in also:
            return 'combined'
        return 'public'
    if kind == 'laundromat':
        also = ((row.get('extra_tags') or {}).get('also') or [])
        if 'showers' in also:
            return 'combined'
        return 'standalone'
    if kind == 'dispersed_camping':
        return 'community'
    return None


def derive_land_type(manager):
    if not manager:
        return 'private'
    m = manager.upper()
    if m in ('CITY', 'LOC', 'LOCAL'):
        return 'private'
    return 'public'


def build_amenities(row):
    """Pack the column-level amenities into a JSONB-friendly dict.
    Only stores positive/truthful values — skips False booleans and
    string 'No'/'Unknown' (matches the iotest display rule)."""
    a = {}
    # Yes/no (booleans) — skip explicit No
    for col, key in [
        ('big_rig_friendly', 'big_rig_friendly'),
        ('tent_friendly',    'tent_friendly'),
        ('pet_friendly',     'pet_friendly'),
    ]:
        v = row.get(col)
        if v is True:
            a[key] = True
        # explicit False is dropped — absence implies "not stated"

    # Free-form text amenities — skip blanks, "Unknown", "No"
    for col in ('water', 'water_potability', 'toilets', 'showers_amenity',
                'dump_station', 'electricity', 'wifi', 'road_surface',
                'surroundings', 'spot_type'):
        v = row.get(col)
        if v is None: continue
        sv = str(v).strip()
        if not sv: continue
        if sv.lower() in ('unknown', 'no'): continue
        a[col] = sv

    # Description-derived
    if row.get('cell_service'):
        a['cell_service'] = row['cell_service']
    if row.get('vehicle_required'):
        a['vehicle_required'] = row['vehicle_required']

    # Aux categories (combined facilities)
    extra_tags = row.get('extra_tags') or {}
    also = extra_tags.get('also')
    if also:
        a['also'] = also
    return a


def build_extra(row):
    """Source-specific scraps that don't fit the unified schema."""
    e = {}
    if row.get('name_original') and row['name_original'] != row['name']:
        e['name_original'] = row['name_original']
    extra_tags = row.get('extra_tags') or {}
    # Drop 'also' from extra_tags since we promoted it to amenities
    leftover = {k: v for k, v in extra_tags.items() if k != 'also'}
    if leftover:
        e['extra_tags'] = leftover
    return e


def map_row(row):
    cat = row.get('category')
    if cat not in KIND_MAP:
        return None
    kind, default_sub = KIND_MAP[cat]
    sub_kind = derive_sub_kind(row, kind) or default_sub

    return {
        'name': row.get('name') or 'Unnamed',
        'description': row.get('description'),
        'latitude': float(row['latitude']),
        'longitude': float(row['longitude']),
        'kind': kind,
        'sub_kind': sub_kind,
        'source': 'community',
        'source_external_id': None,
        'public_land_unit':       row.get('public_land_unit'),
        'public_land_manager':    row.get('public_land_manager'),
        'public_land_designation':row.get('public_land_designation'),
        'public_access':          row.get('public_access'),
        'land_type': derive_land_type(row.get('public_land_manager')),
        'amenities': build_amenities(row),
        'extra': build_extra(row),
        'created_by_user_id': None,
    }


# --- IO -------------------------------------------------------------------

def fetch_all(url_prefix: str, key: str):
    """Paginated fetch from PostgREST (1000-row cap per request)."""
    all_rows = []
    page_size = 1000
    offset = 0
    while True:
        req = urllib.request.Request(
            f'{url_prefix}&offset={offset}&limit={page_size}',
            headers={
                'apikey': key,
                'Authorization': f'Bearer {key}',
            },
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            page = json.loads(resp.read())
        all_rows.extend(page)
        if len(page) < page_size:
            break
        offset += page_size
    return all_rows


def post_batch(url: str, key: str, rows: list):
    body = json.dumps(rows).encode('utf-8')
    req = urllib.request.Request(
        url,
        data=body,
        method='POST',
        headers={
            'apikey': key,
            'Authorization': f'Bearer {key}',
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.status


def truncate_table(url: str, key: str):
    req = urllib.request.Request(
        f'{url}?id=not.is.null',
        method='DELETE',
        headers={
            'apikey': key,
            'Authorization': f'Bearer {key}',
            'Prefer': 'return=minimal',
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.status


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true', help='Actually write rows (default is dry run)')
    parser.add_argument('--truncate', action='store_true', help='Wipe spots before writing')
    args = parser.parse_args()

    key = read_env('SUPABASE_SERVICE_ROLE_KEY')

    print('Fetching community_spots...')
    cs_url = (
        f'{SUPABASE_URL}/rest/v1/community_spots?select=*&order=imported_at.asc'
        # selects everything by default
    )
    rows = fetch_all(cs_url, key)
    print(f'  Got {len(rows)} rows')

    print('\nMapping...')
    mapped = []
    skipped = []
    for r in rows:
        m = map_row(r)
        if m is None:
            skipped.append(r.get('category'))
        else:
            mapped.append(m)
    print(f'  Mapped: {len(mapped)}')
    if skipped:
        from collections import Counter
        print(f'  Skipped: {len(skipped)} — {dict(Counter(skipped))}')

    # Stats
    from collections import Counter
    by_kind = Counter((m['kind'], m['sub_kind']) for m in mapped)
    print('\nKind / sub_kind distribution:')
    for (k, sk), n in sorted(by_kind.items(), key=lambda x: -x[1]):
        print(f'  {n:6}  {k:25}  {sk}')

    by_land = Counter(m['land_type'] for m in mapped)
    print('\nLand type distribution:')
    for k, n in by_land.most_common():
        print(f'  {n:6}  {k}')

    if not args.apply:
        print('\nDRY RUN — sample mapped row:')
        print(json.dumps(mapped[0], indent=2, default=str))
        print('\nRe-run with --apply to actually insert into spots.')
        return

    insert_url = f'{SUPABASE_URL}/rest/v1/spots'
    if args.truncate:
        print(f'\nTruncating spots...')
        truncate_table(insert_url, key)
        print('  Done.')

    print(f'\nInserting {len(mapped)} rows in batches of {BATCH_SIZE}...')
    for i in range(0, len(mapped), BATCH_SIZE):
        batch = mapped[i:i + BATCH_SIZE]
        post_batch(insert_url, key, batch)
        print(f'  [{i + len(batch)}/{len(mapped)}]')
    print('\nDone.')


if __name__ == '__main__':
    main()
