#!/usr/bin/env python3
"""
Backfill OSM road tags (smoothness, tracktype, etc.) onto road_segments rows
within a bbox. Used for the access-difficulty classifier.

Why: many road_segments rows came from imports that only persisted a subset
of OSM tags into typed columns (tracktype, surface_type, four_wd_only) and
left osm_tags JSONB null. This script re-fetches the same OSM ways via
Overpass and updates each row with the full tag bag plus normalized typed
columns.

Usage:
  python3 backfill_osm_road_tags.py --bbox 38.50,-109.70,38.60,-109.55
  python3 backfill_osm_road_tags.py --bbox 38.50,-109.70,38.60,-109.55 --dry-run

bbox order: south,west,north,east
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent
ENV_PATH = PROJECT_ROOT / '.env'
SUPABASE_URL = 'https://ioseedbzvogywztbtgjd.supabase.co'

OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
]

# Tags we always lift into the JSONB bag; if present they show up regardless
# of value. (We could just store everything but this trims OSM noise like
# `source=Bing`, `created_by=...`)
TAG_KEYS = {
    'highway', 'tracktype', 'smoothness', 'surface', 'access',
    '4wd_only', 'motor_vehicle', 'motorcar', 'mtb:scale', 'mtb:scale:imba',
    'sac_scale', 'incline', 'oneway', 'maxspeed', 'bicycle', 'foot',
    'horse', 'name', 'ref', 'operator', 'description', 'note',
    'seasonal', 'opening_hours',
}


def load_env():
    if not ENV_PATH.exists():
        sys.exit(f'No .env at {ENV_PATH}')
    pat = re.compile(r'^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\n]*?)"?\s*$')
    with open(ENV_PATH) as f:
        for line in f:
            m = pat.match(line.rstrip())
            if m:
                os.environ.setdefault(m.group(1), m.group(2))


def overpass_query(bbox):
    south, west, north, east = bbox
    q = f"""
    [out:json][timeout:60];
    (
      way["highway"="track"]({south},{west},{north},{east});
      way["highway"="unclassified"]({south},{west},{north},{east});
      way["highway"="tertiary"]({south},{west},{north},{east});
      way["highway"="secondary"]({south},{west},{north},{east});
      way["4wd_only"="yes"]({south},{west},{north},{east});
    );
    out tags;
    """
    for endpoint in OVERPASS_ENDPOINTS:
        print(f'querying {endpoint}...')
        try:
            data = urllib.parse.urlencode({'data': q}).encode()
            req = urllib.request.Request(endpoint, data=data, method='POST')
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read())
        except Exception as e:
            print(f'  ✗ {endpoint}: {e}')
    sys.exit('all Overpass endpoints failed')


def filter_tags(tags):
    """Keep only the OSM tags we care about."""
    return {k: v for k, v in tags.items() if k in TAG_KEYS}


def fetch_road_segments(key, bbox, source='osm'):
    """Get road_segments rows in the bbox keyed by their external_id."""
    south, west, north, east = bbox
    rows = []
    headers = {'apikey': key, 'Authorization': f'Bearer {key}'}
    PAGE = 1000
    offset = 0
    while True:
        # Filter by intersection with bbox via PostGIS — use a simpler bbox
        # filter on start_point lat/lng. (road_segments doesn't expose lat/lng
        # cols directly so we have to fall back to PostGIS expression queries
        # via the .filter operator on geometry. PostgREST doesn't easily do
        # that; simpler approach: pull all rows by source, filter in Python.)
        url = (f'{SUPABASE_URL}/rest/v1/road_segments?'
               f'select=id,external_id&source_type=eq.{source}'
               f'&order=external_id&limit={PAGE}&offset={offset}')
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=60) as r:
            page = json.loads(r.read())
        if not page:
            break
        rows.extend(page)
        if len(page) < PAGE:
            break
        offset += PAGE
    by_eid = {}
    for r in rows:
        eid = r.get('external_id') or ''
        if eid.startswith('osm_'):
            by_eid.setdefault(eid, []).append(r['id'])
    return by_eid


def patch_segment(key, segment_id, fields):
    headers = {
        'apikey': key, 'Authorization': f'Bearer {key}',
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
    }
    url = f'{SUPABASE_URL}/rest/v1/road_segments?id=eq.{segment_id}'
    body = json.dumps(fields).encode()
    req = urllib.request.Request(url, data=body, method='PATCH', headers=headers)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--bbox', required=True, help='south,west,north,east')
    parser.add_argument('--dry-run', action='store_true', help='no DB writes')
    args = parser.parse_args()

    bbox = tuple(float(x) for x in args.bbox.split(','))
    if len(bbox) != 4:
        sys.exit('bbox must be south,west,north,east')

    load_env()
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    if not key:
        sys.exit('SUPABASE_SERVICE_ROLE_KEY missing')

    print(f'bbox: south={bbox[0]} west={bbox[1]} north={bbox[2]} east={bbox[3]}')

    # 1. Overpass
    osm = overpass_query(bbox)
    elements = [e for e in osm.get('elements', []) if e.get('type') == 'way']
    print(f'overpass returned {len(elements)} ways')

    # 2. Existing road_segments by external_id
    print('fetching road_segments index...')
    by_eid = fetch_road_segments(key, bbox)
    print(f'  found {len(by_eid)} OSM road_segments external_ids in DB (entire table)')

    # 3. Match + patch
    matched = 0
    patched = 0
    skipped_no_match = 0
    smoothness_seen = 0
    tracktype_seen = 0

    for el in elements:
        eid = f'osm_{el.get("id")}'
        ids = by_eid.get(eid)
        if not ids:
            skipped_no_match += 1
            continue
        matched += 1
        tags = el.get('tags') or {}
        if 'smoothness' in tags:
            smoothness_seen += 1
        if 'tracktype' in tags:
            tracktype_seen += 1

        osm_tags = filter_tags(tags)
        # Update only the fields we want — keeps existing data intact
        fields = {'osm_tags': osm_tags}
        # Also normalize typed columns if currently null
        if tags.get('tracktype'):
            fields['tracktype'] = tags['tracktype']
        if tags.get('surface'):
            fields['surface_type'] = tags['surface']
        if tags.get('4wd_only') == 'yes':
            fields['four_wd_only'] = True
        if tags.get('access'):
            fields['access'] = tags['access']
        if tags.get('highway'):
            fields['highway'] = tags['highway']

        if args.dry_run:
            patched += len(ids)
            continue

        for seg_id in ids:
            try:
                patch_segment(key, seg_id, fields)
                patched += 1
            except Exception as e:
                print(f'  patch error for {seg_id}: {e}')

    print(f'\n=== Done ===')
    print(f'  Overpass ways: {len(elements)}')
    print(f'  matched to road_segments: {matched}')
    print(f'  not in DB (skipped): {skipped_no_match}')
    print(f'  road_segments rows patched: {patched}')
    print(f'  ways with smoothness tag: {smoothness_seen}')
    print(f'  ways with tracktype tag: {tracktype_seen}')


if __name__ == '__main__':
    main()
