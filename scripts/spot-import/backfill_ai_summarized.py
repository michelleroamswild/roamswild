#!/usr/bin/env python3
"""One-shot backfill: tag the 165 community rows that the first run of
summarize_pending_descriptions.py already processed (before we added the
ai_summarized flag) with extra.ai_summarized=true.

Identification heuristic: source='community' AND updated_at within the
window the script was running. We refuse to write if the count is
unexpectedly large (>500) — guard against accidentally tagging the
whole community set.
"""
import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ENV_PATH = Path(__file__).resolve().parents[2] / '.env'
SUPABASE_URL = 'https://ioseedbzvogywztbtgjd.supabase.co'
WINDOW_MINUTES = 15
MAX_BACKFILL = 500  # safety cap


def read_env(key: str) -> str:
    pat = re.compile(rf'^{re.escape(key)}\s*=\s*"?([^"\n]+)"?\s*$')
    for line in ENV_PATH.read_text().splitlines():
        m = pat.match(line)
        if m:
            return m.group(1).strip()
    sys.exit(f'Missing {key} in {ENV_PATH}')


def fetch_targets(svc: str, cutoff_iso: str):
    headers = {'apikey': svc, 'Authorization': f'Bearer {svc}'}
    cutoff_enc = cutoff_iso.replace('+', '%2B')
    url = (
        f'{SUPABASE_URL}/rest/v1/spots'
        f'?select=id,extra'
        f'&source=eq.community'
        f'&updated_at=gte.{cutoff_enc}'
        f'&order=updated_at.asc'
        f'&limit=1000'
    )
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())


def patch(svc: str, row_id: str, extra: dict) -> int:
    body = json.dumps({'extra': extra}).encode('utf-8')
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/spots?id=eq.{row_id}',
        data=body, method='PATCH',
        headers={
            'apikey': svc, 'Authorization': f'Bearer {svc}',
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.status


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()

    svc = read_env('SUPABASE_SERVICE_ROLE_KEY')
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=WINDOW_MINUTES)).isoformat()
    print(f'Cutoff (15-min window): {cutoff}')

    rows = fetch_targets(svc, cutoff)
    # Only keep rows whose extra is missing both flags — those are the ones
    # we lost. Skip any that already have ai_review_pending (still pending)
    # or ai_summarized (somehow already tagged).
    targets = [
        r for r in rows
        if not (r.get('extra') or {}).get('ai_review_pending')
        and not (r.get('extra') or {}).get('ai_summarized')
    ]
    print(f'Found {len(targets)} community rows to backfill (window total: {len(rows)})')

    if len(targets) > MAX_BACKFILL:
        sys.exit(f'Refusing: {len(targets)} > MAX_BACKFILL ({MAX_BACKFILL})')

    if not args.apply:
        print('Dry run — re-run with --apply.')
        for r in targets[:5]:
            print(f'  would tag {r["id"]}  extra now: {r.get("extra")}')
        return

    ok = err = 0
    for i, r in enumerate(targets):
        new_extra = dict(r.get('extra') or {})
        new_extra['ai_summarized'] = True
        try:
            status = patch(svc, r['id'], new_extra)
            if status >= 400:
                err += 1
                print(f'  [{i+1}/{len(targets)}] HTTP {status}')
            else:
                ok += 1
        except urllib.error.HTTPError as e:
            err += 1
            print(f'  [{i+1}/{len(targets)}] HTTPError {e.code}')
            sys.exit('Aborting on first failure')
        if (i + 1) % 25 == 0:
            print(f'  [{i+1}/{len(targets)}] ok={ok} err={err}')
    print(f'Done. ok={ok} err={err}')


if __name__ == '__main__':
    main()
