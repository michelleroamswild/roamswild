import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Dispersed Spots API
 *
 * GET /dispersed-spots?lat=38.6&lng=-109.55&radius=10
 *
 * Returns potential dispersed camping spots from the database.
 * Response matches the PotentialSpot interface expected by the frontend.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const lat = parseFloat(url.searchParams.get("lat") || "0");
    const lng = parseFloat(url.searchParams.get("lng") || "0");
    const radius = parseFloat(url.searchParams.get("radius") || "10");
    const vehicleAccess = url.searchParams.get("vehicle_access") || null;
    const minConfidence = parseFloat(url.searchParams.get("min_confidence") || "0");
    const includeDerived = url.searchParams.get("include_derived") !== "false";
    const limit = parseInt(url.searchParams.get("limit") || "100");

    if (!lat || !lng) {
      return new Response(
        JSON.stringify({ error: "lat and lng are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Query the get_dispersed_spots function
    const { data, error } = await supabase.rpc("get_dispersed_spots", {
      p_lat: lat,
      p_lng: lng,
      p_radius_miles: radius,
      p_vehicle_access: vehicleAccess,
      p_min_confidence: minConfidence,
      p_include_derived: includeDerived,
      p_limit: limit,
    });

    if (error) {
      console.error("Database error:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Transform database results to match PotentialSpot interface
    const spots = (data || []).map((row: any) => {
      const isBLM = row.managing_agency === "BLM";
      const isUSFS = row.managing_agency === "USFS" || row.managing_agency === "FS";
      return {
        id: row.id,
        lat: parseFloat(row.lat),
        lng: parseFloat(row.lng),
        // Use name from database (for OSM camp sites), fallback to road_name, then default
        name: row.name || row.road_name || "Dispersed Spot",
        type: mapSpotType(row.spot_type),
        // Pass through DB kind/sub_kind so the explorer can distinguish
        // community-contributed spots (sub_kind='community') from
        // derived dead-ends — both come back with type='dead-end' but
        // they need different visual treatment + filter buckets.
        kind: row.kind || null,
        subKind: row.sub_kind || null,
        score: parseFloat(row.confidence_score) || 0,
        reasons: row.derivation_reasons || [],
        // 'osm' = actual OSM-tagged camp_site/camp_pitch entity (a "known" site).
        // 'derived' = computed from road-network analysis (dead-ends, intersections).
        // potential_spots.spot_type already encodes this distinction.
        source: row.spot_type === "camp_site" ? "osm" : "derived",
        roadName: row.road_name,
        highClearance: row.vehicle_access !== "passenger",
        isOnMVUMRoad: isUSFS, // USFS spots come from MVUM roads
        isOnBLMRoad: isBLM,   // BLM spots from OSM roads on BLM land
        isOnPublicLand: true, // All spots in DB are on public land
        passengerReachable: row.vehicle_access === "passenger",
        highClearanceReachable: row.vehicle_access !== "4wd",
        // Additional fields from database
        status: row.status,
        managingAgency: row.managing_agency,
        distanceMiles: parseFloat(row.distance_miles),
        // Classification flag for established vs dispersed campground
        isEstablishedCampground: row.is_established_campground || false,
        // Road accessibility flag (for filtering backcountry/hike-in camps)
        isRoadAccessible: row.is_road_accessible !== false, // default true for backwards compat
        // Public land flag (for filtering spots not on public land)
        isOnPublicLand: row.is_on_public_land !== false, // default true for backwards compat
        // Raw OSM tags (drinking_water, capacity, fee, etc.) for the detail panel
        osmTags: row.osm_tags || null,
        // Resolved public-land entity at save time
        landName: row.land_unit_name || null,
        landProtectClass: row.land_protect_class || null,
        landProtectionTitle: row.land_protection_title || null,
        // Access difficulty (computed from nearby road OSM tags)
        accessDifficulty: row.access_difficulty || null,
        // Worst-nearby road's tags — explains why a spot is rated extreme/hard
        accessRoad: row.access_road || null,
        // True when the spot sits within ~50m of the containing public-land
        // polygon's boundary — high risk of being on a private inholding.
        nearPublicLandEdge: !!row.near_public_land_edge,
        metersFromPublicLandEdge:
          row.meters_from_public_land_edge != null
            ? parseFloat(row.meters_from_public_land_edge)
            : null,
        // True when no current PAD-US polygon contains this spot at all.
        outsidePublicLandPolygon: !!row.outside_public_land_polygon,
      };
    });

    return new Response(
      JSON.stringify({
        spots,
        count: spots.length,
        searchParams: { lat, lng, radius, vehicleAccess, minConfidence, includeDerived },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function mapSpotType(dbType: string): "dead-end" | "camp-site" | "intersection" {
  switch (dbType) {
    case "dead_end":
      return "dead-end";
    case "camp_site":
      return "camp-site";
    case "intersection":
      return "intersection";
    default:
      return "dead-end";
  }
}
