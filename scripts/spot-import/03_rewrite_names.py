#!/usr/bin/env python3
"""
Stage 3: Rewrite spot names using a local LLM. Strips reviewer commentary
('NICE', 'GREAT', 'OK', etc.), keeps the distinctive geographic identifier,
and appends a short managing-agency tag.

Format: "Place Name — Agency"
Examples:
  "Coral Pink Sand Dunes - OK" (BLM)         -> "Coral Pink Sand Dunes — BLM"
  "Smokey Mountain Rd - NICE" (BLM)          -> "Smokey Mountain Road — BLM"
  "BLM Free Camping West of Zion" (BLM)      -> "West of Zion — BLM"
  "Wild camping" (USFS, Dixie NF)            -> "Dixie National Forest Dispersed"

Resumable — writes after each entry, skips entries that already have a
name_clean field in the output file.

Run: python3 03_rewrite_names.py
     python3 03_rewrite_names.py --input utah_final.json --output utah_named.json
"""

import argparse
import json
import re
import time
from pathlib import Path
from typing import Optional

import urllib.request
import urllib.error

DEFAULT_INPUT = Path(__file__).parent / 'nation_filtered_summarized.json'
DEFAULT_OUTPUT = Path(__file__).parent / 'nation_filtered_named.json'

OLLAMA_URL = 'http://localhost:11434/api/generate'
MODEL = 'llama3.1:8b'
TIMEOUT_S = 60

PROMPT_TEMPLATE = """Rewrite this camping spot's name into a clean directory entry that reads like a real place name, not a user comment.

First, classify the original name:

A) REAL PLACE IDENTIFIER — a road name, road number (FR 263, Highway 89), canyon/creek/peak/lake name, established landmark, or recognized geographic descriptor (e.g. "West of Zion", "Valley of Gods").

B) USER COMMENTARY — a descriptive sentence/phrase that doesn't actually identify a place. Examples: "Before the road gets too rocky", "Beautiful views", "By the creek", "Quiet spot", "Camp on the moon", "Hidden gem", "Wild camping", "Free spot", "Spot", "Site".

If A: strip reviewer words (nice, great, ok, free, prefix "BLM"/"USFS") and keep the geographic identifier. Append " — Agency".

If B: scan the DESCRIPTION for a real place identifier and use that instead. In priority order, look for:
  1. A road/highway/forest-road number — like "FR 263", "FR-30", "Highway 89", "US 191"
  2. A canyon, creek, lake, peak, or wash name — like "Mineral Canyon", "Black's Fork"
  3. A nearby town or landmark — like "near Hanksville", "north of Moab"
  4. If none found in description, fall back to the public land unit — "Dixie NF Dispersed" or similar.

Then append " — Agency". Agency = BLM, USFS, NPS, or SITLA.

Output ONLY the new name on one line. Max 60 chars. No quotes, no preamble.

Examples:

Original: "Coral Pink Sand Dunes - OK"
Description: Free camping near the dunes.
→ Coral Pink Sand Dunes — BLM

Original: "Before the road gets too rocky"
Description: This is on FR 263 about 4 miles in. Spot is just before the road gets too rocky.
→ FR 263 — USFS

Original: "Camp on the moon"
Description: Lunar-like landscape near Hanksville. BLM dispersed.
→ Near Hanksville — BLM

Original: "Wild camping"
Description: Quiet spot in the trees.
Public land unit: Dixie National Forest
→ Dixie NF Dispersed — USFS

Original: "Quiet spot by the creek"
Description: Down FR 30, follow the wash to a clearing. Mineral Creek runs by.
→ Mineral Creek (FR 30) — USFS

Now rewrite this entry:

Original: "{name}"
Description: {description}
Public land unit: {unit}
Managing agency: {manager}

New name:"""


