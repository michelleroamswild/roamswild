#!/usr/bin/env npx tsx
/**
 * Script to run BLM road backfill and spot derivation on the cloud database
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://ioseedbzvogywztbtgjd.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY is required");
  console.log("Run with: SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/run-blm-import.ts");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  db: {
    schema: 'public',
  },
  global: {
    headers: {
      'x-client-info': 'run-blm-import',
    },
  },
});

const MOAB_BOUNDS = {
  north: 38.8,
  south: 38.4,
  east: -109.3,
  west: -109.8,
};

async function main() {
  console.log("Running BLM road backfill and spot derivation for Moab...\n");

  // First, check how many roads exist
  const { count: roadCount } = await supabase
    .from("road_segments")
    .select("*", { count: "exact", head: true });
  console.log(`Total road segments in database: ${roadCount}`);

  // Check OSM roads specifically
  const { count: osmCount } = await supabase
    .from("road_segments")
    .select("*", { count: "exact", head: true })
    .eq("source_type", "osm");
  console.log(`OSM road segments: ${osmCount}`);

  // Check how many have public_land_id
  const { count: linkedCount } = await supabase
    .from("road_segments")
    .select("*", { count: "exact", head: true })
    .not("public_land_id", "is", null);
  console.log(`Roads with public_land_id: ${linkedCount}`);

  // Check public lands
  const { count: landsCount } = await supabase
    .from("public_lands")
    .select("*", { count: "exact", head: true });
  console.log(`Total public lands: ${landsCount}`);

  const { count: blmCount } = await supabase
    .from("public_lands")
    .select("*", { count: "exact", head: true })
    .eq("managing_agency", "BLM");
  console.log(`BLM lands: ${blmCount}\n`);

  // Run backfill
  console.log("Step 1: Backfilling road public_land_ids...");
  const { data: backfillResult, error: backfillError } = await supabase.rpc(
    "backfill_road_public_lands",
    {
      p_north: MOAB_BOUNDS.north,
      p_south: MOAB_BOUNDS.south,
      p_east: MOAB_BOUNDS.east,
      p_west: MOAB_BOUNDS.west,
    }
  );

  if (backfillError) {
    console.error("Backfill error:", backfillError);
  } else {
    console.log(`Backfilled ${backfillResult} roads with public_land_id`);
  }

  // Check linked roads again
  const { count: newLinkedCount } = await supabase
    .from("road_segments")
    .select("*", { count: "exact", head: true })
    .not("public_land_id", "is", null);
  console.log(`Roads with public_land_id after backfill: ${newLinkedCount}\n`);

  // Run improved spot derivation that checks ALL road dead-ends against public land polygons
  console.log("Step 2: Deriving spots from ALL roads (checking polygon intersection)...");
  let totalDerived = 0;
  let batchNum = 0;
  const BATCH_SIZE = 100;
  const MAX_BATCHES = 100; // Allow more batches for comprehensive coverage

  while (batchNum < MAX_BATCHES) {
    batchNum++;
    const { data: batchResult, error: batchError } = await supabase.rpc(
      "derive_all_dead_ends_batch",
      {
        p_north: MOAB_BOUNDS.north,
        p_south: MOAB_BOUNDS.south,
        p_east: MOAB_BOUNDS.east,
        p_west: MOAB_BOUNDS.west,
        p_batch_size: BATCH_SIZE,
      }
    );

    if (batchError) {
      console.error(`Batch ${batchNum} error:`, batchError);
      break;
    }

    const spotsInBatch = batchResult || 0;
    totalDerived += spotsInBatch;
    process.stdout.write(`\rBatch ${batchNum}: ${spotsInBatch} spots (total: ${totalDerived})`);

    // If we got fewer spots than batch size, we're done
    if (spotsInBatch < BATCH_SIZE) {
      break;
    }
  }

  console.log(`\nDerived ${totalDerived} spots total across ${batchNum} batches`);
  if (batchNum >= MAX_BATCHES) {
    console.log("Warning: Hit max batch limit, there may be more spots to derive");
  }

  // Check total spots
  const { count: totalSpots } = await supabase
    .from("potential_spots")
    .select("*", { count: "exact", head: true });
  console.log(`\nTotal potential spots: ${totalSpots}`);

  const { count: blmSpots } = await supabase
    .from("potential_spots")
    .select("*", { count: "exact", head: true })
    .eq("managing_agency", "BLM");
  console.log(`BLM spots: ${blmSpots}`);

  console.log("\nDone!");
}

main().catch(console.error);
