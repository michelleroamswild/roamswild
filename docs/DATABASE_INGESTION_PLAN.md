# Database Ingestion Plan

> **Status**: Planning complete, implementation paused
> **Last Updated**: January 2026
> **Decision**: Continue with API-based approach for now; database ingestion can resume later

---

## Current Database State

### Schema (Complete)
All tables and indexes are in place. Migrations applied:
- `20260137_dispersed_sites_schema.sql` - Core tables
- `20260165_schema_gaps_comprehensive.sql` - Provenance, regulations, designations
- `20260166_schema_polish_pass.sql` - Future-proofing columns, unified view

### Data (Partial - Moab Only)

| Table | Rows | Coverage |
|-------|------|----------|
| potential_spots | 5,996 | Moab region |
| road_segments | 7,311 | Moab region |
| public_lands | 1,377 | Partial |
| established_campgrounds | 137 | Partial |
| private_road_points | 5,782 | Moab region |
| data_sources | 9 | Complete (seeded) |
| wilderness_areas | 0 | Empty |
| national_monuments | 0 | Empty |
| exclusion_zones | 0 | Empty |
| land_regulations | 0 | Empty |

---

## Scripts Created (Ready to Use)

### 1. State Import Script
**File**: `scripts/import-state.ts`

Tile-based import for entire states. Handles rate limiting, retries, and progress tracking.

```bash
# Preview tiles
npx tsx scripts/import-state.ts --state utah --dry-run

# Run full import
npx tsx scripts/import-state.ts --state utah

# Resume from specific tile
npx tsx scripts/import-state.ts --state utah --tile 25
```

**Supported states**: utah, arizona, colorado, nevada, california

**What it imports per tile**:
1. OSM roads (tracks, paths, unclassified)
2. OSM camp sites (tourism=camp_site)
3. Private road points (for filtering)
4. Derived dead-end spots (from road termini)

**Estimated time for Utah**: 2-4 hours (100 tiles)

### 2. Data Sources Seed
**File**: `scripts/seed-data-sources.ts`

Seeds the `data_sources` table with licensing and attribution info.

```bash
npx tsx scripts/seed-data-sources.ts
```

**Status**: Already run, 9 sources seeded.

### 3. Moab Import Script
**File**: `scripts/run-moab-import.ts`

Original script used to import Moab region. Can be used as reference.

---

## Pending Enhancements

### 1. PAD-US Import (Public Lands Boundaries)

**Priority**: HIGH - Foundation for all camping rules

**Data Source**:
- URL: https://www.usgs.gov/programs/gap-analysis-project/science/pad-us-data-download
- Format: GeoPackage (.gpkg) or USGS Feature Service API
- Full US: ~2GB download, Utah only: ~50-100MB

**Implementation Options**:

```
Option A: USGS Feature Service API (no download)
  - Query: https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/PADUS/FeatureServer/0/query
  - Filter by state, paginate results
  - Pros: No file management
  - Cons: Slower, rate limits

Option B: Pre-process with ogr2ogr (faster)
  1. Download PAD-US GeoPackage
  2. Extract Utah: ogr2ogr -f GeoJSON utah_lands.json PADUS.gpkg -where "State_Nm='UT'"
  3. Import GeoJSON via script
  - Pros: Faster, can simplify geometries offline
  - Cons: Requires GDAL, file management
```

**Key fields to import**:
- `Unit_Nm` → name
- `Mang_Name` → managing_agency (BLM, USFS, NPS, etc.)
- `Des_Tp` → land_type (designation type)
- `GIS_Acres` → area_acres
- Geometry → boundary (with simplification)

**Geometry simplification** (reduce storage 80-90%):
```sql
ST_SimplifyPreserveTopology(boundary, 0.001)
```

**Effort**: 2-3 hours

### 2. Wilderness Boundaries

**Priority**: HIGH - Affects camping rules (no motorized access)

**Data Source**:
- Included in PAD-US with `Des_Tp IN ('WILD', 'WSA')`
- Alternative: https://wilderness.net/visit-wilderness/gis.php

**Implementation**:
- Filter PAD-US during import
- Route to `wilderness_areas` table instead of `public_lands`

**Effort**: 1 hour (if done with PAD-US import)

### 3. National Monuments

**Priority**: MEDIUM

**Data Source**:
- Included in PAD-US with `Des_Tp = 'NM'`

**Implementation**:
- Filter PAD-US during import
- Route to `national_monuments` table

**Effort**: Included with PAD-US import

