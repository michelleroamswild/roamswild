#!/usr/bin/env python3
"""
Data migration: copy potential_spots + established_campgrounds rows into
the unified spots table.

Mapping:

  potential_spots:
    spot_type=camp_site (with osm_camp_site_id) → kind=dispersed_camping, sub_kind=known,    source=osm
    spot_type=camp_site (no osm id)              → kind=dispersed_camping, sub_kind=known,    source=osm
    spot_type=dead_end / intersection            → kind=dispersed_camping, sub_kind=derived,  source=<source_type>

  established_campgrounds:
    facility_type=Campground → kind=established_campground, sub_kind=campground
    facility_type=Day Use    → skipped (not camping)
    facility_type=Trailhead  → skipped (not camping)
    source = ridb if ridb_facility_id else osm if osm_id else 'unknown'

By default this is a DRY RUN. Pass --apply to actually write to the spots table.

Usage:
  python3 migrate_derived_to_spots.py
  python3 migrate_derived_to_spots.py --apply
"""

import argparse
import json
import re
import urllib.error
import urllib.request
from collections import Counter
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


def fetch_all(url_prefix: str, key: str):
    all_rows = []
    page_size = 1000
    offset = 0
    while True:
        req = urllib.request.Request(
            f'{url_prefix}&offset={offset}&limit={page_size}',
            headers={'apikey': key, 'Authorization': f'Bearer {key}'},
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
        url, data=body, method='POST',
        headers={
            'apikey': key,
            'Authorization': f'Bearer {key}',
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.status


# --- Mapping helpers ----------------------------------------------------

def derive_land_type(manager):
    if not manager:
        return 'private'
    m = manager.upper()
    if m in ('CITY', 'LOC', 'LOCAL'):
        return 'private'
    return 'public'


def map_potential_spot(r):
    spot_type = r.get('spot_type')
    if spot_type not in ('dead_end', 'intersection', 'camp_site'):
        return None

    if spot_type == 'camp_site':
        sub_kind = 'known'
        source = 'osm'
        source_external_id = (str(r['osm_camp_site_id'])
                              if r.get('osm_camp_site_id') else None)
    else:
        sub_kind = 'derived'
        source = r.get('source_type') or 'derived'
        source_external_id = None

    # Synthesize a name. road_name is usually set; otherwise fall back.
    road_name = r.get('road_name')
    if road_name:
        name = road_name
    elif spot_type == 'camp_site':
        name = 'OSM Campsite'
    else:
        name = 'Dispersed spot'

    amenities = {}
    if r.get('vehicle_access'):
        amenities['vehicle_required'] = r['vehicle_access']

    extra = {}
    for k in ('confidence_score', 'recommendation_score', 'score_breakdown',
              'derivation_reasons', 'is_passenger_reachable',
              'is_high_clearance_reachable', 'status', 'road_segment_id'):
        v = r.get(k)
        if v not in (None, '', [], {}):
            extra[k] = v
    if r.get('osm_camp_site_id') and source_external_id is None:
        extra['osm_camp_site_id'] = r['osm_camp_site_id']

    return {
        'name': name,
        'description': None,
        'latitude': float(r['lat']),
        'longitude': float(r['lng']),
        'kind': 'dispersed_camping',
        'sub_kind': sub_kind,
        'source': source,
        'source_external_id': source_external_id,
        'public_land_unit': None,
        'public_land_manager': r.get('managing_agency'),
        'public_land_designation': None,
        'public_access': None,
        'land_type': derive_land_type(r.get('managing_agency')),
        'amenities': amenities,
        'extra': extra,
        'created_by_user_id': None,
    }


def map_established_campground(r):
    fac = (r.get('facility_type') or '').strip().lower()
    if fac in ('day use', 'day_use', 'trailhead'):
        return None
    sub_kind = 'campground'

    # Source priority: ridb > osm > unknown
    source = 'unknown'
    source_external_id = None
    if r.get('ridb_facility_id'):
        source = 'ridb'
        source_external_id = r['ridb_facility_id']
    elif r.get('osm_id'):
        source = 'osm'
        source_external_id = str(r['osm_id'])
    elif r.get('usfs_rec_area_id'):
        source = 'usfs'
        source_external_id = r['usfs_rec_area_id']

    agency = r.get('agency_name')
    if agency == 'Unknown':
        agency = None

    amenities = {}
    if r.get('has_toilets') is True:
        amenities['toilets'] = 'yes'
    if r.get('has_water') is True:
        amenities['water'] = 'yes'
    if r.get('has_showers') is True:
        amenities['showers_amenity'] = 'yes'
    if r.get('is_reservable') is True:
        amenities['reservation'] = True
    has_fee = r.get('has_fee')
    if has_fee is True:
        amenities['fee'] = 'paid'
        if r.get('fee_description'):
            amenities['fee_description'] = r['fee_description']
    elif has_fee is False:
        amenities['fee'] = 'free'

    extra = {}
    for k in ('forest_name', 'recreation_gov_url', 'last_synced_at'):
        v = r.get(k)
        if v not in (None, '', [], {}):
            extra[k] = v

    desc = r.get('description')
    # Strip HTML for now (Recreation.gov descriptions have <h2> etc.)
    if desc:
        desc = re.sub(r'<[^>]+>', ' ', desc)
        desc = re.sub(r'\s+', ' ', desc).strip()
        if len(desc) > 600:
            desc = desc[:600].rstrip() + '…'

    return {
        'name': r.get('name') or 'Unnamed campground',
        'description': desc,
        'latitude': float(r['lat']),
        'longitude': float(r['lng']),
        'kind': 'established_campground',
        'sub_kind': sub_kind,
        'source': source,
        'source_external_id': source_external_id,
        'public_land_unit': None,
        'public_land_manager': agency,
        'public_land_designation': None,
        'public_access': None,
        'land_type': derive_land_type(agency),
        'amenities': amenities,
        'extra': extra,
        'created_by_user_id': None,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()

    key = read_env('SUPABASE_SERVICE_ROLE_KEY')

    print('Fetching potential_spots...')
    ps = fetch_all(f'{SUPABASE_URL}/rest/v1/potential_spots?select=*', key)
    print(f'  Got {len(ps)} rows')
    print('Fetching established_campgrounds...')
    ec = fetch_all(f'{SUPABASE_URL}/rest/v1/established_campgrounds?select=*', key)
    print(f'  Got {len(ec)} rows')

    mapped_ps = [m for m in (map_potential_spot(r) for r in ps) if m]
    mapped_ec = [m for m in (map_established_campground(r) for r in ec) if m]
    print(f'\nMapped potential_spots:           {len(mapped_ps)} of {len(ps)}')
    print(f'Mapped established_campgrounds:   {len(mapped_ec)} of {len(ec)}')

    all_mapped = mapped_ps + mapped_ec

    by_kind = Counter((m['kind'], m['sub_kind'], m['source']) for m in all_mapped)
    print('\nKind / sub_kind / source distribution:')
    for (k, sk, s), n in sorted(by_kind.items(), key=lambda x: -x[1]):
        print(f'  {n:6}  {k:25}  {sk:15}  {s}')

    if not args.apply:
        print('\nDRY RUN — sample mapped potential_spot:')
        if mapped_ps:
            print(json.dumps(mapped_ps[0], indent=2, default=str))
        print('\nSample mapped established_campground:')
        if mapped_ec:
            print(json.dumps(mapped_ec[0], indent=2, default=str))
        print('\nRe-run with --apply to actually insert.')
        return

    insert_url = f'{SUPABASE_URL}/rest/v1/spots'
    print(f'\nInserting {len(all_mapped)} rows in batches of {BATCH_SIZE}...')
    for i in range(0, len(all_mapped), BATCH_SIZE):
        batch = all_mapped[i:i + BATCH_SIZE]
        post_batch(insert_url, key, batch)
        print(f'  [{i + len(batch)}/{len(all_mapped)}]')
    print('\nDone.')


if __name__ == '__main__':
    main()
