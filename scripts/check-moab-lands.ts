/**
 * Check public lands data for Moab region
 */
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

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
      if ((value.startsWith('"') && value.endsWith('"'))) {
        value = value.slice(1, -1);
      }
      result[match[1].trim()] = value;
    }
  }
  return result;
}

const env1 = loadEnvFile(path.resolve(process.cwd(), '.env'));
const env2 = loadEnvFile(path.resolve(process.cwd(), '.env.development'));
const envVars = { ...env1, ...env2 };

const SUPABASE_URL = envVars.VITE_SUPABASE_URL;
const SUPABASE_KEY = envVars.VITE_SUPABASE_SERVICE_ROLE_KEY || envVars.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkMoabLands() {
  console.log('Checking public lands data for Moab region...\n');

  // Moab bounds
  const bounds = { south: 38.4, north: 38.8, west: -109.8, east: -109.3 };

  // Query public lands in Moab area
  const { data, error } = await supabase
    .from('public_lands')
    .select('id, name, managing_agency, land_type, area_acres, source_type')
    .limit(50);

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  console.log(`Total public lands in database: ${data?.length || 0}\n`);

  // Group by agency
  const byAgency: Record<string, { count: number; samples: string[] }> = {};
  for (const land of data || []) {
    const agency = land.managing_agency || 'Unknown';
    if (!byAgency[agency]) {
      byAgency[agency] = { count: 0, samples: [] };
    }
    byAgency[agency].count++;
    if (byAgency[agency].samples.length < 3) {
      byAgency[agency].samples.push(`${land.name} (${land.area_acres?.toFixed(0) || '?'} acres)`);
    }
  }

  console.log('By Agency:');
  for (const [agency, info] of Object.entries(byAgency)) {
    console.log(`  ${agency}: ${info.count}`);
    info.samples.forEach(s => console.log(`    - ${s}`));
  }

  // Check if we have proper coverage by querying with PostGIS
  console.log('\n\nQuerying lands that intersect Moab bounds...');

  const { data: moabLands, error: moabError } = await supabase.rpc('get_public_lands_nearby', {
    p_lat: 38.6,
    p_lng: -109.55,
    p_radius_miles: 15,
    p_include_geometry: false
  });

  if (moabError) {
    console.error('Error querying Moab lands:', moabError.message);
    return;
  }

  console.log(`Lands near Moab (15mi radius): ${moabLands?.length || 0}`);

  // Show what we have
  if (moabLands) {
    const moabByAgency: Record<string, number> = {};
    for (const land of moabLands) {
      moabByAgency[land.managing_agency] = (moabByAgency[land.managing_agency] || 0) + 1;
    }
    console.log('  By agency:', Object.entries(moabByAgency).map(([k, v]) => `${k}: ${v}`).join(', '));
  }

  // Check total counts
  const { count: totalLands } = await supabase
    .from('public_lands')
    .select('*', { count: 'exact', head: true });

  const { count: totalSpots } = await supabase
    .from('potential_spots')
    .select('*', { count: 'exact', head: true });

  console.log(`\n\nTotal Database Counts:`);
  console.log(`  Public Lands: ${totalLands}`);
  console.log(`  Potential Spots: ${totalSpots}`);
}

checkMoabLands();
