#!/usr/bin/env npx tsx
/**
 * Weekly Sync Script for Dispersed Sites Database
 *
 * This script syncs all priority regions:
 * 1. Public lands via Edge Function (works from cloud)
 * 2. Campgrounds via Edge Function (works from cloud)
 * 3. MVUM roads via local API calls (USFS blocks cloud requests)
 * 4. Derives potential camping spots from road dead-ends
 *
 * Usage:
 *   npx tsx scripts/sync-all-regions.ts
 *   npx tsx scripts/sync-all-regions.ts --region moab
 *   npx tsx scripts/sync-all-regions.ts --skip-roads  # Only sync public lands + campgrounds
 *
 * Recommended: Run weekly via cron or manually after data changes
 *   0 3 * * 0 cd /path/to/project && npx tsx scripts/sync-all-regions.ts >> sync.log 2>&1
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// ============================================
// Configuration
// ============================================

interface RegionConfig {
  name: string;
  bounds: {
    south: number;
    north: number;
    west: number;
    east: number;
  };
}

const REGIONS: Record<string, RegionConfig> = {
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

const MVUM_URL = 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_01/MapServer/1/query';

// ============================================
// Environment Loading
// ============================================

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

const env1 = loadEnvFile(path.resolve(process.cwd(), '.env'));
const env2 = loadEnvFile(path.resolve(process.cwd(), '.env.local'));
const env3 = loadEnvFile(path.resolve(process.cwd(), '.env.development'));
const envVars = { ...env1, ...env2, ...env3 };

const SUPABASE_URL = envVars.VITE_SUPABASE_URL;
const SUPABASE_KEY = envVars.VITE_SUPABASE_SERVICE_ROLE_KEY || envVars.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================
// Sync Functions
// ============================================

async function syncPublicLands(region: RegionConfig): Promise<{ count: number; errors: string[] }> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/import-region`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      regionName: region.name,
      bounds: region.bounds,
      importPublicLands: true,
      importRoads: false,
      deriveSpots: false
    })
  });

  if (!response.ok) {
    return { count: 0, errors: [`HTTP ${response.status}: ${await response.text()}`] };
  }

  const data = await response.json();
  return {
    count: data.result?.publicLandsImported || 0,
    errors: data.result?.errors || []
  };
}

async function syncCampgrounds(region: RegionConfig): Promise<{ count: number; errors: string[] }> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/import-campgrounds`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      regionName: region.name,
      bounds: region.bounds
    })
  });

  if (!response.ok) {
    return { count: 0, errors: [`HTTP ${response.status}: ${await response.text()}`] };
  }

  const data = await response.json();
  return {
    count: data.campgroundsImported || 0,
    errors: data.errors || []
  };
}

interface MVUMFeature {
  attributes: {
    OBJECTID: number;
    NAME?: string;
    SURFACETYPE?: string;
    HIGHCLEARANCEVEHICLE?: string;
    PASSENGERVEHICLE?: string;
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

async function syncRoads(region: RegionConfig): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  let count = 0;

  const bounds = region.bounds;
  const bbox = `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`;
  const url = `${MVUM_URL}?where=1=1&geometry=${bbox}&geometryType=esriGeometryEnvelope&spatialRel=esriSpatialRelIntersects&inSR=4326&outFields=OBJECTID,NAME,SURFACETYPE,HIGHCLEARANCEVEHICLE,PASSENGERVEHICLE&returnGeometry=true&outSR=4326&f=json&resultRecordCount=1000`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      errors.push(`MVUM API error: ${response.status}`);
      return { count, errors };
    }

    const data = await response.json();
    if (data.error) {
      errors.push(`MVUM API error: ${data.error.message}`);
      return { count, errors };
    }

    const features: MVUMFeature[] = data.features || [];

    for (const feature of features) {
      const attrs = feature.attributes;
      const geom = feature.geometry;

      if (!geom?.paths || geom.paths.length === 0) continue;

      const wktLine = arcgisToWKTLine(geom.paths);
      if (!wktLine) continue;

      const externalId = `mvum_${attrs.OBJECTID}`;

      // Check if exists
      const { data: existing } = await supabase
        .from('road_segments')
        .select('id')
        .eq('external_id', externalId)
        .single();

      if (existing) continue;

      let vehicleAccess = 'high_clearance';
      if (attrs.PASSENGERVEHICLE === 'OPEN') {
        vehicleAccess = 'passenger';
      } else if (attrs.HIGHCLEARANCEVEHICLE === 'OPEN') {
        vehicleAccess = 'high_clearance';
      } else {
        vehicleAccess = '4wd';
      }

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
        count++;
      }
    }
  } catch (e: any) {
    errors.push(`Fetch error: ${e.message}`);
  }

  return { count, errors };
}

async function deriveSpots(region: RegionConfig): Promise<number> {
  const { data, error } = await supabase.rpc('derive_dead_end_spots', {
    p_north: region.bounds.north,
    p_south: region.bounds.south,
    p_east: region.bounds.east,
    p_west: region.bounds.west
  });

  if (error) {
    console.error(`  Error deriving spots: ${error.message}`);
    return 0;
  }

  return data || 0;
}

// ============================================
// Main
// ============================================

async function main() {
  const args = process.argv.slice(2);
  let targetRegion: string | null = null;
  let skipRoads = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--region' && args[i + 1]) {
      targetRegion = args[i + 1].toLowerCase();
      i++;
    } else if (args[i] === '--skip-roads') {
      skipRoads = true;
    } else if (args[i] === '--help') {
      console.log(`
Usage: npx tsx scripts/sync-all-regions.ts [options]

Options:
  --region <name>   Sync only a specific region
  --skip-roads      Skip MVUM roads import (useful for cloud-only sync)
  --help            Show this help

Regions: ${Object.keys(REGIONS).join(', ')}
      `);
      process.exit(0);
    }
  }

  const regionsToSync = targetRegion
    ? { [targetRegion]: REGIONS[targetRegion] }
    : REGIONS;

  if (targetRegion && !REGIONS[targetRegion]) {
    console.error(`Unknown region: ${targetRegion}`);
    console.error('Available regions:', Object.keys(REGIONS).join(', '));
    process.exit(1);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('Dispersed Sites Database - Weekly Sync');
  console.log('═'.repeat(60));
  console.log(`Started: ${new Date().toISOString()}`);
  console.log(`Supabase: ${SUPABASE_URL}`);
  console.log(`Regions: ${Object.keys(regionsToSync).join(', ')}`);
  console.log(`Skip roads: ${skipRoads}`);
  console.log('═'.repeat(60) + '\n');

  const results: Record<string, {
    publicLands: number;
    campgrounds: number;
    roads: number;
    spots: number;
    errors: string[];
  }> = {};

  for (const [key, region] of Object.entries(regionsToSync)) {
    console.log(`\n▶ Syncing: ${region.name}`);
    console.log('─'.repeat(40));

    const result = {
      publicLands: 0,
      campgrounds: 0,
      roads: 0,
      spots: 0,
      errors: [] as string[]
    };

    // Public lands
    console.log('  Syncing public lands...');
    const landsResult = await syncPublicLands(region);
    result.publicLands = landsResult.count;
    result.errors.push(...landsResult.errors);
    console.log(`    → ${landsResult.count} imported`);

    // Campgrounds
    console.log('  Syncing campgrounds...');
    const campResult = await syncCampgrounds(region);
    result.campgrounds = campResult.count;
    result.errors.push(...campResult.errors);
    console.log(`    → ${campResult.count} imported`);

    // Roads (local only)
    if (!skipRoads) {
      console.log('  Syncing MVUM roads...');
      const roadsResult = await syncRoads(region);
      result.roads = roadsResult.count;
      result.errors.push(...roadsResult.errors);
      console.log(`    → ${roadsResult.count} imported`);

      // Derive spots if new roads were imported
      if (roadsResult.count > 0) {
        console.log('  Deriving spots...');
        result.spots = await deriveSpots(region);
        console.log(`    → ${result.spots} derived`);
      }
    }

    results[key] = result;
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('Sync Complete - Summary');
  console.log('═'.repeat(60));

  let totalLands = 0, totalCamp = 0, totalRoads = 0, totalSpots = 0, totalErrors = 0;

  for (const [key, result] of Object.entries(results)) {
    console.log(`\n${REGIONS[key].name}:`);
    console.log(`  Public Lands: ${result.publicLands}, Campgrounds: ${result.campgrounds}`);
    if (!skipRoads) {
      console.log(`  Roads: ${result.roads}, Spots: ${result.spots}`);
    }
    if (result.errors.length > 0) {
      console.log(`  Errors: ${result.errors.length}`);
    }
    totalLands += result.publicLands;
    totalCamp += result.campgrounds;
    totalRoads += result.roads;
    totalSpots += result.spots;
    totalErrors += result.errors.length;
  }

  console.log('\n' + '─'.repeat(60));
  console.log('TOTALS:');
  console.log(`  Public Lands: ${totalLands}`);
  console.log(`  Campgrounds: ${totalCamp}`);
  if (!skipRoads) {
    console.log(`  Roads: ${totalRoads}`);
    console.log(`  Spots: ${totalSpots}`);
  }
  console.log(`  Errors: ${totalErrors}`);
  console.log(`\nCompleted: ${new Date().toISOString()}`);
  console.log('═'.repeat(60) + '\n');
}

main().catch(console.error);
