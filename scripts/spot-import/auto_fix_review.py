#!/usr/bin/env python3
"""
Auto-fix the 679 entries flagged by Stage 22:
  - Title issues: regex-based fixes (no LLM)
  - Description issues: re-summarize with strict category-locked prompt
"""

import json
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent
PUBLIC = HERE.parent.parent / 'public' / 'test-data'

FILES = [
    'nation_filtered_clean.json',
    'nation_informal_clean.json',
    'nation_water_clean.json',
    'nation_showers_clean.json',
    'nation_laundromats_clean.json',
]

OLLAMA_URL = 'http://localhost:11434/api/generate'
MODEL = 'llama3.1:8b'
TIMEOUT_S = 30

# Anti-AI-filler prompts per category. Hard-rules out the patterns
# Stage 22 flagged.
PROMPT_TPL = (
    "Write a short factual summary of this {category_label}. The summary "
    "describes the LOCATION ITSELF — not the visit, not the visitor.\n\n"
    "STRICT RULES (must follow all):\n"
    '1. Do NOT start with "This camping spot", "This location", "It is a", '
    '"A camping spot", or "The site". Lead with concrete facts.\n'
    "2. NEVER use first person ('I', 'we', 'our', 'my').\n"
    "3. NEVER mention 'the reviewer', 'the visitor', or 'the visit'.\n"
    "4. NEVER use phrases like 'in this area', 'in this location', 'in this "
    "spot', 'for those interested', 'for those who', 'making it ideal', "
    "'a great place', 'a perfect spot'.\n"
    "5. NEVER add 'note that', 'as mentioned', 'as noted', 'please note'.\n"
    "6. Do NOT invent details (no 'appears to be', no fabricated amenities).\n"
    "7. Use ONLY information explicitly in the original.\n"
    "8. 30 words max. Plain prose. One line. No preamble.\n\n"
    "Original:\n{description}\n\n"
    "Summary:"
)

CATEGORY_LABELS = {
    'dispersed_camping': 'camping spot',
    'wild_camping': 'camping spot',
    'informal_camping': 'informal camping spot',
    'informal_campsite': 'informal camping spot',
    'water': 'water source',
    'Water': 'water source',
    'showers': 'shower facility',
    'Showers': 'shower facility',
    'laundromat': 'laundromat',
    'Laundromat': 'laundromat',
}

PLACEHOLDER_NAMES = re.compile(
    r'^(Unknown|Various|None|Other|Misc(ellaneous)?|N/A|TBD|Spot|Site|Location|Place)\s*$',
    re.IGNORECASE,
)
TRUNCATED_NAME = re.compile(
    r'(,$|—$|-$|\.\.+\s*$|\bbut\s*$|\band\s*$|\bbased\s*$|\bsince\s*$|\bin\s+the\s*$)'
)


def clean_title(name: str, fallback: str) -> str:
    """Apply lightweight regex fixes to a title."""
    if not name:
        return fallback or name
    s = name.strip()
    if PLACEHOLDER_NAMES.match(s):
        return (fallback or s).strip()
    if TRUNCATED_NAME.search(s):
        # Try to use fallback if it's cleaner
        if fallback and not TRUNCATED_NAME.search(fallback.strip()):
            return fallback.strip()
        # Otherwise trim trailing junk
        s = re.sub(r'[,\-—\.…]+\s*$', '', s).strip()
    # Title-case if leads with lowercase
    if s and s[0].islower():
        s = s[0].upper() + s[1:]
    # Trim leading prepositions like "In the middle of the pins" - these are
    # often user input, not real names. Leave as-is for now (would need LLM).
    return s


def call_ollama(category_label: str, description: str) -> str:
    body = json.dumps({
        'model': MODEL,
        'prompt': PROMPT_TPL.format(category_label=category_label, description=description),
        'stream': False,
        'options': {'temperature': 0.0, 'num_predict': 100},
    }).encode('utf-8')
    req = urllib.request.Request(
        OLLAMA_URL, data=body,
        headers={'Content-Type': 'application/json'},
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
        return json.loads(resp.read()).get('response', '').strip().splitlines()[0].strip()


def main():
    list_path = PUBLIC / 'review-list.json'
    flagged_keys = {f"{e['lat']:.5f},{e['lng']:.5f}" for e in json.loads(list_path.read_text())}
    print(f'Flagged: {len(flagged_keys)} entries')

    started = time.time()
    titles_fixed = 0
    descs_fixed = 0
    file_data = {}

    for fname in FILES:
        p = HERE / fname
        if not p.exists():
            continue
        with open(p) as f:
            rows = json.load(f)
        file_data[fname] = (p, rows)

    # Build flat list of (file, idx, row) for flagged
    targets = []
    for fname, (_p, rows) in file_data.items():
        for i, r in enumerate(rows):
            k = f'{round(r["lat"],5):.5f},{round(r["lng"],5):.5f}'
            if k in flagged_keys:
                targets.append((fname, i, r))
    print(f'Matched {len(targets)} of {len(flagged_keys)} flagged')

    for j, (fname, i, r) in enumerate(targets):
        # 1. Title cleanup (regex, no LLM)
        old_clean = r.get('name_clean')
        old_name = r.get('name')
        new_clean = clean_title(old_clean or '', old_name or '')
        if new_clean and new_clean != old_clean:
            r['name_clean'] = new_clean
            titles_fixed += 1

        # 2. Description rewrite (LLM)
        cat_label = CATEGORY_LABELS.get(r.get('category', ''), 'location')
        source = r.get('description') or r.get('description_summary')
        if source and len(str(source).strip()) > 10:
            try:
                new_summary = call_ollama(cat_label, str(source).strip())
                if new_summary:
                    r['description_summary'] = new_summary
                    descs_fixed += 1
            except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
                print(f'  [error] idx {i}: {e}')

        if (j + 1) % 25 == 0:
            for fname2, (p, rows) in file_data.items():
                p.write_text(json.dumps(rows, indent=2, default=str))
            elapsed = time.time() - started
            eta = elapsed / (j + 1) * (len(targets) - j - 1)
            print(f'  [{j+1}/{len(targets)}] titles={titles_fixed} descs={descs_fixed} eta={eta:.0f}s')

    for fname2, (p, rows) in file_data.items():
        p.write_text(json.dumps(rows, indent=2, default=str))
    elapsed = time.time() - started
    print(f'\nDone in {elapsed:.0f}s. Titles fixed: {titles_fixed}. Descriptions rewritten: {descs_fixed}')


if __name__ == '__main__':
    main()
