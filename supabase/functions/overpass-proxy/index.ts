import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Multiple Overpass API endpoints for fallback
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// OSM feature types we care about for photography
interface PhotoFeature {
  id: number;
  type: 'node' | 'way' | 'relation';
  lat: number;
  lng: number;
  name: string | null;
  featureType: string;
  subType: string | null;
  elevation: number | null;
  direction: number | null;  // Viewing direction for viewpoints
  tags: Record<string, string>;
}

// Parse direction tag (can be degrees, cardinal, or range like "90-180")
function parseDirection(dirStr: string | undefined): number | null {
  if (!dirStr) return null;

  // Try parsing as number (degrees)
  const deg = parseFloat(dirStr);
  if (!isNaN(deg)) return deg;

  // Cardinal directions
  const cardinals: Record<string, number> = {
    'N': 0, 'NNE': 22.5, 'NE': 45, 'ENE': 67.5,
    'E': 90, 'ESE': 112.5, 'SE': 135, 'SSE': 157.5,
    'S': 180, 'SSW': 202.5, 'SW': 225, 'WSW': 247.5,
    'W': 270, 'WNW': 292.5, 'NW': 315, 'NNW': 337.5,
  };

  const upper = dirStr.toUpperCase();
  if (cardinals[upper] !== undefined) return cardinals[upper];

  // Range like "90-180" - return midpoint
  const rangeMatch = dirStr.match(/(\d+)-(\d+)/);
  if (rangeMatch) {
    const start = parseFloat(rangeMatch[1]);
    const end = parseFloat(rangeMatch[2]);
    return (start + end) / 2;
  }

  return null;
}

