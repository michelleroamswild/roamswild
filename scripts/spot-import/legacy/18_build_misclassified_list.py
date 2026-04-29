#!/usr/bin/env python3
"""Generate the misclassified-list.json from the same detector as Stage 17."""

import json
import re
from pathlib import Path

HERE = Path(__file__).parent
PUBLIC = HERE.parent.parent / 'public' / 'test-data'

FILES = [
    ('nation_showers_clean.json',     'showers'),
    ('nation_water_clean.json',       'water'),
    ('nation_laundromats_clean.json', 'laundromat'),
]
TERMS = {
    'laundromat': re.compile(r'(laundr|washer|washing|dryer|coin[- ]?op)', re.IGNORECASE),
    'shower':     re.compile(r'(shower|bathing|locker|tub)', re.IGNORECASE),
    'water':      re.compile(r'(water|spigot|tap|hose|fill[- ]?up|potable|fountain|\bdrink\b|\bH2O\b)', re.IGNORECASE),
}
CATEGORY_EXPECTS = {'showers': 'shower', 'water': 'water', 'laundromat': 'laundromat'}


def main():
    out = []
    for fname, cat in FILES:
        p = HERE / fname
        if not p.exists():
            continue
        with open(p) as f:
            rows = json.load(f)
        expected = CATEGORY_EXPECTS[cat]
        for r in rows:
            d = r.get('description') or ''
            if not d.strip():
                continue
            if TERMS[expected].search(d):
                continue
            other_hits = [o for o, rx in TERMS.items() if o != expected and rx.search(d)]
            if other_hits:
                out.append({'lat': r['lat'], 'lng': r['lng']})
    PUBLIC.mkdir(parents=True, exist_ok=True)
    out_path = PUBLIC / 'misclassified-list.json'
    out_path.write_text(json.dumps(out, indent=2))
    print(f'Wrote {len(out)} entries to {out_path}')


if __name__ == '__main__':
    main()
