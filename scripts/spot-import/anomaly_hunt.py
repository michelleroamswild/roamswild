#!/usr/bin/env python3
"""
Hunt for description / title anomalies the existing scan_weird_db.py
doesn't catch yet. Read-only — produces a sample report only.

Looks for:
  - Hallucination signals: GPS coords, "approximately N.N miles" with
    odd precision, brand names, road numbers in descriptions of
    different categories.
  - Truncated descriptions: ending in `,`, `and`, `but`, `or`, `…`.
  - Markdown / HTML leakage: `**bold**`, `<br>`, `&amp;`, `[text](url)`.
  - UTF-8 mojibake / smart quote mix.
  - Template repetition: 3+ sentences starting with the same word.
  - Odd word repetition: same content word 4+ times.
  - Repeated phrases: same 4-word phrase appearing twice.
  - Generic empty-template phrases.
  - Numbers with too-many digits ("at coordinates 37.123456789").
  - Wrong-category descriptions (e.g. laundromat row whose description
    talks about a parking lot).
  - Names that contain quote marks (LLM didn't strip them).
  - Descriptions starting with "It is" / "This is" / "A {kind}" leads.
  - Trailing whitespace + odd punctuation.
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
    """All ai_summarized community spots."""
    out = []
    offset = 0
    PAGE = 1000
    while True:
        url = (
            f'{PROD_URL}/rest/v1/spots'
            f'?select=id,name,description,kind,sub_kind'
            f'&source=eq.community'
            f'&extra->>ai_summarized=eq.true'
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
        if len(page) < PAGE: break
    return out


# Detectors as (name, predicate, severity) tuples.
# severity 'high' = clear AI artifact; 'medium' = often artifact; 'low' = check.
DETECTORS = [
    # --- Truncation / fragments ---
    ('desc_trunc_comma',     lambda r: bool(re.search(r',\s*$', r['description'] or '')), 'high'),
    ('desc_trunc_and_but',   lambda r: bool(re.search(r'\b(and|but|or|because)\s*[\.…]?\s*$', r['description'] or '', re.I)), 'high'),
    ('desc_trunc_ellipsis',  lambda r: bool(re.search(r'\.\.\.+\s*$|…\s*$', r['description'] or '')), 'high'),

    # --- Markdown / HTML leak ---
    ('md_bold',              lambda r: '**' in (r['description'] or '') or '**' in (r['name'] or ''), 'high'),
    ('md_link',              lambda r: bool(re.search(r'\[[^\]]+\]\([^)]+\)', (r['description'] or '') + (r['name'] or ''))), 'high'),
    ('md_heading',           lambda r: bool(re.search(r'^#+\s', (r['description'] or ''), re.M)), 'high'),
    ('html_tag',             lambda r: bool(re.search(r'<[a-z]+[^>]*>|&[a-z]+;', (r['description'] or ''), re.I)), 'high'),

    # --- Encoding mojibake ---
    ('mojibake',             lambda r: bool(re.search(r'â€™|â€œ|â€|Ã©|Ã¨|Ã ', (r['description'] or '') + (r['name'] or ''))), 'high'),
    ('mixed_quote_styles',   lambda r: ('“' in (r['description'] or '') and '"' in (r['description'] or ''))
                                       or ("'" in (r['description'] or '') and '’' in (r['description'] or '')), 'low'),

    # --- Repetition / templating ---
    ('three_starts_with_The',lambda r: len(re.findall(r'(?:^|[.!?]\s+)The\s+[A-Z]', r['description'] or '')) >= 3, 'medium'),
    ('repeat_phrase_4w',     lambda r: _has_repeat_phrase(r['description'] or '', 4), 'high'),
    ('repeat_word_4x',       lambda r: _has_repeat_word(r['description'] or '', 4), 'medium'),

    # --- Numeric weirdness ---
    ('gps_in_desc',          lambda r: bool(re.search(r'\b\d{1,3}\.\d{4,7}°?\s*[NSEW]?', r['description'] or '')), 'medium'),
    ('coord_pair',           lambda r: bool(re.search(r'\b\d{1,3}\.\d+°?\s*[NS][, ]+\d{1,3}\.\d+°?\s*[EW]', r['description'] or '', re.I)), 'high'),
    ('ten_digit_number',     lambda r: bool(re.search(r'\b\d{6,}\b', r['description'] or '')), 'medium'),

    # --- AI templating / prompt leaks in description ---
    ('desc_prompt_leak',     lambda r: bool(re.search(r'is classified as|user commentary|real place identifier|fit into category|doesn\'t fit', r['description'] or '', re.I)), 'high'),
    ('lead_it_is_a',         lambda r: bool(re.match(r'^\s*(?:It is a |This is a |A camping spot|A laundromat is|A water source|The site is a)', r['description'] or '')), 'medium'),

    # --- Doubled punctuation / odd whitespace ---
    ('doubled_punct',        lambda r: bool(re.search(r'[,!?;:]{2,}|\.{4,}', r['description'] or '')), 'medium'),
    ('multi_space',          lambda r: '  ' in (r['description'] or '').strip().rstrip() and not (r['description'] or '').endswith('  '), 'low'),

    # --- Names ---
    ('name_has_quotes',      lambda r: '"' in (r['name'] or '') or '"' in (r['name'] or '') or '"' in (r['name'] or ''), 'medium'),
    ('name_ends_punct',      lambda r: bool(re.search(r'[.,;:!?-]\s*$', (r['name'] or ''))) and not (r['name'] or '').endswith(' —'), 'low'),
    ('name_with_paren_note', lambda r: bool(re.search(r'\((?:Note|Since|Because|Assuming|If)[^)]*\)?$', r['name'] or '', re.I)), 'high'),

    # --- Generic / empty ---
    ('desc_too_generic',     lambda r: bool(re.match(r'^\s*The (?:site|location|place|area)\s+(?:is|has)\s+\w+\.?\s*$', r['description'] or '', re.I)), 'medium'),
    ('desc_empty',           lambda r: 0 < len((r['description'] or '').strip()) < 25, 'high'),

    # --- Wrong category ---
    ('water_desc_no_water',  lambda r: r['kind'] == 'water' and not re.search(r'\b(water|spigot|tap|fountain|fill|hose|hydrant|fountain)\b', r['description'] or '', re.I), 'high'),
    ('shower_desc_no_shower',lambda r: r['kind'] == 'shower' and not re.search(r'\b(shower|wash|hot|cold|stall)\b', r['description'] or '', re.I), 'high'),
    ('laundro_desc_no_wash', lambda r: r['kind'] == 'laundromat' and not re.search(r'\b(wash|laundr|machine|dryer|coin|load|cycle)\b', r['description'] or '', re.I), 'high'),
]


def _has_repeat_phrase(text: str, n: int) -> bool:
    """Any N-word phrase that appears 2+ times (case-insensitive, alphas only)."""
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


def _has_repeat_word(text: str, n: int) -> bool:
    """Any non-stop-word appearing 4+ times in same description."""
    STOP = {'the', 'and', 'for', 'with', 'are', 'has', 'this', 'that', 'from', 'have',
            'not', 'but', 'all', 'can', 'one', 'its', 'any', 'two', 'out'}
    words = [w for w in re.findall(r'\b[a-z]{3,}\b', (text or '').lower()) if w not in STOP]
    if not words:
        return False
    most_common = Counter(words).most_common(1)[0]
    return most_common[1] >= n


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--samples', type=int, default=4)
    args = parser.parse_args()

    print('Fetching all ai_summarized community rows from prod...', flush=True)
    rows = fetch_all()
    print(f'Got {len(rows)} rows.\n')

    counts = Counter()
    samples = defaultdict(list)
    severity = {name: sev for name, _, sev in DETECTORS}

    for r in rows:
        for name, check, _ in DETECTORS:
            try:
                if check(r):
                    counts[name] += 1
                    if len(samples[name]) < args.samples:
                        samples[name].append(r)
            except Exception:
                pass

    print(f'Anomaly summary across {len(rows)} rows:\n')
    print(f'{"DETECTOR":30s} {"SEV":7s} {"COUNT":>6s}')
    print('-' * 50)
    for name, n in sorted(counts.items(), key=lambda x: -x[1]):
        print(f'  {name:30s} {severity[name]:7s} {n:>6d}')

    print()
    for name, _, _ in DETECTORS:
        if not samples.get(name): continue
        print(f'\n=== {name} ({severity[name]}) — {counts[name]} hits, {len(samples[name])} samples ===')
        for r in samples[name]:
            print(f'  • [{r["kind"]}] {r["name"][:50]!r}')
            print(f'    {(r["description"] or "")[:200]}')


if __name__ == '__main__':
    main()
