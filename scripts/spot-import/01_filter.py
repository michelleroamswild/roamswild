#!/usr/bin/env python3
"""
Stage 1: Filter the raw 28k-spot JSON down to Utah camping spots that fall
inside camping-eligible public land and outside tribal reservations.

Inputs (paths configurable via env or constants below):
- Raw spots JSON
- PAD-US Utah GeoDatabase (Combined layer)
- Census TIGER AIANNH shapefile

Output:
- utah_filtered.json — survivors with public-land metadata attached.
  Columns: name, name_original, lat, lng, category, description,
  date_verified, public_land_unit, public_land_manager,
  public_land_designation, public_access.

Run: python3 01_filter_utah.py
"""

import json
import re
import sys
from pathlib import Path

import geopandas as gpd
from shapely.geometry import Point

# --- Inputs ----------------------------------------------------------------
DESKTOP = Path('/Users/michelletaylor/Desktop/_Michelle Roams Wild/RoamsWild')
SPOTS_JSON = DESKTOP / 'wildcampingshowerswaterlaundry.json'
PADUS_GDB = DESKTOP / 'PADUS4_0Geodatabase' / 'PADUS4_0_Geodatabase.gdb'
PADUS_LAYER = 'PADUS4_0Combined_Proclamation_Marine_Fee_Designation_Easement'
AIANNH_SHP = DESKTOP / 'tl_2024_us_aiannh' / 'tl_2024_us_aiannh.shp'

OUT_PATH = Path(__file__).parent / 'nation_filtered.json'
OUT_INFORMAL_PATH = Path(__file__).parent / 'nation_informal.json'

# Categories included in the JSON. Dataset-dependent — current export has
# 'Wild Camping' only (no 'Informal Campsite').
CAMPING_CATEGORIES = {'Wild Camping', 'Informal Campsite'}

# PAD-US designation codes to exclude from camping-eligible filter.
# Reference: https://www.usgs.gov/programs/gap-analysis-project/science/pad-us-data-manual
# Kept narrow: only places where dispersed camping is generally prohibited.
# National Monument / NRA / Wilderness / WSA stay IN — those typically allow
# dispersed camping (GSENM, Bears Ears, etc.).
EXCLUDED_DES_TP = {
    'MIL',   # Military
    'NP',    # National Park
    'SP',    # State Park
    'MPA',   # Marine Protected Area — many polygons have invalid geometry
             # that incorrectly covers terrestrial points (e.g.
             # Papahanaumokuakea showing up in Texas/Seattle).
}

# Manager-name exclusions: BOEM polygons are offshore lease blocks; their
# geometries also misbehave in spatial joins.
EXCLUDED_MANAGER_NAMES = {'BOEM'}

# PAD-US public-access codes to exclude.
EXCLUDED_PUB_ACCESS = {'XA'}  # Closed Access. RA/UK kept (restricted/unknown).


# --- Helpers ---------------------------------------------------------------
def normalize_name(raw: str, category: str) -> str:
    """Light name cleanup. Title-case, strip ALL-CAPS shouty words,
    collapse generic camping placeholders to category default."""
    if not raw:
        return category
    s = raw.strip()
    # Strip trailing punctuation runs
    s = re.sub(r'[\s\-–—|•]+$', '', s)
    # Collapse multiple spaces
    s = re.sub(r'\s+', ' ', s)
    # If it's a generic placeholder, replace with category
    generic = {'wild camping', 'wild camp', 'camping', 'campsite', 'spot', 'free camping', 'site'}
    if s.lower() in generic:
        return category
    # Title-case if all-lowercase or all-uppercase
    if s.isupper() or s.islower():
        s = s.title()
    return s


