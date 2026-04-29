#!/usr/bin/env python3
"""
Comprehensive anomaly scan across ALL description_summary fields. Pure
detection — does NOT call Ollama. Lists counts per anomaly type and
sample matches so you can decide what to fix.

Run: python3 13_unified_anomaly_scan.py [--samples 6]
"""

import argparse
import json
import re
from collections import Counter
from pathlib import Path

HERE = Path(__file__).parent
FILES = [
    'nation_filtered_clean.json',
    'nation_informal_clean.json',
    'nation_water_clean.json',
    'nation_showers_clean.json',
    'nation_laundromats_clean.json',
]

# Each anomaly type maps to a regex pattern to detect it.
ANOMALIES = {
    # First-person voice (Stage 8 patterns)
    'first_person': re.compile(
        r"\b("
        r"I[’']ve|I[’']m|I[’']d|I[’']ll|"
        r"We[’']ve|We[’']re|We[’']ll|We[’']d|"
        r"I had|I have|I was|I am|I went|I stayed|I parked|I camped|"
        r"I found|I saw|I think|I will|I would|I wouldn|I drove|I slept|"
        r"we had|we have|we stayed|we parked|we camped|we found|we went|"
        r"we saw|we drove|we slept|"
        r"my van|my rig|my camper|my truck|my car|my dog|"
        r"our van|our rig|our camper|our truck|our car|our dog"
        r")\b",
        re.IGNORECASE,
    ),
    # 'reviewer' / 'visitor' narrator mentions
    'reviewer_mention': re.compile(
        r"\b(reviewer|the visitor's|the reviewer's|reviewer's stay|during their stay)\b",
        re.IGNORECASE,
    ),
    # Narrative-of-the-visit phrases (Stage 9 patterns + extensions)
    'narrative_visit': re.compile(
        r"\b("
        r"was full|were full|"
        r"happen(?:ed)? to|ended up|decided to|decided not to|"
        r"because [a-z]+ (?:was|were)|"
        r"so (?:we|they|the [a-z]+)|"
        r"reportedly|according to|"
        r"upon arrival|during (?:the|a) (?:stay|visit|trip)|"
        r"appears? to be|seems? to be|"
        r"was used as (?:an? )?alternative|"
        r"spent (?:the|one|a|two|three|several) night|"
        r"stayed (?:there|here|for|overnight|one|two|the night)|"
        r"planned to|turned out|"
        r"a (?:government|park|forest|usfs|blm|local) (?:employee|ranger|worker|official) (?:said|stated|reported|told)"
        r")\b",
        re.IGNORECASE,
    ),
    # Phrases that almost always indicate trip context rather than place
    'trip_context': re.compile(
        r"\b(during the (?:reviewer'?s? )?(?:visit|stay|trip)|after the visit|prior to|on (?:our|their) way|"
        r"after a long|after driving|"
        r"while (?:we|they|the reviewer) (?:were|was)|"
        r"upon (?:arriving|leaving|the visit))\b",
        re.IGNORECASE,
    ),
    # Empty / meaningless / placeholder summaries
    'too_short': re.compile(r'^.{0,12}$'),
    # All-caps shouting (>30% caps in summaries longer than 20 chars)
    'shouty_caps': None,
    # Suspect leading-zero corruption (e.g., 'Located.6 mile' — should be 0.6)
    'missing_leading_zero': re.compile(r'\b[A-Za-z]+\.\d'),
    # 'camping spot' wording in NON-camping (utility) entries
    'utility_says_camping_spot': re.compile(r'\bcamping (?:spot|site|area)\b', re.IGNORECASE),
    # Awkward/AI-flavored closing phrasing — model often pads with
    # "in this area", "for those interested", "to ensure you can..."
    'ai_filler': re.compile(
        r"\b(for those (?:interested|willing|comfortable|prepared)|"
        r"to ensure (?:that |you )|"
        r"in this (?:area|location|spot|setting)|"
        r"making (?:it|this) (?:an? |the )?(?:ideal|perfect|great) (?:place|spot|location)|"
        r"a (?:great|perfect|nice|good) (?:option|choice|place))\b",
        re.IGNORECASE,
    ),
    # Lingering 'it'-corruption pattern from Stage 5 (single 't' adjacent to space dropped — many "ho", "tha", "wha")
    'maybe_t_corruption': re.compile(
        r"\b(?:wha|tha|ho|hree|en camping|tha t|whe re|ho t)\b",
        re.IGNORECASE,
    ),
}


