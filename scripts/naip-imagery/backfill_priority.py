#!/usr/bin/env python3
"""
NAIP backfill in priority order:
  1. dispersed_camping + sub_kind=derived
  2. dispersed_camping + sub_kind=known
  3. dispersed_camping + everything else (community / wild / pullout / boondocking_lot / NULL)

Skips established_campground, water, shower, laundromat, dump_station, etc.
— utilities and formal campgrounds aren't priority for satellite preview chips.

Each tier runs backfill_region.py in-process; idempotent (skips spots that
already have a NAIP image), resumable on crash.

Usage:
  python3 backfill_priority.py --bbox 37.85,-110.55,39.30,-108.55           # Moab
  python3 backfill_priority.py --bbox 24,-125,50,-66 --workers 6            # CONUS
  python3 backfill_priority.py --bbox <…> --dry-run                          # counts only
"""
import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

# Tiers run in this order. Each tuple is (label, --kind, --sub-kind or None).
# Tier 3 has no sub_kind filter — it picks up community / wild / pullout /
# boondocking_lot / NULL after the targeted tiers above have drained.
TIERS = [
    ('Dispersed > Derived',   'dispersed_camping', 'derived'),
    ('Dispersed > Known',     'dispersed_camping', 'known'),
    ('Dispersed > Community', 'dispersed_camping', None),
]

SCRIPT_DIR = Path(__file__).resolve().parent
BACKFILL_REGION = SCRIPT_DIR / 'backfill_region.py'


def run_tier(label, kind, sub_kind, bbox, workers, dry_run):
    print()
    print('=' * 60)
    print(f'TIER: {label}')
    print('=' * 60)
    cmd = [
        sys.executable, '-u', str(BACKFILL_REGION),
        '--bbox', bbox,
        '--workers', str(workers),
        '--kind', kind,
    ]
    if sub_kind:
        cmd.extend(['--sub-kind', sub_kind])
    if dry_run:
        cmd.append('--dry-run')
    started = time.time()
    proc = subprocess.run(cmd, check=False)
    elapsed = time.time() - started
    if proc.returncode != 0:
        print(f'TIER FAILED ({label}) — exit {proc.returncode}')
        return False
    print(f'TIER DONE ({label}) — {elapsed/60:.1f} min')
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--bbox', required=True, help='south,west,north,east')
    parser.add_argument('--workers', type=int, default=4)
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    overall = time.time()
    for label, kind, sub_kind in TIERS:
        ok = run_tier(label, kind, sub_kind, args.bbox, args.workers, args.dry_run)
        if not ok:
            print('Aborting on tier failure — re-run to resume.')
            sys.exit(1)
    print()
    print(f'=== ALL TIERS DONE in {(time.time() - overall)/60:.1f} min ===')


if __name__ == '__main__':
    main()
