#!/usr/bin/env python3
"""
Stage-3 name rewrite, run directly against the prod `spots` table.

Mirrors the prompt + post-cleanup logic of 03_rewrite_names.py (which
operated on JSON files pre-import). Now that data lives on prod, this
script:

  1. Pulls all community spots with extra.ai_summarized=true (the AI-rewritten
     batch — utility rows like laundromats/showers/water skipped name
     rewrite entirely the first time).
  2. Calls local Ollama (llama3.1:8b) with the same prompt template.
  3. Updates the row on prod via PostgREST PATCH:
       - name             → new clean name
       - extra.name_original → preserved (only set if not already there)
       - extra.name_rewritten_v2 → true   (resume marker)

Resumable — restart skips rows where extra.name_rewritten_v2 is already
true. Safe to interrupt with Ctrl-C; only writes per-row, never batches
in memory.

Run overnight (~5-8 hrs for ~14.5k rows on a typical laptop GPU):
  python3 scripts/spot-import/rewrite_names_db.py
  caffeinate -i python3 scripts/spot-import/rewrite_names_db.py   # mac
  python3 scripts/spot-import/rewrite_names_db.py --limit 50      # smoke test
"""
import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional

ROOT     = Path(__file__).resolve().parents[2]
ENV_PROD = ROOT / '.env.production'
ENV_DEV  = ROOT / '.env'

OLLAMA_URL = 'http://localhost:11434/api/generate'
MODEL      = 'llama3.1:8b'
TIMEOUT_S  = 60
PAGE_SIZE  = 500


# ---- env ----------------------------------------------------------------

def read_env(path: Path, key: str) -> str:
    pat = re.compile(rf'^{re.escape(key)}\s*=\s*"?([^"\n]+)"?\s*$')
    for line in path.read_text().splitlines():
        m = pat.match(line)
        if m: return m.group(1).strip()
    sys.exit(f'Missing {key} in {path}')


# prod is the source of truth for the "pending" query; both get patched.
PROD_URL = read_env(ENV_PROD, 'VITE_SUPABASE_URL')
PROD_KEY = read_env(ENV_PROD, 'SUPABASE_SERVICE_ROLE_KEY')
DEV_URL  = 'https://ioseedbzvogywztbtgjd.supabase.co'
DEV_KEY  = read_env(ENV_DEV,  'SUPABASE_SERVICE_ROLE_KEY')


def http(base_url: str, key: str, method: str, path: str, body=None, prefer: str = ''):
    url = f'{base_url}{path}'
    data = json.dumps(body).encode('utf-8') if body is not None else None
    headers = {
        'apikey': key,
        'Authorization': f'Bearer {key}',
        'Content-Type': 'application/json',
    }
    if prefer:
        headers['Prefer'] = prefer
    req = urllib.request.Request(url, method=method, headers=headers, data=data)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            text = resp.read().decode('utf-8')
            return resp.status, json.loads(text) if text.strip() else None
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8')


# ---- prompt + post-clean (verbatim from 03_rewrite_names.py) -----------

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


# Utility-specific prompt — water sources, laundromats, showers. Different
# from camping because:
#   - Most names are real businesses/parks; KEEP unless truly generic.
#   - No "— Agency" suffix (these aren't on managed public land).
#   - Strip price/condition suffixes ("- $0.25/gal", "- OK", "- NICE").
#   - Strip mid-word truncations and complete from description.
UTILITY_PROMPT_TEMPLATE = """Rewrite this {kind_label} location's name into a clean directory entry that reads like a real place name.

Most of these names are already real businesses, parks, or landmarks. KEEP an existing real name when present and only fix it if needed:
  - Strip price/condition suffixes: "- $0.25/gal", "- OK", "- NICE", "($1)", "(free)", "Per Gallon", quality words.
  - Strip mid-word truncations and complete the name using the description: "New Brighton State Beach Outdoor Sh" → "New Brighton State Beach Outdoor Showers".
  - Strip vague prefixes like "The Best", "Cheap", "Random" unless part of the real name.

ONLY replace the name when the original is generic and uninformative. Generic examples: "Rest Area", "Laundromat", "Shower", "Water", "Spot", "Site", "Location", "Place", a single street name with no business attached. In those cases, look at the DESCRIPTION for a real identifier in priority order:
  1. A specific business/chain name (Shell, Walmart, Maverik, KOA, Truck stop name, named park).
  2. A landmark or park name.
  3. The street + town: "Main St (Reno)".

DO NOT append " — BLM/USFS/Agency". Utilities aren't on managed public land.
Output ONLY the new name on one line. Max 60 chars. No quotes, no preamble.

Examples:

Original: "Circle K"
Description: A potable water dispenser is located here.
→ Circle K

Original: "The Water Mill - $ 0.25 Per Gallon"
Description: A standard filtered water dispenser is located here.
→ The Water Mill

Original: "Rest Area"
Description: A free water source is available at this rest area, accessible via a 30-meter hose. Located off I-80 near Truckee.
→ I-80 Rest Area near Truckee

Original: "Laundromat at Shell Station"
Description: A small laundromat with three washers and two dryers, attached to a Shell station on Highway 40 in Reno.
→ Shell Station Laundromat (Reno)

Original: "New Brighton State Beach Outdoor Sh"
Description: The shower facility offers cold water and is located within New Brighton State Beach.
→ New Brighton State Beach Outdoor Showers

Original: "Bonham Street Laundromat"
Description: A simple laundromat with coin-operated machines.
→ Bonham Street Laundromat

Now rewrite this entry:

Original: "{name}"
Description: {description}

New name:"""


