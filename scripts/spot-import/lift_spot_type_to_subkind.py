#!/usr/bin/env python3
"""Migration: lift amenities.spot_type into sub_kind, then drop the
amenity key. See AMENITIES.md — `spot_type` was sub_kind data leaking
into the amenity bag.

Mapping (kind, spot_type) → sub_kind:

  dispersed_camping + 'Natural Setting' → 'wild'
  dispersed_camping + 'Roadside'        → 'pullout'
  dispersed_camping + 'Parking Lot'     → 'boondocking_lot'
  dispersed_camping + 'Walk-in Only'    → 'wild'
  informal_camping  + 'Roadside'        → 'roadside'      (no change)
  informal_camping  + 'Parking Lot'     → 'parking_lot'   (no change)
  informal_camping  + 'Natural Setting' → NULL            (mismatched)

In all cases the amenities.spot_type key is removed.

Default dry-run; pass --apply to commit.
"""
import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional

ENV_PATH = Path(__file__).resolve().parents[2] / '.env'
SUPABASE_URL = 'https://ioseedbzvogywztbtgjd.supabase.co'
PAGE_SIZE = 1000

SUBKIND_MAP = {
    ('dispersed_camping', 'Natural Setting'): 'wild',
    ('dispersed_camping', 'Roadside'):        'pullout',
    ('dispersed_camping', 'Parking Lot'):     'boondocking_lot',
    ('dispersed_camping', 'Walk-in Only'):    'wild',
    ('informal_camping',  'Roadside'):        'roadside',
    ('informal_camping',  'Parking Lot'):     'parking_lot',
    ('informal_camping',  'Natural Setting'): None,
    ('informal_camping',  'Walk-in Only'):    None,  # 2 rows, no informal walk-in vocab
}


def read_env(key: str) -> str:
    pat = re.compile(rf'^{re.escape(key)}\s*=\s*"?([^"\n]+)"?\s*$')
    for line in ENV_PATH.read_text().splitlines():
        m = pat.match(line)
        if m: return m.group(1).strip()
    sys.exit(f'Missing {key} in {ENV_PATH}')


def fetch_all(svc: str):
    """Yield rows where amenities.spot_type is set, paginated."""
    headers = {'apikey': svc, 'Authorization': f'Bearer {svc}'}
    offset = 0
    while True:
        url = (
            f'{SUPABASE_URL}/rest/v1/spots'
            f'?select=id,kind,sub_kind,amenities'
            f'&amenities->>spot_type=not.is.null'
            f'&order=id'
            f'&offset={offset}&limit={PAGE_SIZE}'
        )
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=120) as resp:
            page = json.loads(resp.read())
        if not page: return
        for r in page: yield r
        if len(page) < PAGE_SIZE: return
        offset += PAGE_SIZE


def patch_row(svc: str, row_id: str, new_subkind: Optional[str], new_amenities: dict) -> int:
    body = json.dumps({'sub_kind': new_subkind, 'amenities': new_amenities}).encode('utf-8')
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/spots?id=eq.{row_id}',
        data=body, method='PATCH',
        headers={
            'apikey': svc, 'Authorization': f'Bearer {svc}',
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.status


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--limit', type=int, default=None)
    args = parser.parse_args()

    svc = read_env('SUPABASE_SERVICE_ROLE_KEY')

    rows = list(fetch_all(svc))
    if args.limit:
        rows = rows[: args.limit]
    print(f'Found {len(rows)} rows with amenities.spot_type set')

    # Bucket by (kind, spot_type) to confirm the mapping covers everything
    import collections
    seen = collections.Counter()
    unmapped = collections.Counter()
    for r in rows:
        st = (r.get('amenities') or {}).get('spot_type')
        seen[(r['kind'], st)] += 1
        if (r['kind'], st) not in SUBKIND_MAP:
            unmapped[(r['kind'], st)] += 1
    print()
    print('Distribution:')
    for (k, st), c in seen.most_common():
        flag = ' [UNMAPPED]' if (k, st) in unmapped else ''
        target = SUBKIND_MAP.get((k, st), '???')
        print(f'  {k:22s} {st!r:24s} → {target!r:18s} {c} rows{flag}')

    if unmapped:
        print()
        print(f'WARNING: {sum(unmapped.values())} rows match no mapping rule. They will be skipped.')

    if not args.apply:
        print()
        print('Dry run only — re-run with --apply to write.')
        return

    print()
    print('Applying...')
    ok = err = skipped = 0
    for i, r in enumerate(rows):
        st = (r.get('amenities') or {}).get('spot_type')
        key = (r['kind'], st)
        if key not in SUBKIND_MAP:
            skipped += 1
            continue
        new_subkind = SUBKIND_MAP[key]
        new_amenities = dict(r.get('amenities') or {})
        new_amenities.pop('spot_type', None)
        try:
            status = patch_row(svc, r['id'], new_subkind, new_amenities)
            if status >= 400:
                err += 1
                print(f'  [{i+1}/{len(rows)}] HTTP {status}')
            else:
                ok += 1
        except urllib.error.HTTPError as e:
            err += 1
            print(f'  [{i+1}/{len(rows)}] HTTPError {e.code}: {e.read()[:200]}')
            sys.exit('Aborting on first failure')
        if (i + 1) % 100 == 0:
            print(f'  [{i+1}/{len(rows)}] ok={ok} skipped={skipped} err={err}')
    print()
    print(f'Done. ok={ok} skipped={skipped} err={err}')


if __name__ == '__main__':
    main()
