import { useState, useEffect } from 'react';

// USFS MVUM Road from the API
export interface MVUMRoad {
  id: string;
  name: string;
  surfaceType: string;
  highClearanceVehicle: boolean;
  passengerVehicle: boolean;
  atv: boolean;
  motorcycle: boolean;
  seasonal: string;
  operationalMaintLevel: string;
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
}

// OSM Track from Overpass API
export interface OSMTrack {
  id: number;
  name?: string;
  highway: string;
  surface?: string;
  tracktype?: string;
  access?: string;
  fourWdOnly?: boolean;
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
}

// Potential dispersed camping spot
export interface PotentialSpot {
  id: string;
  lat: number;
  lng: number;
  name: string;
  type: 'dead-end' | 'camp-site' | 'intersection' | 'water-access';
  score: number;
  reasons: string[];
  source: 'mvum' | 'osm' | 'derived';
  roadName?: string;
  nearWater?: boolean;
  highClearance?: boolean;
}

// Water feature from OSM
export interface WaterFeature {
  id: number;
  name?: string;
  type: string; // stream, river, lake, pond
  lat: number;
  lng: number;
}

export interface DispersedRoadsResult {
  mvumRoads: MVUMRoad[];
  osmTracks: OSMTrack[];
  potentialSpots: PotentialSpot[];
  waterFeatures: WaterFeature[];
  loading: boolean;
  error: string | null;
}

const USFS_MVUM_API = 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_01/MapServer/1/query';
// Multiple Overpass endpoints for redundancy
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

/**
 * Calculate distance between two points in miles
 */
function getDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Check if a point is near any water feature
 */
function isNearWater(lat: number, lng: number, waterFeatures: WaterFeature[], thresholdMiles: number = 0.5): boolean {
  return waterFeatures.some(w => getDistanceMiles(lat, lng, w.lat, w.lng) < thresholdMiles);
}

/**
 * Find dead-end points from road geometries
 */
interface EndpointInfo {
  lat: number;
  lng: number;
  count: number;
  roads: string[];
  isPublicLand: boolean; // At least one road is on public land
  isHighClearance: boolean;
}

/**
 * Check if a point is within any public land boundary
 */
function isWithinPublicLand(lat: number, lng: number, publicLands: PublicLandArea[]): boolean {
  return publicLands.some(land =>
    lat >= land.bounds.minLat &&
    lat <= land.bounds.maxLat &&
    lng >= land.bounds.minLng &&
    lng <= land.bounds.maxLng
  );
}

/**
 * Check if an OSM track is likely on public land (not a suburban cul-de-sac)
 * We err on the side of inclusion - the visual polygon overlay helps users verify
 */
function isLikelyPublicLand(track: OSMTrack): boolean {
  // Definitely exclude if marked private
  if (track.access === 'private' || track.access === 'no') return false;

  // Definitely include if marked for off-road/backcountry use
  if (track.fourWdOnly) return true;
  if (track.tracktype) return true; // Any grade indicates real track
  if (track.highway === 'track') return true;
  if (track.access === 'yes' || track.access === 'permissive') return true;

  // Surface types that suggest backcountry
  const backcountrySurfaces = ['unpaved', 'gravel', 'dirt', 'ground', 'sand', 'mud', 'grass'];
  if (track.surface && backcountrySurfaces.some(s => track.surface?.includes(s))) return true;

  // For unclassified roads, include them by default
  // In remote areas these are often public forest/BLM roads
  // The visual polygon overlay helps users verify they're on public land
  if (track.highway === 'unclassified') return true;

  // Default to true - our query already filters for tracks/unpaved roads
  // so anything that made it through the query is likely backcountry
  return true;
}

