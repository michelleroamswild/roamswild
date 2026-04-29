#!/usr/bin/env python3
"""
Build a review list of entries that had their description_summary modified
by Stage 8 (first-person fixes) or Stage 9 (narrative fixes). Done by
diffing the current *_clean.json against the pre-fix *_summarized.json
output from Stage 2.

Output: public/test-data/review-list.json (array of {lat, lng}).
The iotest page reads this and filters markers when 'Review mode' is on.
"""

import json
from pathlib import Path

HERE = Path(__file__).parent
PROJECT_ROOT = HERE.parent.parent
OUT = PROJECT_ROOT / 'public' / 'test-data' / 'review-list.json'

# Pairs of (current clean file, pre-fix summarized file)
PAIRS = [
    ('nation_filtered_clean.json',     'nation_filtered_summarized.json'),
    ('nation_informal_clean.json',     'nation_informal_summarized.json'),
    ('nation_water_clean.json',        'nation_water_summarized.json'),
    ('nation_showers_clean.json',      'nation_showers_summarized.json'),
    ('nation_laundromats_clean.json',  'nation_laundromats_summarized.json'),
]


def key(e):
    return (round(e['lat'], 5), round(e['lng'], 5), e.get('name_original', ''))


def main():
    out_list = []
    for clean_name, summ_name in PAIRS:
        cp = HERE / clean_name
        sp = HERE / summ_name
        if not cp.exists() or not sp.exists():
            print(f'  [skip] {clean_name} or {summ_name} not found')
            continue
        with open(cp) as f:
            clean_rows = json.load(f)
        with open(sp) as f:
            summ_rows = json.load(f)
        summ_idx = {key(e): e for e in summ_rows}
        diffs = 0
        for r in clean_rows:
            prior = summ_idx.get(key(r))
            if not prior:
                continue
            if (r.get('description_summary') or '') != (prior.get('description_summary') or ''):
                out_list.append({
                    'lat': round(r['lat'], 5),
                    'lng': round(r['lng'], 5),
                })
                diffs += 1
        print(f'  {clean_name}: {diffs} entries changed since Stage 2')
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out_list, indent=2))
    print(f'\nWrote {len(out_list)} review entries to {OUT}')


if __name__ == '__main__':
    main()
