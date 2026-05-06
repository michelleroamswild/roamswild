#!/usr/bin/env python3
"""
Targeted fix for the small set of community spot descriptions that contain
literal "[insert location]" / "[location]" / "[insert coordinates]" placeholders
the AI summarizer failed to fill in.

Strategy:
  1. Pull all matching rows from prod.
  2. For each, ask Ollama to rewrite the description, EITHER replacing the
     bracketed placeholder with concrete info from elsewhere in the description,
     OR deleting the bracketed clause entirely if no info is recoverable.
  3. Patch both prod and dev with the cleaned description.

Tiny prompt, tight scope — no new fields, no name changes. Resumable: skips
rows where extra.description_fixed_v1 == true.

Usage:
  python3 scripts/spot-import/fix_placeholder_descriptions.py --dry-run
  python3 scripts/spot-import/fix_placeholder_descriptions.py --apply
"""
import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional, Tuple

ROOT = Path(__file__).resolve().parents[2]
ENV_PROD = ROOT / '.env.production'
ENV_DEV  = ROOT / '.env'

OLLAMA_URL = 'http://localhost:11434/api/generate'
MODEL      = 'llama3.1:8b'


def read_env(path: Path, key: str) -> str:
    pat = re.compile(rf'^{re.escape(key)}\s*=\s*"?([^"\n]+)"?\s*$')
    for line in path.read_text().splitlines():
        m = pat.match(line)
        if m: return m.group(1).strip()
    sys.exit(f'Missing {key} in {path}')


PROD_URL = read_env(ENV_PROD, 'VITE_SUPABASE_URL')
PROD_KEY = read_env(ENV_PROD, 'SUPABASE_SERVICE_ROLE_KEY')
DEV_URL  = 'https://ioseedbzvogywztbtgjd.supabase.co'
DEV_KEY  = read_env(ENV_DEV,  'SUPABASE_SERVICE_ROLE_KEY')


def http(base: str, key: str, method: str, path: str, body=None, prefer: str = ''):
    headers = {'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'}
    if prefer:
        headers['Prefer'] = prefer
    data = json.dumps(body).encode('utf-8') if body is not None else None
    req = urllib.request.Request(f'{base}{path}', method=method, headers=headers, data=data)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            txt = resp.read().decode('utf-8')
            return resp.status, json.loads(txt) if txt.strip() else None
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8')[:200]


# Same brackets we look for: description has [insert ...] or [location] etc.
PLACEHOLDER_RE = re.compile(
    r'\[(?:insert|enter|name|location|road|number|placeholder|tbd|n\s?/\s?a)[^\]]*\]'
    r'|\[\s*(?:insert|enter|name|location|placeholder|tbd|n/a|coordinates)\s*\]',
    re.IGNORECASE,
)

PROMPT = """You are fixing one broken sentence in a directory entry. The original AI summary inserted a literal "[insert location]" or "[insert coordinates]" placeholder it never filled in.

Rewrite the description so the bracketed placeholder is gone. Use one of two strategies:

  1. REPLACE — if the description elsewhere mentions a real street, town, business name, or landmark, slot it into the placeholder.
  2. DELETE — if no concrete info is available, simply remove the bracketed clause and reflow the surrounding sentence so it still reads naturally.

Keep the original wording everywhere except the placeholder. Do NOT add new facts. Do NOT add commentary. Do NOT change the rest of the description. Output ONLY the rewritten description — no preamble, no quotes.

Original description:
{description}

Spot name: {name}

Rewritten description:"""


def call_ollama(prompt: str) -> str:
    body = json.dumps({
        'model': MODEL, 'prompt': prompt, 'stream': False,
        'options': {'temperature': 0.0, 'num_predict': 400},
    }).encode('utf-8')
    req = urllib.request.Request(
        OLLAMA_URL, data=body,
        headers={'Content-Type': 'application/json'},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read())
    return data.get('response', '').strip()


