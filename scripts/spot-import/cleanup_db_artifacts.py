#!/usr/bin/env python3
"""
Deterministic cleanup of LLM artifacts left in spots.name and spots.description
after the 03_rewrite_names.py / rewrite_names_db.py pass on 2026-05-04.

Five batches of fixes, all idempotent:

  1. Description leading-zero formatting:
       "about.7 miles" → "about 0.7 miles"
       (4 rows; pure regex on the description column)

  2. Strip trailing "— None (no public land unit or managing agency...)"
     suffixes from titles. Keeps the part before "— None".  (~57 rows)

  3. Fix mis-titlecased agency tags:
       "— Usace" → "— USACE"
       "— Usbr"  → "— USBR"
     (smart_titlecase_token in rewrite_names_db.py was missing these
     in PRESERVE_UPPER, so they came out wrong.)

  4. Revert hopelessly prompt-leaked titles to extra.name_original AND
     clear extra.name_rewritten_v2 so a future re-rewrite picks them up.
     Targets:
       - title contains "a descriptive sentence/phrase that doesn't"
       - title contains "User Commentary" / "Real Place Identifier"
         / "doesn't fit into either category"
       - title is "Public Land Unit Unknown"
     (~50 rows)

  5. Tighten reviewer_mention false positives — none to fix here, just
     a doc note that "visitor's center" matches reviewer_mention regex
     in scan_weird_db.py and is a known FP.

Writes to BOTH dev and prod via REST PATCH (id is identical post-migration).
Skips rows where the change is a no-op.

Usage:
  python3 scripts/spot-import/cleanup_db_artifacts.py --dry-run
  python3 scripts/spot-import/cleanup_db_artifacts.py --apply
"""
import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional, Tuple

ROOT = Path(__file__).resolve().parents[2]
ENV_PROD = ROOT / '.env.production'
ENV_DEV  = ROOT / '.env'

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
    headers = {
        'apikey': key,
        'Authorization': f'Bearer {key}',
        'Content-Type': 'application/json',
    }
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


# ---- Detection / transformation rules ---------------------------------

# Description: letter+dot+digit at a word boundary → letter + " 0." + digit
LEADING_ZERO_RE = re.compile(r'\b([a-zA-Z]+)\.(\d)')

# Title: trailing "— None (...)" or "— None" suffix
NONE_SUFFIX_RE = re.compile(r'\s*[—-]\s*None(?:\s*\(.*\)?)?\s*$', re.IGNORECASE)

# Title: agency tag casings to normalize. Mapped to readable forms (full
# words like "County" instead of all-caps "CNTY", and uniform "WA DNR"
# instead of "WADNR").
AGENCY_CASING = {
    '— Usace':  '— USACE',
    '— Usbr':   '— USBR',
    '— Wadnr':  '— WA DNR',
    '— WADNR':  '— WA DNR',
    '— Usfs':   '— USFS',
    '— Usfws':  '— USFWS',
    '— Sitla':  '— SITLA',
    '— Sfw':    '— SFW',
    '— Idl':    '— IDL',
    '— Nys':    '— NYS',
    '— Nhdot':  '— NHDOT',
    '— Cnty':   '— County',
    '— CNTY':   '— County',
    '— Tva':    '— TVA',
    '— Sdnr':   '— SDNR',
    '— Sdc':    '— SDC',
    '— Sdf':    '— SDF',
    '— Sdol':   '— SDOL',
    '— Slb':    '— SLB',
    '— Slo':    '— SLO',
    '— Spr':    '— SPR',
    '— Ngo':    '— NGO',
    '— Dnr':    '— DNR',
    '— Nysdec': '— NYSDEC',
    '— Wisdot': '— WisDOT',
    '— Nwr':    '— NWR',
    '— Jnt':    '— JNT',
    '— Nyc':    '— NYC',
    '— CITY':   '— City',  # CITY → City for consistency with rest
    # State DOTs and similar agency abbreviations — surfaced 2026-05-05
    '— Mdot':   '— MDOT',
    '— Ndot':   '— NDOT',
    '— Cdot':   '— CDOT',
    '— Vdot':   '— VDOT',
    '— Nmdot':  '— NMDOT',
    '— Wsdot':  '— WSDOT',
    '— Wvdot':  '— WVDOT',
    '— Aldot':  '— ALDOT',
    '— Azdot':  '— AZDOT',
    '— Ildot':  '— ILDOT',
    '— Kdot':   '— KDOT',
    '— Mdt':    '— MDT',
    '— Odot':   '— ODOT',
    '— Scdot':  '— SCDOT',
    '— Ohd':    '— OHD',
    # Land-management acronyms
    '— Cpnwr':  '— CPNWR',
    '— Wmnf':   '— WMNF',
    '— Wodt':   '— WODT',
    '— Sfnf':   '— SFNF',
    '— Gsenm':  '— GSENM',
    '— Nblt':   '— NBLT',
    '— Ltva':   '— LTVA',
    '— Svra':   '— SVRA',
    # Misc agency / govt
    '— Mdc':    '— MDC',
    '— Mwd':    '— MWD',
    '— Coe':    '— COE',
    '— Acoe':   '— ACOE',
    '— Ars':    '— ARS',
    '— Bba':    '— BBA',
    '— Pvt':    '— PVT',
    '— Chp':    '— CHP',
    '— Doe':    '— DOE',
    '— Itd':    '— ITD',
    '— Phl':    '— PHL',
    '— Lax':    '— LAX',
    '— Mnrtf':  '— MNRTF',
    '— Msu':    '— MSU',
    '— Rwd':    '— RWD',
    '— Uncg':   '— UNCG',
    '— Cvs':    '— CVS',
    # State-named DOT/DNR with bad casing — normalize to upper
    '— Idot':       '— IDOT',
    '— Iowa Dot':   '— Iowa DOT',
    '— Idaho Dot':  '— Idaho DOT',
    '— Michigan Dnr': '— Michigan DNR',
    '— Caltrans':   '— CalTrans',
    '— Ohio Dot':   '— Ohio DOT',
    '— Ohio D.O.T.': '— Ohio DOT',
    '— NYSdot':     '— NYSDOT',
    '— NYSDOT':     '— NYSDOT',  # idempotent
    # Mangled "Bsl (Baxter State Park)" — strip the parenthetical (cleanup_db
    # already strips long parens in titles via separate rule)
}

