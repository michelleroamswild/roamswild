#!/usr/bin/env python3
"""
Stage 6 (optional, runs before the loader): Extract derived tags from the
raw user-written description into structured fields:
  - cell_service: dict of provider -> bars (0-5) or null. Special key
    'none' indicates no cell service.
  - vehicle_required: 'passenger' | 'high_clearance' | '4wd' | None

These fields are written into the *_clean.json files so the loader picks
them up.

Run: python3 06_extract_description_tags.py
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

# --- Cell service patterns ----------------------------------------------
# Provider aliases -> normalized key
PROVIDERS = {
    'verizon': 'verizon',
    'vzw':     'verizon',
    'at&t':    'att',
    'att':     'att',
    'a t and t': 'att',
    't-mobile': 'tmobile',
    't mobile': 'tmobile',
    'tmobile':  'tmobile',
    'tmo':      'tmobile',
    'sprint':   'sprint',
    'us cellular': 'us_cellular',
    'us cell':  'us_cellular',
}
PROVIDER_PAT = '(?:' + '|'.join(re.escape(k) for k in sorted(PROVIDERS, key=len, reverse=True)) + ')'

# 1) "Verizon 3 bars", "Verizon: 3 bars", "Verizon (3 bars)"
RX_PROVIDER_BARS = re.compile(
    rf'\b({PROVIDER_PAT})\b[\s:\(\[]*?(?:has\s+)?(\d)\s*(?:-\s*\d+)?\s*bars?',
    re.IGNORECASE,
)
# 2) "3 bars Verizon", "3 bars of Verizon LTE"
RX_BARS_PROVIDER = re.compile(
    rf'\b(\d)\s*(?:-\s*\d+)?\s*bars?\s*(?:of\s+)?(?:LTE|5G|4G|signal\s+(?:on|with)\s+)?\b({PROVIDER_PAT})\b',
    re.IGNORECASE,
)
# 3) "good Verizon signal", "strong AT&T", "full bars Verizon"
RX_QUAL_PROVIDER = re.compile(
    rf'\b(good|great|strong|full|excellent|reliable|decent)\s+({PROVIDER_PAT})\b',
    re.IGNORECASE,
)
# 4) "no cell", "no signal", "no service", "no reception"
RX_NO_CELL = re.compile(
    r'\b(?:no|none|zero)\s+(?:cell\s+(?:service|signal|reception|coverage)|cellular|signal|service|reception|coverage)\b',
    re.IGNORECASE,
)

# --- Vehicle clearance patterns -----------------------------------------
# 4WD / 4x4 mentioned (positive)
RX_NEEDS_4WD = re.compile(
    r'\b(?:need|needs|requires?|required|necessary|recommend(?:ed)?|essential|must (?:have|use)|will need)'
    r'\s+(?:a\s+)?(?:4[\s\-]?wheel[\s\-]?drive|4wd|4x4|four[\s\-]?wheel[\s\-]?drive)\b',
    re.IGNORECASE,
)
# High clearance needed
RX_NEEDS_HC = re.compile(
    r'\b(?:need|needs|requires?|required|necessary|recommend(?:ed)?|essential|must (?:have|use)|will need)'
    r'\s+(?:a\s+|some\s+)?high[\s\-]?clearance\b'
    r'|\bhigh[\s\-]?clearance\s+(?:needed|required|recommend(?:ed)?|necessary|a must|essential)\b',
    re.IGNORECASE,
)
# Passenger / 2WD ok
RX_PASSENGER_OK = re.compile(
    r'\b(?:passenger\s+(?:car|vehicle|sedan|cars)|2[\s\-]?wd|two[\s\-]?wheel[\s\-]?drive)'
    r'\s+(?:ok|fine|accessible|works|can\s+(?:make|drive|get)|made\s+it|will\s+make|drive[ds]?|navigable|got\s+(?:there|here))'
    r'|\b(?:any\s+(?:vehicle|car))\s+(?:ok|works|can|will\s+make|fine)?'
    r'|\baccessible\s+(?:by|in)\s+(?:any\s+vehicle|passenger|2wd|sedan)'
    r'|\bno\s+(?:4wd|4x4|high[\s\-]?clearance)\s+(?:needed|required|necessary)',
    re.IGNORECASE,
)
# Negative-need patterns: "doesn't need 4WD" → passenger ok
RX_NO_4WD_NEEDED = re.compile(
    r'\b(?:no|don\'?t|doesn\'?t|did not|didn\'?t|do not|do\s+not)\s+'
    r'(?:need|require[ds]?)\s+(?:a\s+)?(?:4[\s\-]?wd|4x4|four[\s\-]?wheel|high[\s\-]?clearance)',
    re.IGNORECASE,
)
# Just mentions 4wd/HC presence (less confident than "need")
RX_PLAIN_4WD = re.compile(r'\b(4[\s\-]?wd|4x4)\b', re.IGNORECASE)
RX_PLAIN_HC = re.compile(r'\bhigh[\s\-]?clearance\b', re.IGNORECASE)


def extract_cell_service(text: str):
    """Returns dict like {'verizon': 4, 'att': 0} or {'none': True} or None."""
    if not text:
        return None
    out: dict = {}

    for m in RX_PROVIDER_BARS.finditer(text):
        prov = PROVIDERS.get(m.group(1).lower())
        bars = int(m.group(2))
        if prov:
            out[prov] = max(out.get(prov, -1), min(5, bars))
    for m in RX_BARS_PROVIDER.finditer(text):
        bars = int(m.group(1))
        prov = PROVIDERS.get(m.group(2).lower())
        if prov:
            out[prov] = max(out.get(prov, -1), min(5, bars))
    for m in RX_QUAL_PROVIDER.finditer(text):
        prov = PROVIDERS.get(m.group(2).lower())
        # qualitative -> approximate bars (good=4)
        if prov and prov not in out:
            out[prov] = 4

    if not out and RX_NO_CELL.search(text):
        return {'none': True}
    return out or None


def extract_vehicle_required(text: str) -> str:
    """Returns 'passenger', 'high_clearance', '4wd', or None."""
    if not text:
        return None
    # Negative-needs first (overrides positive mentions)
    if RX_NO_4WD_NEEDED.search(text):
        return 'passenger'
    if RX_PASSENGER_OK.search(text):
        return 'passenger'
    if RX_NEEDS_4WD.search(text):
        return '4wd'
    if RX_NEEDS_HC.search(text):
        return 'high_clearance'
    # Plain mentions are ambiguous — only flag as 4wd if 4wd is mentioned
    # without a "passenger" override (caught above).
    if RX_PLAIN_4WD.search(text):
        return '4wd'
    if RX_PLAIN_HC.search(text):
        return 'high_clearance'
    return None


def main():
    grand = {'cell': 0, 'cell_none': 0, 'vehicle': 0}
    for fname in FILES:
        p = HERE / fname
        if not p.exists():
            continue
        with open(p) as f:
            rows = json.load(f)
        cell_n = vehicle_n = cell_none_n = 0
        for r in rows:
            raw = r.get('description') or r.get('description_summary') or ''
            cell = extract_cell_service(raw)
            if cell:
                r['cell_service'] = cell
                cell_n += 1
                if cell.get('none'):
                    cell_none_n += 1
            else:
                r['cell_service'] = None
            veh = extract_vehicle_required(raw)
            if veh:
                r['vehicle_required'] = veh
                vehicle_n += 1
            else:
                r['vehicle_required'] = None
        p.write_text(json.dumps(rows, indent=2, default=str))
        print(f'  {fname}: cell={cell_n} (none={cell_none_n}), vehicle={vehicle_n} of {len(rows)}')
        grand['cell'] += cell_n
        grand['cell_none'] += cell_none_n
        grand['vehicle'] += vehicle_n
    print(f'\nTotal: {grand}')


if __name__ == '__main__':
    main()
