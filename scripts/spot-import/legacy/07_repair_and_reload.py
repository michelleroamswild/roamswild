#!/usr/bin/env python3
"""
Recovery: Stage 5's inline regex was buggy (matched the letter 't' instead
of a tab character) and corrupted descriptions in the *_named.json files.
Stage 6's loader also failed to override INPUT_FILES so the DB still has
pre-AI data.

This script:
1. Takes name_clean from *_named.json (intact)
2. Takes description + description_summary from *_summarized.json (intact)
3. Strips iOverlander references with a CORRECT regex
4. Writes merged *_clean.json files
"""

import json
import re
from pathlib import Path

HERE = Path(__file__).parent

PAIRS = [
    ('nation_filtered_summarized.json', 'nation_filtered_named.json', 'nation_filtered_clean.json'),
    ('nation_informal_summarized.json', 'nation_informal_named.json', 'nation_informal_clean.json'),
]
# Utility files only have description_summary from Stage 2 — pass through with strip
UTILITY_FILES = [
    'nation_water_summarized.json',
    'nation_showers_summarized.json',
    'nation_laundromats_summarized.json',
]

# Correct regexes (Python source, no shell escaping)
WORD_RE = re.compile(r'\bi[\s\-]?overlander\b', re.IGNORECASE)
ABBREV_RE = re.compile(r'\biol\b', re.IGNORECASE)  # iOL abbreviation
PHRASE_RE = re.compile(
    r'\s*\b(?:on|via|from|in|saw on|found on|via the)\s+(?:i[\s\-]?overlander|iol)\b',
    re.IGNORECASE,
)
WS_RE = re.compile(r'[ \t]{2,}')  # collapses runs of spaces or tabs
PUNCT_FIX_RE = re.compile(r'\s+([.,!?])')


def clean_text(text):
    if not text or not isinstance(text, str):
        return text
    out = PHRASE_RE.sub('', text)
    out = WORD_RE.sub('', out)
    out = ABBREV_RE.sub('', out)
    out = WS_RE.sub(' ', out)
    out = PUNCT_FIX_RE.sub(r'\1', out)
    return out.strip()


def merge_camping(summarized_path: Path, named_path: Path, out_path: Path):
    with open(summarized_path) as f:
        summarized = json.load(f)
    with open(named_path) as f:
        named = json.load(f)

    # Build keyed lookup of named entries by (lat, lng, name_original)
    def key(e):
        return (e['lat'], e['lng'], e.get('name_original', ''))
    named_idx = {key(e): e for e in named}

    out = []
    descs_cleaned = 0
    for s in summarized:
        n = named_idx.get(key(s))
        merged = dict(s)  # start from summarized (clean descriptions)
        if n:
            # Pull the AI-cleaned name in
            merged['name_clean'] = n.get('name_clean')
        # Strip iOverlander/iOL from descriptions with the correct regex
        for fld in ('description', 'description_summary'):
            v = merged.get(fld)
            if isinstance(v, str) and v:
                cleaned = clean_text(v)
                if cleaned != v:
                    descs_cleaned += 1
                merged[fld] = cleaned or None
        out.append(merged)

    out_path.write_text(json.dumps(out, indent=2, default=str))
    print(f'  {out_path.name}: {len(out)} entries written, {descs_cleaned} description edits')


def clean_utility(in_path: Path, out_path: Path):
    with open(in_path) as f:
        rows = json.load(f)
    descs_cleaned = 0
    for r in rows:
        for fld in ('description', 'description_summary'):
            v = r.get(fld)
            if isinstance(v, str) and v:
                cleaned = clean_text(v)
                if cleaned != v:
                    descs_cleaned += 1
                r[fld] = cleaned or None
    out_path.write_text(json.dumps(rows, indent=2, default=str))
    print(f'  {out_path.name}: {len(rows)} entries written, {descs_cleaned} description edits')


def main():
    print('Merging summarized + named outputs and stripping iOverlander refs...')
    for s_name, n_name, out_name in PAIRS:
        merge_camping(HERE / s_name, HERE / n_name, HERE / out_name)
    for u in UTILITY_FILES:
        out_name = u.replace('_summarized.json', '_clean.json')
        clean_utility(HERE / u, HERE / out_name)
    print('\nDone — *_clean.json files ready for the loader.')


if __name__ == '__main__':
    main()
