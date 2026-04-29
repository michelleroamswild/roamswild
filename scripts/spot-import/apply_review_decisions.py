#!/usr/bin/env python3
"""
Apply user review decisions:
  1. Delete REMOVED rows from local JSON files (DB delete handled separately).
  2. Re-summarize FLAGGED entries + any entries with prompt-leak text +
     any shower entries confused as laundromats. Category-specific prompts
     prevent the 'a laundromat is not mentioned' confusion.

Reads the user's backup JSON for the approved/flagged/removed sets.
"""

import argparse
import json
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

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
TIMEOUT_S = 30

# Per-category prompts. The key trick: name the category once at the top
# so the model can't get confused about whether the description is about
# something else.
PROMPT_BY_CATEGORY = {
    'dispersed_camping': (
        "This is a CAMPING SPOT. Rewrite the description below into a "
        "concise neutral summary about the spot.\n\n"
        "Strict rules:\n"
        "- Describe the LOCATION, not the visit. Never write 'I', 'we', "
        "'my', 'our', 'the reviewer', 'the visitor'.\n"
        "- Use ONLY information explicitly stated. Don't invent details.\n"
        "- Drop reviewer commentary: 'nice', 'great', 'beautiful'.\n"
        "- Aim for 30 words or fewer. Never exceed 50 words.\n"
        "- Plain prose, no bullets, no preamble. Output ONLY the summary "
        "text on one line. Do not write 'Here is...' or 'I'll...'.\n\n"
        "Description:\n{description}\n\n"
        "Summary:"
    ),
    'informal_camping': (
        "This is an INFORMAL/STEALTH CAMPING SPOT (often a parking lot, "
        "city street, business lot, or rest area). Rewrite the description "
        "into a concise neutral summary.\n\n"
        "Strict rules:\n"
        "- Describe the LOCATION, not the visit. Never write 'I', 'we', "
        "'my', 'our', 'the reviewer', 'the visitor'.\n"
        "- Use ONLY information explicitly stated.\n"
        "- Aim for 30 words or fewer.\n"
        "- Output ONLY the summary text on one line. No preamble.\n\n"
        "Description:\n{description}\n\n"
        "Summary:"
    ),
    'water': (
        "This is a WATER SOURCE for travelers (potable or non-potable). "
        "Rewrite the description into a concise neutral summary.\n\n"
        "Strict rules:\n"
        "- Describe the WATER SOURCE: location, access, hours, cost, "
        "potability, type (spigot/tap/hose/etc).\n"
        "- Never write 'I', 'we', 'my', 'our', 'the reviewer'.\n"
        "- DO NOT mention laundromats, showers, or camping unless the "
        "description clearly says they're at the same location.\n"
        "- Use ONLY information explicitly stated.\n"
        "- Aim for 30 words or fewer.\n"
        "- Output ONLY the summary on one line. No preamble like 'Here is...'.\n\n"
        "Description:\n{description}\n\n"
        "Summary:"
    ),
    'showers': (
        "This is a SHOWER FACILITY for travelers. Rewrite the description "
        "into a concise neutral summary.\n\n"
        "Strict rules:\n"
        "- Describe the SHOWER FACILITY: location, access, hours, cost, "
        "amenities (private/public, hot/cold, towels, soap).\n"
        "- Never write 'I', 'we', 'my', 'our', 'the reviewer'.\n"
        "- DO NOT mention laundromats unless the description clearly says "
        "laundry is at the same location.\n"
        "- Use ONLY information explicitly stated.\n"
        "- Aim for 30 words or fewer.\n"
        "- Output ONLY the summary on one line. No preamble.\n\n"
        "Description:\n{description}\n\n"
        "Summary:"
    ),
    'laundromat': (
        "This is a LAUNDROMAT for travelers. Rewrite the description into "
        "a concise neutral summary.\n\n"
        "Strict rules:\n"
        "- Describe the LAUNDROMAT: location, hours, cost, amenities "
        "(machines, change, attendant).\n"
        "- Never write 'I', 'we', 'my', 'our', 'the reviewer'.\n"
        "- Use ONLY information explicitly stated.\n"
        "- Aim for 30 words or fewer.\n"
        "- Output ONLY the summary on one line. No preamble.\n\n"
        "Description:\n{description}\n\n"
        "Summary:"
    ),
}

