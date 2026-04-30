#!/usr/bin/env python3
"""
Scan community spot descriptions for access-difficulty signals (4WD/4x4 etc.)
and tag matching spots with extra.access_difficulty='hard'.

Why: community spots are user-reported so road-tag classification doesn't fire
(they may not be on a tagged OSM road). The description text often contains the
real signal — "4WD required", "rough road", "high clearance only" etc.

Usage:
  python3 scan_descriptions_for_access.py                # dry-run; show counts + samples
  python3 scan_descriptions_for_access.py --apply        # update spots.extra.access_difficulty
  python3 scan_descriptions_for_access.py --bbox S,W,N,E # limit scope (optional)
"""
import argparse
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent
ENV_PATH = PROJECT_ROOT / '.env'
SUPABASE_URL = 'https://ioseedbzvogywztbtgjd.supabase.co'

# Patterns that indicate vehicle requirements. Each tuple is
# (label, vehicle_required_value, regex).
# We tag amenities.vehicle_required — same field derived spots use —
# so /dispersed can already filter on it. We do NOT modify access_difficulty
# (that stays reserved for the road-tag classifier).
PATTERNS = [
    ('4wd_required',      '4wd',            re.compile(r'\b(4[\s-]?w[\s-]?d|4[\s-]?x[\s-]?4|four[\s-]?wheel[\s-]?drive)\b.{0,30}\b(required|necessary|needed|only|must)\b', re.I)),
    ('atv_only',          '4wd',            re.compile(r'\b(atv|utv)\b.{0,15}\b(only|required|access)\b', re.I)),
    ('high_clearance',    'high_clearance', re.compile(r'\bhigh[\s-]?clearance\b.{0,30}\b(required|necessary|needed|only|must|recommended|vehicle)\b', re.I)),
    ('rough_road',        'high_clearance', re.compile(r'\b(rough|rocky|rutted|washed[\s-]?out)\b.{0,20}\b(road|track|trail|drive|way)\b', re.I)),
    ('not_for_low_car',   'high_clearance', re.compile('\\b(not|do[\\s-]?n[\'’]?t).{0,30}\\b(sedan|low[\\s-]?clearance|2[\\s-]?w[\\s-]?d|small car|passenger car)\\b', re.I)),
    ('very_rough',        'high_clearance', re.compile(r'\b(very[\s-]?rough|extremely[\s-]?rough|very[\s-]?rocky)\b', re.I)),
]

# Negation/qualifier guard. If any of these appear within ~30 chars before
# the match, drop it (false positive — describes the access being EASY).
NEGATION_NEAR = re.compile(
    r'\b(no|not|without|n[\'’]t need|any (?:vehicle|car|sedan)|passenger[\s-]?(?:car|vehicle)?\s*(?:ok|fine|works)?)\b',
    re.I,
)


def is_negated(description: str, match: re.Match) -> bool:
    """Check if the 30 chars preceding the match contain a negation."""
    start = max(0, match.start() - 30)
    prefix = description[start:match.start()]
    return bool(NEGATION_NEAR.search(prefix))


def load_env():
    if not ENV_PATH.exists():
        sys.exit(f'No .env at {ENV_PATH}')
    pat = re.compile(r'^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\n]*?)"?\s*$')
    with open(ENV_PATH) as f:
        for line in f:
            m = pat.match(line.rstrip())
            if m:
                os.environ.setdefault(m.group(1), m.group(2))


