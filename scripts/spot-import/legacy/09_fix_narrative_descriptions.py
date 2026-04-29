#!/usr/bin/env python3
"""
Detect and re-summarize 'narrative-of-the-visit' descriptions — summaries
that describe events/circumstances rather than the spot itself. Examples:

  Bad:  "A rest area was full, so we stopped on a gravel track. The
         employee said it opens in May."
  Good: "Gravel track near a rest area; AT&T 3-4 bars; opens in May."

Heuristic: count how many narrative phrases appear in the summary. >= 2
matches => flag for re-summarization. Tighter prompt forces the model to
extract location facts only.

Run: python3 09_fix_narrative_descriptions.py
"""

import json
import re
import time
from pathlib import Path
import urllib.request
import urllib.error

HERE = Path(__file__).parent
FILES = [
    'nation_filtered_clean.json',
    'nation_informal_clean.json',
    'nation_water_clean.json',
    'nation_showers_clean.json',
    'nation_laundromats_clean.json',
]

OLLAMA_URL = 'http://localhost:11434/api/generate'
MODEL = 'llama3.1:8b'
TIMEOUT_S = 60

# Narrative-of-the-visit phrases. Each is a soft signal; need >= NARRATIVE_THRESHOLD
# matches to flag. Tuned to find descriptions that include events/context the
# AI didn't strip from the source.
NARRATIVE_PATTERNS = [
    r'\bwas full\b',
    r'\bwere full\b',
    r'\bhappen(?:ed)? to\b',
    r'\bended up\b',
    r'\bdecided to\b',
    r'\bdecided not to\b',
    r'\bbecause [a-z]+ (?:was|were)\b',
    r'\bso (?:we|they|the [a-z]+)\b',
    r'\breportedly\b',
    r'\baccording to\b',
    r'\b(?:a|an) (?:government|park|forest|usfs|blm|local) (?:employee|ranger|worker|official) (?:said|stated|reported|told)\b',
    r'\bupon arrival\b',
    r'\bduring (?:the|a) (?:stay|visit|trip)\b',
    r'\bappears? to be\b',
    r'\bwas used as (?:an? )?alternative\b',
    r'\bspent (?:the|one|a|two|three|several) night\b',
    r'\bstayed (?:there|here|for|overnight|one|two|the night)\b',
    r'\bplanned to\b',
    r'\bturned out\b',
    r'\bended (?:the|at|in)\b',
    r'\bnoted (?:that|the)\b',
    r'\bobserved (?:that|the|by)\b',
    r'\bafter (?:the|a) (?:stay|visit|trip|night)\b',
]
NARRATIVE_RES = [re.compile(p, re.IGNORECASE) for p in NARRATIVE_PATTERNS]
NARRATIVE_THRESHOLD = 1  # flag when at least this many patterns match


def narrative_score(text: str):
    if not text:
        return 0, []
    matches = []
    for p in NARRATIVE_RES:
        m = p.search(text)
        if m:
            matches.append(m.group(0))
    return len(matches), matches


PROMPT = (
    "Rewrite this camping-spot description as a SHORT location-fact summary. "
    "The output should describe the place itself (terrain, surface, road, "
    "amenities, signal) — NOT the visit, the visitor's situation, or what "
    "anyone said.\n\n"
    "Strict rules:\n"
    "- DESCRIBE THE PLACE, not events. Drop anything about who arrived, why "
    "they stopped, who said what, when something opens, or what the "
    "reviewer did.\n"
    "- Use third person, neutral tone. Never use 'I', 'we', 'my', 'our'.\n"
    "- Use ONLY facts present in the original. Don't invent details.\n"
    "- Aim for 25 words; never exceed 40 words.\n"
    "- Output ONLY the summary text on one line, no preamble.\n\n"
    "Examples:\n\n"
    "Original: A rest area was full, so we stopped on a gravel track with "
    "limited turning space for our 38ft bus. We had 3-4 bars of AT&T signal "
    "and were near an ATV route.\n"
    "Summary: Gravel track adjacent to a rest area; tight turnaround; AT&T "
    "3-4 bars; near an ATV route.\n\n"
    "Original: The Edson Creek Campground was closed when we arrived, "
    "opening in May according to a government employee. We camped in the "
    "parking turnout next to the group area.\n"
    "Summary: Parking turnout next to the Edson Creek Campground group "
    "area; campground itself closed until May.\n\n"
    "Now rewrite this:\n"
    "Original: {description}\n"
    "Summary:"
)


def call_ollama(text: str) -> str:
    body = json.dumps({
        'model': MODEL,
        'prompt': PROMPT.format(description=text),
        'stream': False,
        'options': {'temperature': 0.0, 'num_predict': 80},
    }).encode('utf-8')
    req = urllib.request.Request(
        OLLAMA_URL,
        data=body,
        headers={'Content-Type': 'application/json'},
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
        return json.loads(resp.read()).get('response', '').strip().splitlines()[0].strip()


def main():
    started = time.time()
    grand_flagged = 0
    grand_fixed = 0
    for fname in FILES:
        p = HERE / fname
        if not p.exists():
            continue
        with open(p) as f:
            rows = json.load(f)
        targets = []
        for i, r in enumerate(rows):
            d = r.get('description_summary') or ''
            score, matches = narrative_score(d)
            if score >= NARRATIVE_THRESHOLD:
                targets.append((i, r, matches))
        grand_flagged += len(targets)
        if not targets:
            print(f'  {fname}: 0 flagged')
            continue
        print(f'  {fname}: re-summarizing {len(targets)} entries...')
        # Use the original (raw) description as source — has more facts to extract
        for i, r, _matches in targets:
            source = r.get('description') or r.get('description_summary')
            if not source:
                continue
            try:
                new = call_ollama(source)
                rows[i]['description_summary'] = new
                grand_fixed += 1
            except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
                print(f'    [error] idx {i}: {e}; skip')
        p.write_text(json.dumps(rows, indent=2, default=str))
    elapsed = time.time() - started
    print(f'\nDone. Flagged {grand_flagged} entries, fixed {grand_fixed} in {elapsed:.0f}s.')


if __name__ == '__main__':
    main()
