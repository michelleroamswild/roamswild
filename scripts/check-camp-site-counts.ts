import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

// Load both .env and .env.development
dotenv.config();
dotenv.config({ path: ".env.development" });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCampSiteCounts() {
  console.log("Checking camp site counts in database...\n");

  // Get total camp sites
  const { count: totalCount } = await supabase
    .from("potential_spots")
    .select("*", { count: "exact", head: true })
    .eq("spot_type", "camp_site");

  console.log(`Total camp_site spots: ${totalCount}`);

  // Get by is_road_accessible
  const { count: roadAccessibleTrue } = await supabase
    .from("potential_spots")
    .select("*", { count: "exact", head: true })
    .eq("spot_type", "camp_site")
    .eq("is_road_accessible", true);

  const { count: roadAccessibleFalse } = await supabase
    .from("potential_spots")
    .select("*", { count: "exact", head: true })
    .eq("spot_type", "camp_site")
    .eq("is_road_accessible", false);

  const { count: roadAccessibleNull } = await supabase
    .from("potential_spots")
    .select("*", { count: "exact", head: true })
    .eq("spot_type", "camp_site")
    .is("is_road_accessible", null);

  console.log(`  - is_road_accessible = TRUE: ${roadAccessibleTrue}`);
  console.log(`  - is_road_accessible = FALSE: ${roadAccessibleFalse}`);
  console.log(`  - is_road_accessible = NULL: ${roadAccessibleNull}`);

  // Get by is_established_campground
  const { count: establishedTrue } = await supabase
    .from("potential_spots")
    .select("*", { count: "exact", head: true })
    .eq("spot_type", "camp_site")
    .eq("is_established_campground", true);

  const { count: establishedFalse } = await supabase
    .from("potential_spots")
    .select("*", { count: "exact", head: true })
    .eq("spot_type", "camp_site")
    .eq("is_established_campground", false);

  console.log(`\nEstablished campground classification:`);
  console.log(`  - is_established_campground = TRUE: ${establishedTrue}`);
  console.log(`  - is_established_campground = FALSE: ${establishedFalse}`);

  // Get spots near Moab (38.57, -109.55, 15 mile radius)
  const { data: moabSpots, error } = await supabase.rpc("get_dispersed_spots", {
    p_lat: 38.57,
    p_lng: -109.55,
    p_radius_miles: 15,
    p_vehicle_access: null,
    p_min_confidence: 0,
    p_include_derived: true,
    p_limit: 1000,
  });

  if (error) {
    console.error("\nError fetching Moab spots:", error);
    return;
  }

  const campSites = moabSpots.filter((s: any) => s.spot_type === "camp_site");
  console.log(`\nMoab area (15 mi radius) camp_site spots: ${campSites.length}`);

  // Break down by is_road_accessible
  const roadAccessibleCounts = {
    true: campSites.filter((s: any) => s.is_road_accessible === true).length,
    false: campSites.filter((s: any) => s.is_road_accessible === false).length,
    null: campSites.filter((s: any) => s.is_road_accessible === null).length,
  };
  console.log(`  - is_road_accessible = TRUE: ${roadAccessibleCounts.true}`);
  console.log(`  - is_road_accessible = FALSE: ${roadAccessibleCounts.false}`);
  console.log(`  - is_road_accessible = NULL: ${roadAccessibleCounts.null}`);

  // Count how many would pass the DispersedExplorer filter
  const wouldBeFiltered = campSites.filter((s: any) => s.is_road_accessible === false);
  console.log(`\nCamp sites that would be FILTERED OUT (is_road_accessible=false): ${wouldBeFiltered.length}`);

  if (wouldBeFiltered.length > 0) {
    console.log("\nFirst 5 filtered camp sites:");
    wouldBeFiltered.slice(0, 5).forEach((s: any) => {
      console.log(`  - ${s.name || "Unnamed"} at ${s.lat}, ${s.lng}`);
    });
  }
}

checkCampSiteCounts().catch(console.error);
