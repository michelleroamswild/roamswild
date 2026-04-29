#!/usr/bin/env python3
"""
Comprehensive scan for weird/AI-sounding text across ALL entries — both
titles and description summaries. Reports counts and writes the union
of flagged keys to public/test-data/review-list.json so iotest can
show only those for review.

Anomaly types:
  TITLE issues:
    - truncated mid-sentence (ends mid-word or trailing comma/dash)
    - rambling AI explanations ('not specified, but based on...')
    - too long (>50 chars)
    - placeholder words ('Unknown', 'Not specified', 'N/A', 'Various')
    - leading prepositions / lowercase ('off the road', 'in the back')

  DESCRIPTION_SUMMARY issues:
    - opens with 'This [place type]' / 'It is a' / 'A [type]' (AI pattern)
    - hedge phrases ('appears to be', 'seems to be', 'may be', 'might be')
    - reviewer commentary phrases ('great place', 'perfect for',
      'for those who', 'making it ideal')
    - first-person voice
    - 'reviewer' or 'visitor' mentions
    - prompt-leak text ('A laundromat is not mentioned', 'I'll rewrite')
    - 'in this area' / 'in this spot' filler
    - 'it is described as' meta language
    - 'note that', 'note:' annotations
    - 'a great place', 'a perfect spot'
    - empty / ultra-short (<15 chars)
"""

import argparse
import json
import re
from collections import Counter
from pathlib import Path

HERE = Path(__file__).parent
PUBLIC = HERE.parent.parent / 'public' / 'test-data'

FILES = [
    'nation_filtered_clean.json',
    'nation_informal_clean.json',
    'nation_water_clean.json',
    'nation_showers_clean.json',
    'nation_laundromats_clean.json',
]

# --- Title detectors ---
TITLE_PATTERNS = {
    'too_long': lambda t: len(t) > 50,
    'truncated': lambda t: bool(re.search(r'(,$|—$|-$|\.\.\.|\bbut\s*$|\band\s*$|\bbased\s*$|\bsince\s*$|\bin\s+the\s*$)', t.strip())),
    'AI_explanation': lambda t: bool(re.search(r'\b(not specified|not applicable|not available|N/A|based on|since (?:the|it|this)|appears to be|because (?:the|it))\b', t, re.IGNORECASE)),
    'placeholder': lambda t: bool(re.match(r'^(Unknown|Various|None|Other|Misc(ellaneous)?|N/A|TBD|Spot|Site|Location|Place)\s*$', t.strip(), re.IGNORECASE)),
    'lowercase_lead': lambda t: bool(t) and t[0].islower(),
    'lead_preposition': lambda t: bool(re.match(r'^(off|on|in|at|near|by|behind|next to|across|along|under|past)\s+the\b', t, re.IGNORECASE)),
}

# --- Description detectors ---
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

# Hallucination signals
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

# Specific tokens that, if in summary but not in raw description, suggest
# fabrication. Catches things like "Forest Service Road 1" the model invented.
SPECIFIC_TOKEN_RE = re.compile(
    r'\b(?:'
    r'(?:FR|FS|NF|CR|SR|FSR)[\s\-]?\d+'
    r'|Highway\s+\d+|Hwy\s+\d+|US[\s\-]+\d+|I[\s\-]?\d{1,3}\b|Interstate\s+\d+'
    r'|Forest\s+(?:Service\s+)?Road\s+\d+'
    r')\b',
    re.IGNORECASE,
)


def has_fabricated_specifics(summary: str, raw: str) -> bool:
    """Returns True when the summary mentions a road/highway specifier whose
    digit sequence doesn't appear anywhere in the original description.
    Doesn't care about formatting (FR 371 == FR-371 == Forest Road 371)."""
    matches = list(SPECIFIC_TOKEN_RE.finditer(summary or ''))
    if not matches:
        return False
    raw_lower = (raw or '').lower()
    for m in matches:
        digits = re.search(r'\d+', m.group(0))
        if not digits:
            continue
        d = digits.group(0)
        # Match the number anywhere in raw (with word boundaries)
        if not re.search(rf'\b{re.escape(d)}\b', raw_lower):
            return True
    return False


