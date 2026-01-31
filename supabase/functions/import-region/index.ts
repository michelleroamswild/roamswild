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
  importPublicLands?: boolean;
  importRoads?: boolean;
  deriveSpots?: boolean;
}

interface ImportResult {
  publicLandsImported: number;
  roadsImported: number;
  osmRoadsImported: number;
  osmCampSitesImported: number;
  spotsDerive: number;
  blmSpotsDerive: number;
  errors: string[];
}

// ============================================
// API Endpoints
// ============================================

// USA Federal Lands (more reliable than BLM-specific endpoint)
const FEDERAL_LANDS_URL = "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Federal_Lands/FeatureServer/0/query";

// USFS MVUM roads (Motor Vehicle Use Map)
const MVUM_URL = "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_01/MapServer/1/query";

// PAD-US (Protected Areas Database) - backup for state lands
const PADUS_URL = "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Protected_Areas/FeatureServer/0/query";

// Overpass API endpoints for OSM data (with fallback)
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================
// Helper Functions
// ============================================

function boundsToEnvelope(bounds: RegionBounds): string {
  // Simple comma-separated bbox format: west,south,east,north
  return `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`;
}

function arcgisToPostGISPolygon(rings: number[][][]): string {
  // Convert ArcGIS polygon rings to WKT MULTIPOLYGON
  const polygons = rings.map(ring => {
    const coords = ring.map(([lng, lat]) => `${lng} ${lat}`).join(', ');
    return `((${coords}))`;
  });
  return `MULTIPOLYGON(${polygons.join(', ')})`;
}

function arcgisToPostGISLine(paths: number[][][]): string {
  // Convert ArcGIS polyline to WKT LINESTRING (just first path for simplicity)
  if (!paths || paths.length === 0 || paths[0].length === 0) return '';
  const coords = paths[0].map(([lng, lat]) => `${lng} ${lat}`).join(', ');
  return `LINESTRING(${coords})`;
}

// ============================================
// Import Functions
// ============================================

