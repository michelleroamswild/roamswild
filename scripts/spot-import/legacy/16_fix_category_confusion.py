#!/usr/bin/env python3
"""
Re-summarize entries where the AI hallucinated the wrong category in the
summary (e.g. shower described as 'a laundromat' when no laundry-related
text appears in the original).

Detection: summary mentions wrong category word AND original description
has zero terms related to that wrong category.
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
TIMEOUT_S = 30

PROMPT_BY_CATEGORY = {
    'showers': (
        "This is a SHOWER FACILITY for travelers. Rewrite the description "
        "into a concise neutral summary about the SHOWER.\n\n"
        "Strict rules:\n"
        "- The location is a SHOWER. Do NOT say it is a 'laundromat', "
        "'water source', or anything else.\n"
        "- Describe: hours, cost, amenities (private/public, hot/cold, "
        "towels, lockers, facilities).\n"
        "- Never write 'I', 'we', 'my', 'our', 'the reviewer'.\n"
        "- Use ONLY information explicitly stated in the original.\n"
        "- Aim for 30 words or fewer.\n"
        "- Output ONLY the summary on one line. No preamble.\n\n"
        "Description:\n{description}\n\n"
        "Summary:"
    ),
    'water': (
        "This is a WATER SOURCE (potable water tap, spigot, fountain, fill "
        "station). Rewrite the description into a concise neutral summary.\n\n"
        "Strict rules:\n"
        "- The location is a WATER SOURCE. Do NOT say it is a 'laundromat', "
        "'shower facility', or anything else.\n"
        "- Describe: location of tap, hours, cost, potability.\n"
        "- Never write 'I', 'we', 'my', 'our', 'the reviewer'.\n"
        "- Use ONLY information explicitly stated.\n"
        "- Aim for 30 words or fewer.\n"
        "- Output ONLY the summary on one line. No preamble.\n\n"
        "Description:\n{description}\n\n"
        "Summary:"
    ),
}

LAUNDRY_TERMS = re.compile(r'(laundr|laundromat|washer|washing|dryer|coin[- ]?op)', re.IGNORECASE)
SHOWER_TERMS  = re.compile(r'(shower|bath|locker)', re.IGNORECASE)
WATER_TERMS   = re.compile(r'(water|spigot|tap|hose|fill[- ]?up|potable|fountain)', re.IGNORECASE)


def call_ollama(prompt: str) -> str:
    body = json.dumps({
        'model': MODEL,
        'prompt': prompt,
        'stream': False,
        'options': {'temperature': 0.0, 'num_predict': 100},
    }).encode('utf-8')
    req = urllib.request.Request(OLLAMA_URL, data=body,
                                  headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
        return json.loads(resp.read()).get('response', '').strip().splitlines()[0].strip()


def main():
    started = time.time()
    fixed = 0
    for fname, prompt_key, summary_pat, raw_neg_pat, label in [
        ('nation_showers_clean.json', 'showers',
            re.compile(r'\blaundromat\b', re.IGNORECASE), LAUNDRY_TERMS, 'shower→laundromat'),
        ('nation_showers_clean.json', 'showers',
            re.compile(r'\bwater source\b', re.IGNORECASE), WATER_TERMS, 'shower→water_source'),
        ('nation_water_clean.json', 'water',
            re.compile(r'\blaundromat\b', re.IGNORECASE), LAUNDRY_TERMS, 'water→laundromat'),
        ('nation_water_clean.json', 'water',
            re.compile(r'\bshower', re.IGNORECASE), SHOWER_TERMS, 'water→shower'),
    ]:
        p = HERE / fname
        if not p.exists():
            continue
        with open(p) as f:
            rows = json.load(f)
        targets = [(i, r) for i, r in enumerate(rows)
                   if summary_pat.search(r.get('description_summary') or '')
                   and not raw_neg_pat.search(r.get('description') or '')]
        if not targets:
            print(f'  {label}: 0')
            continue
        print(f'  {label}: re-summarizing {len(targets)}...')
        for j, (i, r) in enumerate(targets):
            src = (r.get('description') or '').strip()
            if not src:
                continue
            try:
                rows[i]['description_summary'] = call_ollama(PROMPT_BY_CATEGORY[prompt_key].format(description=src))
                fixed += 1
            except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
                print(f'    [error] idx {i}: {e}')
            if (j + 1) % 25 == 0:
                p.write_text(json.dumps(rows, indent=2, default=str))
        p.write_text(json.dumps(rows, indent=2, default=str))
    elapsed = time.time() - started
    print(f'\nDone. Fixed {fixed} entries in {elapsed:.0f}s.')


if __name__ == '__main__':
    main()