def has_shouty_caps(text: str) -> bool:
    """True if more than 30% of the alphabetic chars in a sentence-length
    text are uppercase. Skips short strings to avoid false positives on
    abbreviations like 'BLM'."""
    if len(text) < 25:
        return False
    letters = [c for c in text if c.isalpha()]
    if not letters:
        return False
    upper = sum(1 for c in letters if c.isupper())
    return upper / len(letters) > 0.30


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--samples', type=int, default=6, help='Sample matches per anomaly type')
    args = parser.parse_args()

    counts = Counter()
    by_file = {f: Counter() for f in FILES}
    samples = {k: [] for k in ANOMALIES}
    flagged_keys = {k: [] for k in ANOMALIES}
    overall_flagged = set()
    total_scanned = 0

    for fname in FILES:
        p = HERE / fname
        if not p.exists():
            continue
        with open(p) as f:
            rows = json.load(f)
        is_utility = any(u in fname for u in ('water', 'showers', 'laundromats'))
        for r in rows:
            total_scanned += 1
            d = (r.get('description_summary') or '').strip()
            if not d:
                continue
            row_key = f'{round(r["lat"],5)},{round(r["lng"],5)}'
            for anomaly, regex in ANOMALIES.items():
                hit = False
                if anomaly == 'shouty_caps':
                    hit = has_shouty_caps(d)
                elif anomaly == 'utility_says_camping_spot':
                    hit = is_utility and bool(regex.search(d))
                elif regex is not None:
                    hit = bool(regex.search(d))
                if hit:
                    counts[anomaly] += 1
                    by_file[fname][anomaly] += 1
                    overall_flagged.add(row_key)
                    if len(samples[anomaly]) < args.samples:
                        samples[anomaly].append((
                            fname.replace('nation_', '').replace('_clean.json', ''),
                            r.get('name', ''),
                            d[:200],
                        ))
                    flagged_keys[anomaly].append(row_key)

    print(f'Scanned: {total_scanned}')
    print(f'Total unique entries flagged (any anomaly): {len(overall_flagged)} ({100*len(overall_flagged)/total_scanned:.1f}%)')
    print()
    print(f"{'Anomaly':30s}  Total   filtered  informal  water  showers  laundromats")
    for anomaly in ANOMALIES:
        total = counts[anomaly]
        if total == 0:
            continue
        per = lambda f: by_file[f][anomaly]
        print(
            f'{anomaly:30s}  {total:5d}   '
            f'{per("nation_filtered_clean.json"):8d}  {per("nation_informal_clean.json"):8d}  '
            f'{per("nation_water_clean.json"):5d}  {per("nation_showers_clean.json"):7d}  '
            f'{per("nation_laundromats_clean.json"):11d}'
        )
    print()
    for anomaly, lst in samples.items():
        if not lst:
            continue
        print(f'\n=== {anomaly} ({counts[anomaly]} total) ===')
        for src, nm, d in lst:
            print(f'  • [{src}] {nm}')
            print(f'    {d}')

    # Persist the union list for a future fix pass
    out_path = HERE / 'anomaly_keys.json'
    out_path.write_text(json.dumps(sorted(overall_flagged), indent=2))
    print(f'\n→ wrote {len(overall_flagged)} unique flagged keys to {out_path.name}')


if __name__ == '__main__':
    main()
