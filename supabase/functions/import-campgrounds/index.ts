import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// ============================================
// Types
// ============================================

interface RegionBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface ImportRequest {
  regionName: string;
  bounds: RegionBounds;
}

interface RIDBFacility {
  FacilityID: string;
  FacilityName: string;
  FacilityDescription?: string;
  FacilityTypeDescription?: string;
  FacilityLatitude: number;
  FacilityLongitude: number;
  FacilityReservationURL?: string;
  Reservable?: boolean;
  ParentRecAreaName?: string;
  GEOJSON?: {
    COORDINATES: [number, number];
  };
}

interface RIDBResponse {
  RECDATA: RIDBFacility[];
  METADATA: {
    RESULTS: {
      TOTAL_COUNT: number;
      CURRENT_COUNT: number;
    };
  };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RIDB_BASE_URL = "https://ridb.recreation.gov/api/v1";

// ============================================
// Import Function
// ============================================

async function importCampgrounds(
  supabase: any,
  bounds: RegionBounds,
  ridbApiKey: string
): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  let count = 0;

  // RIDB uses lat/lng radius search, so we need center and radius
  const centerLat = (bounds.north + bounds.south) / 2;
  const centerLng = (bounds.east + bounds.west) / 2;

  // Approximate radius in miles (using Haversine approximation)
  const latDiff = bounds.north - bounds.south;
  const lngDiff = bounds.east - bounds.west;
  const avgLatMiles = latDiff * 69; // ~69 miles per degree latitude
  const avgLngMiles = lngDiff * 69 * Math.cos(centerLat * Math.PI / 180);
  const radius = Math.max(avgLatMiles, avgLngMiles) / 2 + 5; // Add buffer

  try {
    // Fetch campground facilities from RIDB
    const params = new URLSearchParams({
      latitude: centerLat.toString(),
      longitude: centerLng.toString(),
      radius: radius.toString(),
      activity: "CAMPING", // Filter for camping-related facilities
      limit: "500",
      offset: "0",
    });

    const url = `${RIDB_BASE_URL}/facilities?${params}`;
    console.log(`Fetching RIDB facilities: lat=${centerLat}, lng=${centerLng}, radius=${radius}mi`);

    const response = await fetch(url, {
      headers: {
        "apikey": ridbApiKey,
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      errors.push(`RIDB API error: ${response.status} - ${text.substring(0, 200)}`);
      return { count, errors };
    }

    const data: RIDBResponse = await response.json();
    console.log(`Got ${data.RECDATA?.length || 0} RIDB facilities (total: ${data.METADATA?.RESULTS?.TOTAL_COUNT || 0})`);

    for (const facility of data.RECDATA || []) {
      try {
        // Skip if no coordinates
        if (!facility.FacilityLatitude || !facility.FacilityLongitude) {
          continue;
        }

        // Skip if outside bounds (radius search can include outside)
        if (facility.FacilityLatitude < bounds.south ||
            facility.FacilityLatitude > bounds.north ||
            facility.FacilityLongitude < bounds.west ||
            facility.FacilityLongitude > bounds.north) {
          continue;
        }

        // Only import campground-type facilities
        const facilityType = facility.FacilityTypeDescription?.toLowerCase() || "";
        if (!facilityType.includes("campground") &&
            !facilityType.includes("camping") &&
            !facilityType.includes("camp site")) {
          continue;
        }

        const externalId = facility.FacilityID;

        // Check if already exists
        const { data: existing } = await supabase
          .from("established_campgrounds")
          .select("id")
          .eq("ridb_facility_id", externalId)
          .single();

        if (existing) {
          continue; // Already imported
        }

        // Determine agency from parent rec area or facility name
        let agencyName = "Unknown";
        const parentArea = facility.ParentRecAreaName?.toLowerCase() || "";
        const facilityName = facility.FacilityName?.toLowerCase() || "";

        if (parentArea.includes("national forest") || facilityName.includes("national forest")) {
          agencyName = "USFS";
        } else if (parentArea.includes("blm") || parentArea.includes("bureau of land")) {
          agencyName = "BLM";
        } else if (parentArea.includes("national park") || parentArea.includes("nps")) {
          agencyName = "NPS";
        } else if (parentArea.includes("state") || facilityName.includes("state park")) {
          agencyName = "STATE";
        } else if (parentArea.includes("corps") || parentArea.includes("army")) {
          agencyName = "USACE";
        }

        // Build recreation.gov URL if reservable
        let recGovUrl: string | null = null;
        if (facility.Reservable || facility.FacilityReservationURL) {
          recGovUrl = facility.FacilityReservationURL ||
            `https://www.recreation.gov/camping/campgrounds/${facility.FacilityID}`;
        }

        // Insert using RPC function
        const { error } = await supabase.rpc("insert_campground", {
          p_ridb_facility_id: externalId,
          p_name: facility.FacilityName,
          p_description: facility.FacilityDescription?.substring(0, 1000) || null,
          p_facility_type: facility.FacilityTypeDescription || "Campground",
          p_lat: facility.FacilityLatitude,
          p_lng: facility.FacilityLongitude,
          p_agency_name: agencyName,
          p_forest_name: facility.ParentRecAreaName || null,
          p_is_reservable: facility.Reservable || false,
          p_recreation_gov_url: recGovUrl,
        });

        if (error) {
          console.error(`Error inserting campground ${externalId}: ${error.message}`);
          errors.push(`Insert error (${externalId}): ${error.message}`);
        } else {
          count++;
          console.log(`Inserted: ${facility.FacilityName}`);
        }
      } catch (e: any) {
        errors.push(`Facility error: ${e.message}`);
      }
    }
  } catch (e: any) {
    errors.push(`RIDB fetch error: ${e.message}`);
  }

  return { count, errors };
}

// ============================================
// Main Handler
// ============================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ridbApiKey = Deno.env.get("RIDB_API_KEY");

    if (!ridbApiKey) {
      return new Response(
        JSON.stringify({ error: "RIDB_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: ImportRequest = await req.json();
    const { regionName, bounds } = body;

    if (!bounds || bounds.north === undefined) {
      return new Response(
        JSON.stringify({ error: "bounds required with north, south, east, west" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Starting campgrounds import for: ${regionName}`);
    console.log(`Bounds: N=${bounds.north}, S=${bounds.south}, E=${bounds.east}, W=${bounds.west}`);

    const result = await importCampgrounds(supabase, bounds, ridbApiKey);

    console.log(`Import complete: ${result.count} campgrounds, ${result.errors.length} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        regionName,
        campgroundsImported: result.count,
        errors: result.errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Import error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
