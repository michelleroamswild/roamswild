# Community Spots Import Pipeline

End-to-end pipeline for ingesting community-sourced spot data (camping, water, showers, laundromats) into the `community_spots` Supabase table.

## Pipeline stages

| # | Script | Input | Output | Notes |
|---|---|---|---|---|
| 1 | `01_filter.py` | raw JSON + PAD-US + AIANNH | `nation_filtered.json`, `nation_informal.json` | Public-land + tribal spatial filter |
| 1b | `01b_extract_utilities.py` | raw JSON | `nation_water.json`, `nation_showers.json`, `nation_laundromats.json` | Splits utilities by source category |
| 2 | `02_summarize_descriptions.py` | `*.json` | `*_summarized.json` | AI summary, category-aware, no first person / no AI filler / no narrative. Strips iOverlander references. |
| 3 | `03_rewrite_names.py` | `*_summarized.json` | `*_named.json` | AI name rewrite, post-pass cleanup (suffix strip, ALL CAPS → Title, "@" → "at"). Camping only — utilities skip this. |
| 4 | `04_attach_csv_tags.py` | `*_named.json` (or `*_summarized.json`) + CSV | `*_clean.json` | Attaches Water / Big rig / Tent / Toilets / Spot type from the CSV via lat/lng nearest-neighbor match |
| 5 | `05_load_to_supabase.py` | `*_clean.json` | Cloud `community_spots` | Truncates and reloads (use `--truncate`) |

The strict-rule prompts in stage 2 and the post-cleanup helpers in stage 3 carry every lesson from the previous review passes — there is no need to chain bug-fix scripts after a normal run.

## Review utilities

After a load, use these to surface anomalies and apply human review decisions:

| Script | Purpose |
|---|---|
| `scan_weird_entries.py` | Scans all loaded data for AI-flavored / weird text and writes `public/test-data/review-list.json` (consumed by `/iotest`). Run after a fresh load to refresh the list. |
| `apply_review_decisions.py --backup BACKUP.json` | Reads an iotest backup file (👍 / 👎 / ✕ sets) and: re-summarizes 👎 entries with a stricter prompt, deletes ✕ entries from local files. Run before a final cloud reload. |
| `auto_fix_review.py` | One-shot pass that re-summarizes everything in the current review list (no human-in-the-loop). Useful when the review list is too large to wade through. |

## Running end to end

```sh
# 1. Filter and extract utility splits
python3 01_filter.py
python3 01b_extract_utilities.py

# 2. AI summaries (run on each file — about 3–5 hours total on llama3.1:8b)
caffeinate -i python3 02_summarize_descriptions.py --input nation_filtered.json --output nation_filtered_summarized.json
caffeinate -i python3 02_summarize_descriptions.py --input nation_informal.json --output nation_informal_summarized.json
caffeinate -i python3 02_summarize_descriptions.py --input nation_water.json --output nation_water_summarized.json
caffeinate -i python3 02_summarize_descriptions.py --input nation_showers.json --output nation_showers_summarized.json
caffeinate -i python3 02_summarize_descriptions.py --input nation_laundromats.json --output nation_laundromats_summarized.json

# 3. AI name rewrite — camping only
caffeinate -i python3 03_rewrite_names.py --input nation_filtered_summarized.json --output nation_filtered_named.json
caffeinate -i python3 03_rewrite_names.py --input nation_informal_summarized.json --output nation_informal_named.json

# 4. CSV merge — final files end with _clean.json
python3 04_attach_csv_tags.py --input nation_filtered_named.json --output nation_filtered_clean.json
python3 04_attach_csv_tags.py --input nation_informal_named.json --output nation_informal_clean.json
python3 04_attach_csv_tags.py --input nation_water_summarized.json --output nation_water_clean.json
python3 04_attach_csv_tags.py --input nation_showers_summarized.json --output nation_showers_clean.json
python3 04_attach_csv_tags.py --input nation_laundromats_summarized.json --output nation_laundromats_clean.json

# 5. Load
python3 05_load_to_supabase.py --truncate

# 6. (Optional) Generate a review list for iotest
python3 scan_weird_entries.py
```

## Files

- `legacy/` — historical bug-fix scripts kept for reference. Not part of the active pipeline.
- `nation_*.json` — pipeline outputs at various stages (gitignored).
- Source JSON / CSV / PAD-US live on Desktop, paths set inside `01_filter.py` and `01b_extract_utilities.py`.