async function importPublicLands(
  supabase: any,
  bounds: RegionBounds
): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  let count = 0;

  // Fetch Federal Lands (BLM, USFS, NPS, etc.)
  try {
    // Build envelope as JSON for ArcGIS
    const envelope = JSON.stringify({
      xmin: bounds.west,
      ymin: bounds.south,
      xmax: bounds.east,
      ymax: bounds.north,
      spatialReference: { wkid: 4326 }
    });

    const params = new URLSearchParams({
      where: "1=1",
      geometry: envelope,
      geometryType: "esriGeometryEnvelope",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "OBJECTID,Agency,unit_name,Shape__Area",
      returnGeometry: "true",
      outSR: "4326",
      f: "json",
      resultRecordCount: "500"
    });

    const url = `${FEDERAL_LANDS_URL}?${params}`;
    console.log(`Fetching Federal lands from: ${url.substring(0, 200)}...`);
    const response = await fetch(url);

    if (!response.ok) {
      const text = await response.text();
      errors.push(`Federal Lands API error: ${response.status} - ${text.substring(0, 200)}`);
    } else {
      const data = await response.json();
      console.log(`Got ${data.features?.length || 0} Federal Land features`);

      if (data.error) {
        errors.push(`Federal Lands API returned error: ${JSON.stringify(data.error)}`);
        return { count, errors };
      }

      for (const feature of data.features || []) {
        try {
          const attrs = feature.attributes;
          const geom = feature.geometry;

          if (!geom?.rings || geom.rings.length === 0) continue;

          const wktPolygon = arcgisToPostGISPolygon(geom.rings);

          // Determine agency from Agency field
          const agencyName = attrs.Agency || '';
          let agency = 'FED';
          let sourceType: string = 'pad_us';
          if (agencyName.includes('Bureau of Land Management') || agencyName === 'BLM') {
            agency = 'BLM';
            sourceType = 'blm_sma';
          } else if (agencyName.includes('Forest Service') || agencyName === 'USFS') {
            agency = 'USFS';
            sourceType = 'usfs';
          } else if (agencyName.includes('Park Service') || agencyName === 'NPS') {
            agency = 'NPS';
          } else if (agencyName.includes('Fish and Wildlife') || agencyName === 'FWS') {
            agency = 'FWS';
          }

          // NPS generally doesn't allow dispersed camping
          const dispersedAllowed = agency !== 'NPS';

          // Convert Shape__Area (square meters) to acres
          const areaAcres = attrs.Shape__Area ? attrs.Shape__Area / 4046.86 : null;
          const externalId = `fed_${attrs.OBJECTID}`;

          // Check if already exists
          const { data: existing } = await supabase
            .from('public_lands')
            .select('id')
            .eq('external_id', externalId)
            .single();

          if (existing) {
            // Already exists, skip
            continue;
          }

          // Insert new record - use raw SQL via rpc for PostGIS geometry
          const { error } = await supabase.rpc('insert_public_land_simple', {
            p_external_id: externalId,
            p_source_type: sourceType,
            p_name: attrs.unit_name || 'Federal Land',
            p_managing_agency: agency,
            p_land_type: agencyName,
            p_boundary_wkt: wktPolygon,
            p_area_acres: areaAcres,
            p_dispersed_camping_allowed: dispersedAllowed
          });

          if (error) {
            console.error(`Error inserting Federal land: ${error.message}`);
            errors.push(`Insert error (${externalId}): ${error.message}`);
          } else {
            count++;
            console.log(`Inserted: ${attrs.unit_name} (${agency})`);
          }
        } catch (e: any) {
          errors.push(`Federal land feature error: ${e.message}`);
        }
      }
    }
  } catch (e: any) {
    errors.push(`Federal Lands fetch error: ${e.message}`);
  }

  // Fetch PAD-US lands (state lands and additional federal)
  try {
    // Build envelope as JSON for ArcGIS
    const envelope = JSON.stringify({
      xmin: bounds.west,
      ymin: bounds.south,
      xmax: bounds.east,
      ymax: bounds.north,
      spatialReference: { wkid: 4326 }
    });

    const params = new URLSearchParams({
      where: "Mang_Type = 'STAT'",  // Focus on state lands (federal covered above)
      geometry: envelope,
      geometryType: "esriGeometryEnvelope",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "OBJECTID,Unit_Nm,Mang_Name,Mang_Type,GIS_Acres,d_Des_Tp",
      returnGeometry: "true",
      outSR: "4326",
      f: "json",
      resultRecordCount: "500"
    });

    console.log(`Fetching PAD-US lands...`);
    const response = await fetch(`${PADUS_URL}?${params}`);

    if (!response.ok) {
      errors.push(`PAD-US API error: ${response.status}`);
    } else {
      const data = await response.json();
      console.log(`Got ${data.features?.length || 0} PAD-US features`);

      for (const feature of data.features || []) {
        try {
          const attrs = feature.attributes;
          const geom = feature.geometry;

          if (!geom?.rings || geom.rings.length === 0) continue;

          const wktPolygon = arcgisToPostGISPolygon(geom.rings);
          const agency = attrs.Mang_Name?.includes('Forest Service') ? 'USFS'
            : attrs.Mang_Name?.includes('Park Service') ? 'NPS'
            : attrs.Mang_Name?.includes('Fish and Wildlife') ? 'FWS'
            : attrs.Mang_Type === 'STAT' ? 'STATE'
            : 'FED';

          // NPS and some state parks don't allow dispersed camping
          const dispersedAllowed = !['NPS', 'STATE'].includes(agency);

          const { error } = await supabase.rpc('insert_public_land', {
            p_external_id: `padus_${attrs.OBJECTID}`,
            p_source_type: 'pad_us',
            p_name: attrs.Unit_Nm || attrs.Mang_Name || 'Protected Area',
            p_managing_agency: agency,
            p_land_type: attrs.d_Des_Tp || 'protected',
            p_boundary_wkt: wktPolygon,
            p_area_acres: attrs.GIS_Acres,
            p_dispersed_camping_allowed: dispersedAllowed
          });

          if (error) {
            console.error(`Error inserting PAD-US land: ${error.message}`);
          } else {
            count++;
          }
        } catch (e) {
          errors.push(`PAD-US feature error: ${e.message}`);
        }
      }
    }
  } catch (e) {
    errors.push(`PAD-US fetch error: ${e.message}`);
  }

  return { count, errors };
}

