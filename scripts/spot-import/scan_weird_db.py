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
            f'?select=id,name,description,latitude,longitude,kind'
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


# Known-good agency tags that legitimately appear after "—" in a name. Anything
# else surfaces as bad_agency_tag (typically LLM hallucinated abbreviations).
KNOWN_AGENCY_TAGS = {
    'BLM','USFS','NPS','FWS','USFWS','USACE','USBR','SITLA','NRA','NF','NM',
    'WMA','WSA','WSR','NHL','NHP','SP','SRA','TPWD','WA DNR','NYS','SDNR',
    'SDC','SDF','SDOL','SLB','SLO','SPR','TVA','SFW','IDL','City','County',
    'State','Private','USCG','DNR','NGO','NWR','MDOT','NDOT','CDOT','VDOT',
    'NMDOT','WSDOT','WVDOT','ALDOT','AZDOT','ILDOT','KDOT','MDT','ODOT',
    'SCDOT','OHD','CPNWR','WMNF','WODT','SFNF','GSENM','NBLT','LTVA','SVRA',
    'MDC','MWD','COE','ACOE','ARS','BBA','PVT','CHP','DOE','ITD','PHL','LAX',
    'MNRTF','MSU','RWD','UNCG','CVS','NHDOT','NYSDEC','WisDOT','JNT','NYC',
    'IDOT','WMATA','Weyerhaeuser','Anza Borrego State Park','Paul Bunyan SF',
    'TxDOT','MassDOT','PennDOT','CalTrans',
    'None',  # "None" intentionally allowed-then-flagged by the scanner if it's
             # the WHOLE tag (not when it's just the value of "— None")
}

# --- Title detectors (verbatim from scan_weird_entries.py + new ones) ---
# Pattern-based agency-tag allowlist for things we don't want to enumerate
# explicitly. "City of Austin" / "County of Maricopa" / "Iowa DOT" / etc.
AGENCY_TAG_PATTERNS = [
    re.compile(r'^(City|County|Town) of \w+', re.IGNORECASE),
    re.compile(r'^\w+ (?:DOT|DNR|NRA|NWR|NF|NM|SF)$'),   # Iowa DOT, Cleveland NF, Paul Bunyan SF
    re.compile(r'^[A-Z]{2}$'),                           # Bare state codes (CA, TX, WI, NY)
    re.compile(r'^I-\d{1,3}', re.IGNORECASE),            # Interstates I-5, I-90, etc.
    # No-space DOTs (CalTrans, TxDOT, MassDOT, PennDOT, IDOT…) — DOT or Trans
    re.compile(r'^[A-Za-z]{2,}(?:DOT|[Tt]rans|DNR|NWR)$'),
    re.compile(r'^[A-Za-z]+\s+County$'),                 # "Caldwell County", "Marion County"
    re.compile(r'^[A-Z][a-z]+\s+(?:NF|NRA|NWR|NM|SP|NP)$'),  # Cleveland NF, Lbl NRA
    re.compile(r'^\w+\s+Welcome Center$'),               # "NYS Welcome Center"
    re.compile(r'^\w+\s+Water Dept$'),                   # "Kemmerer Water Dept"
    re.compile(r'^Marion County Picnic Area$|^Downeast Lakes', re.IGNORECASE),  # legit one-offs
]


def _bad_agency_tag(t: str) -> bool:
    """True if a title's "— X" tag is hallucinated/garbage."""
    m = re.search(r'\s—\s+(.+?)\s*$', t)
    if not m:
        return False
    tag = m.group(1).strip()
    # Strip trailing parentheticals: "— USFS (assuming Oregon)" → "USFS"
    tag = re.sub(r'\s*\(.*\)?\s*$', '', tag).strip()
    if not tag:
        return True
    # Bare "None" is a leak even though we allowed it in KNOWN_AGENCY_TAGS
    if tag.lower() == 'none':
        return True
    # Allow tags via the pattern allowlist (City of X, Iowa DOT, etc.)
    for pat in AGENCY_TAG_PATTERNS:
        if pat.match(tag):
            return False
    # Otherwise check the literal whitelist
    return tag not in KNOWN_AGENCY_TAGS