function findDeadEnds(
  mvumRoads: MVUMRoad[],
  osmTracks: OSMTrack[],
  waterFeatures: WaterFeature[],
  publicLands: PublicLandArea[]
): PotentialSpot[] {
  const spots: PotentialSpot[] = [];

  // Collect all endpoints from all roads
  const endpointMap = new Map<string, EndpointInfo>();

  // Process MVUM roads - these are always on public land (National Forest)
  mvumRoads.forEach(road => {
    if (!road.geometry?.coordinates?.length) return;
    const coords = road.geometry.coordinates;

    // Start point
    const startKey = `${coords[0][1].toFixed(4)},${coords[0][0].toFixed(4)}`;
    const startEntry = endpointMap.get(startKey) || {
      lat: coords[0][1], lng: coords[0][0], count: 0, roads: [],
      isPublicLand: false, isHighClearance: false
    };
    startEntry.count++;
    startEntry.roads.push(road.name);
    startEntry.isPublicLand = true; // MVUM = public land
    startEntry.isHighClearance = startEntry.isHighClearance || road.highClearanceVehicle;
    endpointMap.set(startKey, startEntry);

    // End point
    const endCoord = coords[coords.length - 1];
    const endKey = `${endCoord[1].toFixed(4)},${endCoord[0].toFixed(4)}`;
    const endEntry = endpointMap.get(endKey) || {
      lat: endCoord[1], lng: endCoord[0], count: 0, roads: [],
      isPublicLand: false, isHighClearance: false
    };
    endEntry.count++;
    endEntry.roads.push(road.name);
    endEntry.isPublicLand = true; // MVUM = public land
    endEntry.isHighClearance = endEntry.isHighClearance || road.highClearanceVehicle;
    endpointMap.set(endKey, endEntry);
  });

  // Process OSM tracks - check if they're likely on public land
  osmTracks.forEach(track => {
    if (!track.geometry?.coordinates?.length) return;

    const likelyPublic = isLikelyPublicLand(track);
    const coords = track.geometry.coordinates;

    // Start point
    const startKey = `${coords[0][1].toFixed(4)},${coords[0][0].toFixed(4)}`;
    const startEntry = endpointMap.get(startKey) || {
      lat: coords[0][1], lng: coords[0][0], count: 0, roads: [],
      isPublicLand: false, isHighClearance: false
    };
    startEntry.count++;
    startEntry.roads.push(track.name || 'Unnamed Track');
    startEntry.isPublicLand = startEntry.isPublicLand || likelyPublic;
    startEntry.isHighClearance = startEntry.isHighClearance || track.fourWdOnly;
    endpointMap.set(startKey, startEntry);

    // End point
    const endCoord = coords[coords.length - 1];
    const endKey = `${endCoord[1].toFixed(4)},${endCoord[0].toFixed(4)}`;
    const endEntry = endpointMap.get(endKey) || {
      lat: endCoord[1], lng: endCoord[0], count: 0, roads: [],
      isPublicLand: false, isHighClearance: false
    };
    endEntry.count++;
    endEntry.roads.push(track.name || 'Unnamed Track');
    endEntry.isPublicLand = endEntry.isPublicLand || likelyPublic;
    endEntry.isHighClearance = endEntry.isHighClearance || track.fourWdOnly;
    endpointMap.set(endKey, endEntry);
  });

  // Debug: log endpoint distribution
  const countDistribution: Record<number, number> = {};
  let publicLandCount = 0;
  endpointMap.forEach((entry) => {
    countDistribution[entry.count] = (countDistribution[entry.count] || 0) + 1;
    if (entry.isPublicLand) publicLandCount++;
  });
  console.log('Endpoint count distribution:', countDistribution, 'Public land endpoints:', publicLandCount);

  // Find dead-ends (endpoints that only appear once = true dead end)
  // and intersections (endpoints that appear 3+ times)
  // ONLY include spots that are on public land
  endpointMap.forEach((entry, key) => {
    // Check if within OSM public land boundaries (additional check)
    const withinPublicLandBoundary = isWithinPublicLand(entry.lat, entry.lng, publicLands);

    // Skip if not on public land (either from road characteristics OR boundary check)
    if (!entry.isPublicLand && !withinPublicLandBoundary) return;

    const nearWater = isNearWater(entry.lat, entry.lng, waterFeatures);

    if (entry.count === 1) {
      // Dead end - road terminus
      let score = 25; // Base score for dead end
      const reasons: string[] = ['Road terminus (dead-end)', 'On public land'];

      if (nearWater) {
        score += 15;
        reasons.push('Near water');
      }

      if (entry.isHighClearance) {
        score += 10;
        reasons.push('High clearance road');
      }

      spots.push({
        id: `deadend-${key}`,
        lat: entry.lat,
        lng: entry.lng,
        name: `End of ${entry.roads[0]}`,
        type: 'dead-end',
        score,
        reasons,
        source: 'derived',
        roadName: entry.roads[0],
        nearWater,
        highClearance: entry.isHighClearance,
      });
    } else if (entry.count >= 3) {
      // Intersection - multiple roads meet
      let score = 15;
      const reasons: string[] = [`${entry.count} roads intersect here`, 'On public land'];

      if (nearWater) {
        score += 15;
        reasons.push('Near water');
      }

      spots.push({
        id: `intersection-${key}`,
        lat: entry.lat,
        lng: entry.lng,
        name: `Road Junction`,
        type: 'intersection',
        score,
        reasons,
        source: 'derived',
        nearWater,
      });
    }
  });

  return spots;
}

