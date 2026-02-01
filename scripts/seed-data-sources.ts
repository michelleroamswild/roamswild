/**
 * Seed data_sources table with known data sources and their licensing info
 *
 * Usage: npx tsx scripts/seed-data-sources.ts
 */

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

const supabase = createClient(envVars.VITE_SUPABASE_URL, envVars.SUPABASE_SERVICE_ROLE_KEY);

const DATA_SOURCES = [
  {
    source_key: 'osm',
    source_type: 'osm',
    display_name: 'OpenStreetMap',
    short_name: 'OSM',
    license_type: 'odbl',
    license_url: 'https://opendatacommons.org/licenses/odbl/',
    attribution_text: 'Data © OpenStreetMap contributors, licensed under the Open Data Commons Open Database License (ODbL).',
    attribution_short: '© OpenStreetMap contributors',
    attribution_html: '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>',
    source_url: 'https://overpass-api.de/',
    update_frequency: 'daily',
    is_active: true,
  },
  {
    source_key: 'pad_us_3',
    source_type: 'pad_us',
    display_name: 'Protected Areas Database of the United States (PAD-US) 3.0',
    short_name: 'PAD-US',
    version: '3.0',
    license_type: 'public_domain',
    license_url: 'https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits',
    attribution_text: 'U.S. Geological Survey (USGS) Gap Analysis Project (GAP), Protected Areas Database of the United States (PAD-US) 3.0.',
    attribution_short: 'USGS PAD-US',
    attribution_html: '<a href="https://www.usgs.gov/programs/gap-analysis-project/science/pad-us-data-download">USGS PAD-US</a>',
    source_url: 'https://www.usgs.gov/programs/gap-analysis-project/science/pad-us-data-download',
    update_frequency: 'annual',
    is_active: true,
  },
  {
    source_key: 'mvum',
    source_type: 'usfs',
    display_name: 'USDA Forest Service Motor Vehicle Use Maps',
    short_name: 'MVUM',
    license_type: 'public_domain',
    license_url: 'https://www.fs.usda.gov/about-agency/regulations-policies',
    attribution_text: 'USDA Forest Service Motor Vehicle Use Maps (MVUM). Public domain.',
    attribution_short: 'USDA Forest Service',
    attribution_html: '<a href="https://www.fs.usda.gov/visit/maps">USDA Forest Service</a>',
    source_url: 'https://data.fs.usda.gov/geodata/edw/datasets.php',
    update_frequency: 'annual',
    is_active: true,
  },
  {
    source_key: 'blm_gtrn',
    source_type: 'blm',
    display_name: 'BLM Ground Transportation Linear Features',
    short_name: 'BLM Roads',
    license_type: 'public_domain',
    license_url: 'https://www.blm.gov/about/data',
    attribution_text: 'Bureau of Land Management Ground Transportation data. Public domain.',
    attribution_short: 'BLM',
    attribution_html: '<a href="https://www.blm.gov/">Bureau of Land Management</a>',
    source_url: 'https://gbp-blm-egis.hub.arcgis.com/',
    update_frequency: 'quarterly',
    is_active: true,
  },
  {
    source_key: 'ridb',
    source_type: 'ridb',
    display_name: 'Recreation Information Database (RIDB)',
    short_name: 'Recreation.gov',
    license_type: 'public_domain',
    license_url: 'https://ridb.recreation.gov/docs',
    attribution_text: 'Recreation.gov RIDB API. Public domain.',
    attribution_short: 'Recreation.gov',
    attribution_html: '<a href="https://www.recreation.gov/">Recreation.gov</a>',
    source_url: 'https://ridb.recreation.gov/',
    update_frequency: 'daily',
    is_active: true,
  },
  {
    source_key: 'noaa',
    source_type: 'noaa',
    display_name: 'NOAA National Weather Service',
    short_name: 'NOAA',
    license_type: 'public_domain',
    license_url: 'https://www.weather.gov/disclaimer',
    attribution_text: 'NOAA National Weather Service. Public domain.',
    attribution_short: 'NOAA',
    attribution_html: '<a href="https://www.weather.gov/">NOAA</a>',
    source_url: 'https://api.weather.gov/',
    update_frequency: 'hourly',
    is_active: true,
  },
  {
    source_key: 'wilderness_net',
    source_type: 'usfs',
    display_name: 'Wilderness.net / National Wilderness Preservation System',
    short_name: 'NWPS',
    license_type: 'public_domain',
    attribution_text: 'National Wilderness Preservation System via Wilderness.net. Public domain.',
    attribution_short: 'Wilderness.net',
    attribution_html: '<a href="https://wilderness.net/">Wilderness.net</a>',
    source_url: 'https://wilderness.net/visit-wilderness/gis.php',
    update_frequency: 'annual',
    is_active: true,
  },
  {
    source_key: 'nps',
    source_type: 'nps',
    display_name: 'National Park Service',
    short_name: 'NPS',
    license_type: 'public_domain',
    license_url: 'https://www.nps.gov/aboutus/disclaimer.htm',
    attribution_text: 'National Park Service. Public domain.',
    attribution_short: 'NPS',
    attribution_html: '<a href="https://www.nps.gov/">National Park Service</a>',
    source_url: 'https://public-nps.opendata.arcgis.com/',
    update_frequency: 'quarterly',
    is_active: true,
  },
  {
    source_key: 'derived',
    source_type: 'derived',
    display_name: 'RoamSwild Derived Data',
    short_name: 'Derived',
    version: '1.0',
    license_type: 'proprietary',
    attribution_text: 'Derived by RoamSwild algorithms from public data sources.',
    attribution_short: 'RoamSwild',
    update_frequency: 'continuous',
    is_active: true,
  },
];

async function main() {
  console.log('Seeding data_sources table...\n');

  for (const source of DATA_SOURCES) {
    const { error } = await supabase
      .from('data_sources')
      .upsert(source, { onConflict: 'source_key' });

    if (error) {
      console.log(`✗ ${source.source_key}: ${error.message}`);
    } else {
      console.log(`✓ ${source.source_key}: ${source.display_name}`);
    }
  }

  // Verify
  const { data, error } = await supabase
    .from('data_sources')
    .select('source_key, display_name')
    .order('source_key');

  console.log(`\nTotal data sources: ${data?.length || 0}`);
}

main().catch(console.error);
