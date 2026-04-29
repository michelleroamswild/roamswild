#!/usr/bin/env python3
"""
1. Re-summarize utility (water/showers/laundromat) entries because their
   descriptions are still corrupted by the Stage 5 't'-stripping bug.
   Source: the original Stage 1b output (nation_water.json etc), which
   is intact.
2. Re-summarize any camping entries whose summary mentions 'the reviewer'
   or related reviewer-narrative phrases.

Outputs the result back into the *_clean.json files.
"""

import json
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent

OLLAMA_URL = 'http://localhost:11434/api/generate'
MODEL = 'llama3.1:8b'
TIMEOUT_S = 30  # per-call hard cap; if Ollama hangs, abandon and move on

# Use the same generic prompt that's now in 02_summarize_descriptions.py
PROMPT = (
    "Rewrite the description below into a concise neutral summary about "
    "the LOCATION (could be a camping spot, a water source, a shower "
    "facility, a laundromat, etc.).\n\n"
    "Strict rules:\n"
    "- Describe the LOCATION/PLACE, not the visit. Never refer to 'the "
    "reviewer', 'visitor', 'we', 'I', 'our', etc.\n"
    "- Use ONLY information explicitly stated. Do NOT invent amenities, "
    "terrain features, road conditions, wildlife, prices, or anything else.\n"
    "- Match terminology to the place type — call a laundromat a "
    "laundromat, water source a water source, etc. Do NOT call a "
    "laundromat or water source a 'camping spot'.\n"
    "- If the original is sparse, the summary should be sparse too. A "
    "10-word summary is fine if that is all the source supports.\n"
    "- Drop reviewer commentary: 'nice', 'great', 'beautiful', 'amazing'.\n"
    "- Aim for 30 words or fewer. Never exceed 50 words.\n"
    "- Plain prose, no bullets, no headers.\n"
    "- Output ONLY the summary text on one line.\n\n"
    "Original description:\n{description}\n\n"
    "Summary:"
)

REVIEWER_RE = re.compile(r"\breviewer\b|the reviewer's|the visitor's", re.IGNORECASE)


def call_ollama(text: str) -> str:
    body = json.dumps({
        'model': MODEL,
        'prompt': PROMPT.format(description=text),
        'stream': False,
        'options': {'temperature': 0.0, 'num_predict': 100},
    }).encode('utf-8')
    req = urllib.request.Request(
        OLLAMA_URL, data=body,
        headers={'Content-Type': 'application/json'},
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
        return json.loads(resp.read()).get('response', '').strip().splitlines()[0].strip()


def key(e):
    return (round(e['lat'], 5), round(e['lng'], 5), e.get('name_original', ''))


def repair_utilities():
    """Re-summarize utility _clean files using the original raw descriptions
    from the pre-Stage-2 input files (intact). Resumable — skips entries
    whose description has already been restored from raw."""
    pairs = [
        ('nation_water.json',       'nation_water_clean.json'),
        ('nation_showers.json',     'nation_showers_clean.json'),
        ('nation_laundromats.json', 'nation_laundromats_clean.json'),
    ]
    for raw_name, clean_name in pairs:
        rp = HERE / raw_name
        cp = HERE / clean_name
        if not rp.exists() or not cp.exists():
            continue
        with open(rp) as f:
            raw = json.load(f)
        with open(cp) as f:
            clean = json.load(f)
        raw_idx = {key(e): e for e in raw}
        # Resume: skip entries whose `description` already matches the
        # raw input (i.e. they were already restored).
        todo = []
        for i, r in enumerate(clean):
            src = raw_idx.get(key(r))
            if not src:
                continue
            raw_desc = (src.get('description') or '').strip()
            if r.get('description') == raw_desc and r.get('description_summary'):
                continue
            todo.append((i, r, raw_desc))
        print(f'\n{clean_name}: {len(todo)} of {len(clean)} entries to repair')
        started = time.time()
        for j, (i, r, raw_desc) in enumerate(todo):
            r['description'] = raw_desc
            if not raw_desc:
                r['description_summary'] = None
                continue
            try:
                r['description_summary'] = call_ollama(raw_desc) if len(raw_desc) >= 20 else raw_desc
            except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
                print(f'  [timeout/err] entry {i}: {e}; keep raw as fallback')
                r['description_summary'] = raw_desc[:300]
            if (j + 1) % 25 == 0:
                cp.write_text(json.dumps(clean, indent=2, default=str))
                eta = (time.time() - started) / (j + 1) * (len(todo) - j - 1)
                print(f'  [{j+1}/{len(todo)}] eta {eta:.0f}s')
        cp.write_text(json.dumps(clean, indent=2, default=str))
        elapsed = time.time() - started
        print(f'  {clean_name} done in {elapsed:.0f}s')


def repair_reviewer_camping():
    """Re-summarize camping entries whose summaries mention 'the reviewer'."""
    files = ['nation_filtered_clean.json', 'nation_informal_clean.json']
    for fname in files:
        p = HERE / fname
        with open(p) as f:
            rows = json.load(f)
        flagged = [(i, r) for i, r in enumerate(rows)
                   if r.get('description_summary') and REVIEWER_RE.search(r['description_summary'])]
        if not flagged:
            print(f'\n{fname}: 0 reviewer mentions')
            continue
        print(f'\n{fname}: re-summarizing {len(flagged)} reviewer mentions...')
        started = time.time()
        for j, (i, r) in enumerate(flagged):
            src = (r.get('description') or '').strip()
            if not src:
                continue
            try:
                rows[i]['description_summary'] = call_ollama(src)
            except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
                print(f'  [error] idx {i}: {e}')
            if (j + 1) % 25 == 0:
                p.write_text(json.dumps(rows, indent=2, default=str))
        p.write_text(json.dumps(rows, indent=2, default=str))
        elapsed = time.time() - started
        print(f'  done in {elapsed:.0f}s')


def main():
    repair_utilities()
    repair_reviewer_camping()


if __name__ == '__main__':
    main()
