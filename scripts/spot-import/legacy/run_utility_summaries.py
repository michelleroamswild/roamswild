#!/usr/bin/env python3
"""
Wait for the camping summarization run to finish (utah_final.json hits
1279 entries), then run the three utility summarizations sequentially.

Run: python3 run_utility_summaries.py
"""

import json
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).parent
CAMPING_OUTPUT = HERE / 'utah_final.json'
TARGET_CAMPING = 1279

UTILITY_JOBS = [
    ('utah_laundromats.json', 'utah_laundromats_final.json'),
    ('utah_showers.json',     'utah_showers_final.json'),
    ('utah_water.json',       'utah_water_final.json'),
]


def camping_done() -> bool:
    if not CAMPING_OUTPUT.exists():
        return False
    try:
        with open(CAMPING_OUTPUT) as f:
            return len(json.load(f)) >= TARGET_CAMPING
    except (json.JSONDecodeError, OSError):
        return False


def main():
    print(f'Waiting for camping run to finish ({TARGET_CAMPING} entries)...', flush=True)
    while not camping_done():
        time.sleep(30)
    print('Camping run complete. Starting utility runs.', flush=True)

    for input_name, output_name in UTILITY_JOBS:
        input_path = HERE / input_name
        output_path = HERE / output_name
        print(f'\n=== {input_name} -> {output_name} ===', flush=True)
        result = subprocess.run([
            sys.executable,
            str(HERE / '02_summarize_descriptions.py'),
            '--input', str(input_path),
            '--output', str(output_path),
        ])
        if result.returncode != 0:
            print(f'  Job failed with exit {result.returncode}; continuing.', flush=True)

    print('\nAll utility runs complete.', flush=True)


if __name__ == '__main__':
    main()
