# Region playbook

How to point this pipeline at a new region (anywhere in the US) and pull a
clean, deduplicated outdoor-spot dataset for it.

The Moab pilot is the template. Everything you need to swap regions lives in
**one YAML file** and **one CLI command**.

---

## TL;DR

```bash
# 1. Add a new entry to data/regions.yaml (copy the moab block, edit names)
# 2. Run it
python main.py run-region <new_key> --skip-vision     # cheap pass first
python main.py run-region <new_key>                   # full pass with vision
# 3. Inspect at http://localhost:8765/master
python main.py serve
```

That's it. The orchestrator handles ingest, prefilter, enrich, match, classify,
region-link, consolidate, cleanup, and master-enrichment in order.

---

## What lives where

| File | What it does |
|---|---|
| `data/regions.yaml` | Region definitions (anchor, radius, sources, hand-curated lists) |
| `utah_engine/region_config.py` | Loads YAML; encodes the cleanup deletion list |
| `main.py run-region <key>` | One-shot end-to-end pipeline for the chosen region |
| `main.py cleanup --region <key>` | Deletes noise poi_types inside the region's radius |
| `main.py regions-list` | Lists every configured region |

---

## Adding a new region (step by step)

### 1. Pick the anchor + radius

Pick a single lat/lng for the center and a pull radius in miles. 50 mi is the
default — it covers a town + the surrounding parks/wilderness. Bigger radius =
more spots, more noise, more cost.

### 2. Find the data each source needs

You'll fill in these lists in the YAML. Skip any that don't apply.

- **`nps_park_codes`** — National Park Service park codes (4 letters each).
  Look them up at https://www.nps.gov/aboutus/national-park-system.htm or
  search the NPS API directly. Examples: `arch` (Arches), `jotr` (Joshua
  Tree), `grca` (Grand Canyon), `yose` (Yosemite), `zion` (Zion).
- **`reddit_subs`** — 3–5 subreddits where people talk about this area.
  Always include the city/area subreddit + a state subreddit + 1–2 outdoor
  subs (`overlanding`, `CampingandHiking`, `hiking`).
- **`reddit_gazetteer`** — 20–40 hand-typed landmark names that show up in
  Reddit posts: trails, peaks, canyons, viewpoints, towns, drives. This is
  the relevance filter — posts that don't contain at least one of these names
  get dropped before enrichment. The pipeline auto-merges this with every
  POI/region name already in the DB, so you only need the *seed* list.
- **`wikivoyage_articles`** — Wikivoyage page titles for towns, parks, and
  notable sub-areas. Find them by searching https://en.wikivoyage.org. The
  `{{listing}}` templates inside these articles are what we extract.
- **`seed_files`** — paths (relative to the project root) to hand-curated
  JSON files of hidden gems. Optional. Use this for sources we don't have a
  scraper for (e.g. Atlas Obscura — we maintain a curated seed because their
  site is Cloudflare-walled).

### 3. Edit `data/regions.yaml`

Copy the `moab` block, paste below it, change the key + values. There's a
commented-out `joshua_tree` template at the bottom showing the minimum.

Required fields: `name`, `state` (2-letter), `anchor`, `radius_mi`.

### 4. Run it

```bash
python main.py regions-list                     # confirm the new key shows up
python main.py run-region <new_key> --skip-vision   # ~free pass first
```

The cheap pass exercises every ingester + the dedup pipeline without the paid
vision LLM step. Look at `http://localhost:8765/master` to spot-check.

When you're happy:

```bash
python main.py run-region <new_key>             # full pass (~$0.10–0.30 vision)
```

---

## What gets skipped automatically (non-Utah regions)

Three sources are Utah-only and skip themselves outside Utah:

- **UGRC TrailsAndPathways** — Utah's authoritative trails layer. National
  alternatives (USFS / USGS National Map) aren't wired in yet.
- **UGRC OpenSourcePlaces** — cleaned Utah OSM. (Outside Utah, raw OSM via
  Overpass covers the same ground.)
- **UGRC region polygons** — Utah's NPS/BLM/state-park catalog.
- **Locationscout** — currently walks the Utah index page only.

For non-Utah regions, the pipeline still gets:
GNIS, OSM, NHD, NPS Places, NRHP, MRDS, Reddit, Wikivoyage, Wikimedia photos,
plus any seed files. That's enough for a usable dataset.

---

## The cleanup spec

`utah_engine/region_config.py` carries a frozen list of ~50 poi_type values
that get deleted from every region. These are the categories the user pruned
during the Moab pilot — civic stuff (libraries, churches, courthouses),
commercial (restaurants, sports shops, hospitals), and generic terrain
(valleys, basins, slopes) that don't read as a "destination".

`run-region` runs cleanup automatically before the final consolidation, so
nothing extra needed. To dry-run cleanup standalone:

```bash
python main.py cleanup --region <key> --dry-run
```

Cleanup is **scoped to the region's radius** so it never touches another
region's data.

---

## Cost expectations

A region run with all sources + vision LLM:

| Stage | Cost | Notes |
|---|---|---|
| Ingest (UGRC, GNIS, OSM, NHD, NPS, NRHP, MRDS, Wikivoyage, Wikimedia) | $0 | Public APIs |
| Reddit scrape | $0 | Public JSON |
| Prefilter | $0 | Heuristics |
| Snippet enrich (Claude Haiku 4.5, prompt-cached) | $0.20–0.50 | Skip with `--skip-enrich` |
| Match + classify + link-regions | $0 | Spatial joins |
| Consolidate + cleanup | $0 | SQL |
| Master enrich Tier 1 (signal merging, sun, photos) | $0 | All free |
| Vision pass (only multi-source-confirmed POIs) | $0.10–0.30 | Skip with `--skip-vision` |

**Realistic total per region: ~$0.30–0.80.** First run pays the API. Reruns
hit the LLM cache and are near-free.

---

## Troubleshooting

**"region 'foo' not found"** — `data/regions.yaml` didn't pick up the new
key. Check YAML indentation (every key under `regions:` must have the same
indent).

**No NPS results for non-UT regions** — make sure `nps_park_codes` is set.
Without it, the NPS Places ingest does nothing.

**Reddit returns 0 snippets** — your gazetteer doesn't match how the
community talks about the area. Check a few r/<sub>/top posts manually and
add words that appear there (campsite names, locals' nicknames for trails).

**Vision LLM cost spike** — vision only runs on master_places with
`source_count >= min_sources_for_vision` (default 3). Confirmed multi-source
spots only. To re-tune: `python main.py enrich-master --min-sources 4`.

**Cleanup deleted something I wanted** — the deletion list lives in
`region_config.DEFAULT_CLEANUP_POI_TYPES`. Edit there. The spec is shared
across all regions; per-region overrides aren't wired up yet.

---

## Going nationwide

The pipeline is shaped for one region at a time. To go nationwide, add
regions one by one to the YAML and run them in sequence. The master_places
table is global (not region-scoped) — every region's run contributes rows to
the same table, deduplicated across regions automatically by the consolidate
step (since clustering is purely spatial + name-based).

A reasonable ramp:

1. Joshua Tree, CA (small, dense, well-covered by NPS/Wikivoyage)
2. Jackson Hole / Tetons, WY (different state, mountain terrain)
3. Sedona / Flagstaff, AZ
4. Asheville / Pisgah, NC (forested east coast — different source mix)

Each new region exposes a different gap (e.g. Utah-specific sources missing,
gazetteer assumptions, OSM density variation). Fix gaps as they appear rather
than trying to make the pipeline universal up front.
