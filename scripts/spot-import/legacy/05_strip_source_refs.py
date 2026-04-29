#!/usr/bin/env python3
"""
Stage 5: Strip references to the source platform (iOverlander) from any
description-like field, and drop description_original entirely so the JSON
files match the new community_spots schema.

Run: python3 05_strip_source_refs.py
"""

import json
import re
from pathlib import Path

HERE = Path(__file__).parent
TARGETS = [
    # Nationwide outputs (current pipeline)
    'nation_filtered_tagged.json',
    'nation_informal_tagged.json',
    'nation_water.json',
    'nation_showers.json',
    'nation_laundromats.json',
]

# Match variants like "iOverlander", "I-Overlander", "ioverlander", "i overlander"
WORD_RE = re.compile(r'\bi[\s\-]?overlander\b', re.IGNORECASE)
# Common phrasings that read poorly after just removing the word
PHRASE_RE = re.compile(
    r'\s*\b(?:on|via|from|in|saw on|found on|via the)\s+i[\s\-]?overlander\b',
    re.IGNORECASE,
)
# Collapse runs of whitespace introduced by deletions
WS_RE = re.compile(r'[ \t]{2,}')

DESCRIPTION_FIELDS = ('description', 'description_summary')


def clean_text(text):
    if not text or not isinstance(text, str):
        return text
    out = PHRASE_RE.sub('', text)
    out = WORD_RE.sub('', out)
    out = WS_RE.sub(' ', out)
    # Tidy up dangling " ." or " ," or " !" introduced by phrase removal
    out = re.sub(r'\s+([.,!?])', r'\1', out)
    return out.strip()


def main():
    grand_total_changed = 0
    for fname in TARGETS:
        path = HERE / fname
        if not path.exists():
            print(f'  [skip] {fname} (not found)')
            continue
        with open(path) as f:
            entries = json.load(f)
        changed = 0
        for entry in entries:
            entry.pop('description_original', None)
            for field in DESCRIPTION_FIELDS:
                if field in entry and entry[field]:
                    cleaned = clean_text(entry[field])
                    if cleaned != entry[field]:
                        entry[field] = cleaned
                        changed += 1
        path.write_text(json.dumps(entries, indent=2, default=str))
        print(f'  {fname}: {changed} description fields cleaned, description_original dropped')
        grand_total_changed += changed
    print(f'\nTotal description edits: {grand_total_changed}')


if __name__ == '__main__':
    main()
