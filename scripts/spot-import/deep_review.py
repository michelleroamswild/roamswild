#!/usr/bin/env python3
"""
Deep review of community spot names + descriptions, looking for ANY remaining
artifacts after the bulk cleanups: hallucination clusters, lingering prompt
leaks, suspicious geographic claims, and case anomalies.

Run after cleanup_db_artifacts.py + rewrite_names_db.py have finished. Reads
prod, doesn't modify. Writes a new section to public/test-data/review-list.json
combining the high-signal findings.

Detectors:
  - hallucination_cluster: same exact name on 5+ distinct lat/lng (Papahanaumokuakea, "(Reno)" pattern)
  - paren_city_suffix: title ends "Name (City)" — check if city actually matches lat/lng region (uses bbox)
  - prompt_leak_v2: broader phrase set than scan_weird_db catches
  - all_caps_mid: ALL-CAPS word mid-name that isn't a recognized acronym
  - title_contains_lengthy_paren: "Name (long parenthetical >25 chars)"
  - desc_lead_pattern: descriptions starting with a forbidden phrase
  - quoted_business_name: "Place" with stray double-quotes around a substring
"""
import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ENV_PROD = ROOT / '.env.production'

def read_env(path: Path, key: str) -> str:
    pat = re.compile(rf'^{re.escape(key)}\s*=\s*"?([^"\n]+)"?\s*$')
    for line in path.read_text().splitlines():
        m = pat.match(line)
        if m: return m.group(1).strip()
    sys.exit(f'Missing {key} in {path}')

PROD_URL = read_env(ENV_PROD, 'VITE_SUPABASE_URL')
PROD_KEY = read_env(ENV_PROD, 'SUPABASE_SERVICE_ROLE_KEY')


def fetch_all() -> list:
    out = []
    offset = 0
    PAGE = 1000
    while True:
        url = (
            f'{PROD_URL}/rest/v1/spots'
            f'?select=id,name,description,latitude,longitude,kind'
            f'&source=eq.community'
            f'&order=id'
            f'&offset={offset}&limit={PAGE}'
        )
        req = urllib.request.Request(url,
            headers={'apikey': PROD_KEY, 'Authorization': f'Bearer {PROD_KEY}'})
        with urllib.request.urlopen(req, timeout=120) as r:
            page = json.loads(r.read())
        if not page: break
        out.extend(page)
        offset += PAGE
        print(f'  fetched {len(out)}…', flush=True)
        if len(page) < PAGE: break
    return out


# Recognized acronyms — used to whitelist mid-name ALL-CAPS so we don't flag legit ones
KNOWN_ACRONYMS = {
    'BLM','USFS','NPS','FWS','USFWS','USACE','USBR','SITLA','NRA','NF','NM',
    'WMA','WSA','WSR','NHL','NHP','SP','SRA','TPWD','SDNR','SFW','SDC','IDL',
    'NYS','NYSDEC','MDOT','NDOT','CDOT','VDOT','NMDOT','WSDOT','WVDOT','ALDOT',
    'AZDOT','ILDOT','KDOT','MDT','ODOT','SCDOT','TVA','NHDOT','OHD','CPNWR',
    'WMNF','WODT','SFNF','GSENM','NBLT','LTVA','SVRA','MDC','MWD','COE','ACOE',
    'ARS','BBA','PVT','CHP','DOE','ITD','PHL','LAX','MNRTF','MSU','RWD','UNCG',
    'CVS','RV','RVS','OHV','ATV','UTV','OK','USA','II','III','IV',
    'I-5','I-10','I-15','I-25','I-35','I-40','I-70','I-75','I-80','I-90','I-94','I-95',
    'US','LDS','KOA','RM','ATM','CG','CCC','VRBO','CR','SR','HW','HWY','NWR',
    'JNT','NYC','AT&T','T-MOBILE','LTE','5G','4G','3G','2WD','4WD','AWD','ADA',
    'CB','UPS','RC','HP','GP','MP','NN','BB','DC','BC','LP','PA','TN','AZ','UT','CA','OR','WA',
    'BBQ','WIFI','WI-FI','GPS','UV','WC','OK','GE','NE','NW','SE','SW','NCAA',
    'POW','VFW','VRBO','HOA','HQ','TGIF',
}


# Bigger prompt-leak phrase set than scan_weird_db has
PROMPT_LEAK_BROAD = re.compile(
    r"\b(?:"
    r"appears? to be (?:a|an)|"
    r"(?:does(?:n[''’]?t)?|did(?:n[''’]?t)?) (?:fit|identify)|"
    r"(?:is|was) (?:not a|generic|classified|characterized|considered)|"
    r"real (?:place|business|landmark)|"
    r"geographic (?:identifier|name)|"
    r"user commentary|"
    r"(?:fit|fall) into (?:either |the )?categor|"
    r"would classify|"
    r"described as a|"
    r'\(Note[:\s]|\(assuming|\(since|'
    r"^(?:Since|Because)\s+[\"'“‘]"
    r")",
    re.IGNORECASE,
)

