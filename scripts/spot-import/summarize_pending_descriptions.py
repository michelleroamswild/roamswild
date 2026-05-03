#!/usr/bin/env python3
"""Description summarizer for spots flagged extra.ai_review_pending=true.

Same prompt + post-processing rules as 02_summarize_descriptions.py
(category-aware header, strict-rules body, iOverlander/iOL regex
cleanup) — just reads from the live `spots` table instead of a JSON
file and writes back via PostgREST PATCH per row.

Resumable by design: each row's ai_review_pending flag is cleared on
successful write, so re-running picks up only the still-pending rows.

Default = dry run (prints the first N transformations, no DB writes).
Pass --apply to actually update.

Usage:
  # dry run (preview the first 10 transformations):
  python3 summarize_pending_descriptions.py
  # full run:
  python3 summarize_pending_descriptions.py --apply
  # limit for testing:
  python3 summarize_pending_descriptions.py --apply --limit 50
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional

# --- Config ---------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[2]
ENV_PATH = PROJECT_ROOT / '.env'

SUPABASE_URL = 'https://ioseedbzvogywztbtgjd.supabase.co'

OLLAMA_URL = 'http://localhost:11434/api/generate'
MODEL = 'llama3.1:8b'
TIMEOUT_S = 60
MIN_DESC_LENGTH = 20  # below this, skip LLM call, just post-clean and clear the flag

PAGE_SIZE = 1000

# DB kind → prompt category code (note: 'shower' singular → 'showers' plural)
KIND_TO_CATEGORY = {
    'dispersed_camping': 'dispersed_camping',
    'informal_camping':  'informal_camping',
    'water':             'water',
    'shower':            'showers',
    'laundromat':        'laundromat',
}

# Prompt pieces (verbatim from 02_summarize_descriptions.py) ---------------
PROMPT_HEADER = {
    'dispersed_camping': "This is a CAMPING SPOT in a public-land area.",
    'informal_camping':  "This is an INFORMAL OR STEALTH CAMPING SPOT (often a parking lot, city street, business lot, or rest area).",
    'water':             "This is a WATER SOURCE for travelers (potable or non-potable spigot, tap, or fill station).",
    'showers':           "This is a SHOWER FACILITY for travelers.",
    'laundromat':        "This is a LAUNDROMAT for travelers.",
}
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

# Post-process regexes (verbatim from 02) ---------------------------------
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


def build_prompt(category: str, description: str) -> str:
    cat = category if category in PROMPT_HEADER else 'dispersed_camping'
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


# --- Supabase IO ---------------------------------------------------------
def read_env(key: str) -> str:
    pat = re.compile(rf'^{re.escape(key)}\s*=\s*"?([^"\n]+)"?\s*$')
    if not ENV_PATH.exists():
        sys.exit(f'No .env at {ENV_PATH}')
    for line in ENV_PATH.read_text().splitlines():
        m = pat.match(line)
        if m:
            return m.group(1).strip()
    sys.exit(f'Missing {key} in {ENV_PATH}')


def fetch_pending(svc_key: str, page_size: int = PAGE_SIZE):
    """Yield rows where extra.ai_review_pending=true. Paginates."""
    headers = {'apikey': svc_key, 'Authorization': f'Bearer {svc_key}'}
    offset = 0
    while True:
        url = (
            f'{SUPABASE_URL}/rest/v1/spots'
            f'?select=id,kind,sub_kind,description,extra'
            f'&extra->>ai_review_pending=eq.true'
            f'&order=id'
            f'&offset={offset}&limit={page_size}'
        )
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=120) as resp:
            page = json.loads(resp.read())
        if not page:
            return
        for r in page:
            yield r
        if len(page) < page_size:
            return
        offset += page_size


def patch_row(svc_key: str, row_id: str, new_description: Optional[str], new_extra: dict) -> int:
    """PATCH a single spots row. Updates description + extra (which now omits
    ai_review_pending). Returns HTTP status."""
    body = json.dumps({
        'description': new_description,
        'extra': new_extra,
    }).encode('utf-8')
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/spots?id=eq.{row_id}',
        data=body,
        method='PATCH',
        headers={
            'apikey': svc_key,
            'Authorization': f'Bearer {svc_key}',
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.status


# --- Main ----------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true',
                        help='Actually PATCH the rows (default: dry run)')
    parser.add_argument('--limit', type=int, default=None,
                        help='Process at most N pending rows')
    parser.add_argument('--preview', type=int, default=10,
                        help='Print first N transformations in dry run (default 10)')
    args = parser.parse_args()

    svc_key = read_env('SUPABASE_SERVICE_ROLE_KEY')

    # Quick sanity ping to Ollama before starting the long loop
    try:
        ping = call_ollama('Reply with the single word OK.')
        print(f'Ollama ping: {ping[:80]!r}')
    except Exception as e:
        sys.exit(f'Ollama not reachable at {OLLAMA_URL}: {e}\n'
                 'Start it with `ollama serve` and `ollama pull llama3.1:8b`.')

    print()
    print(f'Fetching pending rows from {SUPABASE_URL}...')
    pending = list(fetch_pending(svc_key))
    if args.limit:
        pending = pending[: args.limit]
    print(f'  {len(pending)} rows with ai_review_pending=true (cap: {args.limit or "none"})')

    if not pending:
        print('Nothing to do.')
        return

    summarized = skipped_short = errors = patched = 0
    start = time.time()
    for i, row in enumerate(pending):
        row_id = row['id']
        kind = row.get('kind') or ''
        category = KIND_TO_CATEGORY.get(kind, 'dispersed_camping')
        raw = (row.get('description') or '').strip()
        extra = dict(row.get('extra') or {})

        # Build new description
        new_desc: Optional[str]
        if len(raw) < MIN_DESC_LENGTH:
            new_desc = post_clean(raw) or None
            skipped_short += 1
            label = 'short'
        else:
            try:
                summary = call_ollama(build_prompt(category, raw))
                new_desc = post_clean(summary) or None
                summarized += 1
                label = 'summarized'
            except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
                # Keep the post-cleaned raw so we still get iOverlander stripped,
                # but DON'T clear the flag — leave it for a re-run.
                print(f'  [error idx {i} id={row_id}]: {e}')
                errors += 1
                continue

        # Clear the pending flag from extra
        extra.pop('ai_review_pending', None)

        if args.preview and not args.apply and i < args.preview:
            print()
            print(f'--- Row {i + 1} (id={row_id}, {kind}, {label}) ---')
            print(f'BEFORE: {raw[:200]}')
            print(f'AFTER:  {new_desc!r}')

        if args.apply:
            try:
                status = patch_row(svc_key, row_id, new_desc, extra)
                if status >= 400:
                    print(f'  [{i + 1}/{len(pending)}] PATCH HTTP {status}')
                    errors += 1
                else:
                    patched += 1
            except urllib.error.HTTPError as e:
                print(f'  [{i + 1}/{len(pending)}] PATCH HTTPError {e.code}: {e.read()[:200]}')
                errors += 1
                # Stop on first DB write failure to avoid hammering Supabase
                print('Aborting on first PATCH failure.')
                break

        if (i + 1) % 25 == 0:
            elapsed = time.time() - start
            rate = (i + 1) / elapsed if elapsed > 0 else 0
            remaining = (len(pending) - i - 1) / rate if rate > 0 else 0
            print(f'  [{i + 1}/{len(pending)}] '
                  f'summarized={summarized} short={skipped_short} '
                  f'patched={patched} errors={errors} '
                  f'rate={rate:.1f}/s eta={int(remaining)}s')

    elapsed = time.time() - start
    print()
    print('=== Done ===')
    print(f'  Summarized via LLM:        {summarized}')
    print(f'  Skipped short (post-clean): {skipped_short}')
    print(f'  Patched in DB:             {patched}')
    print(f'  Errors:                    {errors}')
    print(f'  Total time:                {elapsed:.0f}s ({elapsed / 60:.1f} min)')

    if not args.apply:
        print()
        print('Dry run only — re-run with --apply to write.')


if __name__ == '__main__':
    main()
