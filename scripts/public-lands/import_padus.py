#!/usr/bin/env python3
"""
Bulk-load PAD-US 4.0 polygons into our `public_lands` Postgres table.

Reads the same local GeoDatabase the spot-import pipeline already uses
(scripts/spot-import/01_filter.py), filters to camping-relevant categories,
and posts each polygon to the `insert_public_land_simple` RPC. Idempotent
via PAD-US `OBJECTID` mapped to `external_id` so re-runs skip rows already
in the DB.

Why this exists:
- Our `public_lands` table is sparsely populated (1.9k rows total, no USFS,
  no state, no tribal — only a few demo bboxes that the on-demand
  `import-region` edge function ever touched).
- The spot-quality flags (outside_public_land_polygon, near_public_land_edge)
  in `spots.extra` rely on this table being complete. With current coverage,
  ~48% of derived spots flag "outside polygon" — almost all false positives.
- After this script runs nationwide, re-run `backfill_spot_public_land_edge_distance`
  and the flag will start meaning something.

Setup (once):
  pip install geopandas shapely

.env keys required:
  SUPABASE_SERVICE_ROLE_KEY

Usage:
  python3 import_padus.py                  # full nationwide run
  python3 import_padus.py --dry-run        # count polygons, no inserts
  python3 import_padus.py --limit 100      # smoke test
  python3 import_padus.py --state UT       # only one state's polygons
  python3 import_padus.py --resume         # skip rows already inserted
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import geopandas as gpd
from shapely.geometry import MultiPolygon, Polygon

# ---------------------------------------------------------------------------
# Paths + constants
# ---------------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).parent.parent.parent
ENV_PATH = PROJECT_ROOT / '.env'

DESKTOP = Path('/Users/michelletaylor/Desktop/_Michelle Roams Wild/RoamsWild')
PADUS_GDB = DESKTOP / 'PADUS4_0Geodatabase' / 'PADUS4_0_Geodatabase.gdb'
PADUS_LAYER = 'PADUS4_0Combined_Proclamation_Marine_Fee_Designation_Easement'

SUPABASE_URL = 'https://ioseedbzvogywztbtgjd.supabase.co'

# Same exclusions the spot-import filter uses, with a couple of additions
# specific to bulk load (we still want the spot filter's exclusions to apply
# at point-in-polygon time, but here we want the polygons available so that
# *spots inside them* can be correctly classified during derive).
EXCLUDED_DES_TP = {
    'MIL',   # Military
    'MPA',   # Marine Protected Area — many polygons have invalid geometry
}
EXCLUDED_MANAGER_NAMES = {'BOEM'}
EXCLUDED_PUB_ACCESS = {'XA'}  # Closed Access

# Mang_Type categories we keep. Keeps the row count tractable (~111k vs
# 417k with everything) and matches what's actually camping-relevant.
# Dropped: LOC (city/county parks — rarely host dispersed), NGO (land
# trusts — usually no public camping), PVT (private), DIST (special
# districts), JNT (joint), UNK / TERR (unclear).
INCLUDED_MANG_TYPES = {'FED', 'STAT', 'TRIB'}

# PAD-US Category values we keep by default. Fee = actual ownership/parcels,
# Easement = conservation easements. Dropped by default: Designation
# (Wilderness Study Areas, ACECs, National Monuments — overlay zones layered
# on top of fee parcels), Proclamation (boundary lines like a National
# Forest's outer perimeter regardless of inholdings), Marine. Keeping these
# out leaves us with one polygon per location reflecting actual ownership.
#
# `--include-designations` adds Designation rows on top — useful for
# surfacing "what monument am I in?" (Grand Staircase, Bears Ears,
# Vermilion Cliffs, etc.) without polluting ownership-based reasoning.
# Migration 20260233 ensures derive / edge-distance / outside-polygon
# logic still scopes to Fee+Easement+TRIB-Proclamation only.
INCLUDED_CATEGORIES = {'Fee', 'Easement'}
DESIGNATION_CATEGORIES = {'Designation'}

# PAD-US Mang_Type → our `source_type` enum (see migration 20260137)
SOURCE_TYPE_MAP = {
    'FED': 'pad_us',
    'STAT': 'state',
    'LOC': 'pad_us',
    'DIST': 'pad_us',
    'JNT': 'pad_us',
    'NGO': 'pad_us',
    'PVT': 'pad_us',
    'TRIB': 'pad_us',
    'UNK': 'pad_us',
}

# PAD-US Mang_Name → our managing_agency text. PAD-US uses many state-
# specific codes (SLB for Utah's State Land Board, SLO for NM/AZ State Land
# Office, etc.). We pass them through verbatim — `managing_agency` is just
# TEXT, so any value is accepted, and downstream code can map as needed.
FEDERAL_AGENCY_NORMALIZE = {
    'BLM': 'BLM',
    'USFS': 'USFS',
    'FS':   'USFS',
    'NPS':  'NPS',
    'FWS':  'FWS',
    'DOD':  'DOD',
    'BOR':  'BOR',
    'BIA':  'BIA',
    'DOE':  'DOE',
    'DOI':  'DOI',
    'TVA':  'TVA',
    'USACE':'USACE',
    'USGS': 'USGS',
    'OTHF': 'FED',
}

# Hard cap on vertices per polygon. PAD-US has some monsters (think the
# entire BLM SMA in Nevada as one MultiPolygon) that can't be sent over
# HTTPS as WKT in a single request. For now we simplify to a tolerance,
# warning when a row gets simplified. PostGIS handles geographic distance
# fine on simplified geoms — tolerance below is in degrees, ~1m at the
# equator, so the loss is negligible for our use case (point-in-polygon).
SIMPLIFY_TOLERANCE_DEGREES = 0.00001  # ~1m

# Cap on how many rows to insert per logging interval — purely cosmetic.
LOG_EVERY = 100


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_env() -> None:
    if not ENV_PATH.exists():
        sys.exit(f'No .env at {ENV_PATH}')
    pat = re.compile(r'^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\n]*?)"?\s*$')
    with open(ENV_PATH) as f:
        for line in f:
            m = pat.match(line.rstrip())
            if m:
                os.environ.setdefault(m.group(1), m.group(2))


def http_post(url: str, headers: dict, body: object, timeout: int = 30) -> tuple[int, str]:
    req = urllib.request.Request(
        url,
        method='POST',
        data=json.dumps(body).encode('utf-8'),
        headers=headers,
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def http_get(url: str, headers: dict, timeout: int = 30) -> tuple[int, str]:
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def existing_external_ids(svc_key: str) -> set[str]:
    """Pull every external_id already in public_lands so we can skip them.
    Paginated because the table can run into the hundreds of thousands."""
    headers = {
        'apikey': svc_key,
        'Authorization': f'Bearer {svc_key}',
        'Content-Type': 'application/json',
    }
    seen: set[str] = set()
    PAGE = 1000
    offset = 0
    while True:
        url = f'{SUPABASE_URL}/rest/v1/public_lands?select=external_id&offset={offset}&limit={PAGE}'
        status, body = http_get(url, headers)
        if status != 200:
            sys.exit(f'Failed to fetch existing external_ids: {status} {body[:200]}')
        rows = json.loads(body)
        if not rows:
            break
        seen.update(r['external_id'] for r in rows if r.get('external_id'))
        if len(rows) < PAGE:
            break
        offset += PAGE
    return seen


def insert_polygon(svc_key: str, payload: dict) -> tuple[bool, str]:
    """POST one polygon via the insert_public_land_simple RPC. Returns
    (ok, error_message)."""
    headers = {
        'apikey': svc_key,
        'Authorization': f'Bearer {svc_key}',
        'Content-Type': 'application/json',
    }
    url = f'{SUPABASE_URL}/rest/v1/rpc/insert_public_land_simple'
    status, body = http_post(url, headers, payload, timeout=60)
    if status >= 200 and status < 300:
        return True, ''
    return False, f'HTTP {status}: {body[:300]}'


def normalize_agency(mang_type: str | None, mang_name: str | None) -> str:
    """Map PAD-US (Mang_Type, Mang_Name) to our managing_agency text."""
    if not mang_name:
        return 'UNK'
    n = str(mang_name).strip().upper()
    if mang_type == 'FED' and n in FEDERAL_AGENCY_NORMALIZE:
        return FEDERAL_AGENCY_NORMALIZE[n]
    # State / local / NGO / private / tribal — pass the manager code through.
    return n


def dispersed_allowed(des_tp: str | None, mang_type: str | None) -> bool:
    """Conservative default for `dispersed_camping_allowed`. NPS units, state
    parks, military, and marine areas are excluded earlier; here we mark
    tribal lands not-allowed since tribal access is a per-tribe decision the
    app shouldn't decide on, and a few federal designations as not-allowed."""
    if mang_type == 'TRIB':
        return False
    if des_tp in {'NP', 'SP', 'MIL'}:
        return False
    return True


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true', help='count polygons, no inserts')
    parser.add_argument('--limit', type=int, default=None, help='cap polygons inserted (smoke test)')
    parser.add_argument('--state', type=str, default=None, help='filter to one state code (UT, CO, etc.)')
    parser.add_argument('--resume', action='store_true', default=True, help='skip rows already inserted (default on)')
    parser.add_argument('--include-designations', action='store_true', help='include PAD-US Designation rows (National Monuments, Wilderness, WSAs, ACECs)')
    args = parser.parse_args()

    load_env()
    svc_key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    if not svc_key:
        sys.exit('SUPABASE_SERVICE_ROLE_KEY missing from .env')

    if not PADUS_GDB.exists():
        sys.exit(f'PAD-US GeoDatabase not found at {PADUS_GDB}')

    print(f'Loading PAD-US Combined layer from {PADUS_GDB.name}...')
    # Include OBJECTID so the external_id is stable across runs (we want
    # `padus4_<OBJECTID>` not a content hash). Category distinguishes Fee
    # ownership polygons from Designation/Proclamation overlays.
    columns = ['OBJECTID', 'Category', 'Unit_Nm', 'Mang_Name', 'Mang_Type',
               'Des_Tp', 'Pub_Access', 'GIS_Acres', 'State_Nm', 'IUCN_Cat']
    padus = gpd.read_file(PADUS_GDB, layer=PADUS_LAYER, columns=columns)
    print(f'  Loaded {len(padus)} raw polygons')

    # State filter (optional smoke testing)
    if args.state:
        padus = padus[padus['State_Nm'].fillna('').str.upper().str.contains(args.state.upper())]
        print(f'  After --state {args.state}: {len(padus)}')

    # Same exclusions the spot-import filter uses
    padus = padus[~padus['Des_Tp'].isin(EXCLUDED_DES_TP)]
    padus = padus[~padus['Pub_Access'].isin(EXCLUDED_PUB_ACCESS)]
    padus = padus[~padus['Mang_Name'].isin(EXCLUDED_MANAGER_NAMES)]
    # Trim to camping-relevant management categories only.
    padus = padus[padus['Mang_Type'].isin(INCLUDED_MANG_TYPES)]
    # Fee + Easement only for general land — drops Designation/Proclamation
    # overlays so we get one ownership row per location instead of a stack
    # of admin/overlay polygons co-rendered on the map.
    #
    # Tribal exception: tribal reservations are stored as Proclamation in
    # PAD-US (because they're established by federal proclamation/treaty,
    # not a fee deed). 94% of TRIB rows are Category='Proclamation'. Without
    # this carve-out we'd lose almost all tribal coverage.
    keep_general = padus['Category'].isin(INCLUDED_CATEGORIES)
    keep_tribal_proclamation = (padus['Mang_Type'] == 'TRIB') & (padus['Category'] == 'Proclamation')
    keep_mask = keep_general | keep_tribal_proclamation
    if args.include_designations:
        keep_mask = keep_mask | padus['Category'].isin(DESIGNATION_CATEGORIES)
        print('  --include-designations: adding Designation rows (NMs, WSAs, etc.)')
    padus = padus[keep_mask]
    if padus.crs is None or padus.crs.to_epsg() != 4326:
        padus = padus.to_crs('EPSG:4326')
    print(f'  After camping-eligibility filters: {len(padus)} polygons')

    # Build code -> label map for designations (PAD-US 4.0 stores codes only)
    print('  Loading Designation_Type lookup...')
    dt_lookup = gpd.read_file(PADUS_GDB, layer='Designation_Type')
    dt_label = dict(zip(dt_lookup['Code'].astype(str), dt_lookup['Dom'].astype(str)))

    if args.limit:
        padus = padus.head(args.limit)
        print(f'  Limiting to first {args.limit}')

    # Resume support — pull existing external_ids and skip them
    skip_ids: set[str] = set()
    if args.resume and not args.dry_run:
        print('Fetching existing external_ids from Supabase…')
        skip_ids = existing_external_ids(svc_key)
        print(f'  {len(skip_ids)} already in DB')

    if args.dry_run:
        print()
        print('=== Dry run summary ===')
        print(f'Would attempt: {len(padus)} polygons')
        print()
        print('Top managing agencies (Mang_Type breakdown):')
        print(padus['Mang_Type'].value_counts().head(15).to_string())
        print()
        print('Top managers (Mang_Name):')
        print(padus['Mang_Name'].value_counts().head(15).to_string())
        return

    print()
    print(f'=== Inserting up to {len(padus)} polygons ===')

    inserted = 0
    skipped = 0
    failed = 0
    started = time.time()

    for _, row in padus.iterrows():
        # External-id strategy: prefer OBJECTID (stable, GDB-provided). If the
        # driver dropped OBJECTID for some reason, fall back to a content-
        # derived md5 over the immutable identifying fields. md5 is used for
        # the deterministic-across-runs property; Python's built-in hash() is
        # randomized per-process via PYTHONHASHSEED.
        oid = row.get('OBJECTID')
        if oid is not None and not (isinstance(oid, float) and oid != oid):  # not NaN
            external_id = f'padus4_{int(oid)}'
        else:
            content = '|'.join([
                str(row.get('Unit_Nm') or ''),
                str(row.get('Mang_Name') or ''),
                str(row.get('Mang_Type') or ''),
                str(row.get('Des_Tp') or ''),
                # Centroid as a stability anchor when name+manager collide
                f'{row.geometry.centroid.x:.5f},{row.geometry.centroid.y:.5f}' if row.geometry else '',
            ])
            external_id = 'padus4_h_' + hashlib.md5(content.encode()).hexdigest()[:16]

        if external_id in skip_ids:
            skipped += 1
            continue

        geom = row.geometry
        if geom is None or geom.is_empty:
            skipped += 1
            continue

        # Simplify huge polygons to keep WKT under HTTP body limits.
        # PostGIS will still index/contain correctly at this tolerance.
        if hasattr(geom, 'simplify'):
            geom = geom.simplify(SIMPLIFY_TOLERANCE_DEGREES, preserve_topology=True)

        # public_lands.boundary is MULTIPOLYGON. PAD-US gives us individual
        # Polygon features mixed with MultiPolygons; wrap singletons so the
        # WKT type matches the column type.
        if isinstance(geom, Polygon):
            geom = MultiPolygon([geom])

        try:
            wkt = geom.wkt
        except Exception as e:
            print(f'  skip (wkt error): {row["Unit_Nm"]}: {e}')
            failed += 1
            continue

        agency = normalize_agency(row.get('Mang_Type'), row.get('Mang_Name'))
        des_tp = row.get('Des_Tp')
        des_label = dt_label.get(str(des_tp), des_tp) if des_tp else None

        # IUCN_Cat is "N/A" / NaN for unclassified rows in PAD-US. Normalise
        # those to NULL so downstream filters don't have to special-case them.
        iucn = row.get('IUCN_Cat')
        if iucn is None or (isinstance(iucn, float) and iucn != iucn) or str(iucn).strip().upper() in {'', 'N/A', 'NA'}:
            iucn = None

        payload = {
            'p_external_id': external_id,
            'p_source_type': SOURCE_TYPE_MAP.get(row.get('Mang_Type', ''), 'pad_us'),
            'p_name': (row.get('Unit_Nm') or des_label or 'Public Land')[:255],
            'p_managing_agency': agency,
            'p_land_type': des_label or row.get('Mang_Type') or 'public',
            'p_boundary_wkt': wkt,
            'p_area_acres': float(row['GIS_Acres']) if row.get('GIS_Acres') else None,
            'p_dispersed_camping_allowed': dispersed_allowed(des_tp, row.get('Mang_Type')),
            'p_category': row.get('Category') or None,
            'p_protect_class': iucn,
        }

        ok, err = insert_polygon(svc_key, payload)
        if ok:
            inserted += 1
            if inserted % LOG_EVERY == 0:
                elapsed = time.time() - started
                rate = inserted / elapsed if elapsed > 0 else 0
                print(f'  {inserted} inserted ({rate:.1f}/s, {skipped} skipped, {failed} failed)')
        else:
            failed += 1
            if failed <= 10:  # Don't spam on bulk failures
                print(f'  fail: {row["Unit_Nm"][:60]} ({external_id[:40]}…) — {err[:120]}')

    print()
    print('=== Done ===')
    print(f'Inserted: {inserted}')
    print(f'Skipped:  {skipped}')
    print(f'Failed:   {failed}')
    print(f'Elapsed:  {time.time() - started:.0f}s')


if __name__ == '__main__':
    main()
