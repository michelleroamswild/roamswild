/**
 * Verify import totals across all tables
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

async function verifyCounts() {
  console.log('Dispersed Sites Database - Import Verification\n');
  console.log('═'.repeat(60));

  // Count public lands
  const { count: publicLandsCount } = await supabase
    .from('public_lands')
    .select('*', { count: 'exact', head: true });
  console.log(`\nPublic Lands: ${publicLandsCount}`);

  // Count by agency
  const { data: landsByAgency } = await supabase.rpc('count_by_agency');
  if (landsByAgency) {
    console.log('  By agency:', landsByAgency.map((r: any) => `${r.managing_agency}: ${r.count}`).join(', '));
  }

  // Count road segments
  const { count: roadsCount } = await supabase
    .from('road_segments')
    .select('*', { count: 'exact', head: true });
  console.log(`\nRoad Segments: ${roadsCount}`);

  // Count potential spots
  const { count: spotsCount } = await supabase
    .from('potential_spots')
    .select('*', { count: 'exact', head: true });
  console.log(`\nPotential Spots: ${spotsCount}`);

  // Count by status
  const { data: spotsByStatus } = await supabase
    .from('potential_spots')
    .select('status')
    .then(({ data }) => {
      const counts: Record<string, number> = {};
      data?.forEach((r: any) => {
        counts[r.status] = (counts[r.status] || 0) + 1;
      });
      return { data: Object.entries(counts).map(([status, count]) => ({ status, count })) };
    });
  if (spotsByStatus) {
    console.log('  By status:', spotsByStatus.map((r: any) => `${r.status}: ${r.count}`).join(', '));
  }

  // Count established campgrounds
  const { count: campgroundsCount } = await supabase
    .from('established_campgrounds')
    .select('*', { count: 'exact', head: true });
  console.log(`\nEstablished Campgrounds: ${campgroundsCount}`);

  console.log('\n' + '═'.repeat(60));
  console.log('Import verification complete!');
}

verifyCounts();
