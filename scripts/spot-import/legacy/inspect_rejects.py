#!/usr/bin/env python3
"""
Quick reviewer: shows samples of spots that the Stage 1 filter rejected.
- 10 random samples of "outside public land"
- All "inside tribal reservation" entries
- Includes coordinates so they can be checked on a map
"""

import json
import random
from pathlib import Path

import geopandas as gpd
from shapely.geometry import Point

DESKTOP = Path('/Users/michelletaylor/Desktop/_Michelle Roams Wild/RoamsWild')
SPOTS_JSON = DESKTOP / 'places20260426-16-kt0ipq.json'
PADUS_GDB = DESKTOP / 'PADUS4_1_State_UT_GDB_KMZ' / 'PADUS4_1_StateUT.gdb'
PADUS_LAYER = 'PADUS4_1Comb_DOD_Trib_NGP_Fee_Desig_Ease_State_UT'
AIANNH_SHP = DESKTOP / 'tl_2024_us_aiannh' / 'tl_2024_us_aiannh.shp'

UTAH_BBOX = {'min_lat': 36.9, 'max_lat': 42.1, 'min_lng': -114.5, 'max_lng': -108.8}
CAMPING_CATEGORIES = {'Wild Camping', 'Informal Campsite'}

EXCLUDED_DES_TP = {'MIL', 'NP', 'SP'}
EXCLUDED_PUB_ACCESS = {'XA'}


def main():
    with open(SPOTS_JSON) as f:
        spots_raw = json.load(f)

    # Same filter as Stage 1
    utah_spots = []
    for s in spots_raw:
        cat = s.get('place_category', {}).get('name', '')
        if cat not in CAMPING_CATEGORIES:
            continue
        loc = s.get('location') or {}
        lat = loc.get('latitude')
        lng = loc.get('longitude')
        if lat is None or lng is None:
            continue
        if not (UTAH_BBOX['min_lat'] <= lat <= UTAH_BBOX['max_lat']
                and UTAH_BBOX['min_lng'] <= lng <= UTAH_BBOX['max_lng']):
            continue
        utah_spots.append(s)

    spots_gdf = gpd.GeoDataFrame(
        utah_spots,
        geometry=[Point(s['location']['longitude'], s['location']['latitude']) for s in utah_spots],
        crs='EPSG:4326',
    )

    # PAD-US (full, including excluded designations) for reject diagnosis
    padus_full = gpd.read_file(PADUS_GDB, layer=PADUS_LAYER,
                                columns=['Unit_Nm', 'Mang_Name', 'Mang_Type', 'Des_Tp', 'd_Des_Tp', 'Pub_Access'])
    if padus_full.crs is None or padus_full.crs.to_epsg() != 4326:
        padus_full = padus_full.to_crs('EPSG:4326')

    # Eligible subset (same filter as Stage 1)
    padus_eligible = padus_full[
        ~padus_full['Des_Tp'].isin(EXCLUDED_DES_TP)
        & ~padus_full['Pub_Access'].isin(EXCLUDED_PUB_ACCESS)
        & (padus_full['Mang_Type'] != 'TRIB')
    ]

    tribal = gpd.read_file(AIANNH_SHP)
    if tribal.crs is None or tribal.crs.to_epsg() != 4326:
        tribal = tribal.to_crs('EPSG:4326')
    tribal_utah = tribal.cx[
        UTAH_BBOX['min_lng']:UTAH_BBOX['max_lng'],
        UTAH_BBOX['min_lat']:UTAH_BBOX['max_lat'],
    ]

    # Spatial joins for diagnosis
    in_eligible = gpd.sjoin(spots_gdf, padus_eligible[['Unit_Nm', 'geometry']],
                             how='left', predicate='within')
    in_eligible = in_eligible.loc[~in_eligible.index.duplicated(keep='first')]

    # ALSO check against the FULL padus (including national parks / wilderness etc)
    # so we can tell whether a "rejected" spot is actually inside an excluded
    # category (e.g. inside a National Park) vs. genuinely on private land.
    in_full = gpd.sjoin(spots_gdf, padus_full[['Unit_Nm', 'd_Des_Tp', 'Mang_Name', 'geometry']],
                        how='left', predicate='within', lsuffix='_l', rsuffix='_r')
    in_full = in_full.loc[~in_full.index.duplicated(keep='first')]

    in_tribal = gpd.sjoin(spots_gdf, tribal_utah[['NAME', 'geometry']],
                           how='left', predicate='within')
    in_tribal = in_tribal.loc[~in_tribal.index.duplicated(keep='first')]

    spots_gdf['in_eligible'] = in_eligible['Unit_Nm'].notna().values
    spots_gdf['fallback_unit'] = in_full['Unit_Nm'].values
    spots_gdf['fallback_des_tp'] = in_full['d_Des_Tp'].values
    spots_gdf['fallback_manager'] = in_full['Mang_Name'].values
    spots_gdf['tribal_name'] = in_tribal['NAME'].values

    # Group rejects
    rejects_outside = spots_gdf[~spots_gdf['in_eligible'] & spots_gdf['tribal_name'].isna()]
    rejects_tribal = spots_gdf[spots_gdf['tribal_name'].notna()]

    # Within "outside public land" we have two flavors:
    #  - Inside an EXCLUDED category (e.g., a National Park) — these are correct rejects
    #  - Truly outside any PAD-US polygon (private/county/etc) — also correct, but worth showing
    rejects_excluded_cat = rejects_outside[rejects_outside['fallback_unit'].notna()]
    rejects_truly_outside = rejects_outside[rejects_outside['fallback_unit'].isna()]

    print('=== REJECT BREAKDOWN ===')
    print(f'  Total rejects "outside public land": {len(rejects_outside)}')
    print(f'    └─ Inside an excluded category (NP/SP/Wilderness/etc): {len(rejects_excluded_cat)}')
    print(f'    └─ Truly outside any PAD-US polygon (private/etc):     {len(rejects_truly_outside)}')
    print(f'  Total rejects "inside tribal reservation": {len(rejects_tribal)}')
    print()

    print('=== 10 SAMPLES: spots inside an excluded PAD-US category (these are correct rejects) ===')
    for _, r in rejects_excluded_cat.sample(min(10, len(rejects_excluded_cat)), random_state=42).iterrows():
        loc = r['location']
        print(f'\n• {r["name"]}')
        print(f'  ({loc["latitude"]:.5f}, {loc["longitude"]:.5f})')
        print(f'  Inside: {r["fallback_unit"]} ({r["fallback_des_tp"]}, {r["fallback_manager"]})')
        desc = (r.get("description") or "")[:200]
        print(f'  Desc: {desc}')

    print('\n\n=== 10 SAMPLES: spots NOT inside any PAD-US polygon (private/county/etc) ===')
    for _, r in rejects_truly_outside.sample(min(10, len(rejects_truly_outside)), random_state=42).iterrows():
        loc = r['location']
        print(f'\n• {r["name"]}')
        print(f'  ({loc["latitude"]:.5f}, {loc["longitude"]:.5f})')
        desc = (r.get("description") or "")[:200]
        print(f'  Desc: {desc}')

    print('\n\n=== ALL 27 SAMPLES: spots inside tribal reservations ===')
    for _, r in rejects_tribal.iterrows():
        loc = r['location']
        print(f'\n• {r["name"]}')
        print(f'  ({loc["latitude"]:.5f}, {loc["longitude"]:.5f})')
        print(f'  Tribal: {r["tribal_name"]}')
        desc = (r.get("description") or "")[:200]
        print(f'  Desc: {desc}')


if __name__ == '__main__':
    main()
