#!/usr/bin/env python3
"""
Stage 1b: Filter Water / Showers / Laundromat entries to Utah bbox and
normalize names. No public-land filter — these are travel utilities, often
at gas stations / RV parks / private property.

Outputs three files (one per category):
- utah_water.json
- utah_showers.json
- utah_laundromats.json

Run: python3 01b_filter_utilities.py
"""

import json
import re
from pathlib import Path

DESKTOP = Path('/Users/michelletaylor/Desktop/_Michelle Roams Wild/RoamsWild')
SPOTS_JSON = DESKTOP / 'wildcampingshowerswaterlaundry.json'
OUT_DIR = Path(__file__).parent

# Map source category -> output filename + category-default-name fallback
CATEGORIES = {
    'Water':      ('nation_water.json',       'Water source'),
    'Showers':    ('nation_showers.json',     'Showers'),
    'Laundromat': ('nation_laundromats.json', 'Laundromat'),
}


def normalize_name(raw: str, category_default: str) -> str:
    if not raw:
        return category_default
    s = re.sub(r'\s+', ' ', raw.strip())
    s = re.sub(r'[\s\-–—|•]+$', '', s)
    generic = {'water', 'showers', 'shower', 'laundromat', 'laundry', 'gas', 'fuel', 'spot'}
    if s.lower() in generic:
        return category_default
    if s.isupper() or s.islower():
        s = s.title()
    return s


def main():
    with open(SPOTS_JSON) as f:
        spots_raw = json.load(f)
    print(f'Total raw entries: {len(spots_raw)}')

    buckets: dict[str, list] = {cat: [] for cat in CATEGORIES}

    for s in spots_raw:
        cat = s.get('place_category', {}).get('name', '')
        if cat not in CATEGORIES:
            continue
        loc = s.get('location') or {}
        lat = loc.get('latitude')
        lng = loc.get('longitude')
        if lat is None or lng is None:
            continue

        out_filename, default_name = CATEGORIES[cat]
        buckets[cat].append({
            'name': normalize_name(s['name'], default_name),
            'name_original': s['name'],
            'lat': lat,
            'lng': lng,
            'category': cat,
            'description': s.get('description', ''),
            'date_verified': s.get('date_verified'),
        })

    for cat, entries in buckets.items():
        out_filename, _ = CATEGORIES[cat]
        out_path = OUT_DIR / out_filename
        out_path.write_text(json.dumps(entries, indent=2, default=str))
        print(f'  {cat}: {len(entries)} entries → {out_path.name}')


if __name__ == '__main__':
    main()
