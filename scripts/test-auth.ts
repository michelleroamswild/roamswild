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

async function main() {
  // Test simple query
  const { data, error } = await supabase
    .from('potential_spots')
    .select('id')
    .limit(1);
  
  if (error) {
    console.log('Database query error:', error.message);
  } else {
    console.log('Database query success, got:', data?.length, 'rows');
  }
  
  // Try invoking function directly
  console.log('\nTrying function invoke...');
  const { data: fnData, error: fnError } = await supabase.functions.invoke('import-region', {
    body: {
      regionName: 'Moab',
      bounds: { north: 38.8, south: 38.4, east: -109.3, west: -109.8 },
      importPublicLands: false,
      importRoads: false,
      deriveSpots: true
    }
  });
  
  if (fnError) {
    console.log('Function error:', fnError.message);
  } else {
    console.log('Function result:', JSON.stringify(fnData, null, 2));
  }
}

main().catch(console.error);
