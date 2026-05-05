#!/usr/bin/env python3
"""
Re-summarize community spot descriptions that contain known-bad patterns.
Uses the same proven prompt structure as summarize_pending_descriptions.py:
category-locked header + 10 strict rules ("NEVER invent details. Use only
facts explicitly in the original.").

Targets rows where the description currently has:
  - placeholder text ("[insert location]", "[insert coordinates]", etc.)
  - narrative visit-recap voice ("upon arrival", "fully occupied",
    "decided to", "spent the night")
  - meta language ("is described as", "note that", "with a note")

Runs against PROD as the source of truth, dual-writes to dev. Resumable via
extra.description_resummarized_v1 marker.

Usage:
  # Default: dispersed_camping kind, dry-run preview
  python3 resummarize_descriptions_db.py
  # Apply for real
  python3 resummarize_descriptions_db.py --apply
  # Other kinds
  python3 resummarize_descriptions_db.py --kind informal_camping --apply
  python3 resummarize_descriptions_db.py --kind laundromat --apply
  python3 resummarize_descriptions_db.py --kind water --apply
"""
import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional, Tuple

ROOT = Path(__file__).resolve().parents[2]
ENV_PROD = ROOT / '.env.production'
ENV_DEV  = ROOT / '.env'

OLLAMA_URL = 'http://localhost:11434/api/generate'
MODEL      = 'llama3.1:8b'
TIMEOUT_S  = 60
MIN_DESC   = 20  # below this, skip LLM and just leave as-is


def read_env(path: Path, key: str) -> str:
    pat = re.compile(rf'^{re.escape(key)}\s*=\s*"?([^"\n]+)"?\s*$')
    for line in path.read_text().splitlines():
        m = pat.match(line)
        if m: return m.group(1).strip()
    sys.exit(f'Missing {key} in {path}')


PROD_URL = read_env(ENV_PROD, 'VITE_SUPABASE_URL')
PROD_KEY = read_env(ENV_PROD, 'SUPABASE_SERVICE_ROLE_KEY')
DEV_URL  = 'https://ioseedbzvogywztbtgjd.supabase.co'
DEV_KEY  = read_env(ENV_DEV,  'SUPABASE_SERVICE_ROLE_KEY')


def http(base: str, key: str, method: str, path: str, body=None, prefer: str = ''):
    headers = {'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'}
    if prefer:
        headers['Prefer'] = prefer
    data = json.dumps(body).encode('utf-8') if body is not None else None
    req = urllib.request.Request(f'{base}{path}', method=method, headers=headers, data=data)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            txt = resp.read().decode('utf-8')
            return resp.status, json.loads(txt) if txt.strip() else None
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8')[:200]


# ---- Prompt (verbatim from summarize_pending_descriptions.py) ----------

PROMPT_HEADER = {
    'dispersed_camping': "This is a CAMPING SPOT in a public-land area.",
    'informal_camping':  "This is an INFORMAL OR STEALTH CAMPING SPOT (often a parking lot, city street, business lot, or rest area).",
    'water':             "This is a WATER SOURCE for travelers (potable or non-potable spigot, tap, or fill station).",
    'shower':            "This is a SHOWER FACILITY for travelers.",
    'laundromat':        "This is a LAUNDROMAT for travelers.",
}
CATEGORY_NOUN = {
    'dispersed_camping': 'camping spot',
    'informal_camping':  'informal camping spot',
    'water':             'water source',
    'shower':            'shower facility',
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
    "6. NEVER add meta language. Forbidden phrases: 'note that', 'as "
    "mentioned', 'as noted', 'please note', 'is described as', 'is "
    "characterized as', 'is classified as', 'is rated as', 'is "
    "considered as'. Just state the fact directly.\n"
    "7. Do NOT lead the sentence with 'This camping spot is', 'It is a', "
    "'A camping spot offers', 'The site is'. Open with a concrete fact.\n"
    "8. Drop reviewer commentary: 'nice', 'great', 'beautiful', 'amazing', "
    "ratings, exclamations.\n"
    "9. Aim for 30 words or fewer. Never exceed 50.\n"
    "10. Plain prose, one line, no bullets, no preamble like 'Here is...'.\n\n"
    "Original description:\n{description}\n\n"
    "Summary:"
)


def build_prompt(kind: str, description: str) -> str:
    cat = kind if kind in PROMPT_HEADER else 'dispersed_camping'
    return PROMPT_TEMPLATE.format(
        header=PROMPT_HEADER[cat],
        noun=CATEGORY_NOUN[cat],
        description=description,
    )