def fetch_pending() -> list:
    """All community rows whose description still contains a [insert ...] placeholder."""
    # PostgREST 'like' is wildcard-based; '%[insert%' catches "[insert location]"
    # and '%[location%' catches "[location]" alone. Combined via 'or' filter.
    path = (
        '/rest/v1/spots'
        '?select=id,name,description,extra'
        '&source=eq.community'
        "&or=(description.like.*[insert*,description.like.*[location*,description.like.*[coordinates*)"
        "&description=not.like.*[id*"     # exclude any odd "[id..." matches
        '&limit=1000'
    )
    status, body = http(PROD_URL, PROD_KEY, 'GET', path)
    if status >= 400:
        sys.exit(f'fetch failed ({status}): {body}')
    # Defensive client-side filter: only those that actually match the regex
    # AND haven't already been fixed.
    return [r for r in (body or [])
            if PLACEHOLDER_RE.search(r.get('description') or '')
            and not (r.get('extra') or {}).get('description_fixed_v1')]


def patch_row(spot_id: str, new_desc: str, extra: dict) -> Tuple[bool, Optional[str], Optional[str]]:
    new_extra = dict(extra)
    new_extra['description_fixed_v1'] = True
    payload = {'description': new_desc, 'extra': new_extra}
    p_status, p_body = http(PROD_URL, PROD_KEY, 'PATCH',
        f'/rest/v1/spots?id=eq.{spot_id}', body=payload, prefer='return=minimal')
    d_status, d_body = http(DEV_URL, DEV_KEY, 'PATCH',
        f'/rest/v1/spots?id=eq.{spot_id}', body=payload, prefer='return=minimal')
    p_err = str(p_body)[:200] if p_status >= 400 else None
    d_err = str(d_body)[:200] if d_status >= 400 else None
    return (p_err is None and d_err is None), p_err, d_err


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    if not args.apply and not args.dry_run:
        sys.exit('pass --dry-run or --apply')

    rows = fetch_pending()
    print(f'Found {len(rows)} rows with [insert ...] placeholders.\n')

    rewritten = 0
    errors = 0
    for i, r in enumerate(rows):
        name = r.get('name') or ''
        desc = r.get('description') or ''
        prompt = PROMPT.format(name=name, description=desc)
        try:
            new_desc = call_ollama(prompt).strip()
        except Exception as e:
            print(f'  [ollama err {r["id"][:8]}]: {e}', flush=True)
            errors += 1
            continue

        # Discard if Ollama still emitted a placeholder — fall back to a
        # manual regex-strip so we leave NO [insert ...] in the field.
        if PLACEHOLDER_RE.search(new_desc):
            stripped = PLACEHOLDER_RE.sub('', new_desc)
            stripped = re.sub(r'\s+,', ',', stripped)
            stripped = re.sub(r',\s*,', ',', stripped)
            stripped = re.sub(r'\s{2,}', ' ', stripped).strip()
            new_desc = stripped

        if new_desc == desc:
            print(f'  [skip {i+1}/{len(rows)} {r["id"][:8]}] no change', flush=True)
            continue

        if args.dry_run:
            print(f'  [dry {i+1}/{len(rows)} {r["id"][:8]}] {name}')
            print(f'    BEFORE: {desc[:200]}')
            print(f'    AFTER:  {new_desc[:200]}')
            print()
            rewritten += 1
            continue

        ok, p_err, d_err = patch_row(r['id'], new_desc, r.get('extra') or {})
        if ok:
            rewritten += 1
            print(f'  [ok {i+1}/{len(rows)} {r["id"][:8]}] {name}', flush=True)
        else:
            errors += 1
            if p_err: print(f'  [prod err {r["id"][:8]}]: {p_err}', flush=True)
            if d_err: print(f'  [dev err  {r["id"][:8]}]: {d_err}', flush=True)

    print()
    print(f'Done.  rewritten={rewritten}  errors={errors}')


if __name__ == '__main__':
    main()
