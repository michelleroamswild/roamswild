import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Recreation.gov availability API
const RECREATION_GOV_API = "https://www.recreation.gov/api/camps/availability/campground";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AvailabilityRequest {
  facilityIds: string[];
  startDate: string; // ISO date (YYYY-MM-DD)
  numNights: number;
}

interface NightAvailability {
  date: string; // YYYY-MM-DD
  availableSites: number;
}

interface CampsiteAvailability {
  facilityId: string;
  available: boolean; // true if ANY night has availability
  availableSites: number; // sites available for ALL nights (legacy)
  totalSites: number;
  perNight?: NightAvailability[]; // availability for each requested night
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Parse request body
    const body: AvailabilityRequest = await req.json();
    const { facilityIds, startDate, numNights } = body;

    if (!facilityIds || !Array.isArray(facilityIds) || facilityIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid facilityIds" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!startDate) {
      return new Response(
        JSON.stringify({ error: "Missing startDate" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse start date and calculate the month needed
    const checkInDate = new Date(startDate);
    const checkOutDate = new Date(checkInDate);
    checkOutDate.setDate(checkOutDate.getDate() + (numNights || 1));

    // Get all months we need to check (in case trip spans multiple months)
    const monthsToCheck = new Set<string>();
    const currentDate = new Date(checkInDate);
    while (currentDate <= checkOutDate) {
      const monthStart = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-01`;
      monthsToCheck.add(monthStart);
      currentDate.setMonth(currentDate.getMonth() + 1);
    }

    // Check availability for each facility
    const results: CampsiteAvailability[] = [];

    for (const facilityId of facilityIds) {
      try {
        // Extract numeric ID from "ridb-12345" format
        const numericId = facilityId.replace('ridb-', '');

        let totalSites = 0;
        let sitesWithAllNightsAvailable = 0;
        // Track per-night availability
        const perNightCounts: Map<string, number> = new Map();

        // Initialize per-night tracking for each requested night
        const nightDate = new Date(checkInDate);
        for (let i = 0; i < (numNights || 1); i++) {
          const dateStr = nightDate.toISOString().split('T')[0];
          perNightCounts.set(dateStr, 0);
          nightDate.setDate(nightDate.getDate() + 1);
        }

        // Check each month needed
        for (const monthStart of monthsToCheck) {
          const availabilityUrl = `${RECREATION_GOV_API}/${numericId}/month?start_date=${monthStart}T00:00:00.000Z`;

          const response = await fetch(availabilityUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (compatible; TripPlanner/1.0)",
              "Accept": "application/json",
            },
          });

          if (!response.ok) {
            console.log(`Availability check failed for facility ${numericId}: ${response.status}`);
            continue;
          }

          const data = await response.json();

          // Recreation.gov returns availability by campsite
          // data.campsites is an object with site IDs as keys
          if (data.campsites) {
            const campsites = Object.values(data.campsites) as any[];
            totalSites = Math.max(totalSites, campsites.length);

            // Check each campsite for availability
            for (const site of campsites) {
              if (site.availabilities) {
                let allNightsAvailable = true;

                // Check each night of the stay
                const checkDate = new Date(checkInDate);
                for (let i = 0; i < (numNights || 1); i++) {
                  const dateStr = checkDate.toISOString().split('T')[0];
                  const dateKey = dateStr + 'T00:00:00Z';
                  const status = site.availabilities[dateKey];

                  // Track per-night availability
                  if (status === 'Available') {
                    perNightCounts.set(dateStr, (perNightCounts.get(dateStr) || 0) + 1);
                  } else {
                    allNightsAvailable = false;
                  }
                  checkDate.setDate(checkDate.getDate() + 1);
                }

                if (allNightsAvailable) {
                  sitesWithAllNightsAvailable++;
                }
              }
            }
          }
        }

        // Build per-night array
        const perNight: NightAvailability[] = [];
        for (const [date, count] of perNightCounts.entries()) {
          perNight.push({ date, availableSites: count });
        }
        // Sort by date
        perNight.sort((a, b) => a.date.localeCompare(b.date));

        // "available" is true if ANY night has availability
        const hasAnyAvailability = perNight.some(n => n.availableSites > 0);

        results.push({
          facilityId,
          available: hasAnyAvailability,
          availableSites: sitesWithAllNightsAvailable,
          totalSites,
          perNight,
        });
      } catch (err) {
        console.error(`Error checking availability for ${facilityId}:`, err);
        // Don't include this facility in results if we couldn't check it
      }
    }

    return new Response(JSON.stringify({ availability: results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Availability check error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
