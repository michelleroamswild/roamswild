/**
 * Import MVUM Roads from USFS API
 *
 * This script runs locally because the USFS API blocks cloud infrastructure requests.
 *
 * Usage:
 *   npx tsx scripts/import-mvum-roads.ts --region moab
 *   npx tsx scripts/import-mvum-roads.ts --bounds "38.4,38.8,-109.8,-109.3"
 *   npx tsx scripts/import-mvum-roads.ts --region moab --derive-spots
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Manually parse .env files to ensure correct loading order
function loadEnvFile(filePath: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!fs.existsSync(filePath)) return result;

  const content = fs.readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      let value = match[2].trim();
      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      result[match[1].trim()] = value;
    }
  }
  return result;
}

// Load env files in order (later files override earlier)
const env1 = loadEnvFile(path.resolve(process.cwd(), '.env'));
const env2 = loadEnvFile(path.resolve(process.cwd(), '.env.local'));
const env3 = loadEnvFile(path.resolve(process.cwd(), '.env.development'));
const envVars = { ...env1, ...env2, ...env3 };

const SUPABASE_URL = envVars.VITE_SUPABASE_URL || envVars.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = envVars.VITE_SUPABASE_SERVICE_ROLE_KEY || envVars.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
  console.error('Please set SUPABASE_SERVICE_ROLE_KEY in your .env file');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// USFS MVUM Roads API
const MVUM_URL = 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_01/MapServer/1/query';

// Predefined regions
const REGIONS: Record<string, { name: string; bounds: RegionBounds }> = {
  moab: {
    name: 'Moab, Utah',
    bounds: { south: 38.4, north: 38.8, west: -109.8, east: -109.3 }
  },
  'colorado-front-range': {
    name: 'Colorado Front Range',
    bounds: { south: 39.5, north: 40.5, west: -106.0, east: -105.0 }
  },
  'eastern-sierras': {
    name: 'Eastern Sierras, California',
    bounds: { south: 37.0, north: 38.5, west: -119.5, east: -118.0 }
  },
  sedona: {
    name: 'Sedona, Arizona',
    bounds: { south: 34.5, north: 35.2, west: -112.2, east: -111.5 }
  },
  flagstaff: {
    name: 'Flagstaff, Arizona',
    bounds: { south: 34.8, north: 35.5, west: -112.0, east: -111.2 }
  },
  'bend-oregon': {
    name: 'Bend, Oregon',
    bounds: { south: 43.5, north: 44.5, west: -122.0, east: -121.0 }
  }
};

interface RegionBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface MVUMFeature {
  attributes: {
    OBJECTID: number;
    NAME?: string;
    SURFACETYPE?: string;
    HIGHCLEARANCEVEHICLE?: string;
    PASSENGERVEHICLE?: string;
    OPERATIONALMAINTLEVEL?: string;
  };
  geometry: {
    paths: number[][][];
  };
}

function arcgisToWKTLine(paths: number[][][]): string {
  if (!paths || paths.length === 0 || paths[0].length === 0) return '';
  const coords = paths[0].map(([lng, lat]) => `${lng} ${lat}`).join(', ');
  return `LINESTRING(${coords})`;
}

async function fetchMVUMRoads(bounds: RegionBounds): Promise<MVUMFeature[]> {
  const bbox = `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`;
  // Note: Field names have no underscores (SURFACETYPE not SURFACE_TYPE)
  const url = `${MVUM_URL}?where=1=1&geometry=${bbox}&geometryType=esriGeometryEnvelope&spatialRel=esriSpatialRelIntersects&inSR=4326&outFields=OBJECTID,NAME,SURFACETYPE,HIGHCLEARANCEVEHICLE,PASSENGERVEHICLE&returnGeometry=true&outSR=4326&f=json&resultRecordCount=1000`;

  console.log(`Fetching MVUM roads for bbox: ${bbox}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`MVUM API error: ${response.status}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`MVUM API error: ${data.error.message}`);
  }

  console.log(`Got ${data.features?.length || 0} road features`);
  return data.features || [];
}

async function importRoads(bounds: RegionBounds): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const features = await fetchMVUMRoads(bounds);

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < features.length; i++) {
    const feature = features[i];
    const attrs = feature.attributes;
    const geom = feature.geometry;

    if (!geom?.paths || geom.paths.length === 0) {
      skipped++;
      continue;
    }

    const wktLine = arcgisToWKTLine(geom.paths);
    if (!wktLine) {
      skipped++;
      continue;
    }

    const externalId = `mvum_${attrs.OBJECTID}`;

    // Check if already exists
    const { data: existing } = await supabase
      .from('road_segments')
      .select('id')
      .eq('external_id', externalId)
      .single();

    if (existing) {
      skipped++;
      continue;
    }

    // Determine vehicle access level
    let vehicleAccess = 'high_clearance';
    if (attrs.PASSENGERVEHICLE === 'OPEN') {
      vehicleAccess = 'passenger';
    } else if (attrs.HIGHCLEARANCEVEHICLE === 'OPEN') {
      vehicleAccess = 'high_clearance';
    } else {
      vehicleAccess = '4wd';
    }

    // Insert using RPC function
    const { error } = await supabase.rpc('insert_road_segment_simple', {
      p_external_id: externalId,
      p_source_type: 'mvum',
      p_geometry_wkt: wktLine,
      p_name: attrs.NAME || null,
      p_surface_type: attrs.SURFACETYPE || null,
      p_vehicle_access: vehicleAccess,
      p_seasonal_closure: null
    });

    if (error) {
      errors.push(`Road ${externalId}: ${error.message}`);
    } else {
      imported++;
    }

    // Progress update every 50 roads
    if ((i + 1) % 50 === 0) {
      console.log(`  Progress: ${i + 1}/${features.length} processed, ${imported} imported`);
    }
  }

  return { imported, skipped, errors };
}

async function deriveSpots(bounds: RegionBounds): Promise<number> {
  console.log('Deriving dead-end spots from road network...');

  const { data, error } = await supabase.rpc('derive_dead_end_spots', {
    p_north: bounds.north,
    p_south: bounds.south,
    p_east: bounds.east,
    p_west: bounds.west
  });

  if (error) {
    console.error(`Error deriving spots: ${error.message}`);
    return 0;
  }

  return data || 0;
}

async function main() {
  const args = process.argv.slice(2);

  let bounds: RegionBounds | null = null;
  let regionName = 'Custom Region';
  let shouldDeriveSpots = false;
  let deriveOnly = false;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--region' && args[i + 1]) {
      const regionKey = args[i + 1].toLowerCase();
      if (REGIONS[regionKey]) {
        bounds = REGIONS[regionKey].bounds;
        regionName = REGIONS[regionKey].name;
      } else {
        console.error(`Unknown region: ${regionKey}`);
        console.error('Available regions:', Object.keys(REGIONS).join(', '));
        process.exit(1);
      }
      i++;
    } else if (args[i] === '--bounds' && args[i + 1]) {
      const [south, north, west, east] = args[i + 1].split(',').map(Number);
      if ([south, north, west, east].some(isNaN)) {
        console.error('Invalid bounds format. Use: south,north,west,east');
        process.exit(1);
      }
      bounds = { south, north, west, east };
      i++;
    } else if (args[i] === '--derive-spots') {
      shouldDeriveSpots = true;
    } else if (args[i] === '--derive-only') {
      shouldDeriveSpots = true;
      deriveOnly = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Usage: npx tsx scripts/import-mvum-roads.ts [options]

Options:
  --region <name>     Use predefined region (moab, colorado-front-range, eastern-sierras, sedona, flagstaff, bend-oregon)
  --bounds <coords>   Custom bounds: south,north,west,east (e.g., "38.4,38.8,-109.8,-109.3")
  --derive-spots      After importing roads, derive potential camping spots from dead-ends
  --derive-only       Skip roads import, just derive spots for the region
  --help, -h          Show this help message

Examples:
  npx tsx scripts/import-mvum-roads.ts --region moab
  npx tsx scripts/import-mvum-roads.ts --region moab --derive-spots
  npx tsx scripts/import-mvum-roads.ts --region moab --derive-only
  npx tsx scripts/import-mvum-roads.ts --bounds "38.4,38.8,-109.8,-109.3"
      `);
      process.exit(0);
    }
  }

  if (!bounds) {
    console.error('Please specify a region or bounds');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  console.log(`\n========================================`);
  console.log(`MVUM Roads Import: ${regionName}`);
  console.log(`========================================`);
  console.log(`Bounds: N=${bounds.north}, S=${bounds.south}, E=${bounds.east}, W=${bounds.west}`);
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  console.log(`========================================\n`);

  try {
    // Import roads (unless derive-only)
    if (!deriveOnly) {
      console.log('Importing MVUM roads...');
      const result = await importRoads(bounds);

      console.log(`\nRoads import complete:`);
      console.log(`  - Imported: ${result.imported}`);
      console.log(`  - Skipped (existing or invalid): ${result.skipped}`);

      if (result.errors.length > 0) {
        console.log(`  - Errors: ${result.errors.length}`);
        result.errors.slice(0, 5).forEach(e => console.log(`    ${e}`));
        if (result.errors.length > 5) {
          console.log(`    ... and ${result.errors.length - 5} more`);
        }
      }
    }

    // Derive spots if requested
    if (shouldDeriveSpots) {
      console.log('\n');
      const spotsCreated = await deriveSpots(bounds);
      console.log(`\nSpots derived: ${spotsCreated}`);
    }

    console.log(`\n========================================`);
    console.log(`Import complete!`);
    console.log(`========================================\n`);

  } catch (error: any) {
    console.error('Import failed:', error.message);
    process.exit(1);
  }
}

main();
