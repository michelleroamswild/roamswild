#!/usr/bin/env python3
"""End-to-end import of newly-released community spots from a single
CSV export. Consolidates the work of 01_filter.py + 04_attach_csv_tags.py
+ migrate_community_to_spots.py into one focused, idempotent script.

Why this exists separately from the existing pipeline:
- The legacy pipeline runs in 6 stages (01–06 → migrate). Each stage
  reads/writes intermediate JSONs from disk. Adding new rows means
  re-running the whole chain and risks overwriting AI-summarized
  descriptions on existing rows.
- This script reads the CSV directly, applies the polygon filter via
  the local PAD-US GDB, queries the cloud spots table for already-
  imported (lat,lng) keys, and inserts ONLY rows we don't have. It
  preserves AI-edited names + descriptions on existing rows because
  it never touches them.
- Newly-inserted rows get extra.ai_review_pending=true so the iotest
  page's "Newly imported" toggle finds them for the post-summary
  review pass.

Default: dry run (prints stats + sample mapped row, no DB writes).
Pass --apply to actually insert.
"""

import argparse
import csv
import json
import os
import re
import sys
import urllib.error
import urllib.request
from collections import Counter
from pathlib import Path
from typing import Iterable, Optional

import geopandas as gpd
from shapely.geometry import Point

# --- Paths ----------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[2]
ENV_PATH = PROJECT_ROOT / '.env'

DESKTOP = Path('/Users/michelletaylor/Desktop/_Michelle Roams Wild/RoamsWild')
CSV_PATH = DESKTOP / 'places20260503-15-5ie3bu.csv'
PADUS_GDB = DESKTOP / 'PADUS4_0Geodatabase' / 'PADUS4_0_Geodatabase.gdb'
PADUS_LAYER = 'PADUS4_0Combined_Proclamation_Marine_Fee_Designation_Easement'
AIANNH_SHP = DESKTOP / 'tl_2024_us_aiannh' / 'tl_2024_us_aiannh.shp'

SUPABASE_URL = 'https://ioseedbzvogywztbtgjd.supabase.co'
BATCH_SIZE = 100

# --- Filter rules (mirror 01_filter.py exactly) ---------------------------
INCLUDED_CATEGORIES = {
    'Wild Camping', 'Informal Campsite', 'Water', 'Showers', 'Laundromat',
}
EXCLUDED_DES_TP = {'MIL', 'NP', 'SP', 'MPA'}
EXCLUDED_PUB_ACCESS = {'XA'}
EXCLUDED_MANAGER_NAMES = {'BOEM'}

CATEGORY_TO_KIND = {
    'Wild Camping':       'dispersed_camping',
    'Informal Campsite':  'informal_camping',
    'Water':              'water',
    'Showers':            'shower',
    'Laundromat':         'laundromat',
}

# CSV column → amenity key (mirrors 04_attach_csv_tags.py TAG_COLUMNS)
TAG_COLUMNS = {
    'Water': 'water',
    'Big rig friendly': 'big_rig_friendly',
    'Tent friendly':    'tent_friendly',
    'Toilets':          'toilets',
    'Spot type':        'spot_type',
    'Pet friendly':     'pet_friendly',
    'Wifi':             'wifi',
    'Electricity':      'electricity',
    'Showers':          'showers_amenity',
    'Sanitation dump station': 'dump_station',
    'Water potability': 'water_potability',
    'Road surface':     'road_surface',
    'Surroundings':     'surroundings',
}

INFORMAL_SUBKIND_MAP = {
    'parking lot':   'parking_lot',
    'roadside':      'roadside',
    'urban':         'urban',
    'rest area':     'rest_area',
    'truck stop':    'truck_stop',
    'natural setting': 'unspecified',
    'walk-in only':  'walk_in',
}


# --- Helpers --------------------------------------------------------------
def read_env(key: str) -> str:
    pat = re.compile(rf'^{re.escape(key)}\s*=\s*"?([^"\n]+)"?\s*$')
    if not ENV_PATH.exists():
        sys.exit(f'No .env at {ENV_PATH}')
    for line in ENV_PATH.read_text().splitlines():
        m = pat.match(line)
        if m:
            return m.group(1).strip()
    sys.exit(f'Missing {key} in {ENV_PATH}')


