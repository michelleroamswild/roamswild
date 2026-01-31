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

async function checkMoabSpots() {
  // Check spots near Moab (38.57, -109.55)
  const { data: spots, error } = await supabase.rpc('get_dispersed_spots', {
    p_lat: 38.57,
    p_lng: -109.55,
    p_radius_miles: 15,
    p_include_derived: true,
    p_limit: 200
  });
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('Spots near Moab:', spots?.length || 0);
  
  if (spots && spots.length > 0) {
    const byAgency: Record<string, number> = {};
    spots.forEach((s: any) => {
      const agency = s.managing_agency || 'NULL';
      byAgency[agency] = (byAgency[agency] || 0) + 1;
    });
    console.log('By managing agency:', byAgency);
    
    // Show first few BLM spots
    const blmSpots = spots.filter((s: any) => s.managing_agency === 'BLM');
    console.log('\nBLM spots:', blmSpots.length);
    blmSpots.slice(0, 5).forEach((s: any) => {
      console.log(`  - ${s.road_name}: lat=${s.lat}, lng=${s.lng}, score=${s.confidence_score}`);
    });
  } else {
    console.log('No spots found!');
    
    // Check what public lands exist that might cover Moab
    const { data: lands } = await supabase
      .from('public_lands')
      .select('id, name, managing_agency')
      .or('managing_agency.eq.BLM,managing_agency.eq.USFS')
      .limit(10);
    console.log('\nSample public lands:', lands?.map(l => `${l.managing_agency}: ${l.name}`));
  }
}

checkMoabSpots();