def call_ollama(prompt: str) -> str:
    body = json.dumps({
        'model': MODEL, 'prompt': prompt, 'stream': False,
        'options': {'temperature': 0.0, 'num_predict': 100},
    }).encode('utf-8')
    req = urllib.request.Request(
        OLLAMA_URL, data=body,
        headers={'Content-Type': 'application/json'},
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
        # First line only — defends against the model emitting a multi-line
        # response with preamble even though we said not to.
        return json.loads(resp.read()).get('response', '').strip().splitlines()[0].strip()


# ---- Post-clean (verbatim from summarize_pending_descriptions.py) -----

WS_RE = re.compile(r'[ \t]{2,}')
PUNCT_FIX_RE = re.compile(r'\s+([.,!?])')

def post_clean(text: str) -> str:
    if not text:
        return text
    out = WS_RE.sub(' ', text)
    out = PUNCT_FIX_RE.sub(r'\1', out)
    return out.strip()


# ---- Issue detectors (the patterns we're trying to fix) ---------------

ISSUE_PATTERNS = {
    'placeholder': re.compile(
        r'\[(?:insert|enter|name|location|road|number|placeholder|tbd|coordinates|n\s?/\s?a)[^\]]*\]',
        re.IGNORECASE),
    'located_vague': re.compile(
        r'\blocated\s+(?:at|in|on|near|next to)\s+(?:an?\s+|the\s+)?(?:unspecified|generic|specific\s+site|nondescript|nameless)',
        re.IGNORECASE),
    'narrative': re.compile(
        r"\b(was full|were full|happen(?:ed)? to|ended up|decided to|upon arrival|"
        r"during (?:the|a) (?:stay|visit|trip)|was used as (?:an? )?alternative|"
        r"spent (?:the|one|a|two|several) night|"
        r"a (?:government|park|forest|usfs|blm|local) (?:employee|ranger|worker|official) (?:said|stated|reported|told))\b",
        re.IGNORECASE),
    'meta': re.compile(
        # Loosened from "it is described as" — model emits "X is described as Y"
        # ("the spot is described as quiet"). Also catch the synonyms the LLM
        # offers up when we strip "described as": characterized/classified/
        # rated/considered "as X".
        r'\bis (?:described|characterized|classified|rated|considered)\s+as\b|'
        r'\b(?:as mentioned|as noted|as stated)\b|'
        r'\bnote (?:that|:)\b|\bplease note\b',
        re.IGNORECASE),
    'reviewer': re.compile(
        r"\b(reviewer|the (?:visitor|reviewer)['’]s(?!\s+(?:center|centre|bureau|guide|"
        r"book|information|info|station|kiosk|lobby|building|map)))\b",
        re.IGNORECASE),
}


def issues_in(desc: str) -> list:
    return [name for name, pat in ISSUE_PATTERNS.items() if pat.search(desc or '')]


# ---- Hallucination guard -------------------------------------------------

# Specific tokens (road numbers, highways, GPS coords) — if the rewrite
# introduces these AND they're not in the original, it's a fabrication.
SPECIFIC_TOKEN_RE = re.compile(
    r'\b(?:'
    r'(?:FR|FS|NF|CR|SR|FSR)[\s\-]?\d+'
    r'|Highway\s+\d+|Hwy\s+\d+|US[\s\-]+\d+|I[\s\-]?\d{1,3}\b|Interstate\s+\d+'
    r'|Forest\s+(?:Service\s+)?Road\s+\d+'
    r'|\d+\.\d+°\s*[NSEW]'  # GPS coords like "37.123° N"
    r')\b',
    re.IGNORECASE,
)


def hallucinated_specifics(rewrite: str, original: str) -> list:
    """Return a list of specific tokens in rewrite that don't appear in original."""
    found = []
    raw_lower = (original or '').lower()
    for m in SPECIFIC_TOKEN_RE.finditer(rewrite or ''):
        tok = m.group(0)
        digits = re.search(r'\d+', tok)
        if not digits:
            continue
        d = digits.group(0)
        if not re.search(rf'\b{re.escape(d)}\b', raw_lower):
            found.append(tok)
    return found


# ---- DB ops -------------------------------------------------------------

def fetch_pending(kind: str, limit: int = 0, include_non_summarized: bool = False) -> list:
    """Rows of `kind` whose description has any of our issue patterns and
    that haven't been resummarized yet. By default scopes to ai_summarized=true
    rows (the post-2026 AI batch). Pass include_non_summarized=True to also
    cover the older community-import rows that don't have that flag."""
    out = []
    offset = 0
    PAGE = 200
    ai_filter = '' if include_non_summarized else "&extra->>ai_summarized=eq.true"
    while True:
        path = (
            '/rest/v1/spots'
            '?select=id,name,description,kind,extra'
            '&source=eq.community'
            f'&kind=eq.{kind}'
            f'{ai_filter}'
            "&or=(extra->>description_resummarized_v1.is.null,extra->>description_resummarized_v1.neq.true)"
            f'&order=id&offset={offset}&limit={PAGE}'
        )
        status, body = http(PROD_URL, PROD_KEY, 'GET', path)
        if status >= 400:
            sys.exit(f'fetch failed ({status}): {body}')
        page = body or []
        if not page: break
        # Filter to rows that actually have an issue
        out.extend([r for r in page if issues_in(r.get('description') or '')])
        offset += PAGE
        if limit and len(out) >= limit:
            return out[:limit]
        if len(page) < PAGE: break
    return out


def patch_row(spot_id: str, new_desc: str, extra: dict) -> Tuple[bool, Optional[str], Optional[str]]:
    new_extra = dict(extra)
    if 'description_original' not in new_extra:
        # Preserve original on first fix
        # (fetched separately to avoid races; passed via closure)
        pass
    new_extra['description_resummarized_v1'] = True
    payload = {'description': new_desc, 'extra': new_extra}
    p_status, p_body = http(PROD_URL, PROD_KEY, 'PATCH',
        f'/rest/v1/spots?id=eq.{spot_id}', body=payload, prefer='return=minimal')
    d_status, d_body = http(DEV_URL, DEV_KEY, 'PATCH',
        f'/rest/v1/spots?id=eq.{spot_id}', body=payload, prefer='return=minimal')
    p_err = str(p_body)[:200] if p_status >= 400 else None
    d_err = str(d_body)[:200] if d_status >= 400 else None
    return (p_err is None and d_err is None), p_err, d_err


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--kind', default='dispersed_camping',
                        choices=list(PROMPT_HEADER.keys()),
                        help='Which kind to scope to (default: dispersed_camping)')
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--limit', type=int, default=0)
    parser.add_argument('--include-non-summarized', action='store_true',
                        help='Also include rows without extra.ai_summarized=true (older import wave)')
    args = parser.parse_args()
    if not args.apply and not args.dry_run:
        # Default to dry-run for safety
        args.dry_run = True

    print(f'Scope: {args.kind}  (include_non_summarized={args.include_non_summarized})')
    rows = fetch_pending(args.kind, limit=args.limit,
                         include_non_summarized=args.include_non_summarized)
    print(f'  Found {len(rows)} rows with description issues.\n')

    rewritten = 0
    skipped = 0
    halluc = 0
    errors = 0
    started = time.time()

    for i, r in enumerate(rows):
        spot_id = r['id']
        name = r.get('name') or ''
        desc = r.get('description') or ''
        kind = r.get('kind') or args.kind
        extra = r.get('extra') or {}

        if len(desc) < MIN_DESC:
            skipped += 1
            continue

        prompt = build_prompt(kind, desc)
        try:
            raw = call_ollama(prompt)
        except Exception as e:
            print(f'  [ollama err {spot_id[:8]}]: {e}', flush=True)
            errors += 1
            continue

        cleaned = post_clean(raw)

        # Reject if the rewrite STILL has the same issues we wanted to fix
        new_issues = issues_in(cleaned)
        if new_issues:
            print(f'  [reject-still-bad {spot_id[:8]}] issues={new_issues} skipping', flush=True)
            skipped += 1
            continue

        # Hallucination guard: did the rewrite add a specific token (road #, GPS) that wasn't in original?
        invented = hallucinated_specifics(cleaned, desc)
        if invented:
            print(f'  [reject-hallucination {spot_id[:8]}] invented={invented}', flush=True)
            halluc += 1
            continue

        if cleaned == desc:
            skipped += 1
            continue

        if args.dry_run:
            issues_before = issues_in(desc)
            print(f'  [{i+1}/{len(rows)} {spot_id[:8]}] {name[:40]}  ({",".join(issues_before)})')
            print(f'    BEFORE: {desc[:160]}')
            print(f'    AFTER:  {cleaned[:160]}')
            print()
            rewritten += 1
            continue

        # Preserve original before patching
        new_extra = dict(extra)
        if 'description_original' not in new_extra:
            new_extra['description_original'] = desc
        new_extra['description_resummarized_v1'] = True
        payload = {'description': cleaned, 'extra': new_extra}
        p_status, p_body = http(PROD_URL, PROD_KEY, 'PATCH',
            f'/rest/v1/spots?id=eq.{spot_id}', body=payload, prefer='return=minimal')
        d_status, d_body = http(DEV_URL, DEV_KEY, 'PATCH',
            f'/rest/v1/spots?id=eq.{spot_id}', body=payload, prefer='return=minimal')
        if p_status >= 400 or d_status >= 400:
            errors += 1
            if p_status >= 400:
                print(f'  [prod err {spot_id[:8]}]: {p_body}', flush=True)
            if d_status >= 400:
                print(f'  [dev err  {spot_id[:8]}]: {d_body}', flush=True)
            continue
        rewritten += 1
        print(f'  [ok {i+1}/{len(rows)} {spot_id[:8]}] {name[:40]}', flush=True)

    elapsed = time.time() - started
    print()
    print(f'Done in {elapsed/60:.1f} min')
    print(f'  rewritten:        {rewritten}')
    print(f'  skipped:          {skipped}')
    print(f'  hallucination_rej {halluc}')
    print(f'  errors:           {errors}')


if __name__ == '__main__':
    main()
