import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface PotentialSpot {
  id: string;
  lat: number;
  lng: number;
  name?: string;
  type: "dead-end" | "camp-site" | "intersection";
  score: number;
  reasons: string[];
  source: "mvum" | "osm" | "blm" | "derived";
  roadName?: string;
  highClearance?: boolean;
  isOnMVUMRoad?: boolean;
  isOnBLMRoad?: boolean;
  isOnPublicLand?: boolean;
  passengerReachable?: boolean;
  highClearanceReachable?: boolean;
  isEstablishedCampground?: boolean;
  isRoadAccessible?: boolean;
  // Resolved public-land entity at save time (frontend findContainingLand)
  landName?: string;
  landProtectClass?: string;
  landProtectionTitle?: string;
  // Raw OSM tags for camp-sites — persisted to potential_spots.osm_tags JSONB
  osmTags?: Record<string, string>;
}

interface EstablishedCampground {
  id: string;
  name: string;
  lat: number;
  lng: number;
  description?: string;
  facilityType?: string;
  agencyName?: string;
  reservable?: boolean;
  url?: string;
}

interface MVUMRoadInput {
  id: string;
  name?: string;
  surfaceType?: string;
  passengerVehicle?: boolean;
  highClearanceVehicle?: boolean;
  atv?: boolean;
  motorcycle?: boolean;
  seasonal?: string;
  operationalMaintLevel?: string;
  geometry?: { type: string; coordinates: [number, number][] };
}

interface OSMTrackInput {
  id: number | string;
  name?: string;
  highway?: string;
  surface?: string;
  tracktype?: string;
  access?: string;
  fourWdOnly?: boolean;
  geometry?: { type: string; coordinates: [number, number][] };
  osmTags?: Record<string, string>;
}

interface BLMRoadInput {
  id: string;
  name?: string;
  surfaceType?: string;
  routeType?: string;
  geometry?: { type: string; coordinates: [number, number][] };
}

interface BBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface SaveRequest {
  spots: PotentialSpot[];
  campgrounds?: EstablishedCampground[];
  mvumRoads?: MVUMRoadInput[];
  osmTracks?: OSMTrackInput[];
  blmRoads?: BLMRoadInput[];
  bbox: BBox;
}

function buildLineStringWKT(coords: [number, number][]): string | null {
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const points = coords
    .filter((c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]))
    .map((c) => `${c[0]} ${c[1]}`);
  if (points.length < 2) return null;
  return `SRID=4326;LINESTRING(${points.join(", ")})`;
}

function mvumVehicleAccess(road: MVUMRoadInput): string {
  if (road.passengerVehicle) return "passenger";
  if (road.highClearanceVehicle) return "high_clearance";
  if (road.atv || road.motorcycle) return "atv_only";
  return "high_clearance";
}

function osmVehicleAccess(track: OSMTrackInput): string {
  if (track.fourWdOnly) return "4wd";
  if (track.tracktype === "grade5" || track.tracktype === "grade4") return "4wd";
  if (track.tracktype === "grade3") return "high_clearance";
  if (track.tracktype === "grade1") return "passenger";
  return "high_clearance";
}

// Map agencyName → established_campgrounds.source_type enum
function mapCampgroundSourceType(agencyName?: string): string {
  if (!agencyName) return "osm";
  const a = agencyName.toUpperCase();
  if (a.includes("USFS") || a.includes("FOREST")) return "usfs";
  if (a.includes("BLM")) return "blm_sma";
  return "osm";
}

// Map frontend spot_type → DB enum
function mapSpotType(type: PotentialSpot["type"]): string {
  if (type === "dead-end") return "dead_end";
  if (type === "camp-site") return "camp_site";
  return "intersection";
}

// Map frontend source → DB source_type enum ('mvum' | 'blm' | 'osm')
// The frontend has 'derived' (dead-ends from road-network analysis) which has
// no direct DB enum; pick the best match based on road flags.
function mapSourceType(spot: PotentialSpot): string {
  if (spot.source === "mvum" || spot.source === "blm" || spot.source === "osm") {
    return spot.source;
  }
  // source === 'derived' — map by road provenance
  if (spot.isOnMVUMRoad) return "mvum";
  if (spot.isOnBLMRoad) return "blm";
  return "osm";
}

