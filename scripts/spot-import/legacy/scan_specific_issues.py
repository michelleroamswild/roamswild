#!/usr/bin/env python3
"""Find the specific issues the user noticed in the review:
1. Names containing 'Agency'
2. Descriptions with prompt-leak content ('original name is...', 'I'll rewrite', etc.)
3. Shower entries that say 'laundromat is not mentioned'
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

AGENCY_NAME_RE = re.compile(r'\bagency\b', re.IGNORECASE)
PROMPT_LEAK_RE = re.compile(
    r"(?:original (?:name|description) is(?: classified)?|"
    r"I'?ll (?:rewrite|focus|assume|correct)|"
    r"I will (?:assume|rewrite|focus|correct)|"
    r"here(?:'?s| is) (?:the |a )?(?:rewritten|new|corrected) (?:summary|name|description)|"
    r"since (?:.*?)not mentioned|"
    r"a laundromat is not mentioned|"
    r"a (?:water source|shower) is not mentioned)",
    re.IGNORECASE,
)
SHOWER_LAUNDRY_RE = re.compile(r'laundromat (?:is not|isn\'?t)', re.IGNORECASE)


def main():
    issues = {'agency_name': [], 'prompt_leak': [], 'shower_says_laundry': []}
    for fname in FILES:
        p = HERE / fname
        if not p.exists():
            continue
        short = fname.replace('nation_', '').replace('_clean.json', '')
        with open(p) as f:
            rows = json.load(f)
        for r in rows:
            nm = r.get('name', '') or ''
            d = r.get('description_summary') or r.get('description') or ''
            if AGENCY_NAME_RE.search(nm):
                issues['agency_name'].append((short, nm, d[:140]))
            if PROMPT_LEAK_RE.search(d):
                issues['prompt_leak'].append((short, nm, d[:200]))
            if 'showers' in fname and SHOWER_LAUNDRY_RE.search(d):
                issues['shower_says_laundry'].append((short, nm, d[:200]))

    for k, v in issues.items():
        print(f'\n=== {k}: {len(v)} ===')
        for src, nm, d in v[:8]:
            print(f'  • [{src}] {nm}')
            print(f'    {d}')


if __name__ == '__main__':
    main()
