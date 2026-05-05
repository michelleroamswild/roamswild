#!/usr/bin/env python3
"""
Scan AI-summarized descriptions on prod for weird/AI-sounding patterns.

Source: spots table on prod where source='community' AND
extra.ai_summarized = true (the post-AI-rewrite batch awaiting review).

Reuses the pattern set from scan_weird_entries.py except `fabricated_specific`
(which needs the raw original description; not preserved in the DB row).

Outputs:
  - Stdout: pattern counts + a few samples per pattern
  - public/test-data/review-list.json: lat/lng keys of flagged rows so the
    /iotest page surfaces them under the "review-list" filter.

Usage:
  python3 scripts/spot-import/scan_weird_db.py            # dry: report only
  python3 scripts/spot-import/scan_weird_db.py --write    # also write the
                                                          # review-list.json
  python3 scripts/spot-import/scan_weird_db.py --samples 6
"""
import argparse
import json
import os
import re
import sys
import urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / 'public' / 'test-data'

# Use the prod-pointed env (we're inspecting production data)
ENV = ROOT / '.env.production'

PAGE_SIZE = 1000


def read_env(key: str) -> str:
    pat = re.compile(rf'^{re.escape(key)}\s*=\s*"?([^"\n]+)"?\s*$')
    for line in ENV.read_text().splitlines():
        m = pat.match(line)
        if m: return m.group(1).strip()
    sys.exit(f'Missing {key} in {ENV}')


def fetch_all_summarized() -> list:
    base = read_env('VITE_SUPABASE_URL')
    key  = read_env('SUPABASE_SERVICE_ROLE_KEY')
    out  = []
    offset = 0
    while True:
        url = (
            f'{base}/rest/v1/spots'
            f'?select=id,name,description,latitude,longitude'
            f'&source=eq.community'
            f'&extra->>ai_summarized=eq.true'
            f'&order=id'
            f'&offset={offset}&limit={PAGE_SIZE}'
        )
        req = urllib.request.Request(url,
            headers={'apikey': key, 'Authorization': f'Bearer {key}'})
        with urllib.request.urlopen(req, timeout=120) as r:
            page = json.loads(r.read())
        if not page: break
        out.extend(page)
        offset += PAGE_SIZE
        print(f'  fetched {len(out)}…', flush=True)
        if len(page) < PAGE_SIZE: break
    return out


# --- Title detectors (verbatim from scan_weird_entries.py) ---
TITLE_PATTERNS = {
    'too_long':         lambda t: len(t) > 50,
    'truncated':        lambda t: bool(re.search(r'(,$|—$|-$|\.\.\.|\bbut\s*$|\band\s*$|\bbased\s*$|\bsince\s*$|\bin\s+the\s*$)', t.strip())),
    'AI_explanation':   lambda t: bool(re.search(r'\b(not specified|not applicable|not available|N/A|based on|since (?:the|it|this)|appears to be|because (?:the|it))\b', t, re.IGNORECASE)),
    'placeholder':      lambda t: bool(re.match(r'^(Unknown|Various|None|Other|Misc(ellaneous)?|N/A|TBD|Spot|Site|Location|Place)\s*$', t.strip(), re.IGNORECASE)),
    'lowercase_lead':   lambda t: bool(t) and t[0].islower(),
    'lead_preposition': lambda t: bool(re.match(r'^(off|on|in|at|near|by|behind|next to|across|along|under|past)\s+the\b', t, re.IGNORECASE)),
}

# --- Description detectors (verbatim minus fabricated_specific) ---
FIRST_PERSON_RE = re.compile(
    r"\b(I[’']ve|I[’']m|I[’']d|I[’']ll|We[’']ve|We[’']re|We[’']ll|We[’']d|"
    r"I had|I have|I was|I am|I went|I stayed|I parked|I camped|I found|I saw|"
    r"we had|we have|we stayed|we parked|we camped|we found|we went|we saw|"
    r"my van|my rig|my camper|my truck|my car|"
    r"our van|our rig|our camper|our truck|our car)\b",
    re.IGNORECASE,
)
PROMPT_LEAK_RE = re.compile(
    r"(?:I'?ll (?:rewrite|focus|assume|correct)|I will (?:assume|rewrite|focus|correct)|"
    r"here(?:'?s| is) (?:the |a )?(?:rewritten|new|corrected) (?:summary|name|description)|"
    r"(?:a|an) (?:laundromat|water source|shower|camping spot) is not mentioned|"
    r"original (?:name|description) is)",
    re.IGNORECASE,
)
HEDGE_RE = re.compile(r'\b(appears? to be|seems? to be|may be|might be|reportedly|probably|likely|allegedly)\b', re.IGNORECASE)
AI_FILLER_RE = re.compile(
    r'\b(?:for those (?:interested|willing|comfortable|prepared|seeking)|'
    r'making (?:it|this) (?:an? |the )?(?:ideal|perfect|great) (?:place|spot|location|destination)|'
    r'a (?:great|perfect|nice|good) (?:option|choice|place|destination|spot for)|'
    r'in this (?:area|location|spot|setting|region)|'
    r'this (?:camping spot|location|place) (?:offers|provides|features|is))\b',
    re.IGNORECASE,
)
META_RE = re.compile(r'\b(it is described as|as mentioned|as noted|as stated|note (?:that|:)|please note)\b', re.IGNORECASE)
NARRATIVE_RE = re.compile(
    r"\b(was full|were full|happen(?:ed)? to|ended up|decided to|"
    r"upon arrival|during (?:the|a) (?:stay|visit|trip)|"
    r"was used as (?:an? )?alternative|spent (?:the|one|a|two|several) night|"
    r"a (?:government|park|forest|usfs|blm|local) (?:employee|ranger|worker|official) (?:said|stated|reported|told))\b",
    re.IGNORECASE,
)
REVIEWER_RE = re.compile(r"\b(reviewer|the visitor's|the reviewer's)\b", re.IGNORECASE)
LEADING_ZERO_RE = re.compile(r'\b[A-Za-z]+\.\d')
PLACEHOLDER_RE = re.compile(
    r'\[(?:insert|enter|name|location|road|number|placeholder|tbd|n\s?/\s?a)[^\]]*\]'
    r'|\[\s*(?:insert|enter|name|location|placeholder|tbd|n/a)\s*\]',
    re.IGNORECASE,
)
LOCATED_AT_VAGUE_RE = re.compile(
    r'^\s*located\s+(?:at|in|near|on|next to)\s+(?:an?\s+|the\s+)?'
    r'(?:unspecified|unknown|undisclosed|undefined|unnamed|generic|certain|'
    r'specific|nondescript|nameless)',
    re.IGNORECASE,
)