function mapVehicleAccess(spot: PotentialSpot): string {
  if (spot.passengerReachable) return "passenger";
  if (spot.highClearanceReachable) return "high_clearance";
  return "4wd";
}

// The `potential_spots.managing_agency` column is used downstream by the
// dispersed-spots frontend mapping to set isOnMVUMRoad / isOnBLMRoad, which in
// turn short-circuits the public-land polygon re-check. Storing it correctly
// means spots stay visible even when client-side polygon coverage is partial.
function mapManagingAgency(spot: PotentialSpot): string | null {
  if (spot.isOnMVUMRoad) return "USFS";
  if (spot.isOnBLMRoad) return "BLM";
  return null;
}

// Key used for dedup — matches the 5-decimal precision used elsewhere in the app.
function coordKey(lat: number, lng: number): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = (await req.json()) as SaveRequest;
    const {
      spots,
      campgrounds = [],
      mvumRoads = [],
      osmTracks = [],
      blmRoads = [],
      bbox,
    } = body;

    if (!Array.isArray(spots) || !bbox) {
      return new Response(
        JSON.stringify({ error: "Body must include spots[] and bbox" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // === DISPERSED SPOTS ===
    // Dedup against rows already in the unified `spots` table (kind=dispersed_camping),
    // pad the bbox slightly so 5-decimal-rounded coords still match.
    const pad = 0.0001;
    const { data: existing, error: existingErr } = await db
      .from("spots")
      .select("id, latitude, longitude")
      .eq("kind", "dispersed_camping")
      .gte("latitude", bbox.south - pad)
      .lte("latitude", bbox.north + pad)
      .gte("longitude", bbox.west - pad)
      .lte("longitude", bbox.east + pad);

    if (existingErr) {
      console.error("Failed to fetch existing spots:", existingErr);
      return new Response(
        JSON.stringify({ error: existingErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const existingKeys = new Set(
      (existing || []).map((row: { latitude: number; longitude: number }) =>
        coordKey(Number(row.latitude), Number(row.longitude))
      )
    );

    // Build rows to insert, filtering out dupes by rounded coords
    const rowsToInsert: Record<string, unknown>[] = [];
    const seenInBatch = new Set<string>();

    for (const spot of spots) {
      const key = coordKey(spot.lat, spot.lng);
      if (existingKeys.has(key) || seenInBatch.has(key)) continue;
      seenInBatch.add(key);

      const isCampSite = spot.type === "camp-site";
      const isEstablished = spot.isEstablishedCampground ?? false;

      rowsToInsert.push({
        name: spot.name ?? spot.roadName ?? (isCampSite ? "OSM Campsite" : "Dispersed spot"),
        latitude: spot.lat,
        longitude: spot.lng,
        kind: isEstablished ? "established_campground" : "dispersed_camping",
        sub_kind: isEstablished ? "campground" : (isCampSite ? "known" : "derived"),
        source: mapSourceType(spot),
        source_external_id: null,
        public_land_unit: spot.landName ?? null,
        public_land_manager: mapManagingAgency(spot),
        public_land_designation: spot.landProtectionTitle ?? null,
        land_type: spot.isOnPublicLand ? "public" : "unknown",
        amenities: {
          vehicle_required: mapVehicleAccess(spot),
        },
        extra: {
          confidence_score: spot.score,
          derivation_reasons: spot.reasons ?? [],
          is_passenger_reachable: spot.passengerReachable ?? false,
          is_high_clearance_reachable: spot.highClearanceReachable ?? true,
          is_road_accessible: spot.isRoadAccessible ?? true,
          status: "derived",
          osm_tags: spot.osmTags ?? null,
          road_name: spot.roadName ?? null,
          land_protect_class: spot.landProtectClass ?? null,
        },
      });
    }

    let inserted = 0;
    if (rowsToInsert.length > 0) {
      const { error: insertErr, count } = await db
        .from("spots")
        .insert(rowsToInsert, { count: "exact" });

      if (insertErr) {
        console.error("Failed to insert spots:", insertErr);
        return new Response(
          JSON.stringify({ error: insertErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      inserted = count ?? rowsToInsert.length;
    }

    // === ESTABLISHED CAMPGROUNDS ===
    let insertedCampgrounds = 0;
    let skippedCampgrounds = 0;
    if (campgrounds.length > 0) {
      const { data: existingCg, error: existingCgErr } = await db
        .from("spots")
        .select("id, latitude, longitude")
        .eq("kind", "established_campground")
        .gte("latitude", bbox.south - pad)
        .lte("latitude", bbox.north + pad)
        .gte("longitude", bbox.west - pad)
        .lte("longitude", bbox.east + pad);

      if (existingCgErr) {
        console.error("Failed to fetch existing campgrounds:", existingCgErr);
        return new Response(
          JSON.stringify({ error: existingCgErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const existingCgKeys = new Set(
        (existingCg || []).map((row: { latitude: number; longitude: number }) =>
          coordKey(Number(row.latitude), Number(row.longitude))
        )
      );

      const campgroundRows: Record<string, unknown>[] = [];
      const seenCgInBatch = new Set<string>();

      for (const cg of campgrounds) {
        // Skip non-camping facility types (matches the legacy mirror trigger)
        const ft = (cg.facilityType ?? "").toLowerCase();
        if (ft === "day use" || ft === "day_use" || ft === "trailhead") continue;

        const key = coordKey(cg.lat, cg.lng);
        if (existingCgKeys.has(key) || seenCgInBatch.has(key)) {
          skippedCampgrounds++;
          continue;
        }
        seenCgInBatch.add(key);

        campgroundRows.push({
          name: cg.name,
          description: cg.description ?? null,
          latitude: cg.lat,
          longitude: cg.lng,
          kind: "established_campground",
          sub_kind: "campground",
          source: mapCampgroundSourceType(cg.agencyName),
          source_external_id: null,
          public_land_manager: cg.agencyName && cg.agencyName !== "Unknown" ? cg.agencyName : null,
          land_type: "public",
          amenities: {
            reservation: cg.reservable ?? false,
          },
          extra: {
            facility_type: cg.facilityType ?? "Campground",
            recreation_gov_url: cg.url ?? null,
          },
        });
      }

      if (campgroundRows.length > 0) {
        const { error: cgInsertErr, count: cgCount } = await db
          .from("spots")
          .insert(campgroundRows, { count: "exact" });

        if (cgInsertErr) {
          console.error("Failed to insert campgrounds:", cgInsertErr);
          return new Response(
            JSON.stringify({ error: cgInsertErr.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        insertedCampgrounds = cgCount ?? campgroundRows.length;
      }
    }

    // === ROAD SEGMENTS ===
    let insertedRoads = 0;
    let skippedRoads = 0;
    const totalRoadsIn = mvumRoads.length + osmTracks.length + blmRoads.length;
    if (totalRoadsIn > 0) {
      // Dedup by (source_type, external_id) within bbox.
      const { data: existingRoads, error: existingRoadsErr } = await db
        .from("road_segments")
        .select("source_type, external_id")
        .not("external_id", "is", null);

      if (existingRoadsErr) {
        console.error("Failed to fetch existing roads:", existingRoadsErr);
      }

      const existingRoadKeys = new Set(
        (existingRoads || []).map(
          (row: { source_type: string; external_id: string }) =>
            `${row.source_type}:${row.external_id}`
        )
      );

      const roadRows: Record<string, unknown>[] = [];
      const seenRoadKeys = new Set<string>();

      const addRoad = (
        sourceType: string,
        externalId: string,
        wkt: string | null,
        fields: Record<string, unknown>
      ) => {
        if (!wkt) {
          skippedRoads++;
          return;
        }
        const key = `${sourceType}:${externalId}`;
        // Within this batch dedup; existing-in-DB rows we'll upsert below
        // so OSM tag bag, tracktype, smoothness etc. stay current.
        if (seenRoadKeys.has(key)) {
          skippedRoads++;
          return;
        }
        seenRoadKeys.add(key);
        roadRows.push({
          external_id: externalId,
          source_type: sourceType,
          geometry: wkt,
          ...fields,
        });
      };

      for (const r of mvumRoads) {
        addRoad("mvum", r.id, buildLineStringWKT(r.geometry?.coordinates ?? []), {
          name: r.name ?? null,
          surface_type: r.surfaceType ?? null,
          vehicle_access: mvumVehicleAccess(r),
          seasonal_closure: r.seasonal ?? null,
          // Per-vehicle-class flags + maintenance level live here. The
          // single vehicle_access enum can't carry "passenger AND atv" etc.
          mvum_tags: {
            passenger: r.passengerVehicle ?? false,
            high_clearance: r.highClearanceVehicle ?? false,
            atv: r.atv ?? false,
            motorcycle: r.motorcycle ?? false,
            operational_maint_level: (r as { operationalMaintLevel?: string }).operationalMaintLevel ?? null,
          },
        });
      }

      for (const r of blmRoads) {
        addRoad("blm", r.id, buildLineStringWKT(r.geometry?.coordinates ?? []), {
          name: r.name ?? null,
          surface_type: r.surfaceType ?? null,
          vehicle_access: "high_clearance",
        });
      }

      for (const t of osmTracks) {
        addRoad("osm", String(t.id), buildLineStringWKT(t.geometry?.coordinates ?? []), {
          name: t.name ?? null,
          surface_type: t.surface ?? null,
          vehicle_access: osmVehicleAccess(t),
          highway: t.highway ?? null,
          tracktype: t.tracktype ?? null,
          access: t.access ?? null,
          four_wd_only: t.fourWdOnly ?? false,
          osm_tags: t.osmTags ?? null,
        });
      }

      if (roadRows.length > 0) {
        // Upsert on (source_type, external_id) so re-runs refresh OSM tag bag
        // / tracktype / smoothness on existing rows instead of leaving stale
        // tag-less data behind.
        const { error: roadInsertErr, count: roadCount } = await db
          .from("road_segments")
          .upsert(roadRows, {
            onConflict: "external_id",
            count: "exact",
          });

        if (roadInsertErr) {
          console.error("Failed to upsert roads:", roadInsertErr);
          return new Response(
            JSON.stringify({ error: roadInsertErr.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        insertedRoads = roadCount ?? roadRows.length;
      }
    }

    // Classify access difficulty for the spots we just wrote.
    // Each spot inherits the worst nearby road's OSM-tag-driven difficulty
    // (extreme/hard/moderate/easy). Logged-only on failure — saving the
    // spots themselves matters more.
    if (inserted > 0 || insertedCampgrounds > 0) {
      const { error: clsErr } = await db.rpc('classify_spots_access_difficulty', {
        p_south: bbox.south,
        p_west: bbox.west,
        p_north: bbox.north,
        p_east: bbox.east,
      });
      if (clsErr) console.warn('classify_spots_access_difficulty failed:', clsErr.message);
    }

    // Record that we've analysed this region
    const bboxWKT =
      `SRID=4326;POLYGON((` +
      `${bbox.west} ${bbox.south}, ` +
      `${bbox.east} ${bbox.south}, ` +
      `${bbox.east} ${bbox.north}, ` +
      `${bbox.west} ${bbox.north}, ` +
      `${bbox.west} ${bbox.south}))`;

    const { data: region, error: regionErr } = await db
      .from("loaded_regions")
      .insert({
        bbox: bboxWKT,
        spot_count: spots.length + campgrounds.length,
      })
      .select("id")
      .single();

    if (regionErr) {
      console.error("Failed to record loaded region:", regionErr);
      return new Response(
        JSON.stringify({ error: regionErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        saved: inserted,
        skipped: spots.length - inserted,
        savedCampgrounds: insertedCampgrounds,
        skippedCampgrounds,
        savedRoads: insertedRoads,
        skippedRoads,
        regionId: region?.id ?? null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("save-derived-spots error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