# Detect prompt-leak descriptions to add to the rewrite set
PROMPT_LEAK_RE = re.compile(
    r"(?:original (?:name|description) is(?: classified)?|"
    r"I'?ll (?:rewrite|focus|assume|correct)|"
    r"I will (?:assume|rewrite|focus|correct)|"
    r"here(?:'?s| is) (?:the |a )?(?:rewritten|new|corrected) (?:summary|name|description)|"
    r"a laundromat is not mentioned|"
    r"a (?:water source|shower) is not mentioned)",
    re.IGNORECASE,
)

# Patterns that pollute name_clean. Stage 3 sometimes emitted verbose
# explanations when public_land_manager was unknown, e.g.:
#   "BLM Road — Agency not specified, but based on..."
#   "Trail — Agency unknown (UNK) is not a valid output..."
#   "BLM Road → BLM Road — Agency"
NAME_SUFFIX_TRIM = [
    re.compile(r'\s*[—-]\s*Agency\b.*$', re.IGNORECASE),
    re.compile(r'\s*[—-]\s*unknown\b.*$', re.IGNORECASE),
    re.compile(r'\s*[—-]\s*N/A\b.*$', re.IGNORECASE),
    re.compile(r'\s*[—-]\s*not (?:specified|applicable|available).*$', re.IGNORECASE),
    re.compile(r'\s*\(UNK\)[^A-Za-z]*$', re.IGNORECASE),
]
# "X → Y" arrow constructions — keep just X (the more conservative result)
ARROW_RE = re.compile(r'\s*→.*$')


def clean_name(name):
    """Strip Stage 3 verbose-output artifacts from a name_clean value.
    If the result is too short or empty, return None so the caller can
    fall back to the rules-normalized `name`."""
    if not name:
        return None
    out = name
    out = ARROW_RE.sub('', out)
    for p in NAME_SUFFIX_TRIM:
        out = p.sub('', out)
    out = out.strip()
    if len(out) < 2:
        return None
    return out


