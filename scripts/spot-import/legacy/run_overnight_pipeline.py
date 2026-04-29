#!/usr/bin/env python3
"""
Overnight pipeline runner: Stage 2 (descriptions) + Stage 3 (names) +
Stage 5 (strip refs) + Stage 6 (truncate+reload to Supabase).

Wrap with caffeinate so macOS doesn't sleep:
  caffeinate -i python3 run_overnight_pipeline.py

Each step is resumable — if interrupted, re-running picks up where it
left off (per-stage scripts use their own resume logic).
"""

import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).parent
PYTHON = sys.executable

# Stage 2: summarize descriptions for every category
STAGE2_JOBS = [
    ('nation_filtered_tagged.json', 'nation_filtered_summarized.json'),
    ('nation_informal_tagged.json', 'nation_informal_summarized.json'),
    ('nation_water.json',           'nation_water_summarized.json'),
    ('nation_showers.json',         'nation_showers_summarized.json'),
    ('nation_laundromats.json',     'nation_laundromats_summarized.json'),
]

# Stage 3: rewrite names — only camping (utilities don't need this)
STAGE3_JOBS = [
    ('nation_filtered_summarized.json', 'nation_filtered_named.json'),
    ('nation_informal_summarized.json', 'nation_informal_named.json'),
]


def run_step(label: str, cmd: list, log_path: Path):
    print(f'\n=== {label} ===', flush=True)
    print(f'  cmd: {" ".join(str(c) for c in cmd)}', flush=True)
    print(f'  log: {log_path}', flush=True)
    started = time.time()
    with open(log_path, 'w') as logf:
        result = subprocess.run(cmd, stdout=logf, stderr=subprocess.STDOUT)
    elapsed = time.time() - started
    print(f'  -> exit {result.returncode} after {elapsed/60:.1f} min', flush=True)
    if result.returncode != 0:
        print(f'  !! FAILURE; see {log_path} — continuing anyway', flush=True)
    return result.returncode


def main():
    logs = HERE / 'logs'
    logs.mkdir(exist_ok=True)

    started = time.time()

    # Stage 2 — descriptions
    for in_name, out_name in STAGE2_JOBS:
        run_step(
            f'Stage 2 (describe): {in_name}',
            [PYTHON, str(HERE / '02_summarize_descriptions.py'),
             '--input', str(HERE / in_name),
             '--output', str(HERE / out_name)],
            logs / f'02_{in_name.replace(".json","")}.log',
        )

    # Stage 3 — names (camping only)
    for in_name, out_name in STAGE3_JOBS:
        run_step(
            f'Stage 3 (rename): {in_name}',
            [PYTHON, str(HERE / '03_rewrite_names.py'),
             '--input', str(HERE / in_name),
             '--output', str(HERE / out_name)],
            logs / f'03_{in_name.replace(".json","")}.log',
        )

    # Update Stage 5's TARGETS to point at the new outputs
    run_step(
        'Stage 5 (strip refs)',
        [PYTHON, '-c', '''
import json, re, sys
from pathlib import Path
HERE = Path(sys.argv[1])
TARGETS = [
    "nation_filtered_named.json",
    "nation_informal_named.json",
    "nation_water_summarized.json",
    "nation_showers_summarized.json",
    "nation_laundromats_summarized.json",
]
WORD_RE = re.compile(r"\\\\bi[\\\\s\\\\-]?overlander\\\\b", re.IGNORECASE)
PHRASE_RE = re.compile(r"\\\\s*\\\\b(?:on|via|from|in|saw on|found on|via the)\\\\s+i[\\\\s\\\\-]?overlander\\\\b", re.IGNORECASE)
WS_RE = re.compile(r"[ \\\\t]{2,}")
for fname in TARGETS:
    p = HERE / fname
    if not p.exists():
        continue
    rows = json.loads(p.read_text())
    for r in rows:
        r.pop("description_original", None)
        for f in ("description", "description_summary"):
            v = r.get(f)
            if isinstance(v, str) and v:
                v = PHRASE_RE.sub("", v)
                v = WORD_RE.sub("", v)
                v = WS_RE.sub(" ", v)
                v = re.sub(r"\\\\s+([.,!?])", r"\\\\1", v).strip()
                r[f] = v or None
    p.write_text(json.dumps(rows, indent=2, default=str))
    print(f"  cleaned {fname}: {len(rows)} rows")
''', str(HERE)],
        logs / '05_strip.log',
    )

    # Stage 6 — point loader at the post-LLM filenames and truncate+reload
    # We patch INPUT_FILES at runtime via env var since 06 currently has it
    # hardcoded. Easier: just drive the load with a small inline script.
    run_step(
        'Stage 6 (truncate + reload)',
        [PYTHON, '-c', '''
import sys
from pathlib import Path
sys.path.insert(0, str(Path(sys.argv[1])))
import importlib.util
spec = importlib.util.spec_from_file_location("loader", Path(sys.argv[1]) / "06_load_to_supabase.py")
loader = importlib.util.module_from_spec(spec)
loader.INPUT_FILES = [
    "nation_filtered_named.json",
    "nation_informal_named.json",
    "nation_water_summarized.json",
    "nation_showers_summarized.json",
    "nation_laundromats_summarized.json",
]
sys.argv = ["loader", "--truncate"]
spec.loader.exec_module(loader)
loader.main()
''', str(HERE)],
        logs / '06_load.log',
    )

    total = time.time() - started
    print(f'\n=== Overnight pipeline done in {total/3600:.2f} hours ===', flush=True)


if __name__ == '__main__':
    main()