TITLE_PATTERNS = {
    'too_long':         lambda t: len(t) > 50,
    'truncated':        lambda t: bool(re.search(r'(,$|—$|-$|\.\.\.|\bbut\s*$|\band\s*$|\bbased\s*$|\bsince\s*$|\bin\s+the\s*$)', t.strip())),
    'AI_explanation':   lambda t: bool(re.search(r'\b(not specified|not applicable|not available|N/A|based on|since (?:the|it|this)|appears to be|because (?:the|it)|user commentary|real place identifier|fit into (?:either )?category|is classified as|would classify|is not a (?:real|geographic|specific|valid))\b', t, re.IGNORECASE)),
    'placeholder':      lambda t: bool(re.match(r'^(Unknown|Various|None|Other|Misc(ellaneous)?|N/A|TBD|Spot|Site|Location|Place|Unknown Public Land Unit)\s*$', t.strip(), re.IGNORECASE)),
    'lowercase_lead':   lambda t: bool(t) and t[0].islower(),
    # User confirmed "Behind X / Next to X / Near X / By X / Under X / On X /
    # In X / Along X" are fine when followed by a concrete noun. Only the
    # truly-vague leads stay flagged.
    'lead_preposition': lambda t: bool(re.match(r'^(off|across|past)\s+the\b', t, re.IGNORECASE)),
    'bad_agency_tag':   _bad_agency_tag,
    'paren_note':       lambda t: bool(NAME_PAREN_NOTE_RE.search(t)),
    'name_has_quotes':  lambda t: bool(re.search(r'(?<!\\)["“”]', t)) and bool(re.search(r'\bSince\b|\bnot a\b|\bclassified\b|\bis a\b|\bis not\b', t, re.IGNORECASE)),
    # New from deep_review.py: parenthetical longer than 20 chars in title is
    # almost always LLM reasoning leakage.
    'long_paren':       lambda t: bool(re.search(r'\([A-Za-z][^)]{20,}\)?', t)),
}