# Truly-bad suffix tags surfaced 2026-05-05 — businesses, vague descriptors.
EXTRA_STRIP_TAGS = {
    'Cracker Barrel', 'Holiday Inn', 'General Store', 'Exit 12', 'Exit 39',
    'Fairgrounds', 'Government Lot', 'Commercial', 'Community Parking Lot',
    'CR20', 'I-49', 'I-57', 'I-70', 'I-75NB', 'I-8', 'I-88 East', 'I-90',
}

# Strip these agency-tag suffixes entirely — they're either nonsensical
# placeholders the LLM hallucinated or generic words that don't add info.
# We strip the "— X" suffix and trim trailing whitespace.
STRIP_SUFFIX_TAGS = {
    'Oths', 'OTHS', 'Unkl', 'UNKL', 'Reg', 'REG', 'Unk', 'UNK',
    'Walmart', 'Highway', 'Street', 'Public', 'Downtown', 'Rest Area',
    'Private Property', 'Town', 'TOWN', 'Residential', 'Residential Area',
    'Street Parking', 'Public Street', 'State Park', 'Public Land Unit Unknown',
    # Brand / business names + city names that the LLM dropped as if they
    # were agencies. Flagged by the user 2026-05-05.
    'Chevron', 'Pilot', 'Casino', 'Station', 'Meijer', 'Auburn',
    'Beaufort', 'Brighton', 'Buellton', 'Calallen', 'Ventura', 'Solvang',
    'Raleigh', 'Memphis', 'Ohio', 'Texas', 'Kentucky', 'Lyons',
    'Natoma', 'Freeway', 'Township',
    # 2026-05-05 second pass — non-agencies that slipped through:
    'Cracker Barrel', 'Holiday Inn', 'General Store',
    'Exit 12', 'Exit 39', 'Fairgrounds', 'Government Lot', 'Commercial',
    'Community Parking Lot', 'CR20', 'Cleveland NF',
    'Continental Divide', 'Loch Lomond Subdivision #1',
    'I-49', 'I-57', 'I-70', 'I-75NB', 'I-8', 'I-88 East', 'I-90',
    'Fort Lupton', 'Arlington', 'Asheville', 'IA City Park',
    'Huntington, OR', 'Caldwell County',
}
STRIP_SUFFIX_RE = re.compile(
    r'\s*[—-]\s*(?:' + '|'.join(re.escape(t) for t in STRIP_SUFFIX_TAGS) + r')\s*$',
)

# Title: trailing parenthetical assumption notes — "(assuming New York
# State is the managing agency)" style. These are LLM reasoning leaks.
ASSUMING_PAREN_RE = re.compile(r'\s*\((?:assuming|note|since|because|if)\b[^)]*\)?\s*$', re.IGNORECASE)