async function importRoads(
  supabase: any,
  bounds: RegionBounds
): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  let count = 0;

  // Fetch MVUM roads
  try {
    // MVUM API prefers simple bbox format: west,south,east,north with inSR
    const bbox = `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`;

    // Build URL manually - MVUM API needs unencoded commas
    const url = `${MVUM_URL}?where=1=1&geometry=${bbox}&geometryType=esriGeometryEnvelope&spatialRel=esriSpatialRelIntersects&inSR=4326&outFields=OBJECTID,NAME,SURFACE_TYPE,HIGH_CLEARANCE_VEHICLE,PASSENGER_VEHICLE&returnGeometry=true&outSR=4326&f=json&resultRecordCount=500`;

    console.log(`Fetching MVUM roads...`);
    const response = await fetch(url);

    if (!response.ok) {
      const text = await response.text();
      errors.push(`MVUM API error: ${response.status} - ${text.substring(0, 200)}`);
    } else {
      const data = await response.json();
      console.log(`Got ${data.features?.length || 0} MVUM features`);

      if (data.error) {
        errors.push(`MVUM API returned error: ${JSON.stringify(data.error)}, URL was: ${url.substring(0, 300)}`);
        return { count, errors };
      }

      for (const feature of data.features || []) {
        try {
          const attrs = feature.attributes;
          const geom = feature.geometry;

          if (!geom?.paths || geom.paths.length === 0) continue;

          const wktLine = arcgisToPostGISLine(geom.paths);
          if (!wktLine) continue;

          // Determine vehicle access level
          let vehicleAccess = 'high_clearance';
          if (attrs.PASSENGER_VEHICLE === 'OPEN') {
            vehicleAccess = 'passenger';
          } else if (attrs.HIGH_CLEARANCE_VEHICLE === 'OPEN') {
            vehicleAccess = 'high_clearance';
          } else {
            vehicleAccess = '4wd';
          }

          const externalId = `mvum_${attrs.OBJECTID}`;

          // Check if already exists
          const { data: existing } = await supabase
            .from('road_segments')
            .select('id')
            .eq('external_id', externalId)
            .single();

          if (existing) {
            // Already exists, skip
            continue;
          }

          console.log(`Inserting road: ${externalId} - ${attrs.NAME || 'Unnamed'}`);
          const { data: insertedId, error } = await supabase.rpc('insert_road_segment_simple', {
            p_external_id: externalId,
            p_source_type: 'mvum',
            p_geometry_wkt: wktLine,
            p_name: attrs.NAME,
            p_surface_type: attrs.SURFACE_TYPE,
            p_vehicle_access: vehicleAccess,
            p_seasonal_closure: attrs.SEASONAL
          });

          if (error) {
            console.error(`Error inserting road ${externalId}: ${error.message}`);
            errors.push(`Road insert error (${externalId}): ${error.message}`);
          } else {
            count++;
            console.log(`Inserted road: ${attrs.NAME || 'Unnamed'}`);
          }
        } catch (e: any) {
          errors.push(`MVUM feature error: ${e.message}`);
        }
      }
    }
  } catch (e) {
    errors.push(`MVUM fetch error: ${e.message}`);
  }

  return { count, errors };
}

async function importOSMRoads(
  supabase: any,
  bounds: RegionBounds
): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  let count = 0;

  // Build Overpass query for tracks and unpaved roads
  const query = `
    [out:json][timeout:60];
    (
      way["highway"="track"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
      way["highway"="unclassified"]["surface"~"unpaved|gravel|dirt|ground|sand"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
      way["4wd_only"="yes"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
    );
    out geom;
  `;

  // Try each Overpass endpoint until one succeeds
  let osmData: any = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      console.log(`Fetching OSM roads from ${endpoint}...`);
      const response = await fetch(endpoint, {
        method: "POST",
        body: `data=${encodeURIComponent(query)}`,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });

      if (response.ok) {
        osmData = await response.json();
        console.log(`Got ${osmData.elements?.length || 0} OSM road features`);
        break;
      } else {
        console.warn(`Overpass ${endpoint} returned ${response.status}`);
      }
    } catch (e: any) {
      console.warn(`Overpass ${endpoint} failed: ${e.message}`);
    }
  }

  if (!osmData || !osmData.elements) {
    errors.push("All Overpass endpoints failed");
    return { count, errors };
  }

  // Process OSM ways
  for (const element of osmData.elements) {
    if (element.type !== "way" || !element.geometry || element.geometry.length < 2) {
      continue;
    }

    try {
      // Skip private roads
      const access = element.tags?.access;
      if (access === "private" || access === "no" || access === "customers") {
        continue;
      }

      // Convert geometry to WKT LINESTRING
      const coords = element.geometry.map((n: any) => `${n.lon} ${n.lat}`).join(", ");
      const wktLine = `LINESTRING(${coords})`;

      // Determine vehicle access level
      let vehicleAccess = "high_clearance";
      const tracktype = element.tags?.tracktype;
      const fourWd = element.tags?.["4wd_only"];
      const surface = element.tags?.surface;

      if (fourWd === "yes") {
        vehicleAccess = "4wd";
      } else if (tracktype === "grade1") {
        vehicleAccess = "passenger";
      } else if (tracktype === "grade5" || tracktype === "grade4") {
        vehicleAccess = "4wd";
      } else if (surface && ["sand", "mud", "rock"].some(s => surface.includes(s))) {
        vehicleAccess = "4wd";
      }

      const externalId = `osm_${element.id}`;

      // Check if already exists
      const { data: existing } = await supabase
        .from("road_segments")
        .select("id")
        .eq("external_id", externalId)
        .single();

      if (existing) {
        continue;
      }

      // Insert road segment
      const { error } = await supabase.rpc("insert_road_segment_simple", {
        p_external_id: externalId,
        p_source_type: "osm",
        p_geometry_wkt: wktLine,
        p_name: element.tags?.name || null,
        p_surface_type: surface || null,
        p_vehicle_access: vehicleAccess,
        p_seasonal_closure: null,
      });

      if (error) {
        // Don't log every error, just count them
        if (count === 0) {
          console.error(`First OSM road insert error: ${error.message}`);
        }
      } else {
        count++;
      }
    } catch (e: any) {
      // Skip individual feature errors silently
    }
  }

  console.log(`Inserted ${count} OSM road segments`);
  return { count, errors };
}

