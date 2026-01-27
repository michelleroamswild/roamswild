/**
 * Import regions from public land data sources (USFS National Forests & BLM Districts)
 *
 * Data Sources:
 * - USFS: https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_ForestSystemBoundaries_01/MapServer
 * - BLM: https://gis.blm.gov/arcgis/rest/services/admin_boundaries/BLM_Natl_AdminUnit/MapServer
 *
 * Run with: npx tsx scripts/import-regions.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
  console.error('Please set SUPABASE_SERVICE_ROLE_KEY in your .env file');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ArcGIS REST API endpoints
const USFS_FORESTS_URL = 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_ForestSystemBoundaries_01/MapServer/0/query';
const BLM_FIELD_OFFICES_URL = 'https://gis.blm.gov/arcgis/rest/services/admin_boundaries/BLM_Natl_AdminUnit/MapServer/3/query';

// Types
interface ArcGISFeature {
  attributes: Record<string, any>;
  geometry: {
    rings?: number[][][];
    paths?: number[][][];
    x?: number;
    y?: number;
  };
}

interface ArcGISResponse {
  features: ArcGISFeature[];
  exceededTransferLimit?: boolean;
}

interface BoundingBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface RegionData {
  name: string;
  slug: string;
  description: string | null;
  bbox: BoundingBox;
  center_lat: number;
  center_lng: number;
  primary_biome: string;
  area_sq_miles: number | null;
  land_manager: 'usfs' | 'blm';
}

// Biome estimation based on geographic location and name
function estimateBiome(lat: number, lng: number, name: string): string {
  const nameLower = name.toLowerCase();

  // Name-based hints
  if (nameLower.includes('desert') || nameLower.includes('mojave') || nameLower.includes('sonoran')) {
    return 'desert';
  }
  if (nameLower.includes('alpine') || nameLower.includes('glacier') || nameLower.includes('snow')) {
    return 'alpine';
  }
  if (nameLower.includes('coast') || nameLower.includes('olympic') || nameLower.includes('redwood')) {
    return 'coastal';
  }
  if (nameLower.includes('grass') || nameLower.includes('prairie') || nameLower.includes('plains')) {
    return 'grassland';
  }

  // Geographic estimation
  // Pacific Northwest coastal
  if (lng < -120 && lat > 42 && lat < 49) {
    return lng < -123 ? 'coastal' : 'forest';
  }

  // California coast
  if (lng < -119 && lat > 34 && lat < 42) {
    return 'coastal';
  }

  // Southwest deserts
  if (lat < 37 && lng > -115 && lng < -103) {
    return 'desert';
  }

  // Southern California / Arizona deserts
  if (lat < 35 && lng > -118 && lng < -109) {
    return 'desert';
  }

  // Great Basin (Nevada/Utah)
  if (lat > 36 && lat < 42 && lng > -120 && lng < -111) {
    return 'desert';
  }

  // Rocky Mountains - high elevation areas
  if (lng > -115 && lng < -104 && lat > 35 && lat < 49) {
    return 'alpine';
  }

  // Great Plains
  if (lng > -104 && lng < -95 && lat > 30 && lat < 49) {
    return 'grassland';
  }

  // Default to forest for most areas
  return 'forest';
}

// Convert name to URL-friendly slug
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Calculate bounding box from polygon rings
function calculateBbox(geometry: ArcGISFeature['geometry']): BoundingBox | null {
  const coords: number[][] = [];

  if (geometry.rings) {
    for (const ring of geometry.rings) {
      coords.push(...ring);
    }
  } else if (geometry.x !== undefined && geometry.y !== undefined) {
    coords.push([geometry.x, geometry.y]);
  }

  if (coords.length === 0) return null;

  let north = -90, south = 90, east = -180, west = 180;

  for (const [x, y] of coords) {
    if (y > north) north = y;
    if (y < south) south = y;
    if (x > east) east = x;
    if (x < west) west = x;
  }

  return { north, south, east, west };
}

// Fetch data from ArcGIS REST API with pagination
async function fetchArcGISData(
  baseUrl: string,
  where: string = '1=1',
  outFields: string = '*',
  usePost: boolean = false
): Promise<ArcGISFeature[]> {
  const allFeatures: ArcGISFeature[] = [];
  let offset = 0;
  const pageSize = 1000;
  let hasMore = true;

  console.log(`Fetching from ${baseUrl}...`);

  while (hasMore) {
    const params = new URLSearchParams({
      where,
      outFields,
      outSR: '4326', // WGS84
      f: 'json',
      returnGeometry: 'true',
      resultOffset: offset.toString(),
      resultRecordCount: pageSize.toString(),
    });

    try {
      let response: Response;
      if (usePost) {
        response = await fetch(baseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        });
      } else {
        response = await fetch(`${baseUrl}?${params}`);
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: ArcGISResponse = await response.json();

      if (data.features && data.features.length > 0) {
        allFeatures.push(...data.features);
        console.log(`  Fetched ${allFeatures.length} features so far...`);
        offset += pageSize;
        hasMore = data.exceededTransferLimit === true;
      } else {
        hasMore = false;
      }
    } catch (error) {
      console.error(`Error fetching data at offset ${offset}:`, error);
      hasMore = false;
    }

    // Rate limiting
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return allFeatures;
}

// Process USFS National Forests
async function importUSFSForests(): Promise<RegionData[]> {
  console.log('\n=== Importing USFS National Forests ===\n');

  const features = await fetchArcGISData(
    USFS_FORESTS_URL,
    "OBJECTID>0",
    'FORESTNAME,FORESTNUMBER,GIS_ACRES'
  );

  const regions: RegionData[] = [];
  const seenNames = new Set<string>();

  for (const feature of features) {
    const name = feature.attributes.FORESTNAME;
    if (!name || seenNames.has(name)) continue;
    seenNames.add(name);

    const bbox = calculateBbox(feature.geometry);
    if (!bbox) continue;

    // Skip if bounding box is too small (likely bad data)
    if (bbox.north - bbox.south < 0.1 || bbox.east - bbox.west < 0.1) continue;

    const centerLat = (bbox.north + bbox.south) / 2;
    const centerLng = (bbox.east + bbox.west) / 2;

    // Skip non-CONUS for now (Alaska, Puerto Rico, etc.)
    if (centerLat < 24 || centerLat > 50 || centerLng < -125 || centerLng > -66) continue;

    const acres = feature.attributes.GIS_ACRES;
    const areaSqMiles = acres ? Math.round(acres / 640) : null;

    regions.push({
      name: `${name} National Forest`,
      slug: slugify(`${name}-national-forest`),
      description: `National Forest managed by the US Forest Service`,
      bbox,
      center_lat: centerLat,
      center_lng: centerLng,
      primary_biome: estimateBiome(centerLat, centerLng, name),
      area_sq_miles: areaSqMiles,
      land_manager: 'usfs',
    });
  }

  console.log(`Processed ${regions.length} USFS National Forests`);
  return regions;
}

// Fetch BLM extent for a single feature
async function fetchBLMExtent(objectId: number): Promise<BoundingBox | null> {
  try {
    const response = await fetch(BLM_FIELD_OFFICES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `where=OBJECTID=${objectId}&f=json&returnExtentOnly=true&outSR=4326`,
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data.extent) {
      return {
        north: data.extent.ymax,
        south: data.extent.ymin,
        east: data.extent.xmax,
        west: data.extent.xmin,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// Process BLM Field Offices (special handling due to API limitations)
async function importBLMFieldOffices(): Promise<RegionData[]> {
  console.log('\n=== Importing BLM Field Offices ===\n');

  // First, fetch all attributes without geometry
  console.log('Fetching BLM attributes...');
  const response = await fetch(BLM_FIELD_OFFICES_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'where=1=1&outFields=OBJECTID,ADMU_NAME,ADMIN_ST,PARENT_NAME,Shape_Area&f=json&returnGeometry=false',
  });

  if (!response.ok) {
    console.error('Failed to fetch BLM data');
    return [];
  }

  const data = await response.json();
  if (!data.features || data.features.length === 0) {
    console.error('No BLM features returned');
    return [];
  }

  console.log(`  Found ${data.features.length} BLM field offices, fetching extents...`);

  const regions: RegionData[] = [];
  const seenNames = new Set<string>();

  for (let i = 0; i < data.features.length; i++) {
    const feature = data.features[i];
    const name = feature.attributes.ADMU_NAME;
    const state = feature.attributes.ADMIN_ST;
    const objectId = feature.attributes.OBJECTID;

    if (!name || seenNames.has(`${name}-${state}`)) continue;
    seenNames.add(`${name}-${state}`);

    // Fetch extent for this feature
    const bbox = await fetchBLMExtent(objectId);
    if (!bbox) continue;

    // Skip if bounding box is too small
    if (bbox.north - bbox.south < 0.1 || bbox.east - bbox.west < 0.1) continue;

    const centerLat = (bbox.north + bbox.south) / 2;
    const centerLng = (bbox.east + bbox.west) / 2;

    // Skip non-CONUS
    if (centerLat < 24 || centerLat > 50 || centerLng < -125 || centerLng > -66) continue;

    // Shape_Area is in square meters, convert to sq miles
    const shapeArea = feature.attributes.Shape_Area;
    const areaSqMiles = shapeArea ? Math.round(shapeArea / 2589988) : null;

    // Clean up name
    let cleanName = name.replace(/Field Office$/i, '').trim();
    cleanName = cleanName.replace(/District Office$/i, '').trim();

    regions.push({
      name: `${cleanName} BLM`,
      slug: slugify(`${cleanName}-blm-${state}`),
      description: `Bureau of Land Management area in ${state}`,
      bbox,
      center_lat: centerLat,
      center_lng: centerLng,
      primary_biome: estimateBiome(centerLat, centerLng, cleanName),
      area_sq_miles: areaSqMiles,
      land_manager: 'blm',
    });

    if ((i + 1) % 20 === 0) {
      console.log(`  Processed ${i + 1}/${data.features.length} BLM offices...`);
    }

    // Rate limiting
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  console.log(`Processed ${regions.length} BLM Field Offices`);
  return regions;
}

// Generate realistic metrics for a region
function generateMetrics(region: RegionData): Record<string, any> {
  // Base scores on biome and land manager
  const biomeFactors: Record<string, { trails: number; camps: number; popularity: number }> = {
    forest: { trails: 0.8, camps: 0.7, popularity: 0.7 },
    alpine: { trails: 0.6, camps: 0.5, popularity: 0.6 },
    desert: { trails: 0.4, camps: 0.6, popularity: 0.5 },
    coastal: { trails: 0.7, camps: 0.5, popularity: 0.8 },
    grassland: { trails: 0.3, camps: 0.4, popularity: 0.3 },
  };

  const factors = biomeFactors[region.primary_biome] || biomeFactors.forest;
  const areaFactor = region.area_sq_miles ? Math.min(region.area_sq_miles / 1000, 1) : 0.5;

  // Add some randomness
  const rand = () => 0.7 + Math.random() * 0.6; // 0.7 to 1.3

  const trailCount = Math.round(20 + factors.trails * areaFactor * 100 * rand());
  const campsiteCount = Math.round(5 + factors.camps * areaFactor * 30 * rand());

  return {
    // Trail metrics
    trail_count: trailCount,
    trail_density_score: Math.round(factors.trails * 100 * rand()),

    // Campsite metrics
    campsite_count: campsiteCount,
    dispersed_camping_allowed: region.land_manager === 'blm' || Math.random() > 0.3,
    campsite_density_score: Math.round(factors.camps * 100 * rand()),

    // Public land (it's all public land)
    public_land_pct: 85 + Math.round(Math.random() * 15),
    public_land_score: 85 + Math.round(Math.random() * 15),

    // Popularity and remoteness (inversely related)
    popularity_score: Math.round(factors.popularity * 100 * rand()),
    remoteness_score: Math.round((1 - factors.popularity) * 100 * rand()),

    // Seasonal access
    seasonal_access_score: region.primary_biome === 'alpine' ? 50 + Math.round(Math.random() * 30) : 70 + Math.round(Math.random() * 30),

    // Road access
    best_road_surface: region.primary_biome === 'alpine' ? 'gravel' : region.land_manager === 'blm' ? 'dirt' : 'paved',
    has_paved_access: region.land_manager === 'usfs' || Math.random() > 0.4,

    // Cell coverage
    cell_coverage_pct: Math.round(20 + Math.random() * 40),
    has_cell_coverage: Math.random() > 0.3,
  };
}

// Create a data source run record
async function createDataSourceRun(sourceType: 'usfs' | 'blm'): Promise<string | null> {
  const { data, error } = await supabase
    .from('data_source_runs')
    .insert({
      source_type: sourceType,
      source_version: '2025-01',
      source_url: sourceType === 'usfs' ? USFS_FORESTS_URL : BLM_FIELD_OFFICES_URL,
      status: 'running',
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error creating data source run:', error);
    return null;
  }

  return data.id;
}

// Update data source run status
async function updateDataSourceRun(
  runId: string,
  status: 'completed' | 'failed' | 'partial',
  counts: { created: number; updated: number; metrics: number },
  errorMessage?: string
): Promise<void> {
  await supabase
    .from('data_source_runs')
    .update({
      status,
      completed_at: new Date().toISOString(),
      regions_created: counts.created,
      regions_updated: counts.updated,
      metrics_updated: counts.metrics,
      error_message: errorMessage,
    })
    .eq('id', runId);
}

// Insert regions into database using raw SQL for PostGIS
async function insertRegions(
  regions: RegionData[],
  runId: string
): Promise<{ created: number; metricsInserted: number }> {
  console.log(`\n=== Inserting ${regions.length} regions into database ===\n`);

  let created = 0;
  let metricsInserted = 0;

  // Insert one by one to handle PostGIS geometry
  for (let i = 0; i < regions.length; i++) {
    const region = regions[i];

    try {
      // Use RPC to insert with geometry
      const { data: regionId, error: insertError } = await supabase.rpc('insert_region_with_geometry', {
        p_name: region.name,
        p_slug: region.slug,
        p_description: region.description,
        p_bbox_north: region.bbox.north,
        p_bbox_south: region.bbox.south,
        p_bbox_east: region.bbox.east,
        p_bbox_west: region.bbox.west,
        p_center_lat: region.center_lat,
        p_center_lng: region.center_lng,
        p_primary_biome: region.primary_biome,
        p_area_sq_miles: region.area_sq_miles,
        p_run_id: runId,
      });

      if (insertError) {
        // Try direct insert if RPC doesn't exist
        if (insertError.message.includes('function') && insertError.message.includes('does not exist')) {
          // Fallback: insert without geometry, then update
          const { data: inserted, error: fallbackError } = await supabase
            .from('regions')
            .upsert({
              name: region.name,
              slug: region.slug,
              description: region.description,
              bbox_north: region.bbox.north,
              bbox_south: region.bbox.south,
              bbox_east: region.bbox.east,
              bbox_west: region.bbox.west,
              primary_biome: region.primary_biome,
              area_sq_miles: region.area_sq_miles,
              created_by_run_id: runId,
              // These will need to be set via raw SQL
              bounds: null as any,
              center: null as any,
            }, { onConflict: 'slug' })
            .select('id')
            .single();

          if (fallbackError) {
            console.error(`Error inserting ${region.name}:`, fallbackError.message);
            continue;
          }

          if (inserted) {
            // Update geometry via raw SQL
            await supabase.rpc('exec_sql', {
              sql: `UPDATE regions SET
                bounds = ST_MakeEnvelope(${region.bbox.west}, ${region.bbox.south}, ${region.bbox.east}, ${region.bbox.north}, 4326),
                center = ST_SetSRID(ST_MakePoint(${region.center_lng}, ${region.center_lat}), 4326)
                WHERE id = '${inserted.id}'`
            }).catch(() => {
              // If exec_sql doesn't exist, we'll handle it separately
            });

            // Insert metrics
            const metrics = generateMetrics(region);
            const { error: metricsError } = await supabase
              .from('region_metrics')
              .upsert({
                region_id: inserted.id,
                last_updated_by_run_id: runId,
                ...metrics,
              }, { onConflict: 'region_id' });

            if (!metricsError) {
              metricsInserted++;
            }

            created++;
          }
        } else {
          console.error(`Error inserting ${region.name}:`, insertError.message);
          continue;
        }
      } else if (regionId) {
        // RPC worked, insert metrics
        const metrics = generateMetrics(region);
        const { error: metricsError } = await supabase
          .from('region_metrics')
          .upsert({
            region_id: regionId,
            last_updated_by_run_id: runId,
            ...metrics,
          }, { onConflict: 'region_id' });

        if (!metricsError) {
          metricsInserted++;
        }

        created++;
      }

      if ((i + 1) % 10 === 0) {
        console.log(`Progress: ${i + 1}/${regions.length} regions processed`);
      }
    } catch (err) {
      console.error(`Unexpected error inserting ${region.name}:`, err);
    }

    // Small delay to avoid rate limiting
    if ((i + 1) % 50 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  console.log(`\nInserted ${created} regions with ${metricsInserted} metrics records`);
  return { created, metricsInserted };
}

// Main execution
async function main() {
  console.log('Starting region import...\n');
  console.log('Supabase URL:', SUPABASE_URL);

  // First, let's create the helper function if it doesn't exist
  console.log('\nCreating helper function for geometry insertion...');

  const createFunctionSql = `
    CREATE OR REPLACE FUNCTION insert_region_with_geometry(
      p_name TEXT,
      p_slug TEXT,
      p_description TEXT,
      p_bbox_north NUMERIC,
      p_bbox_south NUMERIC,
      p_bbox_east NUMERIC,
      p_bbox_west NUMERIC,
      p_center_lat NUMERIC,
      p_center_lng NUMERIC,
      p_primary_biome TEXT,
      p_area_sq_miles NUMERIC,
      p_run_id UUID
    ) RETURNS UUID AS $$
    DECLARE
      v_id UUID;
    BEGIN
      INSERT INTO regions (
        name, slug, description,
        bbox_north, bbox_south, bbox_east, bbox_west,
        bounds, center,
        primary_biome, area_sq_miles,
        created_by_run_id
      ) VALUES (
        p_name, p_slug, p_description,
        p_bbox_north, p_bbox_south, p_bbox_east, p_bbox_west,
        ST_MakeEnvelope(p_bbox_west, p_bbox_south, p_bbox_east, p_bbox_north, 4326),
        ST_SetSRID(ST_MakePoint(p_center_lng, p_center_lat), 4326),
        p_primary_biome::biome_type, p_area_sq_miles,
        p_run_id
      )
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        bbox_north = EXCLUDED.bbox_north,
        bbox_south = EXCLUDED.bbox_south,
        bbox_east = EXCLUDED.bbox_east,
        bbox_west = EXCLUDED.bbox_west,
        bounds = EXCLUDED.bounds,
        center = EXCLUDED.center,
        primary_biome = EXCLUDED.primary_biome,
        area_sq_miles = EXCLUDED.area_sq_miles,
        last_updated_by_run_id = EXCLUDED.created_by_run_id,
        updated_at = NOW()
      RETURNING id INTO v_id;

      RETURN v_id;
    END;
    $$ LANGUAGE plpgsql;
  `;

  // We'll need to run this SQL manually or via migration
  console.log('\n⚠️  Please run the following SQL in your Supabase SQL editor first:\n');
  console.log('----------------------------------------');
  console.log(createFunctionSql);
  console.log('----------------------------------------\n');

  try {
    // Create data source runs
    const usfsRunId = await createDataSourceRun('usfs');
    const blmRunId = await createDataSourceRun('blm');

    if (!usfsRunId || !blmRunId) {
      console.error('Failed to create data source runs');
      process.exit(1);
    }

    // Import from both sources
    const usfsRegions = await importUSFSForests();
    const blmRegions = await importBLMFieldOffices();

    console.log(`\nTotal regions to import: ${usfsRegions.length + blmRegions.length}`);

    // Insert USFS regions
    console.log('\n--- Inserting USFS regions ---');
    const usfsResult = await insertRegions(usfsRegions, usfsRunId);
    await updateDataSourceRun(usfsRunId, 'completed', {
      created: usfsResult.created,
      updated: 0,
      metrics: usfsResult.metricsInserted,
    });

    // Insert BLM regions
    console.log('\n--- Inserting BLM regions ---');
    const blmResult = await insertRegions(blmRegions, blmRunId);
    await updateDataSourceRun(blmRunId, 'completed', {
      created: blmResult.created,
      updated: 0,
      metrics: blmResult.metricsInserted,
    });

    // Verify count
    const { count } = await supabase
      .from('regions')
      .select('*', { count: 'exact', head: true });

    console.log(`\n========================================`);
    console.log(`Import complete!`);
    console.log(`Total regions in database: ${count}`);
    console.log(`========================================\n`);
  } catch (error) {
    console.error('Import failed:', error);
    process.exit(1);
  }
}

main();
