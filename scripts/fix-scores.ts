import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://ioseedbzvogywztbtgjd.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY is required");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function main() {
  console.log("Fixing dead-end scores to match client-side (base 25 = Medium confidence)...");

  // Update ALL OSM dead-ends to base score 25 (Medium confidence)
  // This matches the client-side behavior
  const { error, count } = await supabase
    .from("potential_spots")
    .update({ confidence_score: 25 })
    .eq("spot_type", "dead_end")
    .eq("source_type", "osm")
    .select("id", { count: "exact", head: true });

  console.log("Updated OSM dead-ends to score 25:", count, error?.message || "OK");

  // Check new distribution
  const { data: spots } = await supabase
    .from("potential_spots")
    .select("spot_type, confidence_score")
    .eq("spot_type", "dead_end")
    .limit(2000);

  const byScore: Record<number, number> = {};
  spots?.forEach((s: any) => {
    byScore[s.confidence_score] = (byScore[s.confidence_score] || 0) + 1;
  });

  console.log("\nNew dead-end score distribution:");
  Object.entries(byScore).sort((a, b) => Number(a[0]) - Number(b[0])).forEach(([k, v]) => {
    const level = Number(k) >= 35 ? "High" : Number(k) >= 25 ? "Medium" : "Low";
    console.log(`  score ${k} (${level}): ${v} spots`);
  });
}

main().catch(console.error);
