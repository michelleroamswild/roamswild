#!/usr/bin/env python3
"""
Stage 2: Summarize each entry's raw `description` into a clean
`description_summary` using a local Ollama model.

The prompt is category-aware (camping / informal / water / showers /
laundromat) and locks the model down with strict rules accumulated from
prior debugging passes:

  - third person only — no "I", "we", "our"
  - location-facts only — no narrative-of-the-visit, no "the reviewer"
  - no AI filler ("This camping spot offers...", "in this area",
    "for those interested", "a great place to...")
  - no hedge meta language ("note that", "as mentioned")
  - no inventing details
  - terminology matches the category (laundromat ≠ "camping spot")

Post-pass: strips iOverlander / iOL references that sometimes appear in
the user-written original and bleed into the summary.

Resumable — entries that already have a description_summary are skipped.

Usage:
  python3 02_summarize_descriptions.py --input nation_filtered.json --output nation_filtered_summarized.json
  python3 02_summarize_descriptions.py --input nation_water.json --output nation_water_summarized.json
"""

import argparse
import json
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_INPUT = Path(__file__).parent / 'nation_filtered.json'
DEFAULT_OUTPUT = Path(__file__).parent / 'nation_filtered_summarized.json'

OLLAMA_URL = 'http://localhost:11434/api/generate'
MODEL = 'llama3.1:8b'
TIMEOUT_S = 60
MIN_DESC_LENGTH = 20  # below this, skip summarization, keep original

# --- Category-aware prompts ----------------------------------------------
# Category-aware leading line so the model can't confuse types.
PROMPT_HEADER = {
    'dispersed_camping': "This is a CAMPING SPOT in a public-land area.",
    'informal_camping':  "This is an INFORMAL OR STEALTH CAMPING SPOT (often a parking lot, city street, business lot, or rest area).",
    'water':             "This is a WATER SOURCE for travelers (potable or non-potable spigot, tap, or fill station).",
    'showers':           "This is a SHOWER FACILITY for travelers.",
    'laundromat':        "This is a LAUNDROMAT for travelers.",
}
# Source-data labels (older exports use Title Case)
LEGACY_CATEGORY = {
    'Wild Camping': 'dispersed_camping',
    'Informal Campsite': 'informal_camping',
    'Water': 'water',
    'Showers': 'showers',
    'Laundromat': 'laundromat',
}

# Category labels in the body of the prompt (e.g. "the laundromat")
CATEGORY_NOUN = {
    'dispersed_camping': 'camping spot',
    'informal_camping':  'informal camping spot',
    'water':             'water source',
    'showers':           'shower facility',
    'laundromat':        'laundromat',
}

PROMPT_TEMPLATE = (
    "{header}\n\n"
    "Write a short factual summary of THIS {noun}. The summary describes "
    "the LOCATION ITSELF — not the visit, not the visitor.\n\n"
    "Strict rules (must follow ALL):\n"
    "1. Third person only. NEVER use 'I', 'we', 'us', 'our', 'my', "
    "'mine', 'I've', 'we've'.\n"
    "2. NEVER refer to 'the reviewer', 'the visitor', 'the visit', "
    "'during their stay', or 'upon arrival'.\n"
    "3. NEVER invent details. Use only facts explicitly in the original.\n"
    "4. Do NOT call this a 'camping spot' if it is a {noun}. Match the "
    "terminology to the place type.\n"
    "5. NEVER use AI filler: 'in this area', 'in this spot', 'in this "
    "location', 'for those interested', 'for those who', 'making it ideal', "
    "'a great place', 'a perfect spot', 'a nice option'.\n"
    "6. NEVER add meta language: 'note that', 'as mentioned', 'as noted', "
    "'please note', 'it is described as'.\n"
    "7. Do NOT lead the sentence with 'This camping spot is', 'It is a', "
    "'A camping spot offers', 'The site is'. Open with a concrete fact.\n"
    "8. Drop reviewer commentary: 'nice', 'great', 'beautiful', 'amazing', "
    "ratings, exclamations.\n"
    "9. Aim for 30 words or fewer. Never exceed 50.\n"
    "10. Plain prose, one line, no bullets, no preamble like 'Here is...'.\n\n"
    "Original description:\n{description}\n\n"
    "Summary:"
)

# --- iOverlander cleanup -------------------------------------------------
SOURCE_REF_PHRASE = re.compile(
    r"\s*\b(?:on|via|from|in|saw on|found on|via the)\s+(?:i[\s\-]?overlander|iol)\b",
    re.IGNORECASE,
)
SOURCE_REF_WORD = re.compile(r"\bi[\s\-]?overlander\b|\biol\b", re.IGNORECASE)
WS_RE = re.compile(r'[ \t]{2,}')
PUNCT_FIX_RE = re.compile(r'\s+([.,!?])')


def post_clean(text: str) -> str:
    if not text:
        return text
    out = SOURCE_REF_PHRASE.sub('', text)
    out = SOURCE_REF_WORD.sub('', out)
    out = WS_RE.sub(' ', out)
    out = PUNCT_FIX_RE.sub(r'\1', out)
    return out.strip()


def category_key(raw: str) -> str:
    if not raw:
        return 'dispersed_camping'
    if raw in PROMPT_HEADER:
        return raw
    return LEGACY_CATEGORY.get(raw, 'dispersed_camping')


def build_prompt(category: str, description: str) -> str:
    cat = category_key(category)
    return PROMPT_TEMPLATE.format(
        header=PROMPT_HEADER[cat],
        noun=CATEGORY_NOUN[cat],
        description=description,
    )


def call_ollama(prompt: str) -> str:
    body = json.dumps({
        'model': MODEL,
        'prompt': prompt,
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
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', type=Path, default=DEFAULT_INPUT)
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    print(f'Loading entries from {args.input}...')
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
    summarized = skipped_short = errors = 0

    for i, spot in enumerate(spots):
        key = (spot['lat'], spot['lng'], spot.get('name_original', ''))
        if key in existing and 'description_summary' in existing[key]:
            out.append(existing[key])
            continue

        desc = (spot.get('description') or '').strip()
        result = dict(spot)

        if len(desc) < MIN_DESC_LENGTH:
            result['description_summary'] = post_clean(desc) or None
            skipped_short += 1
        else:
            try:
                raw_summary = call_ollama(build_prompt(spot.get('category', ''), desc))
                result['description_summary'] = post_clean(raw_summary)
                summarized += 1
            except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
                print(f'  [error on idx {i}]: {e}; keeping original')
                result['description_summary'] = post_clean(desc)
                errors += 1
        # Also clean source references from the raw description
        if desc:
            result['description'] = post_clean(desc)
        out.append(result)

        if (i + 1) % 10 == 0:
            args.output.write_text(json.dumps(out, indent=2, default=str))
            elapsed = time.time() - start
            rate = (i + 1) / elapsed if elapsed > 0 else 0
            remaining = (len(spots) - i - 1) / rate if rate > 0 else 0
            print(f'  [{i+1}/{len(spots)}] '
                  f'summarized={summarized} short={skipped_short} errors={errors} '
                  f'elapsed={elapsed:.0f}s eta={remaining:.0f}s')

    args.output.write_text(json.dumps(out, indent=2, default=str))
    elapsed = time.time() - start
    print()
    print(f'Done. Wrote {len(out)} entries to {args.output}')
    print(f'  Summarized: {summarized}')
    print(f'  Kept original (too short): {skipped_short}')
    print(f'  Errors (kept original):    {errors}')
    print(f'  Total time: {elapsed:.0f}s')


if __name__ == '__main__':
    main()