/**
 * Query USFS MVUM roads in a bounding box
 */
async function fetchMVUMRoads(
  minLat: number,
  minLng: number,
  maxLat: number,
  maxLng: number
): Promise<MVUMRoad[]> {
  const params = new URLSearchParams({
    where: '1=1',
    geometry: JSON.stringify({
      xmin: minLng,
      ymin: minLat,
      xmax: maxLng,
      ymax: maxLat,
      spatialReference: { wkid: 4326 },
    }),
    geometryType: 'esriGeometryEnvelope',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'OBJECTID,NAME,SURFACETYPE,HIGHCLEARANCEVEHICLE,PASSENGERVEHICLE,ATV,MOTORCYCLE,SEASONAL,OPERATIONALMAINTLEVEL',
    returnGeometry: 'true',
    outSR: '4326',
    f: 'geojson',
  });

  const response = await fetch(`${USFS_MVUM_API}?${params}`);
  if (!response.ok) {
    throw new Error(`MVUM API error: ${response.status}`);
  }

  const data = await response.json();

  if (!data.features) {
    return [];
  }

  return data.features.map((feature: any) => ({
    id: feature.properties.OBJECTID?.toString() || Math.random().toString(),
    name: feature.properties.NAME || 'Unnamed Road',
    surfaceType: feature.properties.SURFACETYPE || 'Unknown',
    highClearanceVehicle: feature.properties.HIGHCLEARANCEVEHICLE === 'Yes',
    passengerVehicle: feature.properties.PASSENGERVEHICLE === 'Yes',
    atv: feature.properties.ATV === 'Yes',
    motorcycle: feature.properties.MOTORCYCLE === 'Yes',
    seasonal: feature.properties.SEASONAL || '',
    operationalMaintLevel: feature.properties.OPERATIONALMAINTLEVEL || '',
    geometry: feature.geometry,
  }));
}

// Public land boundary info
export interface PublicLandArea {
  id: number;
  name?: string;
  type: string; // national_forest, national_park, blm, wilderness, etc.
  bounds: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
}

/**
 * Combined OSM query for tracks, camp sites, water features, and public lands
 * This reduces API calls from 3 to 1 to avoid rate limiting
 */
interface OSMCombinedResult {
  tracks: OSMTrack[];
  campSites: PotentialSpot[];
  waterFeatures: WaterFeature[];
  publicLands: PublicLandArea[];
}

