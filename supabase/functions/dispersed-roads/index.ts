import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Dispersed Roads API
 *
 * GET /dispersed-roads?lat=38.6&lng=-109.55&radius=10
 *
 * Returns road segments from the database for map rendering.
 * These are OSM tracks and other roads that can be displayed on the map.
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
    const sourceType = url.searchParams.get("source_type") || null; // 'osm', 'mvum', or null for all
    const limit = parseInt(url.searchParams.get("limit") || "500");

    if (!lat || !lng) {
      return new Response(
        JSON.stringify({ error: "lat and lng are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Query road segments within radius
    const { data, error } = await supabase.rpc("get_road_segments", {
      p_lat: lat,
      p_lng: lng,
      p_radius_miles: radius,
      p_source_type: sourceType,
      p_limit: limit,
    });

    if (error) {
      console.error("Database error:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Transform to frontend format
    const roads = (data || []).map((row: any) => ({
      id: row.id,
      name: row.name || "Unnamed Road",
      sourceType: row.source_type,
      vehicleAccess: row.vehicle_access,
      highClearance: row.vehicle_access !== "passenger",
      coordinates: row.coordinates || [], // Array of {lat, lng} points
      managingAgency: row.managing_agency,
      distanceMiles: parseFloat(row.distance_miles),
      // OSM-specific tags for road info display
      highway: row.highway || null,
      surface: row.surface_type || null,
      tracktype: row.tracktype || null,
      access: row.access || null,
      fourWdOnly: row.four_wd_only || false,
    }));

    return new Response(
      JSON.stringify({
        roads,
        count: roads.length,
        searchParams: { lat, lng, radius, sourceType },
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
