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
const OVERPASS_API = 'https://overpass-api.de/api/interpreter';

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
function findDeadEnds(
  mvumRoads: MVUMRoad[],
  osmTracks: OSMTrack[],
  waterFeatures: WaterFeature[]
): PotentialSpot[] {
  const spots: PotentialSpot[] = [];
  const allEndpoints: { lat: number; lng: number; count: number }[] = [];

  // Collect all endpoints from all roads
  const endpointMap = new Map<string, { lat: number; lng: number; count: number; roads: string[] }>();

  // Process MVUM roads
  mvumRoads.forEach(road => {
    if (!road.geometry?.coordinates?.length) return;
    const coords = road.geometry.coordinates;

    // Start point
    const startKey = `${coords[0][1].toFixed(4)},${coords[0][0].toFixed(4)}`;
    const startEntry = endpointMap.get(startKey) || { lat: coords[0][1], lng: coords[0][0], count: 0, roads: [] };
    startEntry.count++;
    startEntry.roads.push(road.name);
    endpointMap.set(startKey, startEntry);

    // End point
    const endCoord = coords[coords.length - 1];
    const endKey = `${endCoord[1].toFixed(4)},${endCoord[0].toFixed(4)}`;
    const endEntry = endpointMap.get(endKey) || { lat: endCoord[1], lng: endCoord[0], count: 0, roads: [] };
    endEntry.count++;
    endEntry.roads.push(road.name);
    endpointMap.set(endKey, endEntry);
  });

  // Process OSM tracks
  osmTracks.forEach(track => {
    if (!track.geometry?.coordinates?.length) return;
    const coords = track.geometry.coordinates;

    // Start point
    const startKey = `${coords[0][1].toFixed(4)},${coords[0][0].toFixed(4)}`;
    const startEntry = endpointMap.get(startKey) || { lat: coords[0][1], lng: coords[0][0], count: 0, roads: [] };
    startEntry.count++;
    startEntry.roads.push(track.name || 'Unnamed Track');
    endpointMap.set(startKey, startEntry);

    // End point
    const endCoord = coords[coords.length - 1];
    const endKey = `${endCoord[1].toFixed(4)},${endCoord[0].toFixed(4)}`;
    const endEntry = endpointMap.get(endKey) || { lat: endCoord[1], lng: endCoord[0], count: 0, roads: [] };
    endEntry.count++;
    endEntry.roads.push(track.name || 'Unnamed Track');
    endpointMap.set(endKey, endEntry);
  });

  // Debug: log endpoint distribution
  const countDistribution: Record<number, number> = {};
  endpointMap.forEach((entry) => {
    countDistribution[entry.count] = (countDistribution[entry.count] || 0) + 1;
  });
  console.log('Endpoint count distribution:', countDistribution);

  // Find dead-ends (endpoints that only appear once = true dead end)
  // and intersections (endpoints that appear 3+ times)
  endpointMap.forEach((entry, key) => {
    const nearWater = isNearWater(entry.lat, entry.lng, waterFeatures);

    if (entry.count === 1) {
      // Dead end - road terminus
      let score = 25; // Base score for dead end
      const reasons: string[] = ['Road terminus (dead-end)'];

      if (nearWater) {
        score += 15;
        reasons.push('Near water');
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
      });
    } else if (entry.count >= 3) {
      // Intersection - multiple roads meet
      let score = 15;
      const reasons: string[] = [`${entry.count} roads intersect here`];

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

/**
 * Combined OSM query for tracks, camp sites, and water features
 * This reduces API calls from 3 to 1 to avoid rate limiting
 */
interface OSMCombinedResult {
  tracks: OSMTrack[];
  campSites: PotentialSpot[];
  waterFeatures: WaterFeature[];
}

async function fetchAllOSMData(
  minLat: number,
  minLng: number,
  maxLat: number,
  maxLng: number
): Promise<OSMCombinedResult> {
  // Combined Overpass query for all OSM data we need
  // Use separate output statements: geom for ways (full line coords), center for area ways
  const query = `
    [out:json][timeout:45];
    (
      // Tracks and unpaved roads - need full geometry
      way["highway"="track"](${minLat},${minLng},${maxLat},${maxLng});
      way["highway"="unclassified"]["surface"~"unpaved|gravel|dirt|ground|sand|mud"](${minLat},${minLng},${maxLat},${maxLng});
      way["4wd_only"="yes"](${minLat},${minLng},${maxLat},${maxLng});

      // Camp sites - nodes and ways
      node["tourism"="camp_site"](${minLat},${minLng},${maxLat},${maxLng});
      node["tourism"="camp_pitch"](${minLat},${minLng},${maxLat},${maxLng});
      node["tourism"="caravan_site"](${minLat},${minLng},${maxLat},${maxLng});
      way["tourism"="camp_site"](${minLat},${minLng},${maxLat},${maxLng});
      node["camp_site"](${minLat},${minLng},${maxLat},${maxLng});
      node["camp_type"](${minLat},${minLng},${maxLat},${maxLng});
      node["leisure"="firepit"](${minLat},${minLng},${maxLat},${maxLng});

      // Water features
      way["waterway"="stream"](${minLat},${minLng},${maxLat},${maxLng});
      way["waterway"="river"](${minLat},${minLng},${maxLat},${maxLng});
      way["natural"="water"](${minLat},${minLng},${maxLat},${maxLng});
      node["natural"="spring"](${minLat},${minLng},${maxLat},${maxLng});
    );
    out geom;
  `;

  const response = await fetch(OVERPASS_API, {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  if (!response.ok) {
    throw new Error(`Overpass API error: ${response.status}`);
  }

  const data = await response.json();

  if (!data.elements) {
    console.log('No elements in OSM response');
    return { tracks: [], campSites: [], waterFeatures: [] };
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

  // Parse water features
  const waterFeatures: WaterFeature[] = data.elements
    .filter((el: any) => {
      const tags = el.tags || {};
      return tags.waterway || tags.natural === 'water' || tags.natural === 'spring';
    })
    .map((el: any) => ({
      id: el.id,
      name: el.tags?.name,
      type: el.tags?.waterway || el.tags?.natural || 'water',
      lat: el.lat || el.center?.lat,
      lng: el.lon || el.center?.lon,
    }))
    .filter((w: WaterFeature) => w.lat && w.lng);

  return { tracks, campSites, waterFeatures };
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
            console.log('OSM data fetched:', data.tracks.length, 'tracks,', data.campSites.length, 'camps');
            return data;
          }).catch((err) => {
            console.error('OSM fetch error:', err);
            return { tracks: [], campSites: [], waterFeatures: [] };
          }),
        ]);

        const { tracks: osm, campSites: camps, waterFeatures: water } = osmData;

        setMvumRoads(mvum);
        setOsmTracks(osm);
        setWaterFeatures(water);

        // Find dead-ends and intersections from road geometry
        const derivedSpots = findDeadEnds(mvum, osm, water);

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
