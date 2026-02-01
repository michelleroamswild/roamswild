/**
 * State-level Import Script
 *
 * Imports dispersed camping data for an entire state using tile-based processing.
 * Handles: public lands, roads, camp sites, private roads, and derived spots.
 *
 * Usage:
 *   npx tsx scripts/import-state.ts --state utah
 *   npx tsx scripts/import-state.ts --state utah --tile 12  # Resume from tile 12
 *   npx tsx scripts/import-state.ts --state utah --dry-run  # Preview tiles only
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';

// =============================================================================
// CONFIGURATION
// =============================================================================

interface StateBounds {
  name: string;
  north: number;
  south: number;
  east: number;
  west: number;
}

const STATES: Record<string, StateBounds> = {
  utah: {
    name: 'Utah',
    north: 42.0,
    south: 37.0,
    east: -109.05,
    west: -114.05,
  },
  arizona: {
    name: 'Arizona',
    north: 37.0,
    south: 31.33,
    east: -109.05,
    west: -114.82,
  },
  colorado: {
    name: 'Colorado',
    north: 41.0,
    south: 37.0,
    east: -102.05,
    west: -109.05,
  },
  nevada: {
    name: 'Nevada',
    north: 42.0,
    south: 35.0,
    east: -114.05,
    west: -120.0,
  },
  california: {
    name: 'California',
    north: 42.0,
    south: 32.53,
    east: -114.13,
    west: -124.41,
  },
};

// Tile size in degrees (0.5° ≈ 35 miles at Utah's latitude)
const TILE_SIZE = 0.5;

// Overpass API endpoints (rotate to avoid rate limits)
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

// Rate limiting
const DELAY_BETWEEN_TILES_MS = 5000;
const DELAY_BETWEEN_OVERPASS_MS = 2000;
const MAX_RETRIES = 3;

// =============================================================================
// ENVIRONMENT SETUP
// =============================================================================

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
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      result[match[1].trim()] = value;
    }
  }
  return result;
}

const env1 = loadEnvFile('.env');
const env2 = loadEnvFile('.env.development');
const envVars = { ...env1, ...env2 };

const SUPABASE_URL = envVars.VITE_SUPABASE_URL;
const SUPABASE_KEY = envVars.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// =============================================================================
// TYPES
// =============================================================================

interface Tile {
  index: number;
  name: string;
  north: number;
  south: number;
  east: number;
  west: number;
}

interface TileResult {
  tile: Tile;
  success: boolean;
  publicLands: number;
  roads: number;
  campSites: number;
  privateRoads: number;
  derivedSpots: number;
  errors: string[];
  durationMs: number;
}

interface ImportProgress {
  state: string;
  startedAt: string;
  lastTileCompleted: number;
  tilesCompleted: Tile[];
  tilesFailed: Tile[];
}

// =============================================================================
// TILE GENERATION
// =============================================================================

function generateTiles(bounds: StateBounds): Tile[] {
  const tiles: Tile[] = [];
  let index = 0;

  for (let lat = bounds.north; lat > bounds.south; lat -= TILE_SIZE) {
    for (let lng = bounds.west; lng < bounds.east; lng += TILE_SIZE) {
      const tileSouth = Math.max(lat - TILE_SIZE, bounds.south);
      const tileEast = Math.min(lng + TILE_SIZE, bounds.east);

      tiles.push({
        index: index++,
        name: `${bounds.name}_${lat.toFixed(1)}_${lng.toFixed(1)}`,
        north: lat,
        south: tileSouth,
        east: tileEast,
        west: lng,
      });
    }
  }

  return tiles;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;

      if (response.status === 429 || response.status === 503) {
        console.log(`  Rate limited, waiting ${(i + 1) * 10}s...`);
        await sleep((i + 1) * 10000);
        continue;
      }

      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error: any) {
      if (i === retries - 1) throw error;
      console.log(`  Retry ${i + 1}/${retries}: ${error.message}`);
      await sleep(2000 * (i + 1));
    }
  }
  throw new Error('Max retries exceeded');
}

let overpassEndpointIndex = 0;
function getOverpassEndpoint(): string {
  const endpoint = OVERPASS_ENDPOINTS[overpassEndpointIndex];
  overpassEndpointIndex = (overpassEndpointIndex + 1) % OVERPASS_ENDPOINTS.length;
  return endpoint;
}

// =============================================================================
// DATA SOURCE RUN TRACKING
// =============================================================================

async function createDataSourceRun(
  tile: Tile,
  sourceType: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('data_source_runs')
    .insert({
      source_type: sourceType,
      status: 'running',
      started_at: new Date().toISOString(),
      geographic_bounds: `SRID=4326;POLYGON((${tile.west} ${tile.south}, ${tile.east} ${tile.south}, ${tile.east} ${tile.north}, ${tile.west} ${tile.north}, ${tile.west} ${tile.south}))`,
    })
    .select('id')
    .single();

  if (error) {
    console.error('  Failed to create data source run:', error.message);
    return null;
  }
  return data.id;
}

async function completeDataSourceRun(
  runId: string,
  status: 'completed' | 'failed' | 'partial',
  counts: { created?: number; updated?: number },
  errorMessage?: string
): Promise<void> {
  await supabase
    .from('data_source_runs')
    .update({
      status,
      completed_at: new Date().toISOString(),
      regions_created: counts.created || 0,
      regions_updated: counts.updated || 0,
      error_message: errorMessage,
    })
    .eq('id', runId);
}

// =============================================================================
// IMPORT FUNCTIONS
// =============================================================================

async function importPublicLandsForTile(tile: Tile): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];

  // Check if we already have public lands in this tile
  const { count: existingCount } = await supabase
    .from('public_lands')
    .select('*', { count: 'exact', head: true })
    .gte('centroid', `SRID=4326;POINT(${tile.west} ${tile.south})`)
    .lte('centroid', `SRID=4326;POINT(${tile.east} ${tile.north})`);

  if (existingCount && existingCount > 0) {
    console.log(`  Public lands: ${existingCount} already exist, skipping`);
    return { count: existingCount, errors };
  }

  // For now, we rely on PAD-US being pre-imported
  // TODO: Add PAD-US import from GeoJSON/Shapefile
  console.log('  Public lands: Using existing data (PAD-US import not yet implemented)');

  return { count: 0, errors };
}

async function importOSMRoadsForTile(tile: Tile): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  let count = 0;

  console.log('  Fetching OSM roads...');

  const query = `
    [out:json][timeout:120];
    (
      way["highway"="track"](${tile.south},${tile.west},${tile.north},${tile.east});
      way["highway"="path"]["motor_vehicle"!="no"](${tile.south},${tile.west},${tile.north},${tile.east});
      way["highway"="unclassified"](${tile.south},${tile.west},${tile.north},${tile.east});
      way["highway"="service"]["service"!="parking_aisle"](${tile.south},${tile.west},${tile.north},${tile.east});
    );
    out geom;
  `;

  try {
    const endpoint = getOverpassEndpoint();
    const response = await fetchWithRetry(endpoint, {
      method: 'POST',
      body: 'data=' + encodeURIComponent(query),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const data = await response.json();
    const elements = data.elements || [];
    console.log(`  Got ${elements.length} road features from OSM`);

    if (elements.length === 0) {
      return { count: 0, errors };
    }

    // Process in batches
    const batchSize = 100;
    for (let i = 0; i < elements.length; i += batchSize) {
      const batch = elements.slice(i, i + batchSize);
      const roads = batch
        .filter((el: any) => el.type === 'way' && el.geometry && el.geometry.length >= 2)
        .map((el: any) => {
          const coords = el.geometry.map((n: any) => `${n.lon} ${n.lat}`).join(',');
          const tags = el.tags || {};

          // Determine vehicle access
          let vehicleAccess = 'high_clearance';
          if (tags.tracktype === 'grade1' || tags.surface === 'paved' || tags.surface === 'asphalt') {
            vehicleAccess = 'passenger';
          } else if (tags.tracktype === 'grade5' || tags['4wd_only'] === 'yes') {
            vehicleAccess = '4wd';
          }

          return {
            external_id: `osm_way_${el.id}`,
            source_type: 'osm',
            source_record_id: `osm:way:${el.id}`,
            geometry: `SRID=4326;LINESTRING(${coords})`,
            name: tags.name || tags.ref || null,
            route_number: tags.ref || null,
            surface_type: tags.surface || null,
            vehicle_access: vehicleAccess,
            highway: tags.highway || null,
            tracktype: tags.tracktype || null,
            access: tags.access || null,
            four_wd_only: tags['4wd_only'] === 'yes',
          };
        });

      if (roads.length > 0) {
        const { error } = await supabase.from('road_segments').upsert(roads, {
          onConflict: 'external_id',
          ignoreDuplicates: true,
        });

        if (error) {
          errors.push(`Road batch error: ${error.message}`);
        } else {
          count += roads.length;
        }
      }
    }

    console.log(`  Imported ${count} roads`);

  } catch (error: any) {
    errors.push(`OSM roads fetch error: ${error.message}`);
    console.error(`  Error: ${error.message}`);
  }

  await sleep(DELAY_BETWEEN_OVERPASS_MS);
  return { count, errors };
}

async function importOSMCampSitesForTile(tile: Tile): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  let count = 0;

  console.log('  Fetching OSM camp sites...');

  const query = `
    [out:json][timeout:60];
    (
      node["tourism"="camp_site"](${tile.south},${tile.west},${tile.north},${tile.east});
      way["tourism"="camp_site"](${tile.south},${tile.west},${tile.north},${tile.east});
      node["tourism"="camp_pitch"](${tile.south},${tile.west},${tile.north},${tile.east});
    );
    out center;
  `;

  try {
    const endpoint = getOverpassEndpoint();
    const response = await fetchWithRetry(endpoint, {
      method: 'POST',
      body: 'data=' + encodeURIComponent(query),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const data = await response.json();
    const elements = data.elements || [];
    console.log(`  Got ${elements.length} camp site features from OSM`);

    for (const el of elements) {
      const lat = el.lat || el.center?.lat;
      const lng = el.lon || el.center?.lon;
      if (!lat || !lng) continue;

      const tags = el.tags || {};
      const name = tags.name || 'Camp Site';

      // Check if it's an established campground
      const isEstablished = !!(
        tags.fee === 'yes' ||
        tags.reservation ||
        tags.operator ||
        tags.capacity
      );

      const { error } = await supabase.from('potential_spots').upsert({
        osm_camp_site_id: el.id,
        source_record_id: `osm:${el.type}:${el.id}`,
        location: `SRID=4326;POINT(${lng} ${lat})`,
        spot_type: 'camp_site',
        status: 'derived',
        name: name,
        osm_tags: tags,
        source_type: 'osm',
        confidence_score: isEstablished ? 30 : 40,
        is_established_campground: isEstablished,
        derivation_algorithm: 'osm_camp_site_import',
        derivation_version: 1,
        derived_at: new Date().toISOString(),
      }, {
        onConflict: 'osm_camp_site_id',
      });

      if (error) {
        errors.push(`Camp site insert error: ${error.message}`);
      } else {
        count++;
      }
    }

    console.log(`  Imported ${count} camp sites`);

  } catch (error: any) {
    errors.push(`OSM camp sites fetch error: ${error.message}`);
    console.error(`  Error: ${error.message}`);
  }

  await sleep(DELAY_BETWEEN_OVERPASS_MS);
  return { count, errors };
}

async function importPrivateRoadsForTile(tile: Tile): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  let count = 0;

  console.log('  Fetching private roads...');

  const query = `
    [out:json][timeout:60];
    (
      way["highway"]["access"="private"](${tile.south},${tile.west},${tile.north},${tile.east});
      way["highway"]["access"="no"](${tile.south},${tile.west},${tile.north},${tile.east});
      way["highway"]["access"="customers"](${tile.south},${tile.west},${tile.north},${tile.east});
    );
    out geom;
  `;

  try {
    const endpoint = getOverpassEndpoint();
    const response = await fetchWithRetry(endpoint, {
      method: 'POST',
      body: 'data=' + encodeURIComponent(query),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const data = await response.json();
    const elements = data.elements || [];
    console.log(`  Got ${elements.length} private road features from OSM`);

    // Collect points
    const points: Array<{ lat: number; lng: number; osm_id: number; access: string }> = [];
    for (const el of elements) {
      if (el.type !== 'way' || !el.geometry) continue;
      const access = el.tags?.access || 'private';
      for (const node of el.geometry) {
        points.push({ lat: node.lat, lng: node.lon, osm_id: el.id, access });
      }
    }

    if (points.length > 0) {
      // Use RPC if available, otherwise direct insert
      const { data: rpcResult, error: rpcError } = await supabase.rpc('import_private_road_points', {
        p_north: tile.north,
        p_south: tile.south,
        p_east: tile.east,
        p_west: tile.west,
        p_points: points,
      });

      if (rpcError) {
        // Fallback to direct insert
        const batchSize = 500;
        for (let i = 0; i < points.length; i += batchSize) {
          const batch = points.slice(i, i + batchSize).map(p => ({
            location: `SRID=4326;POINT(${p.lng} ${p.lat})`,
            osm_id: p.osm_id,
            access_type: p.access,
            source_record_id: `osm:way:${p.osm_id}`,
          }));

          const { error } = await supabase.from('private_road_points').insert(batch);
          if (error && !error.message.includes('duplicate')) {
            errors.push(`Private roads batch error: ${error.message}`);
          } else {
            count += batch.length;
          }
        }
      } else {
        count = points.length;
      }
    }

    console.log(`  Imported ${count} private road points`);

  } catch (error: any) {
    errors.push(`Private roads fetch error: ${error.message}`);
    console.error(`  Error: ${error.message}`);
  }

  await sleep(DELAY_BETWEEN_OVERPASS_MS);
  return { count, errors };
}

async function deriveSpotsForTile(tile: Tile): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  let count = 0;

  console.log('  Deriving spots from road dead-ends...');

  // First, link roads to public lands if not already done
  try {
    await supabase.rpc('backfill_road_public_land_ids', {
      p_north: tile.north,
      p_south: tile.south,
      p_east: tile.east,
      p_west: tile.west,
    });
  } catch (e) {
    // Function may not exist, continue anyway
  }

  // Split tile into sub-tiles if needed (to avoid timeout)
  const subTileSize = TILE_SIZE / 2;
  const subTiles: Tile[] = [];

  for (let lat = tile.north; lat > tile.south; lat -= subTileSize) {
    for (let lng = tile.west; lng < tile.east; lng += subTileSize) {
      subTiles.push({
        index: subTiles.length,
        name: `${tile.name}_sub${subTiles.length}`,
        north: lat,
        south: Math.max(lat - subTileSize, tile.south),
        east: Math.min(lng + subTileSize, tile.east),
        west: lng,
      });
    }
  }

  for (const subTile of subTiles) {
    try {
      const { data, error } = await supabase.rpc('derive_spots_from_linked_roads', {
        p_north: subTile.north,
        p_south: subTile.south,
        p_east: subTile.east,
        p_west: subTile.west,
      });

      if (error) {
        if (error.message.includes('timeout')) {
          errors.push(`Derive timeout for sub-tile ${subTile.name}`);
        } else {
          errors.push(`Derive error: ${error.message}`);
        }
      } else {
        count += data || 0;
      }
    } catch (error: any) {
      errors.push(`Derive exception: ${error.message}`);
    }
  }

  console.log(`  Derived ${count} spots`);
  return { count, errors };
}

// =============================================================================
// MAIN TILE PROCESSOR
// =============================================================================

async function processTile(tile: Tile): Promise<TileResult> {
  const startTime = Date.now();
  const errors: string[] = [];

  console.log(`\n${'='.repeat(60)}`);
  console.log(`TILE ${tile.index}: ${tile.name}`);
  console.log(`Bounds: N=${tile.north}, S=${tile.south}, E=${tile.east}, W=${tile.west}`);
  console.log('='.repeat(60));

  // Create data source run
  const runId = await createDataSourceRun(tile, 'derived');

  // Import each data type
  const publicLands = await importPublicLandsForTile(tile);
  errors.push(...publicLands.errors);

  const roads = await importOSMRoadsForTile(tile);
  errors.push(...roads.errors);

  const campSites = await importOSMCampSitesForTile(tile);
  errors.push(...campSites.errors);

  const privateRoads = await importPrivateRoadsForTile(tile);
  errors.push(...privateRoads.errors);

  const derivedSpots = await deriveSpotsForTile(tile);
  errors.push(...derivedSpots.errors);

  // Complete data source run
  if (runId) {
    const status = errors.length === 0 ? 'completed' : 'partial';
    await completeDataSourceRun(runId, status, {
      created: roads.count + campSites.count + derivedSpots.count,
    });
  }

  const durationMs = Date.now() - startTime;
  const success = errors.length === 0;

  console.log(`\nTile ${tile.index} complete in ${(durationMs / 1000).toFixed(1)}s`);
  console.log(`  Roads: ${roads.count}, Camp sites: ${campSites.count}, Derived: ${derivedSpots.count}`);
  if (errors.length > 0) {
    console.log(`  Errors: ${errors.length}`);
    errors.forEach(e => console.log(`    - ${e}`));
  }

  return {
    tile,
    success,
    publicLands: publicLands.count,
    roads: roads.count,
    campSites: campSites.count,
    privateRoads: privateRoads.count,
    derivedSpots: derivedSpots.count,
    errors,
    durationMs,
  };
}

// =============================================================================
// PROGRESS TRACKING
// =============================================================================

function loadProgress(state: string): ImportProgress | null {
  const progressFile = `scripts/.import-progress-${state}.json`;
  if (fs.existsSync(progressFile)) {
    return JSON.parse(fs.readFileSync(progressFile, 'utf-8'));
  }
  return null;
}

function saveProgress(progress: ImportProgress): void {
  const progressFile = `scripts/.import-progress-${progress.state}.json`;
  fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
}

// =============================================================================
// CLI
// =============================================================================

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  let stateName = 'utah';
  let startTile = 0;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--state' && args[i + 1]) {
      stateName = args[i + 1].toLowerCase();
      i++;
    } else if (args[i] === '--tile' && args[i + 1]) {
      startTile = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    } else if (args[i] === '--help') {
      console.log(`
Usage: npx tsx scripts/import-state.ts [options]

Options:
  --state <name>   State to import (utah, arizona, colorado, nevada, california)
  --tile <n>       Start from tile N (for resuming)
  --dry-run        Preview tiles without importing
  --help           Show this help

Examples:
  npx tsx scripts/import-state.ts --state utah
  npx tsx scripts/import-state.ts --state utah --tile 12
  npx tsx scripts/import-state.ts --state utah --dry-run
      `);
      process.exit(0);
    }
  }

  const stateBounds = STATES[stateName];
  if (!stateBounds) {
    console.error(`Unknown state: ${stateName}`);
    console.error(`Available states: ${Object.keys(STATES).join(', ')}`);
    process.exit(1);
  }

  // Generate tiles
  const tiles = generateTiles(stateBounds);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`STATE IMPORT: ${stateBounds.name}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Total tiles: ${tiles.length} (${TILE_SIZE}° × ${TILE_SIZE}°)`);
  console.log(`Bounds: N=${stateBounds.north}, S=${stateBounds.south}, E=${stateBounds.east}, W=${stateBounds.west}`);

  if (dryRun) {
    console.log('\nDRY RUN - Tiles to process:');
    tiles.forEach((tile, i) => {
      console.log(`  ${i}: ${tile.name} (${tile.north}, ${tile.west}) to (${tile.south}, ${tile.east})`);
    });
    process.exit(0);
  }

  // Check for existing progress
  const existingProgress = loadProgress(stateName);
  if (existingProgress && startTile === 0) {
    const lastCompleted = existingProgress.lastTileCompleted;
    console.log(`\nFound existing progress: ${lastCompleted + 1}/${tiles.length} tiles completed`);
    console.log(`Resuming from tile ${lastCompleted + 1}...`);
    startTile = lastCompleted + 1;
  }

  // Initialize progress
  const progress: ImportProgress = existingProgress || {
    state: stateName,
    startedAt: new Date().toISOString(),
    lastTileCompleted: -1,
    tilesCompleted: [],
    tilesFailed: [],
  };

  // Process tiles
  const results: TileResult[] = [];

  for (let i = startTile; i < tiles.length; i++) {
    const tile = tiles[i];

    try {
      const result = await processTile(tile);
      results.push(result);

      if (result.success) {
        progress.tilesCompleted.push(tile);
      } else {
        progress.tilesFailed.push(tile);
      }
      progress.lastTileCompleted = i;
      saveProgress(progress);

      // Rate limit between tiles
      if (i < tiles.length - 1) {
        console.log(`\nWaiting ${DELAY_BETWEEN_TILES_MS / 1000}s before next tile...`);
        await sleep(DELAY_BETWEEN_TILES_MS);
      }

    } catch (error: any) {
      console.error(`\nFATAL ERROR on tile ${i}: ${error.message}`);
      progress.tilesFailed.push(tile);
      progress.lastTileCompleted = i;
      saveProgress(progress);

      // Continue to next tile
      console.log('Continuing to next tile...');
    }
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('IMPORT COMPLETE');
  console.log('='.repeat(60));

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const totalRoads = results.reduce((sum, r) => sum + r.roads, 0);
  const totalCamps = results.reduce((sum, r) => sum + r.campSites, 0);
  const totalDerived = results.reduce((sum, r) => sum + r.derivedSpots, 0);
  const totalTime = results.reduce((sum, r) => sum + r.durationMs, 0);

  console.log(`Tiles processed: ${results.length}/${tiles.length}`);
  console.log(`  Successful: ${successful}`);
  console.log(`  Failed: ${failed}`);
  console.log(`\nData imported:`);
  console.log(`  Roads: ${totalRoads.toLocaleString()}`);
  console.log(`  Camp sites: ${totalCamps.toLocaleString()}`);
  console.log(`  Derived spots: ${totalDerived.toLocaleString()}`);
  console.log(`\nTotal time: ${(totalTime / 1000 / 60).toFixed(1)} minutes`);

  if (failed > 0) {
    console.log(`\nFailed tiles:`);
    progress.tilesFailed.forEach(t => console.log(`  - ${t.name}`));
  }

  // Clean up progress file if complete
  if (successful === tiles.length) {
    const progressFile = `scripts/.import-progress-${stateName}.json`;
    if (fs.existsSync(progressFile)) {
      fs.unlinkSync(progressFile);
    }
    console.log('\nImport fully complete! Progress file cleaned up.');
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
