#!/usr/bin/env python3
"""
Apply review backup decisions for combined laundromat+shower entries:
- Take flagged keys from the user's backup file
- Set category='showers_laundry' for those entries in the local clean.json files
- Print a summary so we can confirm before reloading.
"""

import argparse
import json
from pathlib import Path

HERE = Path(__file__).parent
FILES = [
    'nation_filtered_clean.json',
    'nation_informal_clean.json',
    'nation_water_clean.json',
    'nation_showers_clean.json',
    'nation_laundromats_clean.json',
]
NEW_CATEGORY = 'showers_laundry'


def round_key(lat, lng):
    return f'{round(float(lat), 5):.5f},{round(float(lng), 5):.5f}'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--backup', required=True)
    args = parser.parse_args()

    with open(args.backup) as f:
        backup = json.load(f)
    flagged = {round_key(*k.split(',')) for k in backup.get('flagged') or []}
    print(f'Flagged entries to re-categorize: {len(flagged)}')

    moved_per_file = {}
    not_found = set(flagged)
    for fname in FILES:
        p = HERE / fname
        if not p.exists():
            continue
        with open(p) as f:
            rows = json.load(f)
        moved = 0
        for r in rows:
            k = round_key(r['lat'], r['lng'])
            if k in flagged:
                if r.get('category') != NEW_CATEGORY:
                    r['_old_category'] = r.get('category')
                    r['category'] = NEW_CATEGORY
                    moved += 1
                not_found.discard(k)
        if moved:
            p.write_text(json.dumps(rows, indent=2, default=str))
        moved_per_file[fname] = moved
        print(f'  {fname}: moved {moved} -> {NEW_CATEGORY}')

    if not_found:
        print(f'\n[warn] {len(not_found)} flagged keys not found in any file:')
        for k in sorted(not_found):
            print(f'  {k}')


if __name__ == '__main__':
    main()
