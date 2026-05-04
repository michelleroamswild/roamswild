#!/usr/bin/env python3
"""Run the bbox-scoped community CSV (public/data/community_csv.json)
through the same PAD-US filter the original 01_filter.py applies, so
we can see how many of the 'fell through' rows actually sit inside
public land per the current GDB.

Output:
- Console summary: in-public-land vs outside, broken out by manager.
- public/data/community_csv_with_landcheck.json — same rows but each
  row now carries `inPublicLand` / `manager` / `designation` so iotest
  can color-code them differently.

No Supabase, no writes to the spots table.
"""
import json
import sys
from pathlib import Path
from collections import Counter

import geopandas as gpd
from shapely.geometry import Point

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'public' / 'data' / 'community_csv.json'
OUT = ROOT / 'public' / 'data' / 'community_csv_with_landcheck.json'

DESKTOP = Path('/Users/michelletaylor/Desktop/_Michelle Roams Wild/RoamsWild')
PADUS_GDB = DESKTOP / 'PADUS4_0Geodatabase' / 'PADUS4_0_Geodatabase.gdb'
PADUS_LAYER = 'PADUS4_0Combined_Proclamation_Marine_Fee_Designation_Easement'
AIANNH_SHP = DESKTOP / 'tl_2024_us_aiannh' / 'tl_2024_us_aiannh.shp'

# Exclusions match scripts/spot-import/01_filter.py exactly
EXCLUDED_DES_TP = {'MIL', 'NP', 'SP', 'MPA'}
EXCLUDED_PUB_ACCESS = {'XA'}
EXCLUDED_MANAGER_NAMES = {'BOEM'}