def call_ollama(prompt: str) -> str:
    body = json.dumps({
        'model': MODEL,
        'prompt': prompt,
        'stream': False,
        'options': {'temperature': 0.0, 'num_predict': 100},
    }).encode('utf-8')
    req = urllib.request.Request(
        OLLAMA_URL, data=body,
        headers={'Content-Type': 'application/json'},
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
        return json.loads(resp.read()).get('response', '').strip().splitlines()[0].strip()


def round_key(lat, lng):
    """Build a key normalized to 5 decimals — matches the iotest page format."""
    return f'{round(float(lat), 5):.5f},{round(float(lng), 5):.5f}'


def category_to_prompt_key(cat: str) -> str:
    """Map any source-data category string to PROMPT_BY_CATEGORY key."""
    if not cat:
        return ''
    c = cat.strip().lower().replace(' ', '_')
    if c == 'wild_camping':
        return 'dispersed_camping'
    if c.endswith('campsite'):
        return 'informal_camping'
    return c


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--backup', required=True, help='Path to user backup JSON')
    args = parser.parse_args()

    with open(args.backup) as f:
        backup = json.load(f)

    def renorm_keys(seq):
        out = set()
        for k in seq or []:
            try:
                lat, lng = k.split(',')
                out.add(round_key(lat, lng))
            except Exception:
                out.add(k)
        return out

    flagged = renorm_keys(backup.get('flagged'))
    removed = renorm_keys(backup.get('removed'))
    print(f'Backup: 👍 {len(backup.get("approved",[]))} · 👎 {len(flagged)} · ✕ {len(removed)}')

    # Index entries across all files
    rows_by_key = {}  # key -> (file, idx, row, file_path)
    file_data = {}
    for fname in FILES:
        p = HERE / fname
        if not p.exists(): continue
        with open(p) as f:
            rows = json.load(f)
        file_data[fname] = (p, rows)
        for i, r in enumerate(rows):
            k = round_key(r['lat'], r['lng'])
            rows_by_key[k] = (fname, i, r)

    # Step 1: collect the union of keys to rewrite
    rewrite_keys = set(flagged)
    prompt_leak_keys = set()
    shower_confusion_keys = set()
    for k, (fname, _i, r) in rows_by_key.items():
        d = r.get('description_summary') or ''
        if PROMPT_LEAK_RE.search(d):
            prompt_leak_keys.add(k)
        if 'showers' in fname and 'laundromat is not' in d.lower():
            shower_confusion_keys.add(k)
    rewrite_keys |= prompt_leak_keys | shower_confusion_keys

    # Don't re-write removed entries (we're deleting them) or already-approved
    rewrite_keys -= removed
    print(f'Rewrite set: {len(rewrite_keys)} entries (👎 + prompt-leaks + shower-confusion)')
    print(f'  flagged-only:        {len(flagged - prompt_leak_keys - shower_confusion_keys - removed)}')
    print(f'  prompt-leak-extras:  {len(prompt_leak_keys - flagged - removed)}')
    print(f'  shower-extras:       {len(shower_confusion_keys - flagged - prompt_leak_keys - removed)}')

    # Step 2: re-summarize each
    started = time.time()
    rewritten = 0
    for j, k in enumerate(sorted(rewrite_keys)):
        if k not in rows_by_key:
            print(f'  [skip] {k} not found in data')
            continue
        fname, _i, r = rows_by_key[k]
        category = category_to_prompt_key(r.get('category', ''))
        prompt_tpl = PROMPT_BY_CATEGORY.get(category)
        if not prompt_tpl:
            print(f'  [skip] {k} unknown category: {r.get("category")!r}')
            continue
        source = r.get('description') or r.get('description_summary') or ''
        if not source.strip():
            continue
        try:
            new_summary = call_ollama(prompt_tpl.format(description=source))
            r['description_summary'] = new_summary
            rewritten += 1
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
            print(f'  [error] {k}: {e}; keep existing')
        if (j + 1) % 10 == 0:
            for fname, (p, rows) in file_data.items():
                p.write_text(json.dumps(rows, indent=2, default=str))
            print(f'  [{j+1}/{len(rewrite_keys)}] rewritten so far: {rewritten}')

    # Step 3: delete the removed entries from local JSON files
    deleted_per_file = {f: 0 for f in FILES}
    for fname, (p, rows) in file_data.items():
        kept = []
        for r in rows:
            if round_key(r['lat'], r['lng']) in removed:
                deleted_per_file[fname] += 1
            else:
                kept.append(r)
        file_data[fname] = (p, kept)

    # Step 3.5: cleanup name_clean across ALL entries — Stage 11 only
    # touched `name` field; this fixes the 820+ Agency-suffix cases
    # affecting the actual display names in the DB.
    name_fixed = 0
    for fname, (p, rows) in file_data.items():
        for r in rows:
            nc = r.get('name_clean')
            if not nc:
                continue
            cleaned = clean_name(nc)
            if cleaned != nc:
                if cleaned:
                    r['name_clean'] = cleaned
                else:
                    # Drop obviously-broken name_clean; loader will fall
                    # back to `name` (rules-normalized).
                    r['name_clean'] = None
                name_fixed += 1
    print(f'\nname_clean cleanup: {name_fixed} entries updated')

    # Step 4: write all modified files
    for fname, (p, rows) in file_data.items():
        p.write_text(json.dumps(rows, indent=2, default=str))

    elapsed = time.time() - started
    print(f'\nDone in {elapsed:.0f}s')
    print(f'  Rewritten descriptions: {rewritten}')
    print(f'  Deleted rows from local files: {sum(deleted_per_file.values())}')
    for f, n in deleted_per_file.items():
        if n:
            print(f'    {f}: -{n}')


if __name__ == '__main__':
    main()