### 4. MVUM Import (Motor Vehicle Use Maps)

**Priority**: MEDIUM - Better vehicle access classification than OSM

**Data Source**:
- URL: https://data.fs.usda.gov/geodata/edw/datasets.php?dsetCategory=transportation
- Layer: "Road Core" or "MVUM Roads"
- Format: FileGDB or Shapefile

**Utah National Forests**:
- Manti-La Sal
- Uinta-Wasatch-Cache
- Fishlake
- Dixie
- Ashley

**Vehicle access mapping**:
```
OPER_MAINT_LEVEL 1-2 → closed/4wd
OPER_MAINT_LEVEL 3   → high_clearance
OPER_MAINT_LEVEL 4-5 → passenger
```

**Effort**: 3-4 hours

### 5. BLM Roads (GTRN)

**Priority**: LOW - OSM usually has good BLM road coverage

**Data Source**:
- URL: https://gbp-blm-egis.hub.arcgis.com/
- Layer: Ground Transportation Linear Features

**Effort**: 2-3 hours

---

## Storage Estimates

### Current (Moab only)
~20 MB total

### Utah Complete (projected)

| Table | Estimated Rows | Estimated Size |
|-------|----------------|----------------|
| public_lands | 3,000-5,000 | 30-50 MB |
| road_segments | 100,000-200,000 | 50-100 MB |
| potential_spots | 50,000-100,000 | 20-50 MB |
| wilderness_areas | 50-100 | 5 MB |
| private_road_points | 50,000 | 5 MB |
| **Total** | | **~150-250 MB** |

### Multi-State (UT, AZ, CO, NV)
~600 MB - 1 GB

**Supabase limits**:
- Free tier: 500 MB
- Pro tier: 8 GB

---

## Recommended Implementation Order

When ready to resume database ingestion:

1. **PAD-US + Wilderness + Monuments** (foundation)
   - Defines where dispersed camping is allowed
   - Populates `public_lands`, `wilderness_areas`, `national_monuments`

2. **Run Utah OSM Import** (roads & spots)
   - `npx tsx scripts/import-state.ts --state utah`
   - Gets all roads and derived spots

3. **MVUM Import** (enhancement)
   - Better vehicle access classification
   - Complements OSM roads

4. **Exclusion Zones** (safety)
   - Import mine sites, military areas
   - Populate `exclusion_zones` table

5. **Land Regulations** (rules)
   - Fire restrictions, stay limits
   - Requires manual curation or agency data scraping

---

## API-Based Alternative (Current Approach)

The app currently uses client-side API calls for "Full mode":

### Data Sources
- **Public Lands**: BLM ArcGIS Feature Service, PAD-US Feature Service
- **Roads**: OSM Overpass API
- **Camp Sites**: OSM Overpass API
- **Campgrounds**: Recreation.gov API, USFS API

### Pros
- No database maintenance
- Always current data
- No storage costs

### Cons
- Slower (multiple API calls per request)
- Rate limits on Overpass API
- Can't pre-filter or score spots
- No provenance tracking

### Hybrid Approach (Future)
Use database for:
- Pre-computed spots with scores
- Cached public land boundaries
- Offline/fast mode

Use APIs for:
- Real-time road conditions
- Weather
- Fresh campground availability

---

## Files Reference

### Migrations
```
supabase/migrations/
├── 20260137_dispersed_sites_schema.sql      # Core tables
├── 20260138_dispersed_import_functions.sql  # Import RPCs
├── 20260163_filter_spots_near_private_roads.sql
├── 20260164_fix_derive_source_type_cast.sql
├── 20260165_schema_gaps_comprehensive.sql   # Provenance, regulations
└── 20260166_schema_polish_pass.sql          # Polish columns, view
```

### Scripts
```
scripts/
├── import-state.ts          # State-level tile import
├── seed-data-sources.ts     # Seed data_sources table
├── run-moab-import.ts       # Moab-specific import
├── validate_schema_gaps.sql # Schema validation queries
└── .import-progress-*.json  # Auto-generated progress files
```

### Seed Data
```
supabase/seed/
└── 001_data_sources.sql     # Data sources with licensing
```

---

## Contact / Notes

This plan was developed during the dispersed camping feature build. The schema is production-ready; only data ingestion is pending.

Key decisions made:
- 0.5° tile size balances API limits vs. processing time
- Geometry simplification acceptable for camping use case
- OSM is primary road source; MVUM enhances vehicle access
- Private road filtering happens at import time, not runtime