def main():
    if not SRC.exists():
        sys.exit(f'Source JSON not found: {SRC}\nRun extract_community_csv.py first.')
    if not PADUS_GDB.exists():
        sys.exit(f'PAD-US GDB not found: {PADUS_GDB}')

    rows = json.loads(SRC.read_text())
    print(f'Loaded {len(rows)} rows from {SRC.name}')

    if not rows:
        print('No rows to check.')
        return

    # Build a GeoDataFrame from the CSV rows
    spots_gdf = gpd.GeoDataFrame(
        [{'idx': i, **r} for i, r in enumerate(rows)],
        geometry=[Point(r['lng'], r['lat']) for r in rows],
        crs='EPSG:4326',
    )

    # Bbox of the spots — used to clip PAD-US load for speed
    minx, miny, maxx, maxy = spots_gdf.total_bounds
    print(f'Spots bbox: lat {miny:.3f}–{maxy:.3f}, lng {minx:.3f}–{maxx:.3f}')

    print('Loading PAD-US Combined layer (this takes ~1-2 min — PAD-US is huge)...')
    # bbox= can't be used here: PAD-US is in EPSG:5070 (Albers), not
    # 4326, so a lat/lng bbox loads zero polygons. Read the whole layer
    # then to_crs(4326) like 01_filter.py does — slow but correct.
    padus = gpd.read_file(
        PADUS_GDB,
        layer=PADUS_LAYER,
        columns=['Unit_Nm', 'Mang_Name', 'Mang_Type', 'Des_Tp', 'Pub_Access'],
    )
    print(f'  Loaded {len(padus)} polygons total')

    # Same exclusions as 01_filter.py
    padus = padus[~padus['Des_Tp'].isin(EXCLUDED_DES_TP)]
    padus = padus[~padus['Pub_Access'].isin(EXCLUDED_PUB_ACCESS)]
    padus = padus[~padus['Mang_Name'].isin(EXCLUDED_MANAGER_NAMES)]
    padus = padus[padus['Mang_Type'] != 'TRIB']
    if padus.crs is None or padus.crs.to_epsg() != 4326:
        padus = padus.to_crs('EPSG:4326')
    print(f'  After camping-eligibility filter: {len(padus)} polygons')

    # AIANNH is already in 4326 so the bbox optimization works there
    print('Loading tribal lands (Census AIANNH)...')
    tribal = gpd.read_file(AIANNH_SHP)
    if tribal.crs is None or tribal.crs.to_epsg() != 4326:
        tribal = tribal.to_crs('EPSG:4326')
    print(f'  Tribal polygons: {len(tribal)}')

    # Spatial joins
    print('Running spatial joins...')
    inside_padus = gpd.sjoin(spots_gdf, padus, how='left', predicate='within')
    inside_padus = inside_padus.loc[~inside_padus.index.duplicated(keep='first')]
    inside_tribal = gpd.sjoin(spots_gdf, tribal[['NAME', 'geometry']], how='left', predicate='within')
    inside_tribal = inside_tribal.loc[~inside_tribal.index.duplicated(keep='first')]

    spots_gdf['_in_padus'] = inside_padus['Unit_Nm'].notna().values
    spots_gdf['_in_tribal'] = inside_tribal['NAME'].notna().values
    spots_gdf['_padus_unit'] = inside_padus['Unit_Nm'].values
    spots_gdf['_padus_manager'] = inside_padus['Mang_Name'].values
    spots_gdf['_padus_des_tp'] = inside_padus['Des_Tp'].values
    spots_gdf['_tribal_name'] = inside_tribal['NAME'].values

    in_public = spots_gdf[spots_gdf['_in_padus'] & ~spots_gdf['_in_tribal']]
    in_tribal = spots_gdf[spots_gdf['_in_tribal']]
    outside_all = spots_gdf[~spots_gdf['_in_padus'] & ~spots_gdf['_in_tribal']]

    print()
    print('=== Land-check results ===')
    print(f'  IN public land (non-tribal):    {len(in_public):4d}  ← these were filtered correctly')
    print(f'  IN tribal reservation:           {len(in_tribal):4d}  ← dropped at import time')
    print(f'  OUTSIDE any public-land polygon: {len(outside_all):4d}  ← these are private / informal')

    if len(in_public):
        print()
        print('Top managers among IN-PUBLIC-LAND rows:')
        mgr_counts = Counter(in_public['_padus_manager'].dropna())
        for m, n in mgr_counts.most_common(10):
            print(f'  {n:4d}  {m}')

    if len(outside_all):
        print()
        print('Sample of OUTSIDE rows (first 10):')
        for _, row in outside_all.head(10).iterrows():
            print(f'  ({row["lat"]:.5f}, {row["lng"]:.5f}) [{row["category"]}] {row.get("name") or "(unnamed)"}')

    if len(in_tribal):
        print()
        print('Sample of IN-TRIBAL rows (first 10):')
        for _, row in in_tribal.head(10).iterrows():
            print(f'  ({row["lat"]:.5f}, {row["lng"]:.5f}) [{row["category"]}] {row.get("name") or "(unnamed)"}'
                  f' — tribal: {row["_tribal_name"]}')

    # Persist enriched JSON for iotest to color-code.
    # Match 01_filter.py's classification logic: a "Wild Camping" CSV
    # row that ISN'T inside non-tribal public land would have been
    # bucketed by the import pipeline as informal_camping (it has no
    # camping-eligible polygon). Apply that reclassification here so
    # the iotest dispersed diff doesn't surface these rows as
    # candidates — they're informal by definition, not "missing
    # dispersed."
    enriched = []
    reclassified = 0
    for _, r in spots_gdf.iterrows():
        in_public = bool(r['_in_padus'] and not r['_in_tribal'])
        original_kind = r.get('kind')
        original_category = r['category']
        if original_category == 'Wild Camping' and not in_public:
            kind = 'informal_camping'
            category = 'Informal Campsite'
            reclassified += 1
        else:
            kind = original_kind
            category = original_category
        enriched.append({
            'lat': r['lat'],
            'lng': r['lng'],
            'name': r.get('name'),
            'category': category,
            'kind': kind,
            'originalCategory': original_category,
            'description': r.get('description', ''),
            'inPublicLand': in_public,
            'inTribal': bool(r['_in_tribal']),
            'manager': r['_padus_manager'] if isinstance(r['_padus_manager'], str) else None,
            'designation': r['_padus_des_tp'] if isinstance(r['_padus_des_tp'], str) else None,
            'tribalName': r['_tribal_name'] if isinstance(r['_tribal_name'], str) else None,
        })
    OUT.write_text(json.dumps(enriched, separators=(',', ':')))
    if reclassified:
        print(f'Reclassified {reclassified} "Wild Camping" rows outside public land → informal_camping')
    size_kb = OUT.stat().st_size / 1024
    print()
    print(f'Wrote enriched JSON to {OUT.name} ({size_kb:.1f} KB)')


if __name__ == '__main__':
    main()