def call_ollama(prompt: str) -> str:
    body = json.dumps({
        'model': MODEL, 'prompt': prompt, 'stream': False,
        'options': {'temperature': 0.0, 'num_predict': 30},
    }).encode('utf-8')
    req = urllib.request.Request(
        OLLAMA_URL, data=body,
        headers={'Content-Type': 'application/json'},
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
        data = json.loads(resp.read())
    return data.get('response', '').strip().strip('"').strip("'").splitlines()[0].strip()


def short_agency(manager: Optional[str]) -> str:
    if not manager: return ''
    m = manager.upper()
    if 'BLM' in m: return 'BLM'
    if 'USFS' in m: return 'USFS'
    if 'NPS' in m: return 'NPS'
    if m in ('SLB', 'SITLA') or 'SCHOOL' in m: return 'SITLA'
    return manager


NAME_SUFFIX_TRIM = [
    re.compile(r'\s*[—-]\s*Agency\b.*$', re.IGNORECASE),
    re.compile(r'\s*[—-]\s*unknown\b.*$', re.IGNORECASE),
    re.compile(r'\s*[—-]\s*N/A\b.*$', re.IGNORECASE),
    re.compile(r'\s*[—-]\s*not (?:specified|applicable|available).*$', re.IGNORECASE),
    re.compile(r'\s*\(UNK\)[^A-Za-z]*$', re.IGNORECASE),
]
ARROW_RE = re.compile(r'\s*→.*$')
PRESERVE_UPPER = {
    'BLM','USFS','NPS','FWS','SITLA','USFWS','BIA','DOD','MIL','NF','NM','NRA',
    'WMA','WSR','WSA','WA','SP','NP','RV','RVS','OHV','ATV','UTV','RD','DR',
    'I-5','I-10','I-15','I-25','I-35','I-40','I-70','I-75','I-80','I-90','I-94','I-95',
    'US','LDS','KOA','RM','ATM','CG','CCC','VRBO','CR','SR','HW','HWY',
    # State agency / land-management acronyms surfaced by post-migration scan
    'SFW','SDC','SDF','SDOL','SDNR','SLB','SLO','SPR','TVA','SRA','TPWD',
}

# Prompt-leak / reasoning prefixes the model occasionally emits as the "name".
# When the output starts with any of these, post_clean_name discards it and
# uses the fallback (original name).
PROMPT_LEAK_PREFIXES = re.compile(
    r'^(?:'
    r'based on|looking at|scanning|first[, ]|'
    # "Since X is..." classification reasoning — broaden to catch quoted names
    r'since\s|because\s|'
    # Single-letter classification labels: "A) ..." / "B) ..."
    r'[ABab]\)\s|'
    # First-person reasoning
    r"i[' ]?ll |i will |i would |let[' ]?s |to (?:rewrite|determine)|"
    # Direct prompt echoes
    r"the (?:original|name) (?:is|appears|\")|here(?:[' ]?s| is) |"
    r"strip (?:price|the|trailing|reviewer|this|that|all)|"
    r"keep an existing|rewrite (?:this|the)|look (?:at|for) the|"
    # Bare classification statements
    r'(?:original )?name (?:is )?classified as|"\w[^"]*" (?:is|doesn)|'
    # The model sometimes leads with a parenthetical assumption
    r'\(assuming\s'
    r')',
    re.IGNORECASE,
)

# Phrases that should NEVER appear in a real name — dead-giveaway echoes of
# the prompt template. If any of these substrings show up, post_clean_name
# discards the output and uses the fallback.
PROMPT_LEAK_SUBSTRINGS = re.compile(
    r'(?:'
    r'is generic|real (?:place|business|landmark)(?: name| identifier)|'
    r'place identifier|description for|original name|'
    r'condition suffix|vague prefix|'
    # Classification framework leaks
    r'user commentary|real place identifier|'
    r"fit into (?:either )?category|doesn'?t (?:fit|identify)|"
    r'(?:is|was) classified as|would classify|'
    r"not a (?:real|specific) place|"
    # Trailing prompt leftovers
    r'\(no public land unit|managing agency identified|'
    r'(?:not|state or federal) (?:on|managed by) (?:public|BLM|USFS)'
    r')',
    re.IGNORECASE,
)
ALLCAPS_TOKEN = re.compile(r'\b[A-Z]{3,}\b')
PLACEHOLDER_NAMES = re.compile(
    r'^('
    r'Unknown|Various|None|Other|Misc(ellaneous)?|N/A|TBD|Spot|Site|Location|Place|'
    # Verbose placeholders the LLM occasionally returns when it has no signal
    r'Unknown (?:Public Land Unit|Location|Place|Area|Region)|'
    r'(?:Public Land Unit|Location|Area|Region) Unknown|'
    r'No (?:Place|Location) Identifier'
    r')\s*$',
    re.IGNORECASE,
)
TRUNCATED_NAME = re.compile(r'(,$|—$|-$|\.\.+\s*$|\bbut\s*$|\band\s*$|\bbased\s*$|\bsince\s*$|\bin\s+the\s*$)')


def smart_titlecase_token(match):
    word = match.group(0)
    return word if word in PRESERVE_UPPER else word.capitalize()


def post_clean_name(name: str, fallback: str = '') -> str:
    if not name: return fallback or name
    s = name.strip()
    # Discard prompt-leak / reasoning-aloud outputs in favor of the fallback.
    # Catch both leading phrases ("Based on...") and giveaway substrings
    # ("...is generic", "real place name") that only appear in echoed prompts.
    if PROMPT_LEAK_PREFIXES.match(s) or PROMPT_LEAK_SUBSTRINGS.search(s):
        return (fallback or s).strip()
    s = ARROW_RE.sub('', s)
    for p in NAME_SUFFIX_TRIM:
        s = p.sub('', s)
    s = s.strip()
    if PLACEHOLDER_NAMES.match(s):
        return (fallback or s).strip()
    if TRUNCATED_NAME.search(s) and fallback and not TRUNCATED_NAME.search(fallback.strip()):
        s = fallback.strip()
    s = s.replace(' @ ', ' at ').replace('@', ' at ')
    s = ALLCAPS_TOKEN.sub(smart_titlecase_token, s)
    if s and s[0].islower():
        s = s[0].upper() + s[1:]
    s = re.sub(r'\s+', ' ', s).strip()
    if len(s) > 80:
        s = s[:80].rstrip()
    return s


# ---- DB ops ------------------------------------------------------------

# Per-scope kind filters. The two prompts produce very different outputs
# (camping forces "Place — Agency"; utility keeps real business names) so
# scope must match the prompt being used.
SCOPE_KINDS = {
    'camping': {'informal_camping', 'dispersed_camping'},
    'utility': {'water', 'laundromat', 'shower'},
}
KIND_LABELS = {
    'water': 'water source',
    'laundromat': 'laundromat',
    'shower': 'shower',
}


def fetch_pending(scope: str, limit: Optional[int] = None) -> list:
    """ai_summarized rows on prod that haven't been v2-rewritten yet, scoped
    to camping or utility kinds."""
    out = []
    offset = 0
    cap = limit if limit and limit > 0 else None
    kinds = SCOPE_KINDS[scope]
    kind_filter = '&kind=in.(' + ','.join(kinds) + ')'
    while True:
        page_limit = PAGE_SIZE if cap is None else min(PAGE_SIZE, cap - len(out))
        if page_limit <= 0:
            break
        path = (
            f'/rest/v1/spots'
            f'?select=id,name,description,public_land_unit,public_land_manager,extra,kind'
            f'&source=eq.community'
            f'{kind_filter}'
            f'&extra->>ai_summarized=eq.true'
            f"&or=(extra->>name_rewritten_v2.is.null,extra->>name_rewritten_v2.neq.true)"
            f'&order=id'
            f'&offset={offset}&limit={page_limit}'
        )
        status, body = http(PROD_URL, PROD_KEY, 'GET', path)
        if status >= 400:
            print(f'fetch failed ({status}): {body[:200]}'); sys.exit(1)
        page = body or []
        if not page: break
        out.extend(page)
        offset += page_limit
        if len(page) < page_limit: break
    return out


def update_row(spot_id: str, new_name: str, original_name: str, extra: dict):
    """Patch the row on BOTH prod and dev. Returns (ok, prod_err, dev_err)."""
    new_extra = dict(extra)
    if 'name_original' not in new_extra:
        new_extra['name_original'] = original_name
    new_extra['name_rewritten_v2'] = True
    payload = {'name': new_name, 'extra': new_extra}

    p_status, p_body = http(
        PROD_URL, PROD_KEY, 'PATCH',
        f'/rest/v1/spots?id=eq.{spot_id}',
        body=payload, prefer='return=minimal',
    )
    d_status, d_body = http(
        DEV_URL, DEV_KEY, 'PATCH',
        f'/rest/v1/spots?id=eq.{spot_id}',
        body=payload, prefer='return=minimal',
    )

    p_err = str(p_body)[:200] if p_status >= 400 else None
    d_err = str(d_body)[:200] if d_status >= 400 else None
    ok = p_err is None and d_err is None
    return ok, p_err, d_err


# ---- main --------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--scope', choices=['camping', 'utility'], default='camping',
                        help='Which kinds + prompt to use. camping=informal/dispersed_camping (default); utility=water/laundromat/shower.')
    parser.add_argument('--limit', type=int, default=0,
                        help='Stop after N rows (smoke test). 0 = all.')
    parser.add_argument('--dry-run', action='store_true',
                        help='Call Ollama, log proposed rename, do NOT write to DB.')
    args = parser.parse_args()

    print(f'Scope: {args.scope}  ({", ".join(sorted(SCOPE_KINDS[args.scope]))})', flush=True)
    print(f'Fetching pending rows from {PROD_URL}...', flush=True)
    print(f'(Will patch both prod and dev: {DEV_URL})', flush=True)
    rows = fetch_pending(args.scope, limit=args.limit)
    print(f'  Got {len(rows)} rows to process.', flush=True)
    if not rows:
        print(f'Nothing to do — all {args.scope} rows already have name_rewritten_v2=true.')
        return

    started = time.time()
    rewritten = 0
    skipped   = 0
    errors    = 0

    for i, r in enumerate(rows):
        spot_id  = r['id']
        original = (r.get('name') or '').strip()
        manager  = short_agency(r.get('public_land_manager'))
        unit     = r.get('public_land_unit') or 'unknown'
        desc     = (r.get('description') or '').strip()
        kind     = r.get('kind', '') or ''
        if len(desc) > 600:
            desc = desc[:600] + '…'

        if args.scope == 'utility':
            prompt = UTILITY_PROMPT_TEMPLATE.format(
                kind_label=KIND_LABELS.get(kind, kind),
                name=original or '(no name)',
                description=desc or '(none)',
            )
        else:
            prompt = PROMPT_TEMPLATE.format(
                name=original or '(no name)',
                description=desc or '(none)',
                manager=manager or 'unknown',
                unit=unit,
            )

        try:
            raw_new = call_ollama(prompt)
            cleaned = post_clean_name(raw_new or '', fallback=original) or original
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
            cleaned = post_clean_name(original, fallback=original) or original
            print(f'  [ollama err {i+1}/{len(rows)} {spot_id[:8]}]: {e}', flush=True)
            errors += 1

        if cleaned == original:
            # The LLM tried but produced no useful change (or its output got
            # filtered as a prompt leak). Mark name_rewritten_v2 = true anyway
            # so future runs of THIS script skip the row — saves another
            # ~1s/row of fruitless Ollama calls. A future v3 prompt would use
            # a different marker.
            skipped += 1
            if not args.dry_run:
                ok, p_err, d_err = update_row(spot_id, original, original, r.get('extra') or {})
                if not ok:
                    errors += 1
                    if p_err: print(f'  [prod err skip-mark {spot_id[:8]}]: {p_err}', flush=True)
                    if d_err: print(f'  [dev err  skip-mark {spot_id[:8]}]: {d_err}', flush=True)
        else:
            if args.dry_run:
                print(f'  [{i+1}/{len(rows)}] {spot_id[:8]}  "{original}" → "{cleaned}"', flush=True)
                rewritten += 1
            else:
                ok, p_err, d_err = update_row(spot_id, cleaned, original, r.get('extra') or {})
                if ok:
                    rewritten += 1
                else:
                    errors += 1
                    if p_err: print(f'  [prod err {i+1}/{len(rows)} {spot_id[:8]}]: {p_err}', flush=True)
                    if d_err: print(f'  [dev err  {i+1}/{len(rows)} {spot_id[:8]}]: {d_err}', flush=True)
                    continue

        if (i + 1) % 25 == 0:
            elapsed = time.time() - started
            rate = (i + 1) / elapsed if elapsed > 0 else 0
            eta = (len(rows) - i - 1) / rate if rate > 0 else 0
            print(f'  [{i+1}/{len(rows)}] '
                  f'rewritten={rewritten} skipped={skipped} errors={errors} '
                  f'rate={rate:.1f}/s eta={eta/60:.0f}min',
                  flush=True)

    elapsed = time.time() - started
    print()
    print(f'Done in {elapsed/60:.1f} min')
    print(f'  rewritten: {rewritten}')
    print(f'  skipped:   {skipped}  (no change from LLM)')
    print(f'  errors:    {errors}')


if __name__ == '__main__':
    main()
