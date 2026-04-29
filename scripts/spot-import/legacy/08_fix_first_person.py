#!/usr/bin/env python3
"""
Re-summarize the small subset of entries whose AI summaries slipped into
first-person voice ('I', 'we', 'my', 'our'). Tighter prompt explicitly
bans first-person.

Run: python3 08_fix_first_person.py
Then re-run the loader to push to Supabase.
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

# Same first-person regex as the checker
FP_RE = re.compile(
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
)

PROMPT = (
    "Rewrite this camping-spot description as a concise neutral third-person "
    "summary.\n\n"
    "Strict rules:\n"
    "- NEVER use first-person words: no 'I', 'we', 'us', 'my', 'our', 'mine', "
    "'ours', 'I've', 'we've', 'we stayed', etc. Always third person or passive.\n"
    "- Use only information explicitly stated in the original; do not invent details.\n"
    "- Drop reviewer commentary: nice, great, beautiful, amazing, perfect.\n"
    "- Aim for 40 words or fewer. Never exceed 60 words.\n"
    "- Plain prose. No bullets, no preamble like 'Here is...'.\n"
    "- Output ONLY the summary text on one line.\n\n"
    "Original description:\n{description}\n\n"
    "Summary:"
)


def call_ollama(text: str) -> str:
    body = json.dumps({
        'model': MODEL,
        'prompt': PROMPT.format(description=text),
        'stream': False,
        'options': {'temperature': 0.0, 'num_predict': 120},
    }).encode('utf-8')
    req = urllib.request.Request(
        OLLAMA_URL,
        data=body,
        headers={'Content-Type': 'application/json'},
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
        return json.loads(resp.read()).get('response', '').strip()


def main():
    total_fixed = 0
    started = time.time()
    for fname in FILES:
        p = HERE / fname
        if not p.exists():
            continue
        with open(p) as f:
            rows = json.load(f)
        targets = [(i, r) for i, r in enumerate(rows)
                   if r.get('description_summary') and FP_RE.search(r['description_summary'])]
        if not targets:
            print(f'  {fname}: 0 first-person summaries — skip')
            continue
        print(f'  {fname}: re-summarizing {len(targets)} entries...')
        for i, r in targets:
            # Use the original (raw) description as the source
            source = r.get('description') or r.get('description_summary')
            if not source:
                continue
            try:
                new = call_ollama(source)
                # Sanity check: if the new summary still has first-person, try once
                # more with the previous summary as context (model may listen better
                # the second time).
                if FP_RE.search(new):
                    print(f'    [retry] still first-person: {new[:80]}')
                    new = call_ollama(source + '\n\n(Previous attempt used first-person; rewrite without I/we/our/my.)')
                rows[i]['description_summary'] = new
                total_fixed += 1
            except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
                print(f'    [error] {e}; skipping idx {i}')
        p.write_text(json.dumps(rows, indent=2, default=str))
    elapsed = time.time() - started
    print(f'\nDone. Fixed {total_fixed} summaries in {elapsed:.0f}s.')


if __name__ == '__main__':
    main()
