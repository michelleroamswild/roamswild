#!/usr/bin/env python3
"""
Re-categorize all entries in the showers and laundromat files whose name
or description mentions BOTH shower-related AND laundry-related terms.
Applies the new category 'showers_laundry'.
"""

import json
import re
from pathlib import Path

HERE = Path(__file__).parent
LAUNDRY = re.compile(r'(laundr|washer|washing|dryer|coin[- ]?op)', re.IGNORECASE)
SHOWER = re.compile(r'(shower|bath|locker)', re.IGNORECASE)
NEW_CATEGORY = 'showers_laundry'
TARGET_FILES = (
    'nation_showers_clean.json',
    'nation_laundromats_clean.json',
)


def main():
    total = 0
    for fname in TARGET_FILES:
        p = HERE / fname
        with open(p) as f:
            rows = json.load(f)
        moved = 0
        for r in rows:
            text = ' '.join(filter(None, [r.get('name'), r.get('name_original'), r.get('description')]))
            if LAUNDRY.search(text) and SHOWER.search(text):
                if r.get('category') != NEW_CATEGORY:
                    r['category'] = NEW_CATEGORY
                    moved += 1
        p.write_text(json.dumps(rows, indent=2, default=str))
        print(f'  {fname}: re-categorized {moved} -> {NEW_CATEGORY}')
        total += moved
    print(f'Total: {total}')


if __name__ == '__main__':
    main()
