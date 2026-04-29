#!/usr/bin/env python3
"""
Find entries where the source-assigned category doesn't fit the raw
description. e.g. category='Showers' but description is purely about a
laundromat / water source / camping spot.
"""

import json
import re
from pathlib import Path

HERE = Path(__file__).parent
FILES = [
    ('nation_showers_clean.json',     'showers'),
    ('nation_water_clean.json',       'water'),
    ('nation_laundromats_clean.json', 'laundromat'),
]

# Term groups by expected category content
TERMS = {
    'laundromat': re.compile(r'(laundr|washer|washing|dryer|coin[- ]?op)', re.IGNORECASE),
    'shower':     re.compile(r'(shower|bathing|locker|tub)', re.IGNORECASE),
    'water':      re.compile(r'(water|spigot|tap|hose|fill[- ]?up|potable|fountain|\bdrink\b|\bH2O\b)', re.IGNORECASE),
}

CATEGORY_EXPECTS = {
    'showers':    'shower',
    'water':      'water',
    'laundromat': 'laundromat',
}


def main():
    flagged_per_cat = {}
    for fname, cat in FILES:
        p = HERE / fname
        if not p.exists():
            continue
        with open(p) as f:
            rows = json.load(f)
        expected = CATEGORY_EXPECTS[cat]
        flagged = []
        for r in rows:
            d = r.get('description') or ''
            if not d.strip():
                continue
            # has expected term?
            if TERMS[expected].search(d):
                continue
            # has any OTHER category's term — strong signal of misclassification?
            other_hits = []
            for other, regex in TERMS.items():
                if other == expected:
                    continue
                if regex.search(d):
                    other_hits.append(other)
            if other_hits:
                flagged.append((r, other_hits))
        flagged_per_cat[cat] = flagged
        print(f'{fname}: {len(rows)} entries, {len(flagged)} look misclassified')
        for r, others in flagged[:6]:
            print(f"  • {r.get('name')}  -> looks like: {','.join(others)}")
            print(f"    raw: {(r.get('description') or '')[:160]}")

    return flagged_per_cat


if __name__ == '__main__':
    main()