def normalize_yes_no(raw):
    if raw is None: return None
    s = str(raw).strip()
    if not s: return None
    low = s.lower()
    if low == 'yes': return True
    if low == 'no':  return False
    return s  # 'Yes - Slow', 'Pit Toilets', etc.


def coord_key_5dp(lat, lng) -> str:
    return f'{round(float(lat), 5)},{round(float(lng), 5)}'


def derive_sub_kind(kind: str, spot_type: Optional[str]) -> Optional[str]:
    if kind == 'dispersed_camping':
        return 'community'
    if kind == 'informal_camping':
        st = (spot_type or '').strip().lower()
        return INFORMAL_SUBKIND_MAP.get(st, 'unspecified')
    if kind == 'water':       return 'fill_station'
    if kind == 'shower':      return 'public'
    if kind == 'laundromat':  return 'standalone'
    return None


def derive_land_type(manager: Optional[str]) -> str:
    if not manager: return 'private'
    m = manager.upper()
    if m in ('CITY', 'LOC', 'LOCAL'): return 'private'
    return 'public'


def build_amenities(csv_row: dict) -> dict:
    """Pack Yes/No + free-form CSV columns into the amenities JSONB.
    Mirror migrate_community_to_spots.py's build_amenities — drop
    explicit No / Unknown / blank values."""
    a: dict = {}
    # Yes/No booleans
    for col, key in [
        ('Big rig friendly', 'big_rig_friendly'),
        ('Tent friendly',    'tent_friendly'),
        ('Pet friendly',     'pet_friendly'),
    ]:
        v = normalize_yes_no(csv_row.get(col))
        if v is True:
            a[key] = True
    # Free-form text amenities
    for col in ('Water', 'Water potability', 'Toilets', 'Showers',
                'Sanitation dump station', 'Electricity', 'Wifi',
                'Road surface', 'Surroundings', 'Spot type'):
        v = csv_row.get(col)
        if v is None: continue
        sv = str(v).strip()
        if not sv: continue
        if sv.lower() in ('unknown', 'no'): continue
        # Map original CSV header → amenities key per TAG_COLUMNS
        a[TAG_COLUMNS[col]] = sv
    return a


def build_extra(csv_row: dict, name: str, name_original: str) -> dict:
    """source-specific extras + the ai_review_pending flag."""
    e: dict = {}
    if name_original and name_original != name:
        e['name_original'] = name_original
    # Date verified — useful provenance, the import pipeline doesn't surface
    # it elsewhere
    dv = (csv_row.get('Date verified') or '').strip()
    if dv:
        e['date_verified_csv'] = dv
    # Flag for the iotest "Newly imported" toggle and the future
    # description-summarizer pass.
    e['ai_review_pending'] = True
    return e