def http(method, url, key, body=None):
    headers = {'apikey': key, 'Authorization': f'Bearer {key}'}
    if body is not None:
        headers['Content-Type'] = 'application/json'
        headers['Prefer'] = 'return=minimal'
    req = urllib.request.Request(
        url, method=method, headers=headers,
        data=json.dumps(body).encode() if body is not None else None,
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        text = r.read()
        return r.status, (json.loads(text) if text else None)


def fetch_community_spots(key, bbox=None):
    """Stream community spots in pages, returning id/name/description/amenities."""
    PAGE = 1000
    offset = 0
    rows = []
    while True:
        q = (
            'select=id,name,description,amenities'
            '&source=eq.community'
            '&description=not.is.null'
            f'&limit={PAGE}&offset={offset}'
            '&order=id'
        )
        if bbox:
            s, w, n, e = bbox
            q += f'&latitude=gte.{s}&latitude=lte.{n}&longitude=gte.{w}&longitude=lte.{e}'
        _, page = http('GET', f'{SUPABASE_URL}/rest/v1/spots?{q}', key)
        page = page or []
        if not page:
            break
        rows.extend(page)
        if len(page) < PAGE:
            break
        offset += PAGE
    return rows


def classify(description):
    """Returns (vehicle_required, list of pattern labels that matched).
    vehicle_required is '4wd' if any 4wd-tier pattern hits, else
    'high_clearance' if any HC-tier pattern hits, else None."""
    if not description:
        return None, []
    matches = []
    requires_4wd = False
    requires_hc = False
    for name, level, pat in PATTERNS:
        m = pat.search(description)
        if not m:
            continue
        if is_negated(description, m):
            continue
        matches.append(name)
        if level == '4wd':
            requires_4wd = True
        elif level == 'high_clearance':
            requires_hc = True
    if requires_4wd:
        return '4wd', matches
    if requires_hc:
        return 'high_clearance', matches
    return None, matches


def update_spot(key, spot_id, amenities, vehicle_required):
    """Set amenities.vehicle_required without clobbering other amenity keys."""
    new_amenities = dict(amenities or {})
    new_amenities['vehicle_required'] = vehicle_required
    return http(
        'PATCH',
        f'{SUPABASE_URL}/rest/v1/spots?id=eq.{spot_id}',
        key, body={'amenities': new_amenities},
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true', help='write tags to DB (otherwise dry-run)')
    parser.add_argument('--bbox', help='south,west,north,east — limit to this bbox')
    parser.add_argument('--samples', type=int, default=5, help='samples to print per pattern')
    args = parser.parse_args()

    bbox = None
    if args.bbox:
        bbox = tuple(float(x) for x in args.bbox.split(','))
        if len(bbox) != 4:
            sys.exit('bbox must be south,west,north,east')

    load_env()
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    if not key:
        sys.exit('SUPABASE_SERVICE_ROLE_KEY missing')

    print(f'fetching community spots{" in bbox "+args.bbox if bbox else ""}...')
    spots = fetch_community_spots(key, bbox)
    print(f'  {len(spots)} community spots with descriptions')

    # Skip ones already classified to avoid clobbering
    skipped_already = 0
    matched_4wd: list = []
    matched_hc: list = []
    pattern_counts = {p[0]: 0 for p in PATTERNS}
    pattern_samples = {p[0]: [] for p in PATTERNS}

    for s in spots:
        existing_vehicle = (s.get('amenities') or {}).get('vehicle_required')
        if existing_vehicle:
            skipped_already += 1
            continue
        level, hits = classify(s.get('description') or '')
        if not level:
            continue
        if level == '4wd':
            matched_4wd.append(s)
        else:
            matched_hc.append(s)
        for h in hits:
            pattern_counts[h] += 1
            if len(pattern_samples[h]) < args.samples:
                pattern_samples[h].append(s)

    print(f'\n=== Match summary ===')
    print(f'  skipped (already has vehicle_required): {skipped_already}')
    print(f'  → tag as 4wd:            {len(matched_4wd)}')
    print(f'  → tag as high_clearance: {len(matched_hc)}')
    print(f'  unmatched: {len(spots) - skipped_already - len(matched_4wd) - len(matched_hc)}')

    print(f'\n=== Per-pattern breakdown ===')
    for name, _level, _pat in PATTERNS:
        n = pattern_counts[name]
        if n == 0:
            print(f'  {name:20} {n:4}')
            continue
        print(f'  {name:20} {n:4}  examples:')
        for s in pattern_samples[name]:
            desc = (s.get('description') or '').replace('\n', ' ')[:100]
            print(f'      {(s.get("name") or "")[:30]:30}  "{desc}"')

    if not args.apply:
        print('\n(dry-run — re-run with --apply to write tags to DB)')
        return

    total = len(matched_4wd) + len(matched_hc)
    print(f'\napplying tags to {total} spots...')
    ok = 0
    err = 0
    i = 0
    for level, group in (('4wd', matched_4wd), ('high_clearance', matched_hc)):
        for s in group:
            i += 1
            try:
                update_spot(key, s['id'], s.get('amenities') or {}, level)
                ok += 1
                if i % 200 == 0:
                    print(f'  {i}/{total}...')
            except Exception as e:
                err += 1
                if err < 5:
                    print(f'  error on {s["id"][:8]}: {e}')
    print(f'\nDone. tagged: {ok}  errors: {err}')


if __name__ == '__main__':
    main()