async function importOSMCampSites(
  supabase: any,
  bounds: RegionBounds
): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  let count = 0;

  // Build Overpass query for camp sites
  const query = `
    [out:json][timeout:60];
    (
      node["tourism"="camp_site"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
      node["tourism"="camp_pitch"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
      node["camp_site"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
      node["camp_type"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
      node["leisure"="firepit"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
      way["tourism"="camp_site"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
    );
    out center;
  `;

  // Try each Overpass endpoint
  let osmData: any = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      console.log(`Fetching OSM camp sites from ${endpoint}...`);
      const response = await fetch(endpoint, {
        method: "POST",
        body: `data=${encodeURIComponent(query)}`,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });

      if (response.ok) {
        osmData = await response.json();
        console.log(`Got ${osmData.elements?.length || 0} OSM camp site features`);
        break;
      }
    } catch (e: any) {
      console.warn(`Overpass ${endpoint} failed: ${e.message}`);
    }
  }

  if (!osmData || !osmData.elements) {
    errors.push("Failed to fetch OSM camp sites");
    return { count, errors };
  }

  // Process camp sites
  for (const element of osmData.elements) {
    try {
      // Get coordinates (nodes have lat/lon directly, ways have center)
      const lat = element.lat || element.center?.lat;
      const lon = element.lon || element.center?.lon;
      if (!lat || !lon) continue;

      const tags = element.tags || {};
      const name = tags.name || "Camp Site";
      const osmId = element.id;

      // Check if already exists (by osm_camp_site_id)
      const { data: existing } = await supabase
        .from("potential_spots")
        .select("id")
        .eq("osm_camp_site_id", osmId)
        .single();

      if (existing) continue;

      // Determine confidence score
      let score = 40; // Base for known camp site
      const reasons: string[] = ["Known camp site from OSM"];

      if (tags.fee === "no" || tags.backcountry === "yes") {
        score += 5;
        reasons.push("Free/backcountry camping");
      }
      if (tags.name) {
        score += 5;
        reasons.push("Named location");
      }

      // Insert using RPC function (handles PostGIS geometry)
      const vehicleAccess = tags["4wd_only"] === "yes" ? "4wd" : "high_clearance";
      const { error } = await supabase.rpc("insert_osm_camp_site", {
        p_lat: lat,
        p_lng: lon,
        p_name: name,
        p_osm_id: osmId,
        p_score: score,
        p_reasons: reasons,
        p_vehicle_access: vehicleAccess,
      });

      if (error) {
        if (!error.message.includes("duplicate")) {
          console.error(`Error inserting camp site: ${error.message}`);
        }
      } else {
        count++;
      }
    } catch (e: any) {
      // Skip individual errors
    }
  }

  console.log(`Inserted ${count} OSM camp sites`);
  return { count, errors };
}

async function deriveSpots(supabase: any, bounds: RegionBounds): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];

  try {
    // Call the PostgreSQL function to derive dead-end spots
    const { data, error } = await supabase.rpc('derive_dead_end_spots', {
      p_north: bounds.north,
      p_south: bounds.south,
      p_east: bounds.east,
      p_west: bounds.west
    });

    if (error) {
      errors.push(`Derive spots error: ${error.message}`);
      return { count: 0, errors };
    }

    return { count: data || 0, errors };
  } catch (e) {
    errors.push(`Derive spots exception: ${e.message}`);
    return { count: 0, errors };
  }
}

