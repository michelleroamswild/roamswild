/**
 * Re-derive dead-end spots for Moab area after fixing public lands
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

const supabase = createClient(envVars.VITE_SUPABASE_URL, envVars.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function rederiveMoabSpots() {
  // Moab bounds (roughly 15 mile radius from center)
  const north = 38.8;
  const south = 38.3;
  const east = -109.2;
  const west = -109.9;
  
  console.log('Step 1: Update road segments to re-match with public lands...');
  
  // First, update road segments to find their public_land_id
  // This re-runs the spatial join with the (hopefully) better BLM polygons
  const { error: updateError } = await supabase.rpc('update_road_public_lands', {
    p_north: north,
    p_south: south,
    p_east: east,
    p_west: west
  });
  
  if (updateError) {
    console.log('Note: update_road_public_lands function may not exist yet');
    console.log('We need to create it first');
    
    // Let's check what roads exist in this area and their current public_land_id
    const { data: roads } = await supabase
      .from('road_segments')
      .select('id, name, source_type, public_land_id')
      .gte('start_point', `POINT(${west} ${south})`)
      .limit(20);
      
    console.log('\nSample roads in Moab area:');
    console.log('Roads with public_land_id:', roads?.filter(r => r.public_land_id).length);
    console.log('Roads without public_land_id:', roads?.filter(r => !r.public_land_id).length);
  }
  
  console.log('\nStep 2: Re-derive dead-end spots...');
  const { data: spotCount, error: deriveError } = await supabase.rpc('derive_dead_end_spots', {
    p_north: north,
    p_south: south,
    p_east: east,
    p_west: west
  });
  
  if (deriveError) {
    console.error('Error deriving spots:', deriveError);
    return;
  }
  
  console.log(`Created ${spotCount} new spots`);
  
  // Check the result
  const { data: spots } = await supabase.rpc('get_dispersed_spots', {
    p_lat: 38.57,
    p_lng: -109.55,
    p_radius_miles: 15,
    p_include_derived: true,
    p_limit: 200
  });
  
  const byAgency: Record<string, number> = {};
  spots?.forEach((s: any) => {
    const agency = s.managing_agency || 'NULL';
    byAgency[agency] = (byAgency[agency] || 0) + 1;
  });
  console.log('\nSpots by agency after re-derivation:', byAgency);
}

rederiveMoabSpots().catch(console.error);