def main():
    print('Loading spots JSON...')
    with open(SPOTS_JSON) as f:
        spots_raw = json.load(f)
    print(f'  Total entries: {len(spots_raw)}')

    # Filter to camping categories (no geo restriction — nationwide)
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
        utah_spots.append(s)
    print(f'  After camping-category filter: {len(utah_spots)}')

    # Build a GeoDataFrame of Utah spots
    spots_gdf = gpd.GeoDataFrame(
        [{
            'idx': i,
            'name_original': s['name'],
            'name': normalize_name(s['name'], s['place_category']['name']),
            'category': s['place_category']['name'],
            'description': s.get('description', ''),
            'date_verified': s.get('date_verified'),
            'lat': s['location']['latitude'],
            'lng': s['location']['longitude'],
        } for i, s in enumerate(utah_spots)],
        geometry=[Point(s['location']['longitude'], s['location']['latitude']) for s in utah_spots],
        crs='EPSG:4326',
    )

    # Load PAD-US Combined layer, filter to camping-eligible polygons
    print('Loading PAD-US Combined layer...')
    padus = gpd.read_file(
        PADUS_GDB,
        layer=PADUS_LAYER,
        columns=['Unit_Nm', 'Mang_Name', 'Mang_Type', 'Des_Tp', 'Pub_Access'],
    )
    # Build code -> label map from the Designation_Type lookup (PAD-US 4.0 stores
    # codes in Des_Tp; the human-friendly label lives in a separate table).
    print('  Loading Designation_Type lookup...')
    dt_lookup = gpd.read_file(PADUS_GDB, layer='Designation_Type')
    DES_TP_LABEL = dict(zip(dt_lookup['Code'].astype(str), dt_lookup['Dom'].astype(str)))
    padus['d_Des_Tp'] = padus['Des_Tp'].map(DES_TP_LABEL).fillna(padus['Des_Tp'])
    print(f'  Loaded: {len(padus)} polygons, {len(DES_TP_LABEL)} designation labels')

    padus = padus[~padus['Des_Tp'].isin(EXCLUDED_DES_TP)]
    padus = padus[~padus['Pub_Access'].isin(EXCLUDED_PUB_ACCESS)]
    padus = padus[~padus['Mang_Name'].isin(EXCLUDED_MANAGER_NAMES)]
    # Drop tribal here — handled by AIANNH which is more accurate
    padus = padus[padus['Mang_Type'] != 'TRIB']
    if padus.crs is None or padus.crs.to_epsg() != 4326:
        padus = padus.to_crs('EPSG:4326')
    print(f'  After camping-eligibility filter: {len(padus)} polygons')

    # Load nationwide AIANNH tribal lands (covers all US, ~864 polygons)
    print('Loading tribal lands (Census AIANNH)...')
    tribal = gpd.read_file(AIANNH_SHP)
    if tribal.crs is None or tribal.crs.to_epsg() != 4326:
        tribal = tribal.to_crs('EPSG:4326')
    tribal_utah = tribal  # nationwide; variable name kept for diff stability
    print(f'  Tribal polygons (nationwide): {len(tribal_utah)}')

    # Spatial joins
    print('Running spatial joins...')
    inside_padus = gpd.sjoin(spots_gdf, padus, how='left', predicate='within')
    # A spot may match multiple polygons (overlapping designations). Keep the
    # first match per spot.
    inside_padus = inside_padus.loc[~inside_padus.index.duplicated(keep='first')]

    inside_tribal = gpd.sjoin(spots_gdf, tribal_utah[['NAME', 'geometry']],
                               how='left', predicate='within')
    inside_tribal = inside_tribal.loc[~inside_tribal.index.duplicated(keep='first')]

    # Build survivors
    spots_gdf['_in_padus'] = inside_padus['Unit_Nm'].notna().values
    spots_gdf['_in_tribal'] = inside_tribal['NAME'].notna().values
    spots_gdf['_padus_unit'] = inside_padus['Unit_Nm'].values
    spots_gdf['_padus_manager'] = inside_padus['Mang_Name'].values
    spots_gdf['_padus_des_tp'] = inside_padus['d_Des_Tp'].values
    spots_gdf['_padus_access'] = inside_padus['Pub_Access'].values
    spots_gdf['_tribal_name'] = inside_tribal['NAME'].values

    # Classify into three buckets:
    #   - in non-tribal public land  -> dispersed_camping  (main file)
    #   - outside any public land     -> informal_camping   (separate file)
    #   - in tribal reservation       -> dropped
    dispersed = spots_gdf[spots_gdf['_in_padus'] & ~spots_gdf['_in_tribal']]
    informal  = spots_gdf[~spots_gdf['_in_padus'] & ~spots_gdf['_in_tribal']]
    rejected_tribal = spots_gdf[spots_gdf['_in_tribal']]

    print()
    print('=== Filter results ===')
    print(f'  dispersed_camping (in public land):      {len(dispersed)}')
    print(f'  informal_camping (outside public land):  {len(informal)}')
    print(f'  Rejected — inside tribal reservation:    {len(rejected_tribal)}')
    print()
    print('Top managing agencies among dispersed_camping survivors:')
    print(dispersed['_padus_manager'].value_counts().head(10).to_string())

    main_out = []
    for _, row in dispersed.iterrows():
        main_out.append({
            'name': row['name'],
            'name_original': row['name_original'],
            'lat': row['lat'],
            'lng': row['lng'],
            'category': 'dispersed_camping',
            'description': row['description'],
            'date_verified': row['date_verified'],
            'public_land_unit': row['_padus_unit'],
            'public_land_manager': row['_padus_manager'],
            'public_land_designation': row['_padus_des_tp'],
            'public_access': row['_padus_access'],
        })

    informal_out = []
    for _, row in informal.iterrows():
        informal_out.append({
            'name': row['name'],
            'name_original': row['name_original'],
            'lat': row['lat'],
            'lng': row['lng'],
            'category': 'informal_camping',
            'description': row['description'],
            'date_verified': row['date_verified'],
            'public_land_unit': None,
            'public_land_manager': None,
            'public_land_designation': None,
            'public_access': None,
        })

    OUT_PATH.write_text(json.dumps(main_out, indent=2, default=str))
    OUT_INFORMAL_PATH.write_text(json.dumps(informal_out, indent=2, default=str))
    print()
    print(f'Wrote {len(main_out)} dispersed_camping entries to {OUT_PATH}')
    print(f'Wrote {len(informal_out)} informal_camping entries to {OUT_INFORMAL_PATH}')


if __name__ == '__main__':
    main()