def call_ollama(prompt: str) -> str:
    body = json.dumps({
        'model': MODEL,
        'prompt': prompt,
        'stream': False,
        'options': {'temperature': 0.0, 'num_predict': 30},
    }).encode('utf-8')
    req = urllib.request.Request(
        OLLAMA_URL,
        data=body,
        headers={'Content-Type': 'application/json'},
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
        data = json.loads(resp.read())
    return data.get('response', '').strip().strip('"').strip("'").splitlines()[0].strip()


def short_agency(manager: Optional[str]) -> str:
    if not manager:
        return ''
    m = manager.upper()
    if 'BLM' in m:
        return 'BLM'
    if 'USFS' in m:
        return 'USFS'
    if 'NPS' in m:
        return 'NPS'
    if m in ('SLB', 'SITLA') or 'SCHOOL' in m:
        return 'SITLA'
    return manager  # leave as-is for niche agencies


# --- Title cleanup helpers (post-LLM) -----------------------------------
# When the model has no clear public-land context it sometimes emits verbose
# explanations as the "name". These regexes lop off the trailing junk.
NAME_SUFFIX_TRIM = [
    re.compile(r'\s*[—-]\s*Agency\b.*$', re.IGNORECASE),
    re.compile(r'\s*[—-]\s*unknown\b.*$', re.IGNORECASE),
    re.compile(r'\s*[—-]\s*N/A\b.*$', re.IGNORECASE),
    re.compile(r'\s*[—-]\s*not (?:specified|applicable|available).*$', re.IGNORECASE),
    re.compile(r'\s*\(UNK\)[^A-Za-z]*$', re.IGNORECASE),
]
# "X → Y" arrows are reasoning artifacts; keep just the part before the arrow.
ARROW_RE = re.compile(r'\s*→.*$')
# Acronyms / abbrevs that should stay UPPERCASE
PRESERVE_UPPER = {
    'BLM','USFS','NPS','FWS','SITLA','USFWS','BIA','DOD','MIL','NF','NM','NRA',
    'WMA','WSR','WSA','WA','SP','NP','RV','RVS','OHV','ATV','UTV','RD','DR',
    'I-5','I-10','I-15','I-25','I-35','I-40','I-70','I-75','I-80','I-90','I-94','I-95',
    'US','LDS','KOA','RM','ATM','CG','CCC','VRBO','CR','SR','HW','HWY',
}
ALLCAPS_TOKEN = re.compile(r'\b[A-Z]{3,}\b')

PLACEHOLDER_NAMES = re.compile(
    r'^(Unknown|Various|None|Other|Misc(ellaneous)?|N/A|TBD|Spot|Site|Location|Place)\s*$',
    re.IGNORECASE,
)
TRUNCATED_NAME = re.compile(
    r'(,$|—$|-$|\.\.+\s*$|\bbut\s*$|\band\s*$|\bbased\s*$|\bsince\s*$|\bin\s+the\s*$)'
)


def smart_titlecase_token(match):
    word = match.group(0)
    if word in PRESERVE_UPPER:
        return word
    return word.capitalize()


def post_clean_name(name: str, fallback: str = '') -> str:
    """Apply post-LLM cleanup. Falls back to the rules-normalized `name`
    when the LLM output is broken (truncated mid-sentence, placeholder)."""
    if not name:
        return fallback or name
    s = name.strip()
    s = ARROW_RE.sub('', s)
    for p in NAME_SUFFIX_TRIM:
        s = p.sub('', s)
    s = s.strip()

    # Discard placeholder outputs in favor of fallback
    if PLACEHOLDER_NAMES.match(s):
        return (fallback or s).strip()

    # If still truncated, prefer fallback when it's cleaner
    if TRUNCATED_NAME.search(s) and fallback and not TRUNCATED_NAME.search(fallback.strip()):
        s = fallback.strip()

    # Convert "@" to "at"
    s = s.replace(' @ ', ' at ').replace('@', ' at ')

    # ALL-CAPS tokens → Title Case (preserve acronyms)
    s = ALLCAPS_TOKEN.sub(smart_titlecase_token, s)

    # Capitalize lowercase lead char
    if s and s[0].islower():
        s = s[0].upper() + s[1:]

    # Collapse whitespace
    s = re.sub(r'\s+', ' ', s).strip()
    # Cap length
    if len(s) > 80:
        s = s[:80].rstrip()
    return s


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', type=Path, default=DEFAULT_INPUT)
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    print(f'Loading from {args.input}...')
    with open(args.input) as f:
        spots = json.load(f)
    print(f'  Loaded: {len(spots)} entries')

    existing = {}
    if args.output.exists():
        with open(args.output) as f:
            for entry in json.load(f):
                key = (entry['lat'], entry['lng'], entry.get('name_original', ''))
                existing[key] = entry
        print(f'  Resuming from existing output: {len(existing)} previously processed')

    out = []
    start = time.time()
    rewritten = 0
    errors = 0

    for i, spot in enumerate(spots):
        key = (spot['lat'], spot['lng'], spot.get('name_original', ''))
        if key in existing and 'name_clean' in existing[key]:
            out.append(existing[key])
            continue

        original = spot.get('name_original') or spot.get('name') or ''
        manager_short = short_agency(spot.get('public_land_manager'))
        # Prefer the original (more raw signal — road names, etc.) over the AI summary
        description = (spot.get('description_original')
                       or spot.get('description')
                       or spot.get('description_summary')
                       or '').strip()
        # Trim long descriptions so we don't waste tokens on reviewer fluff
        if len(description) > 600:
            description = description[:600] + '…'
        prompt = PROMPT_TEMPLATE.format(
            name=original,
            description=description or '(none)',
            manager=manager_short or 'unknown',
            unit=spot.get('public_land_unit') or 'unknown',
        )

        result = dict(spot)
        fallback = (spot.get('name') or '').strip() or original
        try:
            raw_new = call_ollama(prompt)
            cleaned = post_clean_name(raw_new or '', fallback=fallback)
            result['name_clean'] = cleaned or fallback
            rewritten += 1
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
            print(f'  [error on idx {i}]: {e}; keeping rules-normalized name')
            result['name_clean'] = post_clean_name(spot.get('name', original), fallback=fallback)
            errors += 1

        out.append(result)

        if (i + 1) % 10 == 0:
            args.output.write_text(json.dumps(out, indent=2, default=str))
            elapsed = time.time() - start
            rate = (i + 1) / elapsed if elapsed > 0 else 0
            remaining = (len(spots) - i - 1) / rate if rate > 0 else 0
            print(f'  [{i+1}/{len(spots)}] '
                  f'rewritten={rewritten} errors={errors} '
                  f'elapsed={elapsed:.0f}s eta={remaining:.0f}s')

    args.output.write_text(json.dumps(out, indent=2, default=str))
    elapsed = time.time() - start
    print()
    print(f'Done. Wrote {len(out)} entries to {args.output}')
    print(f'  Rewritten: {rewritten}')
    print(f'  Errors:    {errors}')
    print(f'  Total time: {elapsed:.0f}s')


if __name__ == '__main__':
    main()
