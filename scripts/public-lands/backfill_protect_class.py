#!/usr/bin/env python3
"""Backfill public_lands.protect_class for already-imported pad_us rows.

Reads the local PAD-US 4.0 GeoDatabase, mirrors import_padus.py's
external_id derivation (OBJECTID when available, content-hash fallback
over Unit_Nm + Mang_Name + Mang_Type + Des_Tp + centroid), and calls
the backfill_public_lands_protect_class RPC in chunks of N updates.

Idempotent: re-runs are cheap because the RPC only updates rows whose
protect_class differs from the supplied value. Non-matching external_
ids are silent no-ops, so it's safe to send rows the original import
filtered out.

Usage:
    python3 backfill_protect_class.py            # full run, all states
    python3 backfill_protect_class.py --state UT # filter by State_Nm
    python3 backfill_protect_class.py --dry-run  # count, no DB writes
"""
import argparse
import hashlib
import json
import os
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

import geopandas as gpd

PROJECT_ROOT = Path(__file__).resolve().parents[2]
ENV_PATH = PROJECT_ROOT / '.env'

DESKTOP = Path('/Users/michelletaylor/Desktop/_Michelle Roams Wild/RoamsWild')
PADUS_GDB = DESKTOP / 'PADUS4_0Geodatabase' / 'PADUS4_0_Geodatabase.gdb'
PADUS_LAYER = 'PADUS4_0Combined_Proclamation_Marine_Fee_Designation_Easement'

SUPABASE_URL = 'https://ioseedbzvogywztbtgjd.supabase.co'

CHUNK_SIZE = 500


def load_env():
    if not ENV_PATH.exists():
        return
    for line in ENV_PATH.read_text().splitlines():
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def normalise_iucn(value):
    """PAD-US uses 'N/A' / NaN for unclassified — collapse to None."""
    if value is None:
        return None
    if isinstance(value, float) and value != value:  # NaN
        return None
    s = str(value).strip()
    if not s or s.upper() in {'N/A', 'NA'}:
        return None
    return s


def http_post(url, headers, body, timeout=60):
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode('utf-8'),
        headers={**headers, 'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode('utf-8')
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--state', type=str, default=None,
                        help='filter to one State_Nm code (UT, CO, ...)')
    parser.add_argument('--dry-run', action='store_true',
                        help='print stats only, do not call the backfill RPC')
    parser.add_argument('--chunk', type=int, default=CHUNK_SIZE,
                        help=f'updates per RPC call (default {CHUNK_SIZE})')
    args = parser.parse_args()

    load_env()
    svc_key = os.environ.get('VITE_SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    if not svc_key and not args.dry_run:
        sys.exit('VITE_SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE_KEY) missing from .env')

    if not PADUS_GDB.exists():
        sys.exit(f'PAD-US GeoDatabase not found at {PADUS_GDB}')

    print(f'Loading PAD-US Combined layer from {PADUS_GDB.name}...')
    # Match the columns import_padus.py reads so the content hash is
    # computed over identical inputs. Geometry is needed for the centroid
    # component of the hash. We deliberately DON'T pass fid_as_index here:
    # the original import never received OBJECTID either, so every row
    # in the DB uses the padus4_h_<md5> hash form, never padus4_<int>.
    # Loading FIDs would tempt us to take the int branch and miss every
    # row.
    columns = ['IUCN_Cat', 'State_Nm', 'Unit_Nm', 'Mang_Name', 'Mang_Type', 'Des_Tp']
    padus = gpd.read_file(PADUS_GDB, layer=PADUS_LAYER, columns=columns)
    print(f'  Loaded {len(padus)} rows')

    # Match import_padus.py's CRS handling so centroid coordinates feed
    # into the hash in the same EPSG:4326 frame.
    if padus.crs is None or padus.crs.to_epsg() != 4326:
        print(f'  Reprojecting from {padus.crs} → EPSG:4326...')
        padus = padus.to_crs('EPSG:4326')

    if args.state:
        padus = padus[padus['State_Nm'].fillna('').str.upper().str.contains(args.state.upper())]
        print(f'  After --state {args.state}: {len(padus)}')

    updates = []
    skipped_no_iucn = 0
    skipped_no_geom = 0
    for _, row in padus.iterrows():
        iucn = normalise_iucn(row.get('IUCN_Cat'))
        if iucn is None:
            skipped_no_iucn += 1
            continue

        geom = row.geometry
        if geom is None or geom.is_empty:
            skipped_no_geom += 1
            continue

        # external_id matches import_padus.py's hash fallback exactly.
        # See note above on why we always take this branch (DB rows are
        # uniformly the hash form).
        content = '|'.join([
            str(row.get('Unit_Nm') or ''),
            str(row.get('Mang_Name') or ''),
            str(row.get('Mang_Type') or ''),
            str(row.get('Des_Tp') or ''),
            f'{geom.centroid.x:.5f},{geom.centroid.y:.5f}',
        ])
        external_id = 'padus4_h_' + hashlib.md5(content.encode()).hexdigest()[:16]

        updates.append({
            'external_id': external_id,
            'protect_class': iucn,
        })

    print(f'  Update candidates: {len(updates)}')
    print(f'  Skipped no-IUCN:  {skipped_no_iucn}')
    print(f'  Skipped no-geom:  {skipped_no_geom}')

    if args.dry_run:
        print()
        print('=== Dry run summary ===')
        # IUCN class distribution for sanity
        from collections import Counter
        cls_counts = Counter(u['protect_class'] for u in updates)
        for cls, n in sorted(cls_counts.items(), key=lambda x: -x[1]):
            print(f'  IUCN {cls}: {n}')
        return

    print()
    print(f'=== Backfilling {len(updates)} rows in chunks of {args.chunk} ===')

    headers = {
        'apikey': svc_key,
        'Authorization': f'Bearer {svc_key}',
    }
    url = f'{SUPABASE_URL}/rest/v1/rpc/backfill_public_lands_protect_class'

    started = time.time()
    total_updated = 0
    chunks_sent = 0
    failed_chunks = 0
    for i in range(0, len(updates), args.chunk):
        chunk = updates[i : i + args.chunk]
        status, body = http_post(url, headers, {'p_updates': chunk})
        if status >= 400:
            failed_chunks += 1
            if failed_chunks <= 5:
                print(f'  fail @ offset {i}: HTTP {status} — {body[:200]}')
            continue
        try:
            n = int(body.strip())
        except ValueError:
            n = 0
        total_updated += n
        chunks_sent += 1
        if chunks_sent % 5 == 0 or i + args.chunk >= len(updates):
            elapsed = time.time() - started
            rate = chunks_sent / elapsed if elapsed > 0 else 0
            print(f'  chunks={chunks_sent}/{(len(updates) + args.chunk - 1) // args.chunk}, '
                  f'rows_updated={total_updated}, rate={rate:.1f} chunks/s')

    print()
    print(f'Done. Sent {chunks_sent} chunks, {total_updated} rows updated, {failed_chunks} chunks failed.')


if __name__ == '__main__':
    main()