# Title: prompt-leak phrases — these can never appear in a real name
PROMPT_LEAK_TITLE = re.compile(
    r"a descriptive sentence/phrase|"
    r"User Commentary|Real Place Identifier|"
    # All forms of "doesn't fit" / "does not fit"
    r"does(?:n[''’]?t| not) fit(?: into (?:either )?category)?|"
    r"does(?:n[''’]?t| not) (?:identify|fit)|"
    r"is (?:classified as|generic)|"
    r"would classify the original|"
    # The "is not a [kind] identifier/place" classification statement
    r"is not a (?:geographic|specific|real|valid) (?:identifier|place)|"
    r"^Public Land Unit Unknown$|"
    r"Public Land Unit Not Applicable|"
    # "Since the/this/it/X" leading phrases — including quoted names
    r"^Since\s+[\"'“‘]|"
    r"since (?:it'?s|this)|"
    r"because (?:the|it)|"
    # "appears to be a [kind]" classification
    r"\bappears to be (?:a|an) (?:business|chain|mobile|restaurant|store|shop|"
    r"gas|truck|rest|travel|park|hotel|motel|brewery|brewing)|"
    # New 2026-05-05: "Does Not Appear to Be a..." / "Is Not a [kind], But Rather"
    r"\bdoes not appear to be (?:a|an)|"
    r"\bis not a (?:camping|retail|gas|truck|rest|travel|business)|"
    r"\bbut rather (?:a|an) \w+|"
    # Truncated reasoning trails
    r"but rat(?:her)?\s*$|"
    # "X — as it appears..." parentheticals
    r"\bas it appears\b",
    re.IGNORECASE,
)


def fetch_camping_with_v2(limit: int = 0, all_community: bool = False) -> list:
    """v2-rewritten camping/utility rows by default. Pass all_community=True
    to also include rows that never went through the v2 rewrite (older
    imports). Read from prod; mirror to dev."""
    out = []
    offset = 0
    PAGE = 1000
    v2_filter = '' if all_community else "&extra->>name_rewritten_v2=eq.true"
    while True:
        path = (
            '/rest/v1/spots'
            '?select=id,name,description,extra'
            '&source=eq.community'
            f'{v2_filter}'
            '&order=id'
            f'&offset={offset}&limit={PAGE}'
        )
        status, body = http(PROD_URL, PROD_KEY, 'GET', path)
        if status >= 400:
            sys.exit(f'fetch failed ({status}): {body}')
        page = body or []
        if not page: break
        out.extend(page)
        offset += PAGE
        if limit and len(out) >= limit: return out[:limit]
        if len(page) < PAGE: break
    return out


