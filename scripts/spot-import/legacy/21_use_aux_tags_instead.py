#!/usr/bin/env python3
"""
Revert the showers_laundry category back to the original (showers /
laundromat). Instead, add an `extra_tags.also` array indicating the
secondary category. This way filtering by either category surfaces
the combined entries.

  showers entry that's also a laundromat:
      category='showers', extra_tags={'also': ['laundromat']}
  laundromat entry that's also a shower:
      category='laundromat', extra_tags={'also': ['showers']}
"""

import json
import re
from pathlib import Path

HERE = Path(__file__).parent
LAUNDRY = re.compile(r'(laundr|washer|washing|dryer|coin[- ]?op)', re.IGNORECASE)
SHOWER = re.compile(r'(shower|bath|locker)', re.IGNORECASE)

# Map filename -> original primary category + the secondary it adds for combined entries
FILE_CONFIG = {
    'nation_showers_clean.json':     ('showers',    'laundromat'),
    'nation_laundromats_clean.json': ('laundromat', 'showers'),
}


def main():
    total_set = 0
    total_reverted = 0
    for fname, (primary, secondary) in FILE_CONFIG.items():
        p = HERE / fname
        with open(p) as f:
            rows = json.load(f)
        for r in rows:
            text = ' '.join(filter(None, [r.get('name'), r.get('name_original'), r.get('description')]))
            is_combined = bool(LAUNDRY.search(text)) and bool(SHOWER.search(text))
            # Revert any rows we set to showers_laundry
            if r.get('category') == 'showers_laundry':
                r['category'] = primary
                total_reverted += 1
            # Apply aux tag
            if is_combined:
                tags = r.get('extra_tags') or {}
                if not isinstance(tags, dict):
                    tags = {}
                also = list(tags.get('also') or [])
                if secondary not in also:
                    also.append(secondary)
                    tags['also'] = also
                    r['extra_tags'] = tags
                    total_set += 1
        p.write_text(json.dumps(rows, indent=2, default=str))
        print(f'  {fname}: processed (primary={primary}, also={secondary})')
    print(f'\nReverted {total_reverted} from showers_laundry')
    print(f'Set extra_tags.also on {total_set} combined entries')


if __name__ == '__main__':
    main()