// ============================================
// Main Handler
// ============================================

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request
    const body: ImportRequest = await req.json();
    const { regionName, bounds, importPublicLands: doLands = true, importRoads: doRoads = true, deriveSpots: doDerive = true } = body;

    if (!bounds || bounds.north === undefined || bounds.south === undefined) {
      return new Response(
        JSON.stringify({ error: "bounds required with north, south, east, west" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Starting import for region: ${regionName}`);
    console.log(`Bounds: N=${bounds.north}, S=${bounds.south}, E=${bounds.east}, W=${bounds.west}`);

    const result: ImportResult = {
      publicLandsImported: 0,
      roadsImported: 0,
      osmRoadsImported: 0,
      osmCampSitesImported: 0,
      spotsDerive: 0,
      blmSpotsDerive: 0,
      errors: []
    };

    // Import public lands
    if (doLands) {
      console.log("Importing public lands...");
      const landsResult = await importPublicLands(supabase, bounds);
      result.publicLandsImported = landsResult.count;
      result.errors.push(...landsResult.errors);
    }

    // Import MVUM roads (Forest Service)
    if (doRoads) {
      console.log("Importing MVUM roads...");
      const roadsResult = await importRoads(supabase, bounds);
      result.roadsImported = roadsResult.count;
      result.errors.push(...roadsResult.errors);

      // Also import OSM roads (for BLM land coverage)
      console.log("Importing OSM roads...");
      const osmRoadsResult = await importOSMRoads(supabase, bounds);
      result.osmRoadsImported = osmRoadsResult.count;
      result.errors.push(...osmRoadsResult.errors);
    }

    // Import OSM camp sites (known camping locations)
    if (doDerive) {
      console.log("Importing OSM camp sites...");
      const campSitesResult = await importOSMCampSites(supabase, bounds);
      result.osmCampSitesImported = campSitesResult.count;
      result.errors.push(...campSitesResult.errors);
    }

    // Always backfill public_land_id for roads when deriving spots
    // This catches roads imported in previous runs that didn't get linked
    if (doDerive) {
      console.log("Backfilling public_land_id for roads...");
      const { data: backfillCount, error: backfillError } = await supabase.rpc("backfill_road_public_lands", {
        p_north: bounds.north,
        p_south: bounds.south,
        p_east: bounds.east,
        p_west: bounds.west,
      });
      if (backfillError) {
        result.errors.push(`Backfill error: ${backfillError.message}`);
      } else {
        console.log(`Backfilled ${backfillCount} roads with public_land_id`);
      }
    }

    // Derive spots from road dead-ends (MVUM/USFS roads and BLM/OSM roads)
    if (doDerive) {
      // Use the simpler/faster derive function that leverages pre-backfilled public_land_id
      console.log("Deriving spots from all roads with public_land_id...");
      const { data: allSpotsCount, error: allSpotsError } = await supabase.rpc("derive_spots_from_linked_roads", {
        p_north: bounds.north,
        p_south: bounds.south,
        p_east: bounds.east,
        p_west: bounds.west,
      });
      if (allSpotsError) {
        // Fall back to original functions if new one doesn't exist
        console.log("Falling back to original derive functions...");

        console.log("Deriving USFS spots from dead-ends...");
        const deriveResult = await deriveSpots(supabase, bounds);
        result.spotsDerive = deriveResult.count;
        result.errors.push(...deriveResult.errors);

        console.log("Deriving BLM spots from OSM roads...");
        const { data: blmCount, error: blmError } = await supabase.rpc("derive_blm_spots", {
          p_north: bounds.north,
          p_south: bounds.south,
          p_east: bounds.east,
          p_west: bounds.west,
        });
        if (blmError) {
          result.errors.push(`BLM derive error: ${blmError.message}`);
        } else {
          result.blmSpotsDerive = blmCount || 0;
        }
      } else {
        result.spotsDerive = allSpotsCount || 0;
        console.log(`Derived ${allSpotsCount} spots from linked roads`);
      }
    }

    console.log(`Import complete: ${result.publicLandsImported} lands, ${result.roadsImported} MVUM roads, ${result.osmRoadsImported} OSM roads, ${result.osmCampSitesImported} camp sites, ${result.spotsDerive} derived spots`);

    return new Response(
      JSON.stringify({
        success: true,
        regionName,
        result
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Import error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
