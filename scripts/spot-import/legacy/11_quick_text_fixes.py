#!/usr/bin/env python3
"""
Light text fixes that don't require an LLM:
  - Strip awkward name suffixes ('— Agency', '— unknown', etc.)
  - Insert leading 0 in number fragments like 'Located.6 miles' -> 'Located 0.6 miles'
  - Spot-fix 'Bu Gunlock' -> 'By Gunlock'
"""

import json
import re
from pathlib import Path

HERE = Path(__file__).parent
FILES = [
    'nation_filtered_clean.json',
    'nation_informal_clean.json',
    'nation_water_clean.json',
    'nation_showers_clean.json',
    'nation_laundromats_clean.json',
]

# Bad name suffixes the model produced when public-land context was missing
SUFFIX_PATTERNS = [
    re.compile(r'\s*[—-]\s*Agency\s+(?:not applicable[^.]*|unknown).*$', re.IGNORECASE),
    re.compile(r'\s*[—-]\s*Agency\s*$', re.IGNORECASE),
    re.compile(r'\s*[—-]\s*unknown\s*$', re.IGNORECASE),
    re.compile(r'\s*[—-]\s*N/A\s*$', re.IGNORECASE),
]
# Insert leading "0" before bare-decimal fragments like "Located.6 miles"
LEADING_ZERO_RE = re.compile(r'\b([A-Za-z]+)(\.\d)')
# Manual one-off
TYPO_FIXES = [
    (re.compile(r'\bBu Gunlock\b'), 'By Gunlock'),
]


def fix_name(name):
    if not name:
        return name
    out = name
    for p in SUFFIX_PATTERNS:
        out = p.sub('', out)
    out = out.strip()
    return out


def fix_text(text):
    if not text or not isinstance(text, str):
        return text
    out = text
    out = LEADING_ZERO_RE.sub(lambda m: f'{m.group(1)} 0{m.group(2)}', out)
    for pattern, repl in TYPO_FIXES:
        out = pattern.sub(repl, out)
    return out


def main():
    grand = {'name': 0, 'desc': 0}
    for fname in FILES:
        p = HERE / fname
        if not p.exists():
            continue
        with open(p) as f:
            rows = json.load(f)
        per = {'name': 0, 'desc': 0}
        for r in rows:
            new_name = fix_name(r.get('name'))
            if new_name != r.get('name'):
                r['name'] = new_name
                per['name'] += 1
            for fld in ('description', 'description_summary'):
                v = r.get(fld)
                new_v = fix_text(v)
                if new_v != v:
                    r[fld] = new_v
                    per['desc'] += 1
        p.write_text(json.dumps(rows, indent=2, default=str))
        print(f'  {fname}: name fixes={per["name"]}, description fixes={per["desc"]}')
        grand['name'] += per['name']
        grand['desc'] += per['desc']
    print(f'\nTotal: {grand}')


if __name__ == '__main__':
    main()
