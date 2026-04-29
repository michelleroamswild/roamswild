#!/usr/bin/env python3
"""Scan AI summaries for first-person voice that slipped through."""

import json
import re
from pathlib import Path

# Strong first-person signals — phrases that almost certainly indicate
# reviewer voice. We avoid bare "I" because of false positives ("I-5",
# "I-90" highways). Apostrophe is REQUIRED in contractions; otherwise
# "We'?ll" would match the word "well" and "We'?re" would match "were".
FP_RE = re.compile(
    r"\b("
    r"I[’']ve|I[’']m|I[’']d|I[’']ll|"
    r"We[’']ve|We[’']re|We[’']ll|We[’']d|"
    r"I had|I have|I was|I am|I went|I stayed|I parked|I camped|"
    r"I found|I saw|I think|I will|I would|I wouldn|I drove|I slept|"
    r"we had|we have|we stayed|we parked|we camped|we found|we went|"
    r"we saw|we drove|we slept|"
    r"my van|my rig|my camper|my truck|my car|my dog|"
    r"our van|our rig|our camper|our truck|our car|our dog"
    r")\b",
    re.IGNORECASE,
)

HERE = Path(__file__).parent
FILES = [
    'nation_filtered_clean.json',
    'nation_informal_clean.json',
    'nation_water_clean.json',
    'nation_showers_clean.json',
    'nation_laundromats_clean.json',
]


def main():
    total = 0
    fp_count = 0
    samples = []
    per_file = {}
    for fname in FILES:
        p = HERE / fname
        if not p.exists():
            continue
        with open(p) as f:
            rows = json.load(f)
        per_file[fname] = 0
        for r in rows:
            total += 1
            d = r.get('description_summary') or ''
            m = FP_RE.search(d)
            if m:
                fp_count += 1
                per_file[fname] += 1
                if len(samples) < 12:
                    samples.append((fname, r.get('name'), d[:240], m.group(0)))

    print(f'Total entries scanned: {total}')
    print(f'First-person summaries: {fp_count} ({100 * fp_count / total:.1f}%)')
    print()
    for fname, n in per_file.items():
        print(f'  {fname}: {n}')
    print()
    for fname, name, d, match in samples:
        short = fname.replace('.json', '').replace('nation_', '')
        print(f'• [{short}] {name}  — matched: "{match}"')
        print(f'  {d}')
        print()


if __name__ == '__main__':
    main()
