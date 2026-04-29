#!/usr/bin/env python3
"""
Normalize names across all clean.json files:
  - "HOT SHOWER @ Railroad Pass" -> "Hot Shower at Railroad Pass"
  - Convert ALL-CAPS sequences (>=3 letters) to Title Case
  - Replace "@" with "at"
  - Collapse extra whitespace
Operates on both `name` and `name_clean` so the loader picks up cleaned values.
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

# Words that should stay UPPERCASE even after the conversion
PRESERVE_UPPER = {
    'BLM','USFS','NPS','FWS','SITLA','USFWS','BIA','DOD','MIL','NF','NM','NRA',
    'WMA','WSR','WSA','WA','SP','NP','RV','RVS','OHV','ATV','UTV','UT','AZ','CA','CO',
    'NV','NM','TX','OK','OR','WA','ID','MT','WY','SD','ND','NE','KS','MN','IA','MO',
    'AR','LA','MS','AL','GA','FL','SC','NC','TN','KY','VA','WV','MD','DE','PA','NJ',
    'NY','CT','MA','RI','VT','NH','ME','MI','OH','IN','IL','WI','HI','AK','DC',
    'I-5','I-10','I-15','I-25','I-35','I-40','I-70','I-75','I-80','I-90','I-94','I-95',
    'US','U.S.','LTE','5G','4G','LDS','KOA','RM','ATM','CG','CCC','VRBO','BIA',
    'CG','TH','FR','FS','CR','SR','HW','HWY','RD','DR',
}
ALLCAPS_TOKEN = re.compile(r'\b[A-Z]{3,}\b')
SHOUTY_RUN = re.compile(r'\b[A-Z][A-Z\s\-\.\']{4,}[A-Z]\b')  # multi-word ALL CAPS


def smart_titlecase(token: str) -> str:
    """Title-case a token unless it's a preserved acronym."""
    if token in PRESERVE_UPPER:
        return token
    return token.capitalize()


def fix_token(match):
    word = match.group(0)
    return smart_titlecase(word)


def normalize_name(name):
    if not name:
        return name
    s = name
    s = s.replace(' @ ', ' at ').replace('@', ' at ')
    # Convert ALL CAPS tokens (3+ letters) to Title Case unless preserved
    s = ALLCAPS_TOKEN.sub(fix_token, s)
    # Collapse whitespace
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def main():
    grand = {'name': 0, 'name_clean': 0}
    for fname in FILES:
        p = HERE / fname
        if not p.exists():
            continue
        with open(p) as f:
            rows = json.load(f)
        per = {'name': 0, 'name_clean': 0}
        for r in rows:
            for fld in ('name', 'name_clean'):
                old = r.get(fld)
                if not old:
                    continue
                new = normalize_name(old)
                if new != old:
                    r[fld] = new
                    per[fld] += 1
        p.write_text(json.dumps(rows, indent=2, default=str))
        print(f'  {fname}: name={per["name"]}, name_clean={per["name_clean"]}')
        grand['name'] += per['name']
        grand['name_clean'] += per['name_clean']
    print(f'\nTotal: {grand}')


if __name__ == '__main__':
    main()
