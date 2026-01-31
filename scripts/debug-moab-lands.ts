/**
 * Debug public lands geometry for Moab
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

async function debugMoabLands() {
  // Check specific large polygons
  console.log('Checking large polygons that should cover Moab...\n');

  // Manti-La Sal National Forest - should cover Moab area
  const { data: mantiLaSal, error } = await supabase
    .from('public_lands')
    .select('id, name, area_acres, managing_agency')
    .ilike('name', '%manti%la%sal%')
    .order('area_acres', { ascending: false });

  console.log('Manti-La Sal entries:', mantiLaSal?.length);
  mantiLaSal?.forEach(l => console.log(`  - ${l.name}: ${l.area_acres?.toFixed(0)} acres`));

  // Check if the large polygon's centroid is near Moab
  const { data: centroids } = await supabase.rpc('debug_polygon_centroids', {
    p_name_pattern: '%manti%la%sal%'
  });

  if (centroids) {
    console.log('\nCentroids:');
    centroids.forEach((c: any) => console.log(`  ${c.name}: (${c.centroid_lat?.toFixed(4)}, ${c.centroid_lng?.toFixed(4)})`));
  }

  // Also check for BLM lands in the Moab area
  console.log('\n\nBLM lands in database:');
  const { data: blmLands } = await supabase
    .from('public_lands')
    .select('id, name, area_acres, managing_agency')
    .eq('managing_agency', 'BLM')
    .order('area_acres', { ascending: false })
    .limit(10);

  blmLands?.forEach(l => console.log(`  - ${l.name}: ${l.area_acres?.toFixed(0)} acres`));

  // Check what the original client-side hook was fetching
  console.log('\n\nNote: The client-side hook fetches from USA Federal Lands API which may have');
  console.log('different/more complete data than what we imported.');
  console.log('\nThe import only grabbed 500 features per region due to API limits.');
  console.log('We may need to re-import with pagination to get complete coverage.');
}

debugMoabLands();