# Closure to give the lambdas access to raw_desc via row context — handled
# in the main loop. The dict keys are the pattern names.
DESC_PATTERNS = {
    'first_person':         lambda d, raw: bool(FIRST_PERSON_RE.search(d)),
    'reviewer_mention':     lambda d, raw: bool(REVIEWER_RE.search(d)),
    'prompt_leak':          lambda d, raw: bool(PROMPT_LEAK_RE.search(d)),
    'placeholder_text':     lambda d, raw: bool(PLACEHOLDER_RE.search(d)),
    'located_at_vague':     lambda d, raw: bool(LOCATED_AT_VAGUE_RE.search(d)),
    'fabricated_specific':  lambda d, raw: has_fabricated_specifics(d, raw),
    'hedge_phrase':         lambda d, raw: bool(HEDGE_RE.search(d)),
    'AI_filler':            lambda d, raw: bool(AI_FILLER_RE.search(d)),
    'meta_language':        lambda d, raw: bool(META_RE.search(d)),
    'narrative_visit':      lambda d, raw: bool(NARRATIVE_RE.search(d)),
    'too_short':            lambda d, raw: 0 < len(d.strip()) < 15,
    'shouty_caps':          lambda d, raw: len(d) >= 25 and (sum(1 for c in d if c.isalpha() and c.isupper()) / max(1, sum(1 for c in d if c.isalpha()))) > 0.30,
    'missing_leading_zero': lambda d, raw: bool(LEADING_ZERO_RE.search(d)),
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--samples', type=int, default=4)
    args = parser.parse_args()

    # High-confidence weirdness signals (default, gets into review-list.json).
    # Excludes hedge_phrase (often legitimate qualified language like "may be
    # slippery") and title:too_long (real names can be long).
    HIGH_CONF_TITLE = {'truncated', 'placeholder', 'lowercase_lead', 'lead_preposition'}
    HIGH_CONF_DESC = {'first_person', 'reviewer_mention', 'prompt_leak',
                      'placeholder_text', 'located_at_vague',
                      'fabricated_specific',
                      'AI_filler', 'meta_language', 'narrative_visit',
                      'too_short', 'shouty_caps', 'missing_leading_zero'}
    counts = Counter()
    samples = {k: [] for k in (*TITLE_PATTERNS, *DESC_PATTERNS)}
    flagged_keys = set()
    total = 0

    for fname in FILES:
        p = HERE / fname
        if not p.exists():
            continue
        short = fname.replace('nation_', '').replace('_clean.json', '')
        with open(p) as f:
            rows = json.load(f)
        for r in rows:
            total += 1
            name = str(r.get('name') or '').strip()
            desc = str(r.get('description_summary') or '').strip()
            raw  = str(r.get('description') or '').strip()
            row_key = f'{round(r["lat"],5):.5f},{round(r["lng"],5):.5f}'
            for t, check in TITLE_PATTERNS.items():
                if name and check(name):
                    counts[f'title:{t}'] += 1
                    if len(samples[t]) < args.samples:
                        samples[t].append((short, name, desc[:160]))
                    if t in HIGH_CONF_TITLE:
                        flagged_keys.add(row_key)
            for t, check in DESC_PATTERNS.items():
                try:
                    is_hit = bool(desc) and check(desc, raw)
                except Exception as e:
                    print(f'  [error in {t}] desc={desc!r} err={e}')
                    raise
                if is_hit:
                    counts[f'desc:{t}'] += 1
                    if len(samples[t]) < args.samples:
                        samples[t].append((short, name, desc[:200]))
                    if t in HIGH_CONF_DESC:
                        flagged_keys.add(row_key)

    print(f'Scanned: {total}')
    print(f'Total unique entries flagged: {len(flagged_keys)} ({100*len(flagged_keys)/total:.1f}%)\n')

    # Print counts grouped
    print('TITLE issues:')
    for t in TITLE_PATTERNS:
        n = counts.get(f'title:{t}', 0)
        if n:
            print(f'  {t:20s} {n}')
    print('\nDESCRIPTION issues:')
    for t in DESC_PATTERNS:
        n = counts.get(f'desc:{t}', 0)
        if n:
            print(f'  {t:20s} {n}')

    # Samples
    for t, lst in samples.items():
        if not lst:
            continue
        print(f'\n=== {t} ({len(lst)} samples) ===')
        for src, name, desc in lst:
            print(f'  • [{src}] {name}')
            print(f'    {desc}')

    # Write the keys
    PUBLIC.mkdir(parents=True, exist_ok=True)
    out = [{'lat': float(k.split(',')[0]), 'lng': float(k.split(',')[1])} for k in sorted(flagged_keys)]
    out_path = PUBLIC / 'review-list.json'
    out_path.write_text(json.dumps(out, indent=2))
    print(f'\nWrote {len(out)} review entries to {out_path}')


if __name__ == '__main__':
    main()
