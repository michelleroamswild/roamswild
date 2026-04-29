#!/usr/bin/env python3
"""
Stage 4: Match the CSV export against the AI-named camping JSON and attach
the four extra tags requested: Water, Big rig friendly, Tent friendly,
Toilets.

Matches on (lat, lng) rounded to 5 decimals (~1m). CSV and JSON both come
from the same source, so coords align after rounding.

Run: python3 04_attach_csv_tags.py
"""

import argparse
import csv
import json
import math
from pathlib import Path

CSV_PATH = Path('/Users/michelletaylor/Desktop/_Michelle Roams Wild/RoamsWild/wildcampingshowerswaterlaundry.csv')
DEFAULT_INPUT = Path(__file__).parent / 'nation_named.json'
DEFAULT_OUTPUT = Path(__file__).parent / 'nation_named_tagged.json'

# CSV column -> output JSON field. Keys here are persisted as DB columns
# in community_spots and read by the unified amenity-display code in iotest.
TAG_COLUMNS = {
    'Water': 'water',
    'Big rig friendly': 'big_rig_friendly',
    'Tent friendly': 'tent_friendly',
    'Toilets': 'toilets',
    'Spot type': 'spot_type',
    # Phase 2 — additions for the unified tag set
    'Pet friendly': 'pet_friendly',
    'Wifi': 'wifi',
    'Electricity': 'electricity',
    'Showers': 'showers_amenity',           # the in-spot amenity (separate from the Showers category)
    'Sanitation dump station': 'dump_station',
    'Water potability': 'water_potability',
    'Road surface': 'road_surface',
    'Surroundings': 'surroundings',         # terrain hint
}

# Fallback nearest-neighbor radius (meters) for entries that don't match
# exactly. Float-precision drift between the JSON and CSV exports puts most
# truly-same spots within fractions of a meter; 10m is generous.
NEAREST_RADIUS_M = 10.0


def normalize_yes_no(raw: str):
    """Map 'Yes'/'No'/empty → bool/None. Leaves other text values alone."""
    if raw is None:
        return None
    s = raw.strip()
    if not s:
        return None
    low = s.lower()
    if low in ('yes',):
        return True
    if low in ('no',):
        return False
    return s  # e.g. 'Pit Toilets', 'Flush Toilets', 'Yes - Slow'


def coord_key(lat, lng) -> str:
    return f'{round(float(lat), 5)},{round(float(lng), 5)}'


def haversine_m(lat1, lng1, lat2, lng2) -> float:
    R = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def tile_key(lat, lng) -> tuple:
    """0.001° grid (~111m) for cheap bucketed nearest-neighbor."""
    return (round(float(lat) * 1000), round(float(lng) * 1000))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', type=Path, default=DEFAULT_INPUT)
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    INPUT = args.input
    OUTPUT = args.output

    print(f'Reading CSV: {CSV_PATH}')
    csv_index = {}
    csv_tile_index: dict = {}
    with open(CSV_PATH) as f:
        for row in csv.DictReader(f):
            try:
                lat = float(row['Latitude'])
                lng = float(row['Longitude'])
            except (ValueError, KeyError):
                continue
            csv_index[coord_key(lat, lng)] = (lat, lng, row)
            csv_tile_index.setdefault(tile_key(lat, lng), []).append((lat, lng, row))
    print(f'  CSV rows indexed: {len(csv_index)}')

    print(f'\nReading JSON: {INPUT}')
    with open(INPUT) as f:
        spots = json.load(f)
    print(f'  JSON entries: {len(spots)}')

    matched_exact = 0
    matched_nearest = 0
    no_match = 0
    tags_filled = {field: 0 for field in TAG_COLUMNS.values()}

    for spot in spots:
        lat, lng = spot['lat'], spot['lng']
        key = coord_key(lat, lng)
        row = None
        if key in csv_index:
            _, _, row = csv_index[key]
            matched_exact += 1
        else:
            # Fallback: scan a 3x3 tile neighborhood for nearest within radius
            tx, ty = tile_key(lat, lng)
            best = None
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    for clat, clng, crow in csv_tile_index.get((tx + dx, ty + dy), []):
                        d = haversine_m(lat, lng, clat, clng)
                        if d <= NEAREST_RADIUS_M and (best is None or d < best[0]):
                            best = (d, crow)
            if best:
                row = best[1]
                matched_nearest += 1

        if row is None:
            no_match += 1
            for field in TAG_COLUMNS.values():
                spot[field] = None
            continue

        for csv_col, json_field in TAG_COLUMNS.items():
            value = normalize_yes_no(row.get(csv_col, ''))
            # Map placeholder 'Unknown' to None across the board.
            if isinstance(value, str) and value.strip().lower() == 'unknown':
                value = None
            spot[json_field] = value
            if value is not None:
                tags_filled[json_field] += 1

    OUTPUT.write_text(json.dumps(spots, indent=2, default=str))

    print(f'\n=== Results ===')
    print(f'  Matched exactly:           {matched_exact}')
    print(f'  Matched within {NEAREST_RADIUS_M:.0f}m: {matched_nearest}')
    print(f'  No CSV match:              {no_match}')
    print(f'  Tag coverage (non-null):')
    for field, count in tags_filled.items():
        pct = 100 * count / len(spots) if spots else 0
        print(f'    {field}: {count} ({pct:.1f}%)')
    print(f'\n  Wrote: {OUTPUT}')


if __name__ == '__main__':
    main()