async function fetchAllOSMData(
  minLat: number,
  minLng: number,
  maxLat: number,
  maxLng: number
): Promise<OSMCombinedResult> {
  // Optimized Overpass query - removed expensive public lands (using BLM API instead)
  // and simplified water features to avoid timeouts
  const query = `
    [out:json][timeout:45];
    (
      // Tracks and unpaved roads - need full geometry for dead-end detection
      way["highway"="track"](${minLat},${minLng},${maxLat},${maxLng});
      way["highway"="unclassified"]["surface"~"unpaved|gravel|dirt|ground|sand|mud"](${minLat},${minLng},${maxLat},${maxLng});
      way["4wd_only"="yes"](${minLat},${minLng},${maxLat},${maxLng});

      // Camp sites - nodes and ways
      node["tourism"="camp_site"](${minLat},${minLng},${maxLat},${maxLng});
      node["tourism"="camp_pitch"](${minLat},${minLng},${maxLat},${maxLng});
      way["tourism"="camp_site"](${minLat},${minLng},${maxLat},${maxLng});
      node["camp_site"](${minLat},${minLng},${maxLat},${maxLng});
      node["camp_type"](${minLat},${minLng},${maxLat},${maxLng});
      node["leisure"="firepit"](${minLat},${minLng},${maxLat},${maxLng});

      // Water features - only nodes/points to reduce query size
      node["natural"="spring"](${minLat},${minLng},${maxLat},${maxLng});
      node["natural"="water"](${minLat},${minLng},${maxLat},${maxLng});
      node["amenity"="drinking_water"](${minLat},${minLng},${maxLat},${maxLng});
    );
    out geom;
  `;

  // Try multiple Overpass endpoints with retry logic
  let response: Response | null = null;
  let lastError: Error | null = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`Trying Overpass endpoint: ${endpoint} (attempt ${attempt})`);
        response = await fetch(endpoint, {
          method: 'POST',
          body: `data=${encodeURIComponent(query)}`,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        });

        if (response.ok) {
          console.log(`Overpass query successful from ${endpoint}`);
          break; // Success, exit retry loop
        }

        // If rate limited (429) or timeout (504), wait and retry
        if ((response.status === 429 || response.status === 504) && attempt < 2) {
          console.log(`Overpass API returned ${response.status}, retrying in 2s...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }

        lastError = new Error(`Overpass API error: ${response.status}`);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < 2) {
          console.log(`Overpass API failed, retrying in 2s...`, err);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }

    if (response?.ok) break; // Success, exit endpoint loop
    console.log(`Endpoint ${endpoint} failed, trying next...`);
  }

  if (!response?.ok) {
    throw lastError || new Error('All Overpass endpoints failed');
  }

  const data = await response.json();

  if (!data.elements) {
    console.log('No elements in OSM response');
    return { tracks: [], campSites: [], waterFeatures: [], publicLands: [] };
  }

  console.log('OSM response elements:', data.elements.length, 'total');

  // Debug: count element types
  const wayCount = data.elements.filter((el: any) => el.type === 'way').length;
  const nodeCount = data.elements.filter((el: any) => el.type === 'node').length;
  const waysWithGeom = data.elements.filter((el: any) => el.type === 'way' && el.geometry).length;
  const waysWithHighway = data.elements.filter((el: any) => el.type === 'way' && el.tags?.highway).length;
  console.log('OSM breakdown:', { wayCount, nodeCount, waysWithGeom, waysWithHighway });

  // Parse tracks
  const tracks: OSMTrack[] = data.elements
    .filter((el: any) => el.type === 'way' && el.geometry && el.tags?.highway)
    .map((el: any) => ({
      id: el.id,
      name: el.tags?.name,
      highway: el.tags?.highway || 'track',
      surface: el.tags?.surface,
      tracktype: el.tags?.tracktype,
      access: el.tags?.access,
      fourWdOnly: el.tags?.['4wd_only'] === 'yes',
      geometry: {
        type: 'LineString' as const,
        coordinates: el.geometry.map((pt: any) => [pt.lon, pt.lat]),
      },
    }));

  // Parse camp sites
  const campSites: PotentialSpot[] = data.elements
    .filter((el: any) => {
      const tags = el.tags || {};
      return tags.tourism === 'camp_site' ||
        tags.tourism === 'camp_pitch' ||
        tags.tourism === 'caravan_site' ||
        tags.camp_site ||
        tags.camp_type ||
        tags.leisure === 'firepit';
    })
    .map((el: any) => {
      const lat = el.lat || el.center?.lat;
      const lng = el.lon || el.center?.lon;
      const tags = el.tags || {};

      const isBackcountry = tags.backcountry === 'yes' ||
        tags.camp_site === 'basic' ||
        tags.camp_type === 'wildcamp' ||
        tags.camp_type === 'non_designated';

      const isFirepit = tags.leisure === 'firepit';

      let name = tags.name || 'Camp Site';
      if (isFirepit && !tags.name) name = 'Fire Ring';

      let score = 30;
      const reasons: string[] = [];

      if (isFirepit) {
        score = 35;
        reasons.push('Fire ring/pit (likely camp spot)');
      } else if (isBackcountry) {
        score = 40;
        reasons.push('Known camp site', 'Backcountry/primitive');
      } else if (tags.tourism === 'camp_site') {
        reasons.push('Known camp site', 'Established site');
      } else if (tags.camp_site || tags.camp_type) {
        score = 35;
        reasons.push('Mapped camping location');
      } else {
        reasons.push('Camping-related feature');
      }

      return {
        id: `camp-${el.id}`,
        lat,
        lng,
        name,
        type: 'camp-site' as const,
        score,
        reasons,
        source: 'osm' as const,
      };
    })
    .filter((s: any) => s.lat && s.lng);

  // Parse water features (springs, water points, drinking water)
  const waterFeatures: WaterFeature[] = data.elements
    .filter((el: any) => {
      const tags = el.tags || {};
      return tags.natural === 'water' || tags.natural === 'spring' || tags.amenity === 'drinking_water';
    })
    .map((el: any) => ({
      id: el.id,
      name: el.tags?.name,
      type: el.tags?.natural || el.tags?.amenity || 'water',
      lat: el.lat || el.center?.lat,
      lng: el.lon || el.center?.lon,
    }))
    .filter((w: WaterFeature) => w.lat && w.lng);

  // Public lands are now fetched from BLM SMA API separately, return empty array
  const publicLands: PublicLandArea[] = [];

  return { tracks, campSites, waterFeatures, publicLands };
}

/**
 * Hook to fetch dispersed camping roads from MVUM and OSM
 */
export function useDispersedRoads(
  lat: number | null,
  lng: number | null,
  radiusMiles: number = 15
): DispersedRoadsResult {
  const [mvumRoads, setMvumRoads] = useState<MVUMRoad[]>([]);
  const [osmTracks, setOsmTracks] = useState<OSMTrack[]>([]);
  const [potentialSpots, setPotentialSpots] = useState<PotentialSpot[]>([]);
  const [waterFeatures, setWaterFeatures] = useState<WaterFeature[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (lat === null || lng === null) {
      setMvumRoads([]);
      setOsmTracks([]);
      setPotentialSpots([]);
      setWaterFeatures([]);
      return;
    }

    const fetchRoads = async () => {
      setLoading(true);
      setError(null);

      // Calculate bounding box from center point and radius
      const latDelta = radiusMiles / 69; // ~69 miles per degree latitude
      const lngDelta = radiusMiles / (69 * Math.cos(lat * (Math.PI / 180)));

      const minLat = lat - latDelta;
      const maxLat = lat + latDelta;
      const minLng = lng - lngDelta;
      const maxLng = lng + lngDelta;

      try {
        // Fetch MVUM and all OSM data (combined query to avoid rate limiting)
        const [mvum, osmData] = await Promise.all([
          fetchMVUMRoads(minLat, minLng, maxLat, maxLng).catch((err) => {
            console.error('MVUM fetch error:', err);
            return [];
          }),
          fetchAllOSMData(minLat, minLng, maxLat, maxLng).then((data) => {
            console.log('OSM data fetched:', data.tracks.length, 'tracks,', data.campSites.length, 'camps,', data.publicLands.length, 'public lands');
            return data;
          }).catch((err) => {
            console.error('OSM fetch error:', err);
            return { tracks: [], campSites: [], waterFeatures: [], publicLands: [] };
          }),
        ]);

        const { tracks: osm, campSites: camps, waterFeatures: water, publicLands } = osmData;

        setMvumRoads(mvum);
        setOsmTracks(osm);
        setWaterFeatures(water);

        // Find dead-ends and intersections from road geometry
        // Pass publicLands for additional boundary checking
        const derivedSpots = findDeadEnds(mvum, osm, water, publicLands);

        // Filter out derived spots that are within 0.5 miles of a known OSM camp site
        const filteredDerivedSpots = derivedSpots.filter(spot => {
          const tooCloseToKnownSite = camps.some(camp =>
            getDistanceMiles(spot.lat, spot.lng, camp.lat, camp.lng) < 0.5
          );
          return !tooCloseToKnownSite;
        });

        console.log('Dispersed data:', {
          mvumRoads: mvum.length,
          osmTracks: osm.length,
          osmCamps: camps.length,
          waterFeatures: water.length,
          derivedSpots: derivedSpots.length,
          filteredDerivedSpots: filteredDerivedSpots.length,
        });

        // Combine all potential spots: OSM camp sites + filtered derived spots
        const allSpots = [...camps, ...filteredDerivedSpots];

        // Sort by score (highest first)
        allSpots.sort((a, b) => b.score - a.score);

        setPotentialSpots(allSpots);
      } catch (err) {
        console.error('Dispersed roads fetch error:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch roads');
      } finally {
        setLoading(false);
      }
    };

    fetchRoads();
  }, [lat, lng, radiusMiles]);

  return { mvumRoads, osmTracks, potentialSpots, waterFeatures, loading, error };
}
