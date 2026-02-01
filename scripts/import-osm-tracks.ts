/**
 * Import OSM Tracks from Overpass API
 *
 * This script fetches OSM tracks (unpaved roads, 4WD roads, etc.) and imports them
 * into the road_segments table for use in the dispersed camping feature.
 *
 * Usage:
 *   npx tsx scripts/import-osm-tracks.ts --region moab
 *   npx tsx scripts/import-osm-tracks.ts --bounds "38.4,38.8,-109.8,-109.3"
 *   npx tsx scripts/import-osm-tracks.ts --region moab --derive-spots
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

// Overpass API endpoint
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// Predefined regions (same as MVUM import)
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

interface OSMElement {
  type: 'way' | 'node';
  id: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
  nodes?: number[];
}

interface OSMResponse {
  elements: OSMElement[];
}

function geometryToWKT(geometry: { lat: number; lon: number }[]): string {
  if (!geometry || geometry.length < 2) return '';
  const coords = geometry.map(pt => `${pt.lon} ${pt.lat}`).join(', ');
  return `LINESTRING(${coords})`;
}

function determineVehicleAccess(tags: Record<string, string>): string {
  // Check explicit 4WD tags
  if (tags['4wd_only'] === 'yes') return '4wd';
  if (tags['high_clearance'] === 'yes') return 'high_clearance';

  // Check tracktype (grade1 is best, grade5 is worst)
  const tracktype = tags['tracktype'];
  if (tracktype === 'grade1') return 'passenger';
  if (tracktype === 'grade2') return 'high_clearance';
  if (tracktype === 'grade3' || tracktype === 'grade4' || tracktype === 'grade5') return '4wd';

  // Check surface type
  const surface = tags['surface'];
  if (surface === 'paved' || surface === 'asphalt' || surface === 'concrete') return 'passenger';
  if (surface === 'gravel' || surface === 'fine_gravel' || surface === 'compacted') return 'high_clearance';
  if (surface === 'dirt' || surface === 'ground' || surface === 'sand' || surface === 'mud' || surface === 'rock') return '4wd';

  // Check smoothness
  const smoothness = tags['smoothness'];
  if (smoothness === 'excellent' || smoothness === 'good') return 'passenger';
  if (smoothness === 'intermediate') return 'high_clearance';
  if (smoothness === 'bad' || smoothness === 'very_bad' || smoothness === 'horrible' || smoothness === 'very_horrible') return '4wd';

  // Default for tracks
  if (tags['highway'] === 'track') return 'high_clearance';

  return 'high_clearance';
}

async function fetchOSMTracks(bounds: RegionBounds): Promise<OSMElement[]> {
  const { south, north, west, east } = bounds;

  // Overpass query for tracks and unpaved roads
  const query = `
    [out:json][timeout:60];
    (
      // Tracks (unpaved roads, forest roads, etc.)
      way["highway"="track"](${south},${west},${north},${east});

      // Unpaved roads
      way["highway"="unclassified"]["surface"~"unpaved|gravel|dirt|ground|sand|mud"](${south},${west},${north},${east});
      way["highway"="tertiary"]["surface"~"unpaved|gravel|dirt|ground|sand|mud"](${south},${west},${north},${east});
      way["highway"="secondary"]["surface"~"unpaved|gravel|dirt|ground|sand|mud"](${south},${west},${north},${east});

      // Explicit 4WD roads
      way["4wd_only"="yes"](${south},${west},${north},${east});
    );
    out geom;
  `;

  console.log(`Fetching OSM tracks for bounds: N=${north}, S=${south}, E=${east}, W=${west}`);
  console.log('This may take a moment...');

  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`
  });

  if (!response.ok) {
    throw new Error(`Overpass API error: ${response.status} ${response.statusText}`);
  }

  const data: OSMResponse = await response.json();

  // Filter to only ways with geometry
  const tracks = data.elements.filter(el => el.type === 'way' && el.geometry && el.geometry.length >= 2);

  console.log(`Got ${tracks.length} track features`);
  return tracks;
}

async function importTracks(bounds: RegionBounds): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const tracks = await fetchOSMTracks(bounds);

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  console.log(`\nImporting ${tracks.length} tracks...`);

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const tags = track.tags || {};
    const geometry = track.geometry;

    if (!geometry || geometry.length < 2) {
      skipped++;
      continue;
    }

    const wktLine = geometryToWKT(geometry);
    if (!wktLine) {
      skipped++;
      continue;
    }

    const externalId = `osm_${track.id}`;

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

    // Determine vehicle access level from tags
    const vehicleAccess = determineVehicleAccess(tags);

    // Insert using RPC function
    const { error } = await supabase.rpc('insert_road_segment_simple', {
      p_external_id: externalId,
      p_source_type: 'osm',
      p_geometry_wkt: wktLine,
      p_name: tags.name || null,
      p_surface_type: tags.surface || null,
      p_vehicle_access: vehicleAccess,
      p_seasonal_closure: null
    });

    if (error) {
      errors.push(`Track ${externalId}: ${error.message}`);
    } else {
      imported++;
    }

    // Progress update every 100 tracks
    if ((i + 1) % 100 === 0) {
      console.log(`  Progress: ${i + 1}/${tracks.length} processed, ${imported} imported`);
    }
  }

  return { imported, skipped, errors };
}

async function backfillPublicLands(bounds: RegionBounds): Promise<number> {
  console.log('Backfilling public land associations for imported roads...');

  const { data, error } = await supabase.rpc('backfill_road_public_lands', {
    p_north: bounds.north,
    p_south: bounds.south,
    p_east: bounds.east,
    p_west: bounds.west
  });

  if (error) {
    console.error(`Error backfilling public lands: ${error.message}`);
    return 0;
  }

  return data || 0;
}

async function deriveSpots(bounds: RegionBounds): Promise<number> {
  console.log('Deriving dead-end spots from road network...');

  // Try the all OSM dead ends function first
  const { data, error } = await supabase.rpc('derive_all_osm_dead_ends', {
    p_north: bounds.north,
    p_south: bounds.south,
    p_east: bounds.east,
    p_west: bounds.west,
    p_batch_size: 500
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
  let shouldBackfill = true;
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
    } else if (args[i] === '--no-backfill') {
      shouldBackfill = false;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Usage: npx tsx scripts/import-osm-tracks.ts [options]

Options:
  --region <name>     Use predefined region (moab, colorado-front-range, eastern-sierras, sedona, flagstaff, bend-oregon)
  --bounds <coords>   Custom bounds: south,north,west,east (e.g., "38.4,38.8,-109.8,-109.3")
  --derive-spots      After importing tracks, derive potential camping spots from dead-ends
  --derive-only       Skip tracks import, just derive spots for the region
  --no-backfill       Skip backfilling public land associations
  --help, -h          Show this help message

Examples:
  npx tsx scripts/import-osm-tracks.ts --region moab
  npx tsx scripts/import-osm-tracks.ts --region moab --derive-spots
  npx tsx scripts/import-osm-tracks.ts --bounds "38.4,38.8,-109.8,-109.3"
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
  console.log(`OSM Tracks Import: ${regionName}`);
  console.log(`========================================`);
  console.log(`Bounds: N=${bounds.north}, S=${bounds.south}, E=${bounds.east}, W=${bounds.west}`);
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  console.log(`========================================\n`);

  try {
    // Import tracks (unless derive-only)
    if (!deriveOnly) {
      console.log('Importing OSM tracks...');
      const result = await importTracks(bounds);

      console.log(`\nTracks import complete:`);
      console.log(`  - Imported: ${result.imported}`);
      console.log(`  - Skipped (existing or invalid): ${result.skipped}`);

      if (result.errors.length > 0) {
        console.log(`  - Errors: ${result.errors.length}`);
        result.errors.slice(0, 5).forEach(e => console.log(`    ${e}`));
        if (result.errors.length > 5) {
          console.log(`    ... and ${result.errors.length - 5} more`);
        }
      }

      // Backfill public land associations
      if (shouldBackfill && result.imported > 0) {
        console.log('\n');
        const backfilled = await backfillPublicLands(bounds);
        console.log(`Public land associations updated: ${backfilled} roads`);
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