def patch_row(spot_id: str, payload: dict) -> Tuple[bool, Optional[str], Optional[str]]:
    p_status, p_body = http(PROD_URL, PROD_KEY, 'PATCH',
        f'/rest/v1/spots?id=eq.{spot_id}',
        body=payload, prefer='return=minimal')
    d_status, d_body = http(DEV_URL, DEV_KEY, 'PATCH',
        f'/rest/v1/spots?id=eq.{spot_id}',
        body=payload, prefer='return=minimal')
    p_err = str(p_body)[:200] if p_status >= 400 else None
    d_err = str(d_body)[:200] if d_status >= 400 else None
    return (p_err is None and d_err is None), p_err, d_err


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--limit', type=int, default=0,
                        help='Smoke-test cap on rows to inspect.')
    parser.add_argument('--all-community', action='store_true',
                        help='Process all community rows, not just v2-rewritten ones.')
    args = parser.parse_args()
    if not args.dry_run and not args.apply:
        sys.exit('pass --dry-run or --apply')

    scope_msg = 'ALL community rows' if args.all_community else 'v2-rewritten community rows'
    print(f'Fetching {scope_msg}...')
    rows = fetch_camping_with_v2(limit=args.limit, all_community=args.all_community)
    print(f'  {len(rows)} rows.\n')

    counters = {
        'leading_zero': 0,
        'none_suffix':  0,
        'agency_case':  0,
        'strip_bad_suffix': 0,
        'strip_assuming_paren': 0,
        'titlecase_leading': 0,
        'revert_to_original': 0,
        'unchanged': 0,
        'errors': 0,
    }

    for r in rows:
        spot_id = r['id']
        name = (r.get('name') or '').strip()
        desc = (r.get('description') or '')
        extra = r.get('extra') or {}

        new_name = name
        new_desc = desc
        new_extra = dict(extra)
        applied = []

        # Fix 1: leading-zero in description
        fixed_desc = LEADING_ZERO_RE.sub(r'\1 0.\2', desc)
        if fixed_desc != desc:
            new_desc = fixed_desc
            applied.append('leading_zero')
            counters['leading_zero'] += 1

        # Fix 2: strip — None suffix in title
        stripped = NONE_SUFFIX_RE.sub('', new_name).rstrip(' —-').strip()
        if stripped and stripped != new_name:
            new_name = stripped
            applied.append('none_suffix')
            counters['none_suffix'] += 1

        # Fix 3: agency casing
        for bad, good in AGENCY_CASING.items():
            if bad in new_name:
                new_name = new_name.replace(bad, good)
                applied.append('agency_case')
                counters['agency_case'] += 1
                break

        # Fix 3b: strip "(assuming ...)" parentheticals (LLM reasoning leak)
        stripped_paren = ASSUMING_PAREN_RE.sub('', new_name).rstrip()
        if stripped_paren != new_name and stripped_paren:
            new_name = stripped_paren
            applied.append('strip_assuming_paren')
            counters['strip_assuming_paren'] += 1

        # Fix 3c: strip nonsense agency suffixes (— Walmart, — Public, etc.)
        stripped_suffix = STRIP_SUFFIX_RE.sub('', new_name).rstrip(' —-').strip()
        if stripped_suffix != new_name and stripped_suffix:
            new_name = stripped_suffix
            applied.append('strip_bad_suffix')
            counters['strip_bad_suffix'] += 1

        # Fix 3d: title-case names with lowercase-leading OR mid-word
        # lowercase non-stop-words. Catches:
        #   "angler fishing parking" → "Angler Fishing Parking" (lowercase lead)
        #   "Coin laundry"           → "Coin Laundry"           (mid-word)
        #   "Planet fitness"         → "Planet Fitness"         (mid-word)
        #   "Mini Grand Canyon of Wyoming" → unchanged (stop word "of")
        #   "Behind the Cliff"       → unchanged (stop word "the")
        # Idempotent for already-properly-cased names.
        _stop_for_check = {'the', 'of', 'and', 'or', 'on', 'in', 'at', 'to', 'a', 'an'}
        def _needs_titlecase(s: str) -> bool:
            if not s or len(s) < 3: return False
            if s[0].islower(): return True
            words = re.split(r'\s+', s)
            for i, w in enumerate(words):
                if i == 0: continue
                if not w: continue
                if w[0].islower() and w.lower() not in _stop_for_check:
                    return True
            return False

        if _needs_titlecase(new_name):
            # Title-case each word; preserve any all-caps tokens (USFS, NF) that
            # were already there mid-string (uncommon for lowercase-leading
            # names, but defensive).
            def _smart_title(token: str) -> str:
                if token.isupper() and len(token) >= 2:
                    return token  # preserve acronyms
                if not token:
                    return token
                # Don't title-case stop words like "the", "of", "and" mid-string,
                # but DO capitalize them at position 0.
                return token[0].upper() + token[1:].lower()
            tokens = re.split(r'(\s+)', new_name)
            stop = {'the', 'of', 'and', 'or', 'on', 'in', 'at', 'to', 'a', 'an'}
            new_tokens = []
            for i, tok in enumerate(tokens):
                if tok.isspace() or not tok:
                    new_tokens.append(tok)
                    continue
                # Always capitalize the first non-space token
                if not any(not (t.isspace() or not t) for t in new_tokens):
                    new_tokens.append(_smart_title(tok))
                elif tok.lower() in stop:
                    new_tokens.append(tok.lower())
                else:
                    new_tokens.append(_smart_title(tok))
            new_name = ''.join(new_tokens)
            applied.append('titlecase_leading')
            counters['titlecase_leading'] += 1

        # Fix 4: revert to name_original if title has prompt leakage
        if PROMPT_LEAK_TITLE.search(new_name):
            original = extra.get('name_original')
            if original:
                new_name = original
                # Clear the v2 marker so the next stricter rewrite picks it up
                new_extra.pop('name_rewritten_v2', None)
                applied.append('revert_to_original')
                counters['revert_to_original'] += 1

        if not applied:
            counters['unchanged'] += 1
            continue

        if args.dry_run:
            tags = ','.join(applied)
            print(f'  [{tags}] {spot_id[:8]}  "{name[:50]}" → "{new_name[:50]}"')
            continue

        payload = {}
        if new_name != name: payload['name'] = new_name
        if new_desc != desc: payload['description'] = new_desc
        if new_extra != extra: payload['extra'] = new_extra

        ok, p_err, d_err = patch_row(spot_id, payload)
        if not ok:
            counters['errors'] += 1
            print(f'  [err] {spot_id[:8]}: prod={p_err}  dev={d_err}', flush=True)

    print()
    for k, v in counters.items():
        print(f'  {k:22s} {v}')


if __name__ == '__main__':
    main()
