import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

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

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const bounds = { north: 38.8, south: 38.4, east: -109.3, west: -109.8 };

async function fetchPrivateRoads() {
  console.log('Fetching private roads from Overpass...');

  const query = `
    [out:json][timeout:60];
    (
      way["highway"]["access"="private"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
      way["highway"]["access"="no"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
      way["highway"]["access"="customers"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
    );
    out geom;
  `;

  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    body: 'data=' + encodeURIComponent(query),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  if (!response.ok) throw new Error('Overpass error: ' + response.status);

  const data = await response.json();
  console.log('Got ' + (data.elements?.length || 0) + ' private road features');

  // Collect points
  const points: Array<{ lat: number; lng: number; osm_id: number; access: string }> = [];
  for (const element of data.elements || []) {
    if (element.type !== 'way' || !element.geometry) continue;
    const access = element.tags?.access || 'private';
    for (const node of element.geometry) {
      points.push({ lat: node.lat, lng: node.lon, osm_id: element.id, access });
    }
  }

  console.log('Collected ' + points.length + ' private road points');
  return points;
}

async function importPrivateRoadPoints(points: any[]) {
  console.log('Importing private road points to database...');

  // Insert in batches
  const batchSize = 500;
  let imported = 0;

  for (let i = 0; i < points.length; i += batchSize) {
    const batch = points.slice(i, i + batchSize);
    const { data, error } = await supabase.rpc('import_private_road_points', {
      p_north: bounds.north,
      p_south: bounds.south,
      p_east: bounds.east,
      p_west: bounds.west,
      p_points: batch,
    });

    if (error) {
      console.error('Batch error:', error.message);
    } else {
      imported += batch.length;
      console.log('  Imported ' + imported + '/' + points.length + ' points');
    }
  }

  return imported;
}

async function deriveSpots() {
  console.log('Deriving spots from linked roads...');

  const { data, error } = await supabase.rpc('derive_spots_from_linked_roads', {
    p_north: bounds.north,
    p_south: bounds.south,
    p_east: bounds.east,
    p_west: bounds.west,
  });

  if (error) {
    console.error('Derive error:', error.message);
    return 0;
  }

  console.log('Derived ' + data + ' spots');
  return data;
}

async function main() {
  console.log('Moab Region Import');
  console.log('==================\n');

  // 1. Fetch and import private roads
  const privateRoadPoints = await fetchPrivateRoads();
  const importedPoints = await importPrivateRoadPoints(privateRoadPoints);
  console.log('\nImported ' + importedPoints + ' private road points\n');

  // 2. Derive spots (now with private road filtering)
  const derivedSpots = await deriveSpots();
  console.log('\nDerived ' + derivedSpots + ' new spots');

  console.log('\nDone!');
}

main().catch(console.error);