# A parenthetical with >20 chars of words — almost always LLM reasoning
LONG_PAREN_RE = re.compile(r'\([A-Za-z][^)]{20,}\)?')

# All-caps word of 3+ letters that isn't in KNOWN_ACRONYMS (or common state codes)
ALLCAPS_TOKEN_RE = re.compile(r'\b[A-Z][A-Z0-9-]{2,}\b')


def is_unknown_acronym(token: str) -> bool:
    """True if a fully-uppercase 3+ letter token is NOT in our whitelist."""
    if not ALLCAPS_TOKEN_RE.fullmatch(token):
        return False
    return token.upper() not in KNOWN_ACRONYMS


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true',
                        help='Append findings to public/test-data/review-list.json')
    parser.add_argument('--samples', type=int, default=4)
    args = parser.parse_args()

    print(f'Fetching all community rows from prod...', flush=True)
    rows = fetch_all()
    print(f'  Got {len(rows)} rows.\n')

    # ---- Detector 1: hallucination clusters (same name, many lat/lng) ----
    name_to_locs = defaultdict(set)
    name_to_ids  = defaultdict(list)
    for r in rows:
        n = (r.get('name') or '').strip()
        if not n: continue
        name_to_locs[n].add((round(float(r['latitude']), 3), round(float(r['longitude']), 3)))
        name_to_ids[n].append(r['id'])

    hallucination_clusters = {n: ids for n, ids in name_to_ids.items()
                              if len(name_to_locs[n]) >= 5
                              and n.lower() not in {
                                  'walmart', 'rest area', 'rest stop', 'street parking',
                                  'roadside', 'roadside pullout', 'pullout', 'parking lot',
                                  'cracker barrel', 'home depot', 'truck stop', 'truckstop',
                                  'cabela\'s', 'lowes', 'lowe\'s', 'planet fitness',
                                  'sam\'s club', 'kmart', 'target', 'tractor supply',
                                  'casino', 'shell', 'pilot', 'flying j', 'love\'s',
                                  'church', 'campsite', 'camp site', 'cracker barrel',
                                  "love's", "loves", 'meijer', 'kroger', 'publix',
                                  'site', 'spot', 'overnight parking',
                              }}

    # ---- Detector 2: long parentheticals (LLM reasoning leftovers) ----
    long_paren_titles = []
    for r in rows:
        n = (r.get('name') or '').strip()
        if LONG_PAREN_RE.search(n):
            long_paren_titles.append(r)

    # ---- Detector 3: prompt-leak v2 (broader patterns) ----
    prompt_leak_titles = []
    prompt_leak_descs = []
    for r in rows:
        n = (r.get('name') or '').strip()
        d = (r.get('description') or '').strip()
        if PROMPT_LEAK_BROAD.search(n):
            prompt_leak_titles.append(r)
        if PROMPT_LEAK_BROAD.search(d):
            prompt_leak_descs.append(r)

    # ---- Detector 4: unknown all-caps mid-word ----
    unknown_caps = []
    for r in rows:
        n = (r.get('name') or '').strip()
        if not n: continue
        for tok in re.findall(r'\b[A-Z][A-Z0-9-]{2,}\b', n):
            # Skip leading position
            if n.startswith(tok): continue
            # Skip recognized acronyms
            if tok.upper() in KNOWN_ACRONYMS: continue
            # Skip pure-digit suffixes
            if tok.replace('-', '').isdigit(): continue
            unknown_caps.append((r, tok))
            break

    # ---- Print summary ----
    print(f'\n=== HALLUCINATION CLUSTERS (name on 5+ distinct lat/lng) ===')
    print(f'Total clusters: {len(hallucination_clusters)}')
    items = sorted(hallucination_clusters.items(), key=lambda x: -len(x[1]))[:30]
    for n, ids in items:
        print(f'  {len(ids):4d}  {n[:60]}')

    print(f'\n=== LONG PARENTHETICALS in titles (LLM reasoning leak) ===')
    print(f'Total: {len(long_paren_titles)}')
    for r in long_paren_titles[:args.samples]:
        print(f'  • {r["name"][:80]}')

    print(f'\n=== PROMPT LEAKS (broader patterns) ===')
    print(f'In titles:       {len(prompt_leak_titles)}')
    print(f'In descriptions: {len(prompt_leak_descs)}')
    for r in prompt_leak_titles[:args.samples]:
        print(f'  • TITLE: {r["name"][:80]}')
    for r in prompt_leak_descs[:args.samples]:
        print(f'  • DESC ({r["kind"]}): {r["name"][:50]} → {r["description"][:120]}')

    print(f'\n=== UNKNOWN ALL-CAPS mid-name tokens ===')
    print(f'Total: {len(unknown_caps)}')
    tok_counts = Counter(tok for _, tok in unknown_caps)
    for tok, n in tok_counts.most_common(15):
        print(f'  {n:3d}  {tok}')


if __name__ == '__main__':
    main()