# --- Description detectors (verbatim minus fabricated_specific) ---
# Tightened to avoid the "We'll Rd" (typo of "Well Rd") false positive that
# matched the prior I'll/We'll alternation. We require word-bounded I/We
# pronouns AND a following space + verb so apostrophe typos in road names
# don't trip the filter.
FIRST_PERSON_RE = re.compile(
    r"(?:^|[\s.,;!?])(?:"
    r"I[’']ve|I[’']m|I[’']d|I[’']ll|We[’']ve|We[’']re|We[’']ll|We[’']d"
    r")\s+\w|"
    r"\b(?:I had|I have|I was|I am|I went|I stayed|I parked|I camped|I found|I saw|"
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
# Tightened: "the visitor's center" / "Visitor's Center" are legit place
# features (NPS, parks). Only flag when "visitor's"/"reviewer's" is followed
# by something that isn't "center", "bureau", or "guide".
REVIEWER_RE = re.compile(
    r"\b(?:reviewer|"
    r"the (?:visitor|reviewer)['’]s(?!\s+(?:center|centre|bureau|guide|book|"
    r"information|info|station|kiosk|lobby|building|map))"
    r")\b",
    re.IGNORECASE,
)
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

# Additional detectors surfaced by anomaly_hunt.py (2026-05-05).

TRUNC_DESC_RE = re.compile(r'(,|\b(?:and|but|or|because|since)\b)\s*$|\.\.\.+\s*$|…\s*$', re.IGNORECASE)
COORD_PAIR_RE = re.compile(r'\b\d{1,3}\.\d+°?\s*[NS][, ]+\d{1,3}\.\d+°?\s*[EW]|\b\d{1,3}\.\d{4,7}\s*°?\s*[NSEW]\b|\b\d{1,3}\.\d{6,}\s*,\s*-?\d{1,3}\.\d{6,}\b', re.IGNORECASE)
PROMPT_LEAK_DESC_RE = re.compile(r'is classified as|user commentary|real place identifier|fit into category|doesn\'t fit|is described as a "?(?:user commentary|real place)', re.IGNORECASE)
NAME_PAREN_NOTE_RE = re.compile(r'\((?:Note|Since|Because|Assuming|If)[^)]*\)?$', re.IGNORECASE)


def _has_repeat_phrase(text: str, n: int = 4) -> bool:
    words = re.findall(r"[a-z]{3,}", (text or '').lower())
    if len(words) < n * 2:
        return False
    seen = set()
    for i in range(len(words) - n + 1):
        ph = ' '.join(words[i:i + n])
        if ph in seen:
            return True
        seen.add(ph)
    return False


DESC_PATTERNS = {
    'first_person':         lambda d: bool(FIRST_PERSON_RE.search(d)),
    'reviewer_mention':     lambda d: bool(REVIEWER_RE.search(d)),
    'prompt_leak':          lambda d: bool(PROMPT_LEAK_RE.search(d)),
    'desc_prompt_leak':     lambda d: bool(PROMPT_LEAK_DESC_RE.search(d)),
    'placeholder_text':     lambda d: bool(PLACEHOLDER_RE.search(d)),
    'located_at_vague':     lambda d: bool(LOCATED_AT_VAGUE_RE.search(d)),
    'hedge_phrase':         lambda d: bool(HEDGE_RE.search(d)),
    'AI_filler':            lambda d: bool(AI_FILLER_RE.search(d)),
    'meta_language':        lambda d: bool(META_RE.search(d)),
    'narrative_visit':      lambda d: bool(NARRATIVE_RE.search(d)),
    'too_short':            lambda d: 0 < len(d.strip()) < 15,
    'desc_truncated':       lambda d: bool(TRUNC_DESC_RE.search(d)),
    'coord_in_desc':        lambda d: bool(COORD_PAIR_RE.search(d)),
    'repeat_phrase_4w':     lambda d: _has_repeat_phrase(d, 4),
    'shouty_caps':          lambda d: len(d) >= 25 and (sum(1 for c in d if c.isalpha() and c.isupper()) / max(1, sum(1 for c in d if c.isalpha()))) > 0.30,
    'missing_leading_zero': lambda d: bool(LEADING_ZERO_RE.search(d)),
}

HIGH_CONF_TITLE = {'truncated', 'placeholder', 'lowercase_lead',
                   'lead_preposition', 'AI_explanation', 'bad_agency_tag',
                   'paren_note', 'name_has_quotes', 'long_paren'}
HIGH_CONF_DESC  = {'first_person', 'reviewer_mention', 'prompt_leak',
                   'desc_prompt_leak',
                   'placeholder_text', 'located_at_vague',
                   # 'AI_filler' deliberately NOT in HIGH_CONF — 98% of hits
                   # are "in this area" filler that's stylistic, not factually
                   # wrong. Still counted/sampled in the report but not flagged.
                   'meta_language', 'narrative_visit',
                   'too_short',
                   # 'shouty_caps' false-positive on legit quoted-sign text
                   # ('"NO PARK AND RIDE"' — that's a real sign, not LLM caps).
                   'missing_leading_zero',
                   'desc_truncated', 'coord_in_desc',
                   # 'repeat_phrase_4w' triggers on legit price lists
                   # ("$10/2hr, $15/8hr") and repeated business names.
                   }


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
    # Per-row issue map: {row_key: {'spot_id', 'lat', 'lng', 'issues': set()}}
    # — Iotest renders issue tags next to each flagged row.
    flagged: dict = {}

    def add_flag(row_key, lat, lng, spot_id, kind, issue_tag):
        entry = flagged.setdefault(row_key, {
            'spot_id': spot_id, 'lat': lat, 'lng': lng,
            'kind': kind, 'issues': []
        })
        if issue_tag not in entry['issues']:
            entry['issues'].append(issue_tag)

    for r in rows:
        name = (r.get('name') or '').strip()
        desc = (r.get('description') or '').strip()
        kind = r.get('kind') or ''
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
                    add_flag(row_key, lat, lng, r['id'], kind, f'title:{t}')

        for t, check in DESC_PATTERNS.items():
            if desc and check(desc):
                counts[f'desc:{t}'] += 1
                if len(samples[t]) < args.samples:
                    samples[t].append(('DESC', name, desc[:200]))
                if t in HIGH_CONF_DESC:
                    add_flag(row_key, lat, lng, r['id'], kind, f'desc:{t}')

    total = len(rows)
    print(f'Scanned: {total}')
    print(f'Flagged (high-confidence): {len(flagged)} ({100*len(flagged)/max(1,total):.1f}%)\n')

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
        # Sort by row_key for stable output (lat,lng → reproducible diffs)
        out = [
            {
                'spot_id': v['spot_id'],
                'lat': v['lat'],
                'lng': v['lng'],
                'kind': v.get('kind') or '',
                'issues': sorted(v['issues']),
            }
            for k, v in sorted(flagged.items())
        ]
        out_path.write_text(json.dumps(out, indent=2))
        print(f'\nWrote {len(out)} review entries to {out_path}')
    else:
        print('\n(report only; pass --write to update review-list.json)')


if __name__ == '__main__':
    main()
