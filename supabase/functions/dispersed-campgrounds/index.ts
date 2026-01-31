import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Dispersed Campgrounds API
 *
 * GET /dispersed-campgrounds?lat=38.6&lng=-109.55&radius=15
 *
 * Returns established campgrounds from the database.
 * Response matches the EstablishedCampground interface expected by the frontend.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const lat = parseFloat(url.searchParams.get("lat") || "0");
    const lng = parseFloat(url.searchParams.get("lng") || "0");
    const radius = parseFloat(url.searchParams.get("radius") || "15");

    if (!lat || !lng) {
      return new Response(
        JSON.stringify({ error: "lat and lng are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Query the get_campgrounds_nearby function
    const { data, error } = await supabase.rpc("get_campgrounds_nearby", {
      p_lat: lat,
      p_lng: lng,
      p_radius_miles: radius,
    });

    if (error) {
      console.error("Database error:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Transform database results to match EstablishedCampground interface
    const campgrounds = (data || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      lat: parseFloat(row.lat),
      lng: parseFloat(row.lng),
      description: undefined, // Not returned by the function for performance
      facilityType: "Campground",
      agencyName: row.agency_name,
      reservable: row.is_reservable || false,
      url: row.recreation_gov_url,
      distanceMiles: parseFloat(row.distance_miles),
    }));

    return new Response(
      JSON.stringify({
        campgrounds,
        count: campgrounds.length,
        searchParams: { lat, lng, radius },
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
