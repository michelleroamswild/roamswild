/**
 * Test the get_dispersed_spots query function
 */
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Load env files
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

async function testSpotsQuery() {
  console.log('Testing get_dispersed_spots query...\n');

  // Test near Moab (center of our imported area)
  const lat = 38.6;
  const lng = -109.55;
  const radius = 15;

  console.log(`Query: lat=${lat}, lng=${lng}, radius=${radius}mi, include_derived=true`);

  const start = Date.now();

  const { data, error } = await supabase.rpc('get_dispersed_spots', {
    p_lat: lat,
    p_lng: lng,
    p_radius_miles: radius,
    p_include_derived: true,
    p_limit: 50
  });

  const elapsed = Date.now() - start;

  if (error) {
    console.log('Error:', error.message);
    return;
  }

  console.log(`\nQuery time: ${elapsed}ms`);
  console.log(`Spots returned: ${data?.length || 0}`);

  if (data && data.length > 0) {
    console.log('\nSample spots:');
    console.log('─'.repeat(80));

    data.slice(0, 10).forEach((spot: any, i: number) => {
      console.log(`${i + 1}. ${spot.road_name || 'Unnamed'}`);
      console.log(`   Agency: ${spot.managing_agency || 'Unknown'} | Score: ${spot.confidence_score} | Distance: ${spot.distance_miles}mi`);
      console.log(`   Type: ${spot.spot_type} | Status: ${spot.status} | Access: ${spot.vehicle_access}`);
      if (spot.derivation_reasons) {
        console.log(`   Reasons: ${spot.derivation_reasons.join(', ')}`);
      }
      console.log('');
    });

    // Summary stats
    const byAgency: Record<string, number> = {};
    const byAccess: Record<string, number> = {};
    for (const spot of data) {
      byAgency[spot.managing_agency || 'Unknown'] = (byAgency[spot.managing_agency || 'Unknown'] || 0) + 1;
      byAccess[spot.vehicle_access || 'Unknown'] = (byAccess[spot.vehicle_access || 'Unknown'] || 0) + 1;
    }

    console.log('─'.repeat(80));
    console.log('Summary:');
    console.log('  By Agency:', Object.entries(byAgency).map(([k, v]) => `${k}: ${v}`).join(', '));
    console.log('  By Access:', Object.entries(byAccess).map(([k, v]) => `${k}: ${v}`).join(', '));
  }
}

testSpotsQuery();
