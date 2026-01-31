import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Dispersed Public Lands API
 *
 * GET /dispersed-public-lands?lat=38.6&lng=-109.55&radius=15
 *
 * Returns public land boundaries from the database.
 * Response matches the PublicLand interface expected by the frontend.
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
    const includeGeometry = url.searchParams.get("include_geometry") !== "false";

    if (!lat || !lng) {
      return new Response(
        JSON.stringify({ error: "lat and lng are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Query the get_public_lands_nearby function
    const { data, error } = await supabase.rpc("get_public_lands_nearby", {
      p_lat: lat,
      p_lng: lng,
      p_radius_miles: radius,
      p_include_geometry: includeGeometry,
    });

    if (error) {
      console.error("Database error:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Transform database results to match PublicLand interface
    const publicLands = (data || []).map((row: any) => {
      // Parse simplified geometry if present
      let polygon: { lat: number; lng: number }[] | undefined;
      let vertexCount = 0;

      if (row.boundary_simplified) {
        polygon = parseGeometryToPolygon(row.boundary_simplified);
        vertexCount = polygon?.length || 0;
      }

      // Don't render very large polygons (performance)
      const renderOnMap = vertexCount > 0 && vertexCount < 5000;

      return {
        id: row.id,
        name: row.name,
        managingAgency: mapAgencyCode(row.managing_agency),
        managingAgencyFull: getAgencyFullName(row.managing_agency),
        unitName: row.name,
        lat, // Using search center as approximate location
        lng,
        distance: 0, // Would need centroid calculation
        polygon: renderOnMap ? polygon : undefined,
        renderOnMap,
        vertexCount,
        dispersedCampingAllowed: row.dispersed_camping_allowed,
        landType: row.land_type,
      };
    });

    return new Response(
      JSON.stringify({
        publicLands,
        count: publicLands.length,
        searchParams: { lat, lng, radius, includeGeometry },
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

// Parse PostGIS geometry to array of lat/lng points
function parseGeometryToPolygon(geom: any): { lat: number; lng: number }[] | undefined {
  if (!geom) return undefined;

  try {
    // If it's a GeoJSON object
    if (geom.type === "MultiPolygon" && geom.coordinates) {
      // Get first polygon, first ring
      const ring = geom.coordinates[0]?.[0];
      if (ring) {
        return ring.map(([lng, lat]: [number, number]) => ({ lat, lng }));
      }
    } else if (geom.type === "Polygon" && geom.coordinates) {
      const ring = geom.coordinates[0];
      if (ring) {
        return ring.map(([lng, lat]: [number, number]) => ({ lat, lng }));
      }
    }
  } catch (e) {
    console.error("Error parsing geometry:", e);
  }

  return undefined;
}

function mapAgencyCode(agency: string): string {
  const mapping: Record<string, string> = {
    "USFS": "USFS",
    "BLM": "BLM",
    "NPS": "NPS",
    "FWS": "FWS",
    "STATE": "STATE",
    "FED": "FED",
  };
  return mapping[agency] || agency;
}

function getAgencyFullName(agency: string): string {
  const names: Record<string, string> = {
    "USFS": "US Forest Service",
    "BLM": "Bureau of Land Management",
    "NPS": "National Park Service",
    "FWS": "Fish & Wildlife Service",
    "STATE": "State Park",
    "FED": "Federal Land",
  };
  return names[agency] || agency;
}