# --- HTTP -----------------------------------------------------------------
def http_get_json(url: str, key: str, timeout: int = 60):
    req = urllib.request.Request(
        url,
        headers={'apikey': key, 'Authorization': f'Bearer {key}'},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def fetch_existing_community_keys(svc_key: str) -> set:
    """Returns a Set of (lat,lng) 5dp keys for every spots row currently
    flagged source='community'. This is the dedupe gate."""
    keys: set = set()
    page_size = 1000
    offset = 0
    print('Fetching existing community spots from DB...')
    while True:
        url = (
            f'{SUPABASE_URL}/rest/v1/spots'
            f'?select=latitude,longitude'
            f'&source=eq.community'
            f'&offset={offset}&limit={page_size}'
        )
        page = http_get_json(url, svc_key)
        for r in page:
            try:
                keys.add(coord_key_5dp(r['latitude'], r['longitude']))
            except (KeyError, TypeError, ValueError):
                continue
        if len(page) < page_size:
            break
        offset += page_size
        print(f'  …{offset} fetched')
    print(f'  Existing community keys: {len(keys)}')
    return keys


def post_batch(svc_key: str, rows: list) -> int:
    body = json.dumps(rows).encode('utf-8')
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/spots',
        data=body,
        method='POST',
        headers={
            'apikey': svc_key,
            'Authorization': f'Bearer {svc_key}',
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.status


# --- Main pipeline --------------------------------------------------------
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true',
                        help='Actually write to spots table (default: dry run)')
    parser.add_argument('--csv', type=Path, default=CSV_PATH,
                        help='Override CSV path')
    parser.add_argument('--limit', type=int, default=None,
                        help='Cap rows for testing (post-filter)')
    args = parser.parse_args()

    if not args.csv.exists():
        sys.exit(f'CSV not found: {args.csv}')
    if not PADUS_GDB.exists():
        sys.exit(f'PAD-US GDB not found: {PADUS_GDB}')

    # 1. Read CSV → rows of community categories only
    print(f'Reading CSV: {args.csv.name}')
    raw_rows = []
    cats = Counter()
    with open(args.csv, newline='') as f:
        for r in csv.DictReader(f):
            cat = (r.get('Category') or '').strip()
            if cat not in INCLUDED_CATEGORIES:
                continue
            try:
                lat = float(r['Latitude'])
                lng = float(r['Longitude'])
            except (KeyError, TypeError, ValueError):
                continue
            r['_lat'] = lat
            r['_lng'] = lng
            raw_rows.append(r)
            cats[cat] += 1
    print(f'  {len(raw_rows)} community-category rows')
    for c, n in cats.most_common():
        print(f'    {n:6}  {c}')

    # 2. Spatial join with PAD-US (camping-eligible polygons only) + tribal
    spots_gdf = gpd.GeoDataFrame(
        [{'idx': i,
          'name_original': r['Name'] or '',
          'category': r['Category'],
          'lat': r['_lat'], 'lng': r['_lng'],
          '_csv': r}
         for i, r in enumerate(raw_rows)],
        geometry=[Point(r['_lng'], r['_lat']) for r in raw_rows],
        crs='EPSG:4326',
    )

    print('Loading PAD-US Combined layer (this takes ~1-2 min)...')
    padus = gpd.read_file(
        PADUS_GDB, layer=PADUS_LAYER,
        columns=['Unit_Nm', 'Mang_Name', 'Mang_Type', 'Des_Tp', 'Pub_Access'],
    )
    print(f'  Loaded {len(padus)} polygons total')
    padus = padus[~padus['Des_Tp'].isin(EXCLUDED_DES_TP)]
    padus = padus[~padus['Pub_Access'].isin(EXCLUDED_PUB_ACCESS)]
    padus = padus[~padus['Mang_Name'].isin(EXCLUDED_MANAGER_NAMES)]
    padus = padus[padus['Mang_Type'] != 'TRIB']
    if padus.crs is None or padus.crs.to_epsg() != 4326:
        padus = padus.to_crs('EPSG:4326')
    print(f'  After camping-eligibility filter: {len(padus)} polygons')

    print('Loading tribal lands (Census AIANNH)...')
    tribal = gpd.read_file(AIANNH_SHP)
    if tribal.crs is None or tribal.crs.to_epsg() != 4326:
        tribal = tribal.to_crs('EPSG:4326')
    print(f'  Tribal polygons: {len(tribal)}')

    print('Spatial joins...')
    inside_padus = gpd.sjoin(spots_gdf, padus, how='left', predicate='within')
    inside_padus = inside_padus.loc[~inside_padus.index.duplicated(keep='first')]
    inside_tribal = gpd.sjoin(spots_gdf, tribal[['NAME', 'geometry']],
                               how='left', predicate='within')
    inside_tribal = inside_tribal.loc[~inside_tribal.index.duplicated(keep='first')]

    spots_gdf['_in_padus'] = inside_padus['Unit_Nm'].notna().values
    spots_gdf['_in_tribal'] = inside_tribal['NAME'].notna().values
    spots_gdf['_padus_unit'] = inside_padus['Unit_Nm'].values
    spots_gdf['_padus_manager'] = inside_padus['Mang_Name'].values
    spots_gdf['_padus_des_tp'] = inside_padus['Des_Tp'].values
    spots_gdf['_padus_access'] = inside_padus['Pub_Access'].values

    # 3. Drop tribal-reservation rows entirely (matches 01_filter.py)
    drop_tribal = spots_gdf['_in_tribal'].sum()
    spots_gdf = spots_gdf[~spots_gdf['_in_tribal']].copy()
    print(f'Dropped {drop_tribal} rows inside tribal reservations')

    # 4. Build mapped rows (with the Wild-Camping-outside-polygon →
    #    informal_camping reclassification baked in)
    reclassified = 0
    mapped = []
    for _, gdf_row in spots_gdf.iterrows():
        csv_row = gdf_row['_csv']
        lat = float(gdf_row['lat']); lng = float(gdf_row['lng'])
        category = gdf_row['category']
        in_public = bool(gdf_row['_in_padus'])
        if category == 'Wild Camping' and not in_public:
            category = 'Informal Campsite'
            reclassified += 1
        kind = CATEGORY_TO_KIND[category]

        manager = gdf_row['_padus_manager'] if isinstance(gdf_row['_padus_manager'], str) else None
        unit    = gdf_row['_padus_unit']    if isinstance(gdf_row['_padus_unit'], str)    else None
        des_tp  = gdf_row['_padus_des_tp']  if isinstance(gdf_row['_padus_des_tp'], str)  else None
        access  = gdf_row['_padus_access']  if isinstance(gdf_row['_padus_access'], str)  else None

        name_original = (csv_row.get('Name') or '').strip()
        spot_type = (csv_row.get('Spot type') or '').strip() or None

        mapped.append({
            'name': name_original or 'Unnamed',
            'description': csv_row.get('Description') or None,
            'latitude': lat,
            'longitude': lng,
            'kind': kind,
            'sub_kind': derive_sub_kind(kind, spot_type),
            'source': 'community',
            'source_external_id': None,
            'public_land_unit': unit,
            'public_land_manager': manager,
            'public_land_designation': des_tp,
            'public_access': access,
            'land_type': derive_land_type(manager),
            'amenities': build_amenities(csv_row),
            'extra': build_extra(csv_row, name_original, name_original),
            'created_by_user_id': None,
        })

    if reclassified:
        print(f'Reclassified {reclassified} Wild Camping rows outside polygon → informal_camping')

    # 5. Skip-if-exists: query DB, drop rows whose key is already there.
    # Run this in dry-run too so the preview number is accurate. It's
    # a single paginated SELECT — low impact compared to silent over-
    # estimation that'd push us toward an unnecessary --apply.
    svc_key = read_env('SUPABASE_SERVICE_ROLE_KEY')
    existing = fetch_existing_community_keys(svc_key)

    new_rows = []
    skipped_existing = 0
    for m in mapped:
        k = coord_key_5dp(m['latitude'], m['longitude'])
        if k in existing:
            skipped_existing += 1
            continue
        new_rows.append(m)

    if args.limit:
        new_rows = new_rows[: args.limit]

    # 6. Summary
    print()
    print('=== Summary ===')
    print(f'  Mapped (post-PAD-US filter):    {len(mapped)}')
    print(f'  Already in DB (skip):           {skipped_existing}')
    print(f'  NEW rows ready to insert:       {len(new_rows)}')
    if args.limit:
        print(f'    (capped at --limit {args.limit})')
    by_kind = Counter((r['kind'], r['sub_kind']) for r in new_rows)
    print('  By kind/sub_kind:')
    for (k, sk), n in sorted(by_kind.items(), key=lambda x: -x[1]):
        print(f'    {n:6}  {k:25}  {sk}')
    by_mgr = Counter(r['public_land_manager'] or '(none)' for r in new_rows)
    print('  Top managers:')
    for m, n in by_mgr.most_common(10):
        print(f'    {n:6}  {m}')

    if not args.apply:
        if new_rows:
            print()
            print('--- Sample mapped row (first NEW) ---')
            print(json.dumps(new_rows[0], indent=2, default=str))
        print()
        print('Dry run only. Re-run with --apply to insert into spots table.')
        return

    # 7. Insert
    if not new_rows:
        print('Nothing to insert.')
        return

    svc_key = read_env('SUPABASE_SERVICE_ROLE_KEY')
    print()
    print(f'Inserting {len(new_rows)} rows in batches of {BATCH_SIZE}...')
    inserted = 0
    failed = 0
    for i in range(0, len(new_rows), BATCH_SIZE):
        batch = new_rows[i:i + BATCH_SIZE]
        try:
            status = post_batch(svc_key, batch)
            if status >= 400:
                failed += len(batch)
                print(f'  [{i + len(batch)}/{len(new_rows)}] HTTP {status}')
            else:
                inserted += len(batch)
                print(f'  [{i + len(batch)}/{len(new_rows)}] HTTP {status}')
        except urllib.error.HTTPError as e:
            failed += len(batch)
            print(f'  [{i + len(batch)}/{len(new_rows)}] HTTPError {e.code}: {e.read()[:200]}')
            # Stop on first batch failure to avoid hammering Supabase
            print('Aborting on first failure to avoid hammering Supabase.')
            break
    print()
    print(f'Done. Inserted: {inserted} · Failed: {failed}')


if __name__ == '__main__':
    main()
