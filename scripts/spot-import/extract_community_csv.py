#!/usr/bin/env python3
"""Extract community-category rows from the source CSV for the iotest
diff visualization. Output is a slim JSON the iotest page can fetch
client-side and cross-reference against DB community spots.

Each row keeps just the fields iotest needs to render + match:
  lat, lng, name, category, description (truncated)

Output: public/data/community_csv.json
"""
import csv
import json
import sys
from pathlib import Path

SRC = Path('/Users/michelletaylor/Desktop/_Michelle Roams Wild/RoamsWild/places20260503-15-5ie3bu.csv')
OUT = Path(__file__).resolve().parents[2] / 'public' / 'data' / 'community_csv.json'

# Bbox to scope the output. Default: Moab ~50mi radius (covers
# Canyonlands, Indian Creek, Castle Valley, Mill Canyon area). Setting
# to None emits the full nationwide ~10MB file; iotest can't parse that
# without stalling the main thread. Match this bbox to the diffBbox in
# src/pages/IoTest.tsx so the diff scope is consistent.
BBOX = {
    'min_lat': 37.85, 'max_lat': 39.30,
    'min_lng': -110.55, 'max_lng': -108.55,
}

# Categories the community import pipeline pulls in. Anything else (RV
# parks, etc.) is irrelevant for the "did community spots fall through?"
# question.
INCLUDED_CATEGORIES = {
    'Wild Camping',
    'Informal Campsite',
    'Water',
    'Showers',
    'Laundromat',
}

# Map CSV category → the kind it WOULD be imported as (per
# scripts/spot-import/migrate_community_to_spots.py KIND_MAP).
CATEGORY_TO_KIND = {
    'Wild Camping':       'dispersed_camping',
    'Informal Campsite':  'informal_camping',
    'Water':              'water',
    'Showers':            'shower',
    'Laundromat':         'laundromat',
}


def truncate(s: str, n: int = 280) -> str:
    if not s:
        return ''
    s = s.strip()
    return s[: n - 1] + '…' if len(s) > n else s


def main():
    if not SRC.exists():
        sys.exit(f'CSV not found: {SRC}')
    OUT.parent.mkdir(parents=True, exist_ok=True)

    rows = []
    seen_categories: dict[str, int] = {}
    with open(SRC, newline='') as f:
        reader = csv.DictReader(f)
        for r in reader:
            cat = r.get('Category', '').strip()
            if cat not in INCLUDED_CATEGORIES:
                continue
            try:
                lat = float(r['Latitude'])
                lng = float(r['Longitude'])
            except (KeyError, TypeError, ValueError):
                continue
            if BBOX and (
                lat < BBOX['min_lat'] or lat > BBOX['max_lat']
                or lng < BBOX['min_lng'] or lng > BBOX['max_lng']
            ):
                continue
            rows.append({
                'lat': round(lat, 6),
                'lng': round(lng, 6),
                'name': (r.get('Name') or '').strip() or None,
                'category': cat,
                'kind': CATEGORY_TO_KIND[cat],
                'description': truncate(r.get('Description') or ''),
            })
            seen_categories[cat] = seen_categories.get(cat, 0) + 1

    OUT.write_text(json.dumps(rows, separators=(',', ':')))
    print(f'Wrote {len(rows)} rows to {OUT}')
    for c, n in sorted(seen_categories.items(), key=lambda x: -x[1]):
        print(f'  {n:6} {c}')
    size_mb = OUT.stat().st_size / 1024 / 1024
    print(f'Output size: {size_mb:.2f} MB')


if __name__ == '__main__':
    main()