// Calculate centroid of a way (for lakes, etc.)
function calculateCentroid(nodes: Array<{ lat: number; lon: number }>): { lat: number; lng: number } {
  if (nodes.length === 0) return { lat: 0, lng: 0 };

  let latSum = 0;
  let lngSum = 0;
  for (const node of nodes) {
    latSum += node.lat;
    lngSum += node.lon;
  }

  return {
    lat: latSum / nodes.length,
    lng: lngSum / nodes.length,
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const lat = url.searchParams.get("lat");
    const lng = url.searchParams.get("lng");
    const radiusKm = parseFloat(url.searchParams.get("radius") || "15");

    if (!lat || !lng) {
      return new Response(
        JSON.stringify({ error: "lat and lng parameters required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const radiusM = radiusKm * 1000;

    // Overpass QL query for photography-relevant features
    // Includes: viewpoints, peaks, water, geological features, cliffs, rock formations
    const query = `[out:json][timeout:30];(` +
      // Viewpoints and observation points
      `node["tourism"="viewpoint"]["access"!~"private|no"](around:${radiusM},${lat},${lng});` +
      `node["man_made"="observation_tower"]["access"!~"private|no"](around:${radiusM},${lat},${lng});` +
      // Peaks and summits
      `node["natural"="peak"](around:${radiusM},${lat},${lng});` +
      `node["natural"="saddle"](around:${radiusM},${lat},${lng});` +
      // Cliffs and rock formations (key for dramatic photos)
      `node["natural"="cliff"](around:${radiusM},${lat},${lng});` +
      `way["natural"="cliff"](around:${radiusM},${lat},${lng});` +
      `node["natural"="rock"](around:${radiusM},${lat},${lng});` +
      `node["natural"="stone"](around:${radiusM},${lat},${lng});` +
      `node["natural"="boulder"](around:${radiusM},${lat},${lng});` +
      // Geological features (hoodoos, tors, outcrops, etc.)
      `node["geological"](around:${radiusM},${lat},${lng});` +
      `way["geological"](around:${radiusM},${lat},${lng});` +
      `node["natural"="ridge"](around:${radiusM},${lat},${lng});` +
      `way["natural"="ridge"](around:${radiusM},${lat},${lng});` +
      `way["natural"="arete"](around:${radiusM},${lat},${lng});` +
      // Canyons, gorges, valleys
      `node["natural"="valley"](around:${radiusM},${lat},${lng});` +
      `node["natural"="gorge"](around:${radiusM},${lat},${lng});` +
      `way["natural"="gorge"](around:${radiusM},${lat},${lng});` +
      `node["natural"="canyon"](around:${radiusM},${lat},${lng});` +
      // Arches and caves
      `node["natural"="arch"](around:${radiusM},${lat},${lng});` +
      `node["natural"="cave_entrance"](around:${radiusM},${lat},${lng});` +
      // Water features
      `way["natural"="water"]["water"="lake"]["access"!~"private|no"](around:${radiusM},${lat},${lng});` +
      `way["natural"="water"]["water"="reservoir"]["access"!~"private|no"](around:${radiusM},${lat},${lng});` +
      `way["natural"="water"]["water"="pond"]["name"]["access"!~"private|no"](around:${radiusM},${lat},${lng});` +
      `way["natural"="beach"]["access"!~"private|no"](around:${radiusM},${lat},${lng});` +
      `node["natural"="beach"]["access"!~"private|no"](around:${radiusM},${lat},${lng});` +
      // Waterfalls and rapids
      `node["waterway"="waterfall"](around:${radiusM},${lat},${lng});` +
      `node["waterway"="rapids"](around:${radiusM},${lat},${lng});` +
      // Lighthouses and landmarks
      `node["man_made"="lighthouse"](around:${radiusM},${lat},${lng});` +
      `node["tourism"="attraction"]["access"!~"private|no"](around:${radiusM},${lat},${lng});` +
      // Historic ruins (great subjects)
      `node["historic"="ruins"](around:${radiusM},${lat},${lng});` +
      `way["historic"="ruins"](around:${radiusM},${lat},${lng});` +
      `);out body;>;out skel qt;`;

    // Try each endpoint until one works
    let data: any = null;
    let lastError: string = '';

    console.log(`Fetching features for ${lat}, ${lng} with radius ${radiusKm}km`);

    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        console.log(`Trying endpoint: ${endpoint}`);
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `data=${encodeURIComponent(query)}`,
        });

        console.log(`Response status: ${response.status}`);

        if (response.ok) {
          data = await response.json();
          console.log(`Success! Got ${data.elements?.length || 0} elements`);
          break;
        } else {
          const errorText = await response.text();
          lastError = `${endpoint}: ${response.status} - ${errorText.substring(0, 200)}`;
          console.log(`Failed: ${lastError}`);
        }
      } catch (e) {
        lastError = `${endpoint}: ${e.message}`;
        console.log(`Error: ${lastError}`);
      }
    }

    if (!data) {
      throw new Error(`All Overpass endpoints failed. Last error: ${lastError}`);
    }

    // Build a map of node IDs to coordinates for resolving way geometries
    const nodeMap = new Map<number, { lat: number; lon: number }>();
    for (const element of data.elements) {
      if (element.type === 'node' && element.lat !== undefined) {
        nodeMap.set(element.id, { lat: element.lat, lon: element.lon });
      }
    }

    // Process elements into PhotoFeatures
    const features: PhotoFeature[] = [];
    const seenIds = new Set<string>();

    for (const element of data.elements) {
      const uniqueId = `${element.type}-${element.id}`;
      if (seenIds.has(uniqueId)) continue;

      const tags = element.tags || {};

      // Determine feature type and subtype
      let featureType = '';
      let subType: string | null = null;

      if (tags.tourism === 'viewpoint') {
        featureType = 'viewpoint';
      } else if (tags.natural === 'peak') {
        featureType = 'peak';
      } else if (tags.natural === 'saddle') {
        featureType = 'saddle';
      } else if (tags.natural === 'water') {
        featureType = 'water';
        subType = tags.water || null;
      } else if (tags.natural === 'beach') {
        featureType = 'beach';
      } else if (tags.natural === 'cliff') {
        featureType = 'cliff';
      } else if (tags.natural === 'arch') {
        featureType = 'arch';
      } else if (tags.natural === 'rock' || tags.natural === 'stone' || tags.natural === 'boulder') {
        featureType = 'rock_formation';
        subType = tags.natural;
      } else if (tags.geological) {
        featureType = 'geological';
        subType = tags.geological;
      } else if (tags.natural === 'ridge' || tags.natural === 'arete') {
        featureType = 'ridge';
        subType = tags.natural;
      } else if (tags.natural === 'valley' || tags.natural === 'gorge' || tags.natural === 'canyon') {
        featureType = 'canyon';
        subType = tags.natural;
      } else if (tags.natural === 'cave_entrance') {
        featureType = 'cave';
      } else if (tags.historic === 'ruins') {
        featureType = 'ruins';
      } else if (tags.man_made === 'lighthouse') {
        featureType = 'lighthouse';
      } else if (tags.waterway === 'waterfall') {
        featureType = 'waterfall';
      } else if (tags.waterway === 'rapids') {
        featureType = 'rapids';
      } else if (tags.tourism === 'attraction') {
        featureType = 'attraction';
      } else if (tags.man_made === 'observation_tower' || tags['tower:type'] === 'observation') {
        featureType = 'observation_tower';
      } else {
        // Skip elements without relevant tags (like bare nodes from way resolution)
        continue;
      }

      // Get coordinates
      let lat: number;
      let lng: number;

      if (element.type === 'node') {
        if (element.lat === undefined) continue;
        lat = element.lat;
        lng = element.lon;
      } else if (element.type === 'way' && element.nodes) {
        // Calculate centroid from way nodes
        const wayNodes = element.nodes
          .map((nid: number) => nodeMap.get(nid))
          .filter((n: any) => n !== undefined);
        if (wayNodes.length === 0) continue;
        const centroid = calculateCentroid(wayNodes);
        lat = centroid.lat;
        lng = centroid.lng;
      } else {
        continue;
      }

      seenIds.add(uniqueId);

      features.push({
        id: element.id,
        type: element.type,
        lat,
        lng,
        name: tags.name || tags['name:en'] || null,
        featureType,
        subType,
        elevation: tags.ele ? parseFloat(tags.ele) : null,
        direction: parseDirection(tags.direction),
        tags,
      });
    }

    return new Response(JSON.stringify({
      features,
      query: {
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        radiusKm,
      },
      count: features.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