DESC_PATTERNS = {
    'first_person':         lambda d: bool(FIRST_PERSON_RE.search(d)),
    'reviewer_mention':     lambda d: bool(REVIEWER_RE.search(d)),
    'prompt_leak':          lambda d: bool(PROMPT_LEAK_RE.search(d)),
    'placeholder_text':     lambda d: bool(PLACEHOLDER_RE.search(d)),
    'located_at_vague':     lambda d: bool(LOCATED_AT_VAGUE_RE.search(d)),
    'hedge_phrase':         lambda d: bool(HEDGE_RE.search(d)),
    'AI_filler':            lambda d: bool(AI_FILLER_RE.search(d)),
    'meta_language':        lambda d: bool(META_RE.search(d)),
    'narrative_visit':      lambda d: bool(NARRATIVE_RE.search(d)),
    'too_short':            lambda d: 0 < len(d.strip()) < 15,
    'shouty_caps':          lambda d: len(d) >= 25 and (sum(1 for c in d if c.isalpha() and c.isupper()) / max(1, sum(1 for c in d if c.isalpha()))) > 0.30,
    'missing_leading_zero': lambda d: bool(LEADING_ZERO_RE.search(d)),
}

HIGH_CONF_TITLE = {'truncated', 'placeholder', 'lowercase_lead', 'lead_preposition'}
HIGH_CONF_DESC  = {'first_person', 'reviewer_mention', 'prompt_leak',
                   'placeholder_text', 'located_at_vague',
                   'AI_filler', 'meta_language', 'narrative_visit',
                   'too_short', 'shouty_caps', 'missing_leading_zero'}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--samples', type=int, default=4)
    parser.add_argument('--write', action='store_true',
                        help='Write public/test-data/review-list.json')
    args = parser.parse_args()

    print('Fetching all ai_summarized community spots from prod...', flush=True)
    rows = fetch_all_summarized()
    print(f'Got {len(rows)} rows.\n')

    counts  = Counter()
    samples = {k: [] for k in (*TITLE_PATTERNS, *DESC_PATTERNS)}
    flagged_keys = set()
    flagged_ids  = set()

    for r in rows:
        name = (r.get('name') or '').strip()
        desc = (r.get('description') or '').strip()
        try:
            lat = float(r['latitude'])
            lng = float(r['longitude'])
        except (TypeError, ValueError):
            continue
        row_key = f'{round(lat,5):.5f},{round(lng,5):.5f}'

        for t, check in TITLE_PATTERNS.items():
            if name and check(name):
                counts[f'title:{t}'] += 1
                if len(samples[t]) < args.samples:
                    samples[t].append(('TITLE', name, desc[:160]))
                if t in HIGH_CONF_TITLE:
                    flagged_keys.add(row_key); flagged_ids.add(r['id'])

        for t, check in DESC_PATTERNS.items():
            if desc and check(desc):
                counts[f'desc:{t}'] += 1
                if len(samples[t]) < args.samples:
                    samples[t].append(('DESC', name, desc[:200]))
                if t in HIGH_CONF_DESC:
                    flagged_keys.add(row_key); flagged_ids.add(r['id'])

    total = len(rows)
    print(f'Scanned: {total}')
    print(f'Flagged (high-confidence): {len(flagged_ids)} ({100*len(flagged_ids)/max(1,total):.1f}%)\n')

    print('TITLE issues:')
    for t in TITLE_PATTERNS:
        n = counts.get(f'title:{t}', 0)
        if n: print(f'  {t:20s} {n}')
    print('\nDESCRIPTION issues:')
    for t in DESC_PATTERNS:
        n = counts.get(f'desc:{t}', 0)
        if n: print(f'  {t:20s} {n}')

    for t, lst in samples.items():
        if not lst: continue
        print(f'\n=== {t} ({len(lst)} samples) ===')
        for tag, name, desc in lst:
            print(f'  • [{tag}] {name}')
            print(f'    {desc}')

    if args.write:
        PUBLIC.mkdir(parents=True, exist_ok=True)
        out_path = PUBLIC / 'review-list.json'
        out = [{'lat': float(k.split(',')[0]), 'lng': float(k.split(',')[1])}
               for k in sorted(flagged_keys)]
        out_path.write_text(json.dumps(out, indent=2))
        print(f'\nWrote {len(out)} review entries to {out_path}')
    else:
        print('\n(report only; pass --write to update review-list.json)')


if __name__ == '__main__':
    main()
