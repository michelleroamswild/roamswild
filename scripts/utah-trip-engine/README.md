# Utah Trip Engine — Moab Pilot

Ingests authoritative trail/region geo data and community flavor metadata
(blogs, forum, Reddit, curated editorial) into a local Postgres+PostGIS
"outdoor brain" database. Anchored on Moab (~38.5733, −109.5498) with a
50-mile radius for v1.

## Quick start

```bash
docker compose up -d
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # fill in ANTHROPIC_API_KEY
alembic upgrade head
python main.py --help
```

## Pipeline stages

```bash
python main.py ingest ugrc            # official trails (UGRC)
python main.py ingest regions         # NPS / BLM / state-park polygons
python main.py scrape all             # community sources
python main.py prefilter              # cheap junk-skip before LLM
python main.py enrich --dry-run       # cost estimate
python main.py enrich --batch 50      # Anthropic Claude Haiku 4.5
python main.py match                  # link community mentions → UGRC trails
python main.py classify               # promote unmatched mentions to POIs
python main.py link-regions           # spatial join POIs ↔ regions
python main.py seasons                # elevation-driven access windows
python main.py run-all                # end-to-end with summary
```

## Cost controls

- Claude Haiku 4.5 with prompt caching on the system prompt + tool schema.
- Content-hash cache for LLM outputs (re-runs near-free).
- Snippet dedup + place-name/keyword prefilter before any LLM call.
- Heuristic regex extractors fill obvious fields first.
- Hard `BUDGET_CAP` (USD) auto-halts the pipeline.

## Data model

- `utah_poi` — points (trails, viewpoints, photo spots, hidden gems, …).
- `pilot_regions` — polygon regions (parks, monuments, recreation areas).
- `poi_region` — many-to-many spatial linkage.
- `pipeline_runs` — per-run telemetry, including LLM token spend.

See `/Users/michelletaylor/.claude/plans/goofy-beaming-metcalfe.md` for the
full plan.
