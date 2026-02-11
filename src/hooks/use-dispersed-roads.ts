import { useState, useEffect } from 'react';

// Established campground from RIDB (USFS, BLM, NPS, etc.)
export interface EstablishedCampground {
  id: string;
  name: string;
  lat: number;
  lng: number;
  description?: string;
  facilityType: string;
  agencyName?: string;
  reservable: boolean;
  url?: string;
}

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
  isPaved?: boolean; // True for paved roads (used for junction filtering, not dead-end generation)
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
  type: 'dead-end' | 'camp-site' | 'intersection';
  score: number;
  reasons: string[];
  source: 'mvum' | 'osm' | 'blm' | 'derived';
  roadName?: string;
  highClearance?: boolean;
  isOnMVUMRoad?: boolean; // True if this spot is on a USFS MVUM road (definitely public land)
  isOnBLMRoad?: boolean; // True if this spot is on a BLM road (definitely public land)
  isOnPublicLand?: boolean; // True if this spot is likely on public land (based on road characteristics)
  // Route accessibility - can you REACH this spot via passenger/high-clearance roads?
  passengerReachable?: boolean; // True if reachable via only passenger-accessible roads
  highClearanceReachable?: boolean; // True if reachable via passenger + high-clearance roads (no 4WD required)
  // Classification flag for established campground vs dispersed site (from database)
  isEstablishedCampground?: boolean;
  // Road accessibility flag - is this camp site near a road? (for filtering backcountry/hike-in sites)
  isRoadAccessible?: boolean;
}

// BLM Road from GTLF (Ground Transportation Linear Feature)
export interface BLMRoad {
  id: string;
  name: string;
  surfaceType: string;
  routeType: string; // road, primitive_road, trail, etc.
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
}

export interface DispersedRoadsResult {
  mvumRoads: MVUMRoad[];
  blmRoads: BLMRoad[];
  osmTracks: OSMTrack[];
  potentialSpots: PotentialSpot[];
  establishedCampgrounds: EstablishedCampground[];
  loading: boolean;
  error: string | null;
}

const USFS_MVUM_API = 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_01/MapServer/1/query';

// BLM road data endpoints by state
// Note: Service names and layer IDs vary by state - only states with verified working endpoints are included
// States without road services: CA (OHV areas only), OR, WY, NM, NV, ID (empty folder)
interface BLMEndpointConfig {
  url: string;
  nameField: string;
  surfaceField: string;
  typeField: string;
}

// BLM road data endpoints by state
// Note: Utah does NOT have a GTLF road service - only TMA (Travel Management Area) polygons
// Utah BLM roads will rely on OSM tracks and PAD-US polygon filtering instead
const BLM_ROAD_ENDPOINTS: Record<string, BLMEndpointConfig> = {
  'CO': {
    url: 'https://gis.blm.gov/coarcgis/rest/services/transportation/BLM_CO_GTLF/FeatureServer/5/query',
    nameField: 'ROUTE_PRMRY_NM',
    surfaceField: 'OBSRVE_SRFCE_TYPE',
    typeField: 'PLAN_MODE_TRNSPRT',
  },
  'AZ': {
    url: 'https://gis.blm.gov/azarcgis/rest/services/transportation/BLM_AZ_TMAP/FeatureServer/0/query',
    nameField: 'ROUTE_PRMRY_NM',
    surfaceField: 'OBSRVE_SRFCE_TYPE',
    typeField: 'PLAN_MODE_TRNSPRT',
  },
  // Utah removed - BLM_UT_TMA is polygon data only, no road lines available
};

// State boundaries for states with working BLM road endpoints
const STATE_BOUNDS: Record<string, { minLat: number; maxLat: number; minLng: number; maxLng: number }> = {
  'AZ': { minLat: 31.33, maxLat: 37.00, minLng: -114.82, maxLng: -109.04 },
  'CO': { minLat: 36.99, maxLat: 41.00, minLng: -109.05, maxLng: -102.04 },
  // Utah removed - no BLM road line data available
};

/**
 * Get states that overlap with a bounding box
 */
function getStatesForBounds(minLat: number, minLng: number, maxLat: number, maxLng: number): string[] {
  const states: string[] = [];
  for (const [state, bounds] of Object.entries(STATE_BOUNDS)) {
    // Check if bounding boxes overlap
    if (minLat <= bounds.maxLat && maxLat >= bounds.minLat &&
        minLng <= bounds.maxLng && maxLng >= bounds.minLng) {
      states.push(state);
    }
  }
  return states;
}

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
 * Determine vehicle accessibility for a point based on nearest roads
 * Returns the best vehicle access available to reach this point
 */
function determinePointAccessibility(
  lat: number,
  lng: number,
  mvumRoads: MVUMRoad[],
  blmRoads: BLMRoad[],
  osmTracks: OSMTrack[],
  thresholdMiles: number = 0.25
): { passengerReachable: boolean; highClearanceReachable: boolean } {
  let hasPassengerRoad = false;
  let hasHighClearanceRoad = false;

  // Helper to get coordinate values safely
  const getCoordLng = (coord: any): number | null => {
    if (Array.isArray(coord) && typeof coord[0] === 'number') return coord[0];
    if (coord && typeof coord.lng === 'number') return coord.lng;
    if (coord && typeof coord.lon === 'number') return coord.lon;
    return null;
  };

  const getCoordLat = (coord: any): number | null => {
    if (Array.isArray(coord) && typeof coord[1] === 'number') return coord[1];
    if (coord && typeof coord.lat === 'number') return coord.lat;
    return null;
  };

  // Check MVUM roads
  for (const road of mvumRoads) {
    if (!road.geometry?.coordinates?.length) continue;
    for (const coord of road.geometry.coordinates) {
      const coordLat = getCoordLat(coord);
      const coordLng = getCoordLng(coord);
      if (coordLat !== null && coordLng !== null) {
        if (getDistanceMiles(lat, lng, coordLat, coordLng) < thresholdMiles) {
          // Check MVUM road vehicle type
          if (road.passengerVehicle) {
            hasPassengerRoad = true;
          } else if (road.highClearanceVehicle) {
            hasHighClearanceRoad = true;
          }
          break; // Found a nearby point on this road, move to next road
        }
      }
    }
  }

  // Check BLM roads (assume high-clearance by default)
  for (const road of blmRoads) {
    if (!road.geometry?.coordinates?.length) continue;
    for (const coord of road.geometry.coordinates) {
      const coordLat = getCoordLat(coord);
      const coordLng = getCoordLng(coord);
      if (coordLat !== null && coordLng !== null) {
        if (getDistanceMiles(lat, lng, coordLat, coordLng) < thresholdMiles) {
          // BLM roads - check surface type
          const surfaceLower = (road.surfaceType || '').toLowerCase();
          if (surfaceLower.includes('paved') || surfaceLower.includes('asphalt')) {
            hasPassengerRoad = true;
          } else {
            hasHighClearanceRoad = true;
          }
          break;
        }
      }
    }
  }

  // Check OSM tracks
  for (const track of osmTracks) {
    if (!track.geometry?.coordinates?.length) continue;
    for (const coord of track.geometry.coordinates) {
      const coordLat = getCoordLat(coord);
      const coordLng = getCoordLng(coord);
      if (coordLat !== null && coordLng !== null) {
        if (getDistanceMiles(lat, lng, coordLat, coordLng) < thresholdMiles) {
          // Check OSM track vehicle type - be conservative
          if (track.tracktype === 'grade1') {
            hasPassengerRoad = true;
          } else if (!track.fourWdOnly && track.tracktype !== 'grade4' && track.tracktype !== 'grade5') {
            hasHighClearanceRoad = true;
          }
          // grade4, grade5, and 4WD only don't contribute to reachability
          break;
        }
      }
    }
  }

  return {
    passengerReachable: hasPassengerRoad,
    highClearanceReachable: hasPassengerRoad || hasHighClearanceRoad,
  };
}

/**
 * Check if a point is near any road (for filtering out backcountry/hike-in campsites)
 * Returns true if the point is within thresholdMiles of any road segment
 */
function isNearRoad(
  lat: number,
  lng: number,
  mvumRoads: MVUMRoad[],
  osmTracks: OSMTrack[],
  thresholdMiles: number = 0.25,
  blmRoads: BLMRoad[] = []
): boolean {
  // Helper to get coordinate values safely
  const getCoordLng = (coord: any): number | null => {
    if (Array.isArray(coord) && typeof coord[0] === 'number') return coord[0];
    if (coord && typeof coord.lng === 'number') return coord.lng;
    if (coord && typeof coord.lon === 'number') return coord.lon;
    return null;
  };

  const getCoordLat = (coord: any): number | null => {
    if (Array.isArray(coord) && typeof coord[1] === 'number') return coord[1];
    if (coord && typeof coord.lat === 'number') return coord.lat;
    return null;
  };

  // Check MVUM roads
  for (const road of mvumRoads) {
    if (!road.geometry?.coordinates?.length) continue;
    for (const coord of road.geometry.coordinates) {
      const coordLat = getCoordLat(coord);
      const coordLng = getCoordLng(coord);
      if (coordLat !== null && coordLng !== null) {
        if (getDistanceMiles(lat, lng, coordLat, coordLng) < thresholdMiles) {
          return true;
        }
      }
    }
  }

  // Check BLM roads
  for (const road of blmRoads) {
    if (!road.geometry?.coordinates?.length) continue;
    for (const coord of road.geometry.coordinates) {
      const coordLat = getCoordLat(coord);
      const coordLng = getCoordLng(coord);
      if (coordLat !== null && coordLng !== null) {
        if (getDistanceMiles(lat, lng, coordLat, coordLng) < thresholdMiles) {
          return true;
        }
      }
    }
  }

  // Check OSM tracks
  for (const track of osmTracks) {
    if (!track.geometry?.coordinates?.length) continue;
    for (const coord of track.geometry.coordinates) {
      const coordLat = getCoordLat(coord);
      const coordLng = getCoordLng(coord);
      if (coordLat !== null && coordLng !== null) {
        if (getDistanceMiles(lat, lng, coordLat, coordLng) < thresholdMiles) {
          return true;
        }
      }
    }
  }

  return false;
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
  hasMVUMRoad: boolean; // At least one MVUM road contributes to this endpoint
  hasBLMRoad: boolean; // At least one BLM road contributes to this endpoint
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
 * Point-in-polygon check using ray casting algorithm
 * Returns true if the point (lat, lng) is inside the polygon
 */
function isPointInPolygon(lat: number, lng: number, polygon: [number, number][]): boolean {
  if (polygon.length < 3) return false;

  let inside = false;
  const x = lng;
  const y = lat;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0]; // lng
    const yi = polygon[i][1]; // lat
    const xj = polygon[j][0];
    const yj = polygon[j][1];

    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);

    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Check if a point is within or near any private/industrial land area
 * bufferMiles: additional buffer around polygons to catch nearby spots
 */
function isWithinPrivateLand(lat: number, lng: number, privateLands: PrivateLandArea[], bufferMiles: number = 0.5): { isPrivate: boolean; landName?: string; landType?: string } {
  for (const land of privateLands) {
    // Check if point is inside polygon
    if (isPointInPolygon(lat, lng, land.geometry.coordinates)) {
      return { isPrivate: true, landName: land.name, landType: land.type };
    }

    // Check if point is within buffer distance of any polygon vertex
    for (const coord of land.geometry.coordinates) {
      const polyLng = coord[0];
      const polyLat = coord[1];
      const distance = getDistanceMiles(lat, lng, polyLat, polyLng);
      if (distance < bufferMiles) {
        return { isPrivate: true, landName: land.name, landType: `near ${land.type}` };
      }
    }
  }
  return { isPrivate: false };
}

/**
 * Check if an OSM track is likely on public land (not a suburban cul-de-sac)
 * We err on the side of inclusion - the visual polygon overlay helps users verify
 */
function isLikelyPublicLand(track: OSMTrack): boolean {
  // Definitely exclude if marked private or restricted
  if (track.access === 'private' || track.access === 'no' || track.access === 'customers') return false;

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

interface PrivateRoadPoint {
  lat: number;
  lng: number;
}

/**
 * Road segment for network analysis
 */
interface RoadSegment {
  id: string;
  startKey: string;
  endKey: string;
  vehicleType: 'passenger' | 'high-clearance' | '4wd';
  isEntryRoad: boolean; // Road likely connects to main road network
}

/**
 * Analyze road network to determine which spots are reachable by different vehicle types
 *
 * This builds a graph of road connectivity and determines if each endpoint can be
 * reached from "entry points" (places where back roads connect to main roads)
 * using only roads accessible to specific vehicle types.
 */
function analyzeRoadAccessibility(
  mvumRoads: MVUMRoad[],
  blmRoads: BLMRoad[],
  osmTracks: OSMTrack[],
  searchBounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }
): Map<string, { passengerReachable: boolean; highClearanceReachable: boolean }> {
  const segments: RoadSegment[] = [];
  const nodeConnections = new Map<string, Set<string>>(); // node -> connected nodes
  const edgeVehicleTypes = new Map<string, 'passenger' | 'high-clearance' | '4wd'>(); // edge key -> vehicle type

  // Helper to round coordinates to ~100m precision for node matching
  const toNodeKey = (lat: number, lng: number): string => {
    return `${lat.toFixed(3)},${lng.toFixed(3)}`;
  };

  // Helper to check if a point is near the edge of search bounds (likely connects to main roads)
  const isNearBoundary = (lat: number, lng: number, margin: number = 0.02): boolean => {
    return lat <= searchBounds.minLat + margin ||
           lat >= searchBounds.maxLat - margin ||
           lng <= searchBounds.minLng + margin ||
           lng >= searchBounds.maxLng - margin;
  };

  // Helper to safely get coordinates
  const getCoordLng = (coord: any): number | null => {
    if (Array.isArray(coord) && typeof coord[0] === 'number') return coord[0];
    if (coord && typeof coord.lng === 'number') return coord.lng;
    if (coord && typeof coord.lon === 'number') return coord.lon;
    return null;
  };
  const getCoordLat = (coord: any): number | null => {
    if (Array.isArray(coord) && typeof coord[1] === 'number') return coord[1];
    if (coord && typeof coord.lat === 'number') return coord.lat;
    return null;
  };

  // Process MVUM roads
  mvumRoads.forEach(road => {
    if (!road.geometry?.coordinates?.length) return;
    const coords = road.geometry.coordinates;

    const startLat = getCoordLat(coords[0]);
    const startLng = getCoordLng(coords[0]);
    const endLat = getCoordLat(coords[coords.length - 1]);
    const endLng = getCoordLng(coords[coords.length - 1]);

    if (startLat === null || startLng === null || endLat === null || endLng === null) return;

    const startKey = toNodeKey(startLat, startLng);
    const endKey = toNodeKey(endLat, endLng);

    // Determine vehicle type for MVUM road
    // Default to high-clearance — only mark passenger if explicitly flagged
    let vehicleType: 'passenger' | 'high-clearance' | '4wd' = 'high-clearance';
    if (road.passengerVehicle) {
      vehicleType = 'passenger';
    } else if (!road.highClearanceVehicle && (road.atv || road.motorcycle)) {
      vehicleType = '4wd';
    }

    // MVUM roads at boundary are entry points
    const isEntry = isNearBoundary(startLat, startLng) || isNearBoundary(endLat, endLng);

    segments.push({ id: road.id, startKey, endKey, vehicleType, isEntryRoad: isEntry });

    // Add to node connections
    if (!nodeConnections.has(startKey)) nodeConnections.set(startKey, new Set());
    if (!nodeConnections.has(endKey)) nodeConnections.set(endKey, new Set());
    nodeConnections.get(startKey)!.add(endKey);
    nodeConnections.get(endKey)!.add(startKey);

    // Store edge vehicle type (both directions)
    const edgeKey1 = `${startKey}-${endKey}`;
    const edgeKey2 = `${endKey}-${startKey}`;
    edgeVehicleTypes.set(edgeKey1, vehicleType);
    edgeVehicleTypes.set(edgeKey2, vehicleType);
  });

  // Process BLM roads (assume high-clearance unless surface indicates otherwise)
  blmRoads.forEach(road => {
    if (!road.geometry?.coordinates?.length) return;
    const coords = road.geometry.coordinates;

    const startLat = getCoordLat(coords[0]);
    const startLng = getCoordLng(coords[0]);
    const endLat = getCoordLat(coords[coords.length - 1]);
    const endLng = getCoordLng(coords[coords.length - 1]);

    if (startLat === null || startLng === null || endLat === null || endLng === null) return;

    const startKey = toNodeKey(startLat, startLng);
    const endKey = toNodeKey(endLat, endLng);

    // BLM roads - assume high-clearance by default
    const surfaceLower = (road.surfaceType || '').toLowerCase();
    let vehicleType: 'passenger' | 'high-clearance' | '4wd' = 'high-clearance';
    if (surfaceLower.includes('paved') || surfaceLower.includes('asphalt') || surfaceLower.includes('gravel')) {
      vehicleType = 'passenger';
    }

    const isEntry = isNearBoundary(startLat, startLng) || isNearBoundary(endLat, endLng);

    segments.push({ id: road.id, startKey, endKey, vehicleType, isEntryRoad: isEntry });

    if (!nodeConnections.has(startKey)) nodeConnections.set(startKey, new Set());
    if (!nodeConnections.has(endKey)) nodeConnections.set(endKey, new Set());
    nodeConnections.get(startKey)!.add(endKey);
    nodeConnections.get(endKey)!.add(startKey);

    const edgeKey1 = `${startKey}-${endKey}`;
    const edgeKey2 = `${endKey}-${startKey}`;
    // Only set if not already set (MVUM takes precedence)
    if (!edgeVehicleTypes.has(edgeKey1)) edgeVehicleTypes.set(edgeKey1, vehicleType);
    if (!edgeVehicleTypes.has(edgeKey2)) edgeVehicleTypes.set(edgeKey2, vehicleType);
  });

  // Process OSM tracks
  osmTracks.forEach(track => {
    if (!track.geometry?.coordinates?.length) return;
    const coords = track.geometry.coordinates;

    const startLat = getCoordLat(coords[0]);
    const startLng = getCoordLng(coords[0]);
    const endLat = getCoordLat(coords[coords.length - 1]);
    const endLng = getCoordLng(coords[coords.length - 1]);

    if (startLat === null || startLng === null || endLat === null || endLng === null) return;

    const startKey = toNodeKey(startLat, startLng);
    const endKey = toNodeKey(endLat, endLng);

    // Determine vehicle type for OSM track
    // Be conservative - OSM data quality varies significantly
    let vehicleType: 'passenger' | 'high-clearance' | '4wd' = 'high-clearance'; // Default to high-clearance
    if (track.fourWdOnly) {
      vehicleType = '4wd';
    } else if (track.tracktype === 'grade5' || track.tracktype === 'grade4') {
      vehicleType = '4wd';
    } else if (track.tracktype === 'grade3' || track.tracktype === 'grade2') {
      // grade2 (gravel) and grade3 both require high clearance to be safe
      vehicleType = 'high-clearance';
    } else if (track.tracktype === 'grade1') {
      // Only grade1 (paved/solid) is reliably passenger-accessible
      vehicleType = 'passenger';
    } else if (track.highway === 'track') {
      // Generic tracks without grade - assume high-clearance minimum
      vehicleType = 'high-clearance';
    }
    // unclassified roads without grade info - be conservative, treat as high-clearance

    // OSM roads at boundary OR unclassified roads are potential entry points
    const isEntry = isNearBoundary(startLat, startLng) ||
                    isNearBoundary(endLat, endLng) ||
                    (track.highway === 'unclassified' && vehicleType === 'passenger');

    segments.push({ id: String(track.id), startKey, endKey, vehicleType, isEntryRoad: isEntry });

    if (!nodeConnections.has(startKey)) nodeConnections.set(startKey, new Set());
    if (!nodeConnections.has(endKey)) nodeConnections.set(endKey, new Set());
    nodeConnections.get(startKey)!.add(endKey);
    nodeConnections.get(endKey)!.add(startKey);

    const edgeKey1 = `${startKey}-${endKey}`;
    const edgeKey2 = `${endKey}-${startKey}`;
    // Only set if not already set (earlier roads take precedence)
    if (!edgeVehicleTypes.has(edgeKey1)) edgeVehicleTypes.set(edgeKey1, vehicleType);
    if (!edgeVehicleTypes.has(edgeKey2)) edgeVehicleTypes.set(edgeKey2, vehicleType);
  });

  // Find entry nodes (nodes on roads that connect to main road network)
  const entryNodes = new Set<string>();
  segments.forEach(seg => {
    if (seg.isEntryRoad) {
      entryNodes.add(seg.startKey);
      entryNodes.add(seg.endKey);
    }
  });

  console.log(`Road network: ${segments.length} segments, ${nodeConnections.size} nodes, ${entryNodes.size} entry nodes`);

  // BFS to find passenger-reachable nodes
  const passengerReachable = new Set<string>();
  const passengerQueue: string[] = [];

  // Start from entry nodes that have at least one passenger-accessible connection
  entryNodes.forEach(node => {
    const neighbors = nodeConnections.get(node);
    if (neighbors) {
      for (const neighbor of neighbors) {
        const edgeKey = `${node}-${neighbor}`;
        const vehicleType = edgeVehicleTypes.get(edgeKey);
        if (vehicleType === 'passenger') {
          passengerReachable.add(node);
          passengerQueue.push(node);
          break;
        }
      }
    }
  });

  // BFS for passenger reachability
  while (passengerQueue.length > 0) {
    const current = passengerQueue.shift()!;
    const neighbors = nodeConnections.get(current);
    if (!neighbors) continue;

    for (const neighbor of neighbors) {
      if (passengerReachable.has(neighbor)) continue;

      const edgeKey = `${current}-${neighbor}`;
      const vehicleType = edgeVehicleTypes.get(edgeKey);

      // Only traverse passenger-accessible edges
      if (vehicleType === 'passenger') {
        passengerReachable.add(neighbor);
        passengerQueue.push(neighbor);
      }
    }
  }

  // BFS to find high-clearance-reachable nodes (includes passenger roads)
  const highClearanceReachable = new Set<string>();
  const hcQueue: string[] = [];

  // Start from entry nodes
  entryNodes.forEach(node => {
    const neighbors = nodeConnections.get(node);
    if (neighbors) {
      for (const neighbor of neighbors) {
        const edgeKey = `${node}-${neighbor}`;
        const vehicleType = edgeVehicleTypes.get(edgeKey);
        if (vehicleType === 'passenger' || vehicleType === 'high-clearance') {
          highClearanceReachable.add(node);
          hcQueue.push(node);
          break;
        }
      }
    }
  });

  // BFS for high-clearance reachability
  while (hcQueue.length > 0) {
    const current = hcQueue.shift()!;
    const neighbors = nodeConnections.get(current);
    if (!neighbors) continue;

    for (const neighbor of neighbors) {
      if (highClearanceReachable.has(neighbor)) continue;

      const edgeKey = `${current}-${neighbor}`;
      const vehicleType = edgeVehicleTypes.get(edgeKey);

      // Traverse passenger or high-clearance edges (not 4WD)
      if (vehicleType === 'passenger' || vehicleType === 'high-clearance') {
        highClearanceReachable.add(neighbor);
        hcQueue.push(neighbor);
      }
    }
  }

  console.log(`Reachability: ${passengerReachable.size} passenger-reachable nodes, ${highClearanceReachable.size} high-clearance-reachable nodes`);

  // Build result map
  const result = new Map<string, { passengerReachable: boolean; highClearanceReachable: boolean }>();
  nodeConnections.forEach((_, nodeKey) => {
    result.set(nodeKey, {
      passengerReachable: passengerReachable.has(nodeKey),
      highClearanceReachable: highClearanceReachable.has(nodeKey),
    });
  });

  return result;
}

function findDeadEnds(
  mvumRoads: MVUMRoad[],
  blmRoads: BLMRoad[],
  osmTracks: OSMTrack[],
  publicLands: PublicLandArea[],
  accessibilityMap: Map<string, { passengerReachable: boolean; highClearanceReachable: boolean }>
): { spots: PotentialSpot[]; privateRoadPoints: PrivateRoadPoint[] } {
  const spots: PotentialSpot[] = [];
  const privateRoadPoints: PrivateRoadPoint[] = [];

  // Collect all endpoints from all roads
  const endpointMap = new Map<string, EndpointInfo>();

  // Helper to safely get coordinate values
  const getCoordLng = (coord: any): number | null => {
    if (Array.isArray(coord) && typeof coord[0] === 'number') return coord[0];
    if (coord && typeof coord.lng === 'number') return coord.lng;
    if (coord && typeof coord.lon === 'number') return coord.lon;
    return null;
  };

  const getCoordLat = (coord: any): number | null => {
    if (Array.isArray(coord) && typeof coord[1] === 'number') return coord[1];
    if (coord && typeof coord.lat === 'number') return coord.lat;
    return null;
  };

  // Process MVUM roads - these are always on public land (National Forest)
  mvumRoads.forEach(road => {
    if (!road.geometry?.coordinates?.length) return;
    const coords = road.geometry.coordinates;

    // Start point
    const startLng = getCoordLng(coords[0]);
    const startLat = getCoordLat(coords[0]);
    if (startLat === null || startLng === null) return;

    const startKey = `${startLat.toFixed(4)},${startLng.toFixed(4)}`;
    const startEntry = endpointMap.get(startKey) || {
      lat: startLat, lng: startLng, count: 0, roads: [],
      isPublicLand: false, isHighClearance: false, hasMVUMRoad: false, hasBLMRoad: false
    };
    startEntry.count++;
    startEntry.roads.push(road.name);
    startEntry.isPublicLand = true; // MVUM = public land
    startEntry.isHighClearance = startEntry.isHighClearance || road.highClearanceVehicle;
    startEntry.hasMVUMRoad = true; // This endpoint has an MVUM road
    endpointMap.set(startKey, startEntry);

    // End point
    const endCoord = coords[coords.length - 1];
    const endLng = getCoordLng(endCoord);
    const endLat = getCoordLat(endCoord);
    if (endLat === null || endLng === null) return;

    const endKey = `${endLat.toFixed(4)},${endLng.toFixed(4)}`;
    const endEntry = endpointMap.get(endKey) || {
      lat: endLat, lng: endLng, count: 0, roads: [],
      isPublicLand: false, isHighClearance: false, hasMVUMRoad: false, hasBLMRoad: false
    };
    endEntry.count++;
    endEntry.roads.push(road.name);
    endEntry.isPublicLand = true; // MVUM = public land
    endEntry.isHighClearance = endEntry.isHighClearance || road.highClearanceVehicle;
    endEntry.hasMVUMRoad = true; // This endpoint has an MVUM road
    endpointMap.set(endKey, endEntry);
  });

  // Process BLM roads - these are always on public land
  blmRoads.forEach(road => {
    if (!road.geometry?.coordinates?.length) return;
    const coords = road.geometry.coordinates;

    // Start point
    const startLng = getCoordLng(coords[0]);
    const startLat = getCoordLat(coords[0]);
    if (startLat === null || startLng === null) return;

    const startKey = `${startLat.toFixed(4)},${startLng.toFixed(4)}`;
    const startEntry = endpointMap.get(startKey) || {
      lat: startLat, lng: startLng, count: 0, roads: [],
      isPublicLand: false, isHighClearance: false, hasMVUMRoad: false, hasBLMRoad: false
    };
    startEntry.count++;
    startEntry.roads.push(road.name);
    startEntry.isPublicLand = true; // BLM = public land
    startEntry.hasBLMRoad = true; // This endpoint has a BLM road
    endpointMap.set(startKey, startEntry);

    // End point
    const endCoord = coords[coords.length - 1];
    const endLng = getCoordLng(endCoord);
    const endLat = getCoordLat(endCoord);
    if (endLat === null || endLng === null) return;

    const endKey = `${endLat.toFixed(4)},${endLng.toFixed(4)}`;
    const endEntry = endpointMap.get(endKey) || {
      lat: endLat, lng: endLng, count: 0, roads: [],
      isPublicLand: false, isHighClearance: false, hasMVUMRoad: false, hasBLMRoad: false
    };
    endEntry.count++;
    endEntry.roads.push(road.name);
    endEntry.isPublicLand = true; // BLM = public land
    endEntry.hasBLMRoad = true; // This endpoint has a BLM road
    endpointMap.set(endKey, endEntry);
  });

  // Process OSM tracks - check if they're likely on public land
  // Skip paved roads for dead-end generation (they're only used for junction filtering)
  osmTracks.forEach(track => {
    if (!track.geometry?.coordinates?.length) return;

    // Skip paved roads - we don't want dead-ends from them
    // They're included in the data only for junction filtering
    if (track.isPaved) return;

    const likelyPublic = isLikelyPublicLand(track);
    const coords = track.geometry.coordinates;

    // If this road is marked private, collect its coordinates for proximity filtering
    if (track.access === 'private' || track.access === 'no' || track.access === 'customers') {
      coords.forEach(coord => {
        const lat = getCoordLat(coord);
        const lng = getCoordLng(coord);
        if (lat !== null && lng !== null) {
          privateRoadPoints.push({ lat, lng });
        }
      });
    }

    // Start point
    const startLng = getCoordLng(coords[0]);
    const startLat = getCoordLat(coords[0]);
    if (startLat === null || startLng === null) return;

    const startKey = `${startLat.toFixed(4)},${startLng.toFixed(4)}`;
    const startEntry = endpointMap.get(startKey) || {
      lat: startLat, lng: startLng, count: 0, roads: [],
      isPublicLand: false, isHighClearance: false, hasMVUMRoad: false, hasBLMRoad: false
    };
    // Track is high-clearance/4WD if: 4wd_only, rough tracktype, or generic track without grade1
    const isRuggedRoad = track.fourWdOnly ||
      track.tracktype === 'grade3' || track.tracktype === 'grade4' || track.tracktype === 'grade5' ||
      (track.highway === 'track' && track.tracktype !== 'grade1');

    startEntry.count++;
    startEntry.roads.push(track.name || 'Unnamed Track');
    startEntry.isPublicLand = startEntry.isPublicLand || likelyPublic;
    startEntry.isHighClearance = startEntry.isHighClearance || isRuggedRoad;
    // Note: hasMVUMRoad stays false for OSM tracks
    endpointMap.set(startKey, startEntry);

    // End point
    const endCoord = coords[coords.length - 1];
    const endLng = getCoordLng(endCoord);
    const endLat = getCoordLat(endCoord);
    if (endLat === null || endLng === null) return;

    const endKey = `${endLat.toFixed(4)},${endLng.toFixed(4)}`;
    const endEntry = endpointMap.get(endKey) || {
      lat: endLat, lng: endLng, count: 0, roads: [],
      isPublicLand: false, isHighClearance: false, hasMVUMRoad: false, hasBLMRoad: false
    };
    endEntry.count++;
    endEntry.roads.push(track.name || 'Unnamed Track');
    endEntry.isPublicLand = endEntry.isPublicLand || likelyPublic;
    endEntry.isHighClearance = endEntry.isHighClearance || isRuggedRoad;
    // Note: hasMVUMRoad stays false for OSM tracks
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

  // Helper to look up accessibility (accessibility map uses 3-decimal precision)
  const getAccessibility = (lat: number, lng: number) => {
    const accessKey = `${lat.toFixed(3)},${lng.toFixed(3)}`;
    return accessibilityMap.get(accessKey) || { passengerReachable: false, highClearanceReachable: false };
  };

  // Find dead-ends (endpoints that only appear once = true dead end)
  // and intersections (endpoints that appear 3+ times)
  // ONLY include spots that are on public land
  endpointMap.forEach((entry, key) => {
    // Check if within OSM public land boundaries (additional check)
    const withinPublicLandBoundary = isWithinPublicLand(entry.lat, entry.lng, publicLands);

    // Skip if not on public land (either from road characteristics OR boundary check)
    if (!entry.isPublicLand && !withinPublicLandBoundary) return;

    // Get route accessibility for this spot
    const accessibility = getAccessibility(entry.lat, entry.lng);

    if (entry.count === 1) {
      // Dead end - road terminus on public land
      // Score based on data quality indicators
      let score = 25; // Base score for any dead-end on public land
      const reasons: string[] = ['Road terminus (dead-end)', 'On public land'];

      // Official road sources are more reliable
      if (entry.hasMVUMRoad || entry.hasBLMRoad) {
        score += 10;
        reasons.push(entry.hasMVUMRoad ? 'On MVUM road (official)' : 'On BLM road (official)');
      }

      // Named roads suggest more established access
      const roadName = entry.roads[0];
      // Check for a real name - not generic placeholders
      const hasRealName = roadName &&
        !roadName.match(/^(track|path|road|way|unnamed\s*track)$/i) &&
        !roadName.startsWith('Unnamed');
      if (hasRealName) {
        score += 10; // Named roads are significant for dispersed camping
        reasons.push('Named road');
      }

      // 4WD/high-clearance roads are more remote and desirable for dispersed camping
      if (entry.isHighClearance) {
        score += 3;
        reasons.push('Remote 4WD road');
      }

      // Generate a meaningful name
      let spotName: string;
      if (hasRealName) {
        spotName = `End of ${roadName}`;
      } else {
        // Generate a short location code from coordinates (e.g., "Site N38.55 W109.78")
        const latDir = entry.lat >= 0 ? 'N' : 'S';
        const lngDir = entry.lng >= 0 ? 'E' : 'W';
        const latStr = Math.abs(entry.lat).toFixed(2);
        const lngStr = Math.abs(entry.lng).toFixed(2);
        spotName = `Dispersed ${latDir}${latStr} ${lngDir}${lngStr}`;
      }

      spots.push({
        id: `deadend-${key}`,
        lat: entry.lat,
        lng: entry.lng,
        name: spotName,
        type: 'dead-end',
        score,
        reasons,
        source: 'derived',
        roadName: roadName,
        highClearance: entry.isHighClearance,
        isOnMVUMRoad: entry.hasMVUMRoad,
        isOnBLMRoad: entry.hasBLMRoad,
        isOnPublicLand: entry.isPublicLand,
        passengerReachable: accessibility.passengerReachable,
        highClearanceReachable: accessibility.highClearanceReachable,
      });
    // NOTE: Intersection spots disabled - too many false positives, rarely actual campsites
    // Keeping code for potential future use
    // } else if (entry.count >= 3) {
    //   // Intersection - multiple roads meet
    //   const score = 15;
    //   const reasons: string[] = [`${entry.count} roads intersect here`, 'On public land'];
    //
    //   spots.push({
    //     id: `intersection-${key}`,
    //     lat: entry.lat,
    //     lng: entry.lng,
    //     name: `Road Junction`,
    //     type: 'intersection',
    //     score,
    //     reasons,
    //     source: 'derived',
    //     isOnMVUMRoad: entry.hasMVUMRoad,
    //     isOnBLMRoad: entry.hasBLMRoad,
    //     isOnPublicLand: entry.isPublicLand,
    //     passengerReachable: accessibility.passengerReachable,
    //     highClearanceReachable: accessibility.highClearanceReachable,
    //   });
    // }
    }
  });

  console.log(`Found ${privateRoadPoints.length} private road points for proximity filtering`);

  // Filter out false dead-ends:
  // 1. Dead-ends near the interior of another road (actually intersections due to coordinate mismatch)
  // 2. Dead-ends at junctions with paved/higher-class roads (where dirt track meets pavement)
  const filteredSpots = spots.filter(spot => {
    if (spot.type !== 'dead-end') return true;

    const INTERSECTION_THRESHOLD = 0.00012; // ~12 meters - must be very close
    const PAVED_JUNCTION_THRESHOLD = 0.0003; // ~30 meters for paved road junctions

    // Helper to get lat/lng from coord
    const getLatLng = (coord: any): { lat: number; lng: number } | null => {
      if (Array.isArray(coord) && typeof coord[0] === 'number') {
        return { lat: coord[1], lng: coord[0] };
      } else if (coord && typeof coord.lat === 'number') {
        return { lat: coord.lat, lng: coord.lng ?? coord.lon };
      }
      return null;
    };

    // Check if dead-end is at a junction with a paved or higher-class road
    // These are where dirt tracks meet pavement - not good camping spots
    const isAtPavedRoadJunction = (): boolean => {
      for (const track of osmTracks) {
        if (!track.geometry?.coordinates?.length) continue;
        if (!track.isPaved) continue; // Only check paved roads

        const coords = track.geometry.coordinates;

        // Check if spot is near either endpoint of this paved road
        const startPt = getLatLng(coords[0]);
        const endPt = getLatLng(coords[coords.length - 1]);

        if (startPt) {
          const latDiff = Math.abs(spot.lat - startPt.lat);
          const lngDiff = Math.abs(spot.lng - startPt.lng);
          if (latDiff < PAVED_JUNCTION_THRESHOLD && lngDiff < PAVED_JUNCTION_THRESHOLD) {
            console.log(`Filtering dead-end at paved road junction: ${spot.name} near ${track.highway} road`);
            return true;
          }
        }
        if (endPt) {
          const latDiff = Math.abs(spot.lat - endPt.lat);
          const lngDiff = Math.abs(spot.lng - endPt.lng);
          if (latDiff < PAVED_JUNCTION_THRESHOLD && lngDiff < PAVED_JUNCTION_THRESHOLD) {
            console.log(`Filtering dead-end at paved road junction: ${spot.name} near ${track.highway} road`);
            return true;
          }
        }
      }
      return false;
    };

    // Filter out dead-ends at paved road junctions
    if (isAtPavedRoadJunction()) {
      return false;
    }

    // Check if a point is near an interior point of a road (not its endpoints)
    // Returns true only if the spot is near the MIDDLE of the road, not near either endpoint
    const isNearRoadInterior = (roads: { name?: string; geometry?: { coordinates?: any[] } }[]): string | null => {
      for (const road of roads) {
        if (!road.geometry?.coordinates?.length) continue;
        const coords = road.geometry.coordinates;

        // Skip roads with fewer than 5 points (too short to reliably detect "interior")
        if (coords.length < 5) continue;

        // Check if spot is near road's endpoints (which would be a track-to-track junction, keep it)
        const startPt = getLatLng(coords[0]);
        const endPt = getLatLng(coords[coords.length - 1]);

        if (startPt) {
          const distToStart = Math.abs(spot.lat - startPt.lat) + Math.abs(spot.lng - startPt.lng);
          if (distToStart < INTERSECTION_THRESHOLD * 2) continue; // Near start endpoint - track junction
        }
        if (endPt) {
          const distToEnd = Math.abs(spot.lat - endPt.lat) + Math.abs(spot.lng - endPt.lng);
          if (distToEnd < INTERSECTION_THRESHOLD * 2) continue; // Near end endpoint - track junction
        }

        // Check interior points only (skip first 2 and last 2 points to avoid endpoint proximity)
        for (let i = 2; i < coords.length - 2; i++) {
          const pt = getLatLng(coords[i]);
          if (pt) {
            const latDiff = Math.abs(spot.lat - pt.lat);
            const lngDiff = Math.abs(spot.lng - pt.lng);
            if (latDiff < INTERSECTION_THRESHOLD && lngDiff < INTERSECTION_THRESHOLD) {
              return road.name || 'unnamed road'; // This dead-end is near the interior of another road
            }
          }
        }
      }
      return null;
    };

    // Check if this dead-end is near the interior of any MVUM, BLM, or OSM road
    const nearbyMVUM = isNearRoadInterior(mvumRoads);
    const nearbyBLM = isNearRoadInterior(blmRoads);
    const nearbyOSM = isNearRoadInterior(osmTracks);

    if (nearbyMVUM || nearbyBLM || nearbyOSM) {
      return false; // Filter out - it's actually an intersection
    }

    return true;
  });

  const removedCount = spots.length - filteredSpots.length;
  if (removedCount > 0) {
    console.log(`Filtered out ${removedCount} false dead-ends (actually intersections)`);
  }

  return { spots: filteredSpots, privateRoadPoints };
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

  console.log(`Fetching MVUM roads for bbox: ${minLat.toFixed(4)},${minLng.toFixed(4)} to ${maxLat.toFixed(4)},${maxLng.toFixed(4)}`);

  const response = await fetch(`${USFS_MVUM_API}?${params}`);
  if (!response.ok) {
    throw new Error(`MVUM API error: ${response.status}`);
  }

  const data = await response.json();

  if (!data.features) {
    console.log('MVUM API returned no features - this area may not have digitized MVUM data');
    return [];
  }

  console.log(`MVUM API returned ${data.features.length} roads`);

  return data.features.map((feature: any) => {
    const maintLevel = (feature.properties.OPERATIONALMAINTLEVEL || '').toUpperCase();
    // Check both the explicit flag AND the maintenance level for high clearance
    const isHighClearance = feature.properties.HIGHCLEARANCEVEHICLE === 'Yes' ||
      maintLevel.includes('HIGH CLEARANCE') ||
      maintLevel.startsWith('2 -') || maintLevel.startsWith('2-');
    // Passenger is OK if explicitly marked OR if it's level 3+ (maintained for passenger vehicles)
    const isPassenger = feature.properties.PASSENGERVEHICLE === 'Yes' ||
      maintLevel.startsWith('3 -') || maintLevel.startsWith('3-') ||
      maintLevel.startsWith('4 -') || maintLevel.startsWith('4-') ||
      maintLevel.startsWith('5 -') || maintLevel.startsWith('5-');

    return {
      id: feature.properties.OBJECTID?.toString() || Math.random().toString(),
      name: feature.properties.NAME || 'Unnamed Road',
      surfaceType: feature.properties.SURFACETYPE || 'Unknown',
      highClearanceVehicle: isHighClearance,
      passengerVehicle: isPassenger,
      atv: feature.properties.ATV === 'Yes',
      motorcycle: feature.properties.MOTORCYCLE === 'Yes',
      seasonal: feature.properties.SEASONAL || '',
      operationalMaintLevel: feature.properties.OPERATIONALMAINTLEVEL || '',
      geometry: feature.geometry,
    };
  });
}

/**
 * Query BLM roads in a bounding box
 * Fetches from all relevant state endpoints based on the search area
 * Currently supports: CO, AZ, UT (states with verified working road endpoints)
 */
async function fetchBLMRoads(
  minLat: number,
  minLng: number,
  maxLat: number,
  maxLng: number
): Promise<BLMRoad[]> {
  // Determine which states overlap with the search area
  const states = getStatesForBounds(minLat, minLng, maxLat, maxLng);

  if (states.length === 0) {
    console.log('No BLM road data available for this area (supported: CO, AZ, UT)');
    return [];
  }

  console.log(`Fetching BLM roads for states: ${states.join(', ')}`);

  // Query all relevant state endpoints in parallel
  const statePromises = states.map(async (state) => {
    const config = BLM_ROAD_ENDPOINTS[state];
    if (!config) return [];

    try {
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
        outFields: `OBJECTID,${config.nameField},${config.surfaceField},${config.typeField}`,
        returnGeometry: 'true',
        outSR: '4326',
        f: 'geojson',
      });

      const response = await fetch(`${config.url}?${params}`);
      if (!response.ok) {
        console.warn(`BLM ${state} API returned ${response.status}`);
        return [];
      }

      const data = await response.json();

      if (!data.features) {
        console.log(`BLM ${state} API returned no features`);
        return [];
      }

      console.log(`BLM ${state} API returned ${data.features.length} roads`);

      return data.features.map((feature: any) => {
        const props = feature.properties || {};
        return {
          id: `blm-${state}-${props.OBJECTID || Math.random().toString()}`,
          name: props[config.nameField] || 'Unnamed BLM Road',
          surfaceType: props[config.surfaceField] || 'Unknown',
          routeType: props[config.typeField] || 'road',
          geometry: feature.geometry,
        };
      });
    } catch (error) {
      console.error(`BLM ${state} fetch error:`, error);
      return [];
    }
  });

  const stateResults = await Promise.all(statePromises);
  const allRoads = stateResults.flat();

  console.log(`Total BLM roads fetched: ${allRoads.length}`);
  return allRoads;
}

// USFS Recreation Opportunities API - has campgrounds not in RIDB
const USFS_RECREATION_API = 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_RecreationOpportunities_01/MapServer/0/query';

/**
 * Fetch USFS campgrounds from Recreation Opportunities API
 * This catches primitive/FCFS campgrounds not in Recreation.gov
 */
async function fetchUSFSCampgrounds(
  minLat: number,
  minLng: number,
  maxLat: number,
  maxLng: number
): Promise<EstablishedCampground[]> {
  try {
    const params = new URLSearchParams({
      // MARKERACTIVITY contains the type like "Campground Camping"
      // MARKERACTIVITYGROUP contains broader category like "Camping & Cabins"
      where: "MARKERACTIVITY LIKE '%Campground%' OR MARKERACTIVITY LIKE '%Camping%' OR MARKERACTIVITYGROUP LIKE '%Camping%'",
      geometry: JSON.stringify({
        xmin: minLng,
        ymin: minLat,
        xmax: maxLng,
        ymax: maxLat,
        spatialReference: { wkid: 4326 },
      }),
      geometryType: 'esriGeometryEnvelope',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: 'RECAREAID,RECAREANAME,RECAREADESCRIPTION,FORESTNAME,MARKERACTIVITY,MARKERACTIVITYGROUP,RESERVATION_INFO,RECAREAURL',
      returnGeometry: 'true',
      outSR: '4326',
      f: 'json',
    });

    const response = await fetch(`${USFS_RECREATION_API}?${params}`);
    if (!response.ok) {
      console.warn(`USFS Recreation API returned ${response.status}`);
      return [];
    }

    const data = await response.json();
    if (!data.features) {
      return [];
    }

    console.log(`Found ${data.features.length} USFS campgrounds from Recreation API`);

    return data.features
      .filter((f: any) => f.geometry?.x && f.geometry?.y)
      .map((f: any) => {
        const reservationInfo = (f.attributes.RESERVATION_INFO || '').toLowerCase();
        const isReservable = reservationInfo.includes('reserve') && !reservationInfo.includes('first come');

        return {
          id: `usfs-${f.attributes.RECAREAID}`,
          name: f.attributes.RECAREANAME || 'USFS Campground',
          lat: f.geometry.y,
          lng: f.geometry.x,
          description: f.attributes.RECAREADESCRIPTION?.replace(/<[^>]*>/g, '').slice(0, 200) || '',
          facilityType: f.attributes.MARKERACTIVITY || f.attributes.MARKERACTIVITYGROUP || 'Campground',
          agencyName: f.attributes.FORESTNAME || 'USFS',
          reservable: isReservable,
          url: f.attributes.RECAREAURL || undefined,
        };
      });
  } catch (error) {
    console.error('USFS Recreation API error:', error);
    return [];
  }
}

/**
 * Fetch established campgrounds from RIDB via Vite proxy
 */
async function fetchRIDBCampgrounds(
  lat: number,
  lng: number,
  radiusMiles: number
): Promise<EstablishedCampground[]> {
  try {
    // Use local Vite proxy for RIDB API (proxies to ridb.recreation.gov with API key)
    const params = new URLSearchParams({
      latitude: lat.toString(),
      longitude: lng.toString(),
      radius: radiusMiles.toString(),
      limit: '100',
    });

    console.log('[fetchRIDBCampgrounds] Fetching RIDB campgrounds for dispersed explorer');

    const response = await fetch(`/api/ridb/facilities?${params}`);

    if (!response.ok) {
      console.error('[fetchRIDBCampgrounds] RIDB API error:', response.status);
      return [];
    }

    const data = await response.json();
    const facilities = data.RECDATA || [];

    // Filter to only include campgrounds and related facilities
    const campgroundTypes = ['campground', 'camping', 'camp', 'campsite', 'primitive'];
    const campgrounds = facilities.filter((f: any) => {
      if (!f.FacilityLatitude || !f.FacilityLongitude) return false;
      const typeDesc = (f.FacilityTypeDescription || '').toLowerCase();
      const name = (f.FacilityName || '').toLowerCase();
      const keywords = (f.Keywords || '').toLowerCase();
      return campgroundTypes.some(type =>
        typeDesc.includes(type) || name.includes(type) || keywords.includes(type)
      );
    });

    console.log(`[fetchRIDBCampgrounds] Found ${campgrounds.length} established campgrounds from RIDB (from ${facilities.length} total facilities)`);

    return campgrounds.map((facility: any) => {
      // Clean up the description - remove HTML tags
      const cleanDescription = facility.FacilityDescription
        ?.replace(/<[^>]*>/g, '')
        ?.slice(0, 200) || '';

      return {
        id: `ridb-${facility.FacilityID}`,
        name: facility.FacilityName,
        lat: facility.FacilityLatitude,
        lng: facility.FacilityLongitude,
        description: cleanDescription,
        facilityType: facility.FacilityTypeDescription || 'Campground',
        agencyName: facility.FACILITYUSEFEE ? 'Fee Area' : undefined,
        reservable: facility.Reservable === true,
        url: `https://www.recreation.gov/camping/campgrounds/${facility.FacilityID}`,
      };
    });
  } catch (error) {
    console.error('[fetchRIDBCampgrounds] RIDB campground fetch error:', error);
    return [];
  }
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

// Private/industrial land areas from OSM
export interface PrivateLandArea {
  id: number;
  name?: string;
  type: string; // industrial, quarry, commercial, private
  geometry: {
    type: 'Polygon';
    coordinates: [number, number][];
  };
}

// Exclusion point (ranger stations, visitor centers, parking lots)
interface ExclusionPoint {
  lat: number;
  lng: number;
  type: string;
  name?: string;
}

/**
 * Combined OSM query for tracks and camp sites
 * This reduces API calls to avoid rate limiting
 */
interface OSMCombinedResult {
  tracks: OSMTrack[];
  campSites: PotentialSpot[];
  publicLands: PublicLandArea[];
  privateLands: PrivateLandArea[];
  exclusionPoints: ExclusionPoint[];
}

async function fetchAllOSMData(
  minLat: number,
  minLng: number,
  maxLat: number,
  maxLng: number
): Promise<OSMCombinedResult> {
  // Optimized Overpass query - removed expensive public lands (using BLM API instead)
  // Added private/industrial land areas to filter out spots on private property
  const query = `
    [out:json][timeout:45];
    (
      // Tracks and unpaved roads - need full geometry for dead-end detection
      way["highway"="track"](${minLat},${minLng},${maxLat},${maxLng});
      way["highway"="unclassified"]["surface"~"unpaved|gravel|dirt|ground|sand|mud"](${minLat},${minLng},${maxLat},${maxLng});
      way["highway"="tertiary"]["surface"~"unpaved|gravel|dirt|ground|sand|mud"](${minLat},${minLng},${maxLat},${maxLng});
      way["highway"="secondary"]["surface"~"unpaved|gravel|dirt|ground|sand|mud"](${minLat},${minLng},${maxLat},${maxLng});
      way["4wd_only"="yes"](${minLat},${minLng},${maxLat},${maxLng});

      // Paved roads - needed to filter out dead-ends at paved road junctions
      way["highway"="tertiary"](${minLat},${minLng},${maxLat},${maxLng});
      way["highway"="secondary"](${minLat},${minLng},${maxLat},${maxLng});
      way["highway"="primary"](${minLat},${minLng},${maxLat},${maxLng});
      way["highway"="residential"](${minLat},${minLng},${maxLat},${maxLng});
      way["highway"="unclassified"](${minLat},${minLng},${maxLat},${maxLng});

      // Camp sites - nodes and ways
      node["tourism"="camp_site"](${minLat},${minLng},${maxLat},${maxLng});
      node["tourism"="camp_pitch"](${minLat},${minLng},${maxLat},${maxLng});
      way["tourism"="camp_site"](${minLat},${minLng},${maxLat},${maxLng});
      node["camp_site"](${minLat},${minLng},${maxLat},${maxLng});
      node["camp_type"](${minLat},${minLng},${maxLat},${maxLng});
      node["leisure"="firepit"](${minLat},${minLng},${maxLat},${maxLng});

      // Private/industrial land areas - to exclude from dispersed camping
      way["landuse"="industrial"](${minLat},${minLng},${maxLat},${maxLng});
      way["landuse"="quarry"](${minLat},${minLng},${maxLat},${maxLng});
      way["landuse"="landfill"](${minLat},${minLng},${maxLat},${maxLng});
      way["landuse"="military"](${minLat},${minLng},${maxLat},${maxLng});
      way["access"="private"]["landuse"](${minLat},${minLng},${maxLat},${maxLng});
      // Ranger stations, visitor centers, and similar facilities
      node["amenity"="ranger_station"](${minLat},${minLng},${maxLat},${maxLng});
      way["amenity"="ranger_station"](${minLat},${minLng},${maxLat},${maxLng});
      node["tourism"="information"]["information"="visitor_centre"](${minLat},${minLng},${maxLat},${maxLng});
      node["tourism"="information"]["information"="office"](${minLat},${minLng},${maxLat},${maxLng});
      way["amenity"="parking"](${minLat},${minLng},${maxLat},${maxLng});
      // Industrial water features (evaporation ponds, settling basins, etc.)
      way["water"="basin"](${minLat},${minLng},${maxLat},${maxLng});
      way["water"="reservoir"]["reservoir_type"="evaporation"](${minLat},${minLng},${maxLat},${maxLng});
      way["man_made"="evaporation_pond"](${minLat},${minLng},${maxLat},${maxLng});
      way["man_made"="tailings_pond"](${minLat},${minLng},${maxLat},${maxLng});
      // Ponds near private/industrial roads are likely industrial (evaporation ponds)
      way["water"="pond"](${minLat},${minLng},${maxLat},${maxLng});
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
    return { tracks: [], campSites: [], publicLands: [], privateLands: [], exclusionPoints: [] };
  }

  console.log('OSM response elements:', data.elements.length, 'total');

  // Debug: count element types
  const wayCount = data.elements.filter((el: any) => el.type === 'way').length;
  const nodeCount = data.elements.filter((el: any) => el.type === 'node').length;
  const waysWithGeom = data.elements.filter((el: any) => el.type === 'way' && el.geometry).length;
  const waysWithHighway = data.elements.filter((el: any) => el.type === 'way' && el.tags?.highway).length;
  console.log('OSM breakdown:', { wayCount, nodeCount, waysWithGeom, waysWithHighway });

  // Parse tracks
  const pavedHighways = ['tertiary', 'secondary', 'primary', 'residential', 'trunk', 'motorway'];
  const pavedSurfaces = ['paved', 'asphalt', 'concrete', 'cobblestone'];
  const unpavedSurfaces = ['unpaved', 'gravel', 'dirt', 'ground', 'sand', 'mud', 'grass'];

  const tracks: OSMTrack[] = data.elements
    .filter((el: any) => el.type === 'way' && el.geometry && el.tags?.highway)
    .map((el: any) => {
      const highway = el.tags?.highway || 'track';
      const surface = el.tags?.surface || '';

      // Determine if this is a paved road (used for junction filtering, not dead-end generation)
      // A road is paved if: it has a paved surface, OR it's a higher-class road without unpaved surface
      const hasPavedSurface = pavedSurfaces.some(s => surface.includes(s));
      const hasUnpavedSurface = unpavedSurfaces.some(s => surface.includes(s));
      const isHigherClassRoad = pavedHighways.includes(highway);
      const isPaved = hasPavedSurface || (isHigherClassRoad && !hasUnpavedSurface);

      return {
        id: el.id,
        // Use name if available, otherwise ref (e.g., "FR 123"), otherwise undefined
        name: el.tags?.name || el.tags?.ref,
        highway,
        surface: el.tags?.surface,
        tracktype: el.tags?.tracktype,
        access: el.tags?.access,
        fourWdOnly: el.tags?.['4wd_only'] === 'yes',
        isPaved,
        geometry: {
          type: 'LineString' as const,
          coordinates: el.geometry.map((pt: any) => [pt.lon, pt.lat]),
        },
      };
    });

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
      // For nodes, use lat/lon directly
      // For ways, calculate center from geometry
      let lat = el.lat || el.center?.lat;
      let lng = el.lon || el.center?.lon;

      // If no direct coordinates, calculate center from geometry (for ways/polygons)
      if (!lat && el.geometry && el.geometry.length > 0) {
        const sumLat = el.geometry.reduce((sum: number, pt: any) => sum + pt.lat, 0);
        const sumLng = el.geometry.reduce((sum: number, pt: any) => sum + pt.lon, 0);
        lat = sumLat / el.geometry.length;
        lng = sumLng / el.geometry.length;
      }

      const tags = el.tags || {};
      const name = tags.name || '';

      // Determine if this is a dispersed/backcountry site
      const isBackcountry = tags.backcountry === 'yes' ||
        tags.camp_site === 'basic' ||
        tags.camp_type === 'wildcamp' ||
        tags.camp_type === 'non_designated';

      const isFirepit = tags.leisure === 'firepit';

      // Determine if this is an established campground (vs dispersed site)
      // Indicators of established campground:
      const isWayOrArea = el.type === 'way' || el.type === 'relation';
      const hasFee = tags.fee === 'yes';
      const hasAmenities = tags.toilets || tags.drinking_water || tags.shower ||
                          tags.power_supply || tags.internet_access;
      const hasCapacity = tags.capacity && parseInt(tags.capacity) > 5;
      const nameIndicatesCampground = /campground|camp\s|camping|rv\s*park|yurt/i.test(name);
      const isIndividualSite = /^Site\s*\d/i.test(name) || tags.tourism === 'camp_pitch';

      // Score how likely this is an established campground (not dispersed)
      // Requires strong evidence - polygon alone is not enough
      let establishedScore = 0;
      if (isWayOrArea) establishedScore += 1;  // Polygon gives slight boost, but not enough alone
      if (hasFee) establishedScore += 2;       // Fee is strong indicator
      if (hasAmenities) establishedScore += 2; // Amenities are strong indicator
      if (hasCapacity) establishedScore += 1;
      if (nameIndicatesCampground) establishedScore += 2;  // Name is strong indicator
      if (isBackcountry) establishedScore -= 3;  // Definitely not established
      if (isIndividualSite) establishedScore -= 1;  // Individual sites within campgrounds

      // Require score >= 3 AND either: name indicates campground, OR has fee/amenities
      // This prevents random polygons from being classified as established
      const hasStrongIndicator = nameIndicatesCampground || hasFee || hasAmenities;
      const isEstablishedCampground = establishedScore >= 3 && !isBackcountry && hasStrongIndicator;

      let displayName = name || 'Camp Site';
      if (isFirepit && !name) displayName = 'Fire Ring';

      // Granular scoring based on data quality
      let score = 35; // Base score for any OSM camp site
      const reasons: string[] = [];

      if (isEstablishedCampground) {
        // Established campgrounds get base score, shown differently in UI
        reasons.push('Established campground');
      } else if (tags.tourism === 'camp_site') {
        reasons.push('OSM camp site');

        // Bonus for having a real name (not generic)
        if (name && !name.match(/^(camp\s*site|campsite|camping)$/i)) {
          score += 5;
          reasons.push('Named location');
        }

        // Bonus for backcountry/primitive designation
        if (isBackcountry) {
          score += 5;
          reasons.push('Backcountry/primitive');
        }

        // Bonus for fire ring (infrastructure confirms camping)
        if (isFirepit) {
          score += 3;
          reasons.push('Has fire ring');
        }

        // Bonus for multiple confirming tags
        const confirmingTags = [
          tags.camp_site,
          tags.camp_type,
          tags.openfire,
          tags.drinking_water,
          tags.toilets
        ].filter(Boolean).length;
        if (confirmingTags >= 2) {
          score += 2;
          reasons.push('Multiple confirming tags');
        }
      } else if (tags.camp_site || tags.camp_type) {
        score = 33;
        reasons.push('Mapped camping location');
        if (name && !name.match(/^(camp\s*site|campsite|camping)$/i)) {
          score += 3;
          reasons.push('Named location');
        }
      } else if (isFirepit) {
        score = 30;
        reasons.push('Fire ring/pit (likely camp spot)');
      } else {
        reasons.push('Camping-related feature');
      }

      return {
        id: `camp-${el.id}`,
        lat,
        lng,
        name: displayName,
        type: 'camp-site' as const,
        score,
        reasons,
        source: 'osm' as const,
        isEstablishedCampground,
        isBackcountry,
        isIndividualSite,
      };
    })
    .filter((s: any) => s.lat && s.lng);

  // Public lands are now fetched from BLM SMA API separately, return empty array
  const publicLands: PublicLandArea[] = [];

  // Parse private/industrial land areas
  const privateLands: PrivateLandArea[] = data.elements
    .filter((el: any) => {
      if (el.type !== 'way' || !el.geometry || el.geometry.length < 3) return false;
      const tags = el.tags || {};
      return tags.landuse === 'industrial' ||
        tags.landuse === 'quarry' ||
        tags.landuse === 'landfill' ||
        tags.landuse === 'military' ||
        (tags.access === 'private' && tags.landuse) ||
        tags.water === 'basin' ||
        tags.water === 'pond' ||
        tags['reservoir_type'] === 'evaporation' ||
        tags.man_made === 'evaporation_pond' ||
        tags.man_made === 'tailings_pond';
    })
    .map((el: any) => {
      const tags = el.tags || {};
      return {
        id: el.id,
        name: tags.name,
        type: tags.landuse || 'private',
        geometry: {
          type: 'Polygon' as const,
          coordinates: el.geometry.map((pt: any) => [pt.lon, pt.lat]),
        },
      };
    });

  console.log(`Found ${privateLands.length} private/industrial land areas from OSM`);

  // Parse exclusion points (ranger stations, visitor centers, parking lots)
  const exclusionPoints: ExclusionPoint[] = data.elements
    .filter((el: any) => {
      const tags = el.tags || {};
      return tags.amenity === 'ranger_station' ||
        tags.amenity === 'parking' ||
        (tags.tourism === 'information' && (tags.information === 'visitor_centre' || tags.information === 'office'));
    })
    .map((el: any) => {
      const tags = el.tags || {};
      // For nodes, use lat/lon directly; for ways, calculate center
      let lat = el.lat;
      let lng = el.lon;
      if (!lat && el.geometry && el.geometry.length > 0) {
        lat = el.geometry.reduce((sum: number, pt: any) => sum + pt.lat, 0) / el.geometry.length;
        lng = el.geometry.reduce((sum: number, pt: any) => sum + pt.lon, 0) / el.geometry.length;
      }
      return {
        lat,
        lng,
        type: tags.amenity || tags.tourism || 'exclusion',
        name: tags.name,
      };
    })
    .filter((p: ExclusionPoint) => p.lat && p.lng);

  console.log(`Found ${exclusionPoints.length} exclusion points (ranger stations, parking, etc.)`);

  return { tracks, campSites, publicLands, privateLands, exclusionPoints };
}

/**
 * Hook to fetch dispersed camping roads from MVUM and OSM
 */
export function useDispersedRoads(
  lat: number | null,
  lng: number | null,
  radiusMiles: number = 10
): DispersedRoadsResult {
  const [mvumRoads, setMvumRoads] = useState<MVUMRoad[]>([]);
  const [blmRoads, setBlmRoads] = useState<BLMRoad[]>([]);
  const [osmTracks, setOsmTracks] = useState<OSMTrack[]>([]);
  const [potentialSpots, setPotentialSpots] = useState<PotentialSpot[]>([]);
  const [establishedCampgrounds, setEstablishedCampgrounds] = useState<EstablishedCampground[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (lat === null || lng === null) {
      setMvumRoads([]);
      setBlmRoads([]);
      setOsmTracks([]);
      setPotentialSpots([]);
      setEstablishedCampgrounds([]);
      return;
    }

    const fetchRoads = async () => {
      setLoading(true);
      setError(null);

      // Clear previous data immediately when starting a new search
      setMvumRoads([]);
      setBlmRoads([]);
      setOsmTracks([]);
      setPotentialSpots([]);
      setEstablishedCampgrounds([]);

      // Calculate bounding box from center point and radius
      const latDelta = radiusMiles / 69; // ~69 miles per degree latitude
      const lngDelta = radiusMiles / (69 * Math.cos(lat * (Math.PI / 180)));

      const minLat = lat - latDelta;
      const maxLat = lat + latDelta;
      const minLng = lng - lngDelta;
      const maxLng = lng + lngDelta;

      try {
        // Fetch MVUM, BLM, OSM data, USFS campgrounds, and RIDB campgrounds in parallel
        const [mvum, blm, osmData, usfsCampgrounds, ridbCampgrounds] = await Promise.all([
          fetchMVUMRoads(minLat, minLng, maxLat, maxLng).catch((err) => {
            console.error('MVUM fetch error:', err);
            return [];
          }),
          fetchBLMRoads(minLat, minLng, maxLat, maxLng).catch((err) => {
            console.error('BLM fetch error:', err);
            return [];
          }),
          fetchAllOSMData(minLat, minLng, maxLat, maxLng).then((data) => {
            console.log('OSM data fetched:', data.tracks.length, 'tracks,', data.campSites.length, 'camps,', data.publicLands.length, 'public lands,', data.privateLands.length, 'private lands');
            return data;
          }).catch((err) => {
            console.error('OSM fetch error:', err);
            return { tracks: [], campSites: [], publicLands: [], privateLands: [], exclusionPoints: [] };
          }),
          fetchUSFSCampgrounds(minLat, minLng, maxLat, maxLng).catch((err) => {
            console.error('USFS campgrounds fetch error:', err);
            return [];
          }),
          fetchRIDBCampgrounds(lat, lng, radiusMiles).catch((err) => {
            console.error('RIDB campgrounds fetch error:', err);
            return [];
          }),
        ]);

        const { tracks: osm, campSites: camps, publicLands, privateLands, exclusionPoints } = osmData;

        // Merge RIDB and USFS campgrounds, deduplicating by proximity
        const allCampgrounds = [...ridbCampgrounds];
        usfsCampgrounds.forEach(usfsCg => {
          // Only add USFS campground if not already in RIDB (within 0.25 miles)
          const alreadyInRIDB = ridbCampgrounds.some(ridbCg =>
            getDistanceMiles(usfsCg.lat, usfsCg.lng, ridbCg.lat, ridbCg.lng) < 0.25
          );
          if (!alreadyInRIDB) {
            allCampgrounds.push(usfsCg);
          }
        });

        // Add OSM campgrounds (established campgrounds with amenities, not dispersed sites)
        // Use the isEstablishedCampground flag computed during parsing
        const osmCampgrounds = camps.filter((camp: any) => camp.isEstablishedCampground);

        osmCampgrounds.forEach(osmCg => {
          // Only add if not already in list - require VERY close proximity for dedup
          // Don't use name matching since campgrounds can have multiple loops (e.g., SFRA Loop A, Loop G)
          const alreadyExists = allCampgrounds.some(cg => {
            const dist = getDistanceMiles(osmCg.lat, osmCg.lng, cg.lat, cg.lng);
            // Only consider duplicate if at essentially the same location (<0.05 miles / ~80 meters)
            return dist < 0.05;
          });
          if (!alreadyExists) {
            allCampgrounds.push({
              id: osmCg.id,
              name: osmCg.name,
              lat: osmCg.lat,
              lng: osmCg.lng,
              facilityType: 'Campground',
              agencyName: 'OSM',
              reservable: false,
            });
          }
        });

        console.log(`Total campgrounds: ${allCampgrounds.length} (${ridbCampgrounds.length} RIDB, ${usfsCampgrounds.length} USFS, ${osmCampgrounds.length} OSM)`);

        setMvumRoads(mvum);
        setBlmRoads(blm);
        setOsmTracks(osm);
        setEstablishedCampgrounds(allCampgrounds);

        // Analyze road network accessibility to determine which spots are reachable
        // by passenger vehicles vs requiring high-clearance/4WD
        const searchBounds = { minLat, maxLat, minLng, maxLng };
        const accessibilityMap = analyzeRoadAccessibility(mvum, blm, osm, searchBounds);

        // Find dead-ends and intersections from road geometry
        // Pass publicLands for additional boundary checking and accessibilityMap for route reachability
        const { spots: derivedSpots, privateRoadPoints } = findDeadEnds(mvum, blm, osm, publicLands, accessibilityMap);

        // Helper to check if a point is near any private road
        // Using 0.5 mile buffer since industrial areas often have many unmarked internal roads
        const isNearPrivateRoad = (lat: number, lng: number, thresholdMiles: number = 0.5): boolean => {
          return privateRoadPoints.some(pt =>
            getDistanceMiles(lat, lng, pt.lat, pt.lng) < thresholdMiles
          );
        };

        // Filter out derived spots that are:
        // 1. Within 0.5 miles of known OSM camp sites
        // 2. Within 0.5 miles of established campgrounds (RIDB + USFS)
        // 3. Within private/industrial land areas (Potash fields, mines, etc.)
        // 4. Near roads marked as private (0.3 mile buffer)
        const filteredDerivedSpots = derivedSpots.filter(spot => {
          // Debug: check specific spot near ranger station
          const isDebugSpot = Math.abs(spot.lat - 38.5748) < 0.005 && Math.abs(spot.lng - (-109.5494)) < 0.005;

          // Check if within private/industrial land
          const privateCheck = isWithinPrivateLand(spot.lat, spot.lng, privateLands);
          if (privateCheck.isPrivate) {
            if (isDebugSpot) console.log(`[DEBUG] Ranger station spot filtered: private land (${privateCheck.landType}: ${privateCheck.landName})`);
            console.log(`Filtering out spot on private land: ${spot.name} (${privateCheck.landType}: ${privateCheck.landName || 'unnamed'})`);
            return false;
          }

          // Check if near a road marked as private
          if (isNearPrivateRoad(spot.lat, spot.lng)) {
            if (isDebugSpot) console.log(`[DEBUG] Ranger station spot filtered: near private road`);
            console.log(`Filtering out spot near private road: ${spot.name}`);
            return false;
          }

          // NOTE: We no longer filter dead-ends near OSM camp sites
          // OSM camp sites and dead-ends serve different purposes - both are valid spots
          // This matches Fast mode behavior where derived spots are shown alongside camp sites

          // Check established campgrounds (merged RIDB + USFS)
          const tooCloseToEstablished = allCampgrounds.some(cg =>
            getDistanceMiles(spot.lat, spot.lng, cg.lat, cg.lng) < 0.5
          );
          if (tooCloseToEstablished) {
            if (isDebugSpot) console.log(`[DEBUG] Ranger station spot filtered: too close to established campground`);
            return false;
          }

          // Check if near ranger stations, visitor centers, or parking lots
          const nearExclusionPoint = exclusionPoints.some(ep =>
            getDistanceMiles(spot.lat, spot.lng, ep.lat, ep.lng) < 0.25
          );
          if (nearExclusionPoint) {
            if (isDebugSpot) console.log(`[DEBUG] Ranger station spot filtered: near exclusion point`);
            console.log(`Filtering out spot near ranger station/visitor center: ${spot.name}`);
            return false;
          }

          if (isDebugSpot) console.log(`[DEBUG] Ranger station spot PASSED all filters at ${spot.lat}, ${spot.lng}`);
          return true;
        });

        // Filter out backcountry/hike-in campsites that aren't near any road
        // These are for backpackers, not car camping
        // Also determine vehicle accessibility for each camp-site based on nearby roads
        // Use 0.5 mile threshold to be inclusive - some OSM sites are slightly off from roads
        const roadAccessibleCamps = camps
          .filter(camp => {
            const nearRoad = isNearRoad(camp.lat, camp.lng, mvum, osm, 0.5, blm);
            // Debug: check specific camp sites
            const isDebugCamp1 = Math.abs(camp.lat - 38.457196) < 0.001 && Math.abs(camp.lng - (-109.476386)) < 0.001;
            const isDebugCamp2 = Math.abs(camp.lat - 38.466396) < 0.001 && Math.abs(camp.lng - (-109.60488)) < 0.001;
            if (isDebugCamp2) {
              console.log('[DEBUG] Camp site at 38.466, -109.605:', {
                name: camp.name,
                lat: camp.lat,
                lng: camp.lng,
                nearRoad,
                isEstablished: camp.isEstablishedCampground,
                isIndividualSite: camp.isIndividualSite,
              });
            }
            if (isDebugCamp1) {
              console.log('[DEBUG] Camp site at 38.457, -109.476:', {
                name: camp.name,
                lat: camp.lat,
                lng: camp.lng,
                nearRoad,
                mvumRoadsCount: mvum.length,
                osmTracksCount: osm.length,
              });
            }
            if (!nearRoad) {
              console.log(`Filtering out backcountry camp: ${camp.name} (not near any road)`);
            }
            return nearRoad;
          })
          .map(camp => {
            // Determine accessibility based on nearby roads
            const accessibility = determinePointAccessibility(camp.lat, camp.lng, mvum, blm, osm, 0.25);
            return {
              ...camp,
              passengerReachable: accessibility.passengerReachable,
              highClearanceReachable: accessibility.highClearanceReachable,
            };
          });

        // Filter out OSM camps that are:
        // 1. Established campgrounds (already added to allCampgrounds)
        // 2. Individual sites within established campgrounds (Site 1, Site 2, etc.)
        // 3. Any camp too close to an established campground
        // 4. Within private/industrial land areas
        const trulyDispersedCamps = roadAccessibleCamps.filter((camp: any) => {
          // Debug: check specific camp site
          const isDebugCamp = Math.abs(camp.lat - 38.466396) < 0.001 && Math.abs(camp.lng - (-109.60488)) < 0.001;

          // Skip if this is an established campground (already in establishedCampgrounds)
          if (camp.isEstablishedCampground) {
            if (isDebugCamp) console.log(`[DEBUG] Camp at 38.466, -109.605 filtered: isEstablishedCampground`);
            return false;
          }

          // Skip if within private/industrial land
          const privateCheck = isWithinPrivateLand(camp.lat, camp.lng, privateLands);
          if (privateCheck.isPrivate) {
            if (isDebugCamp) console.log(`[DEBUG] Camp at 38.466, -109.605 filtered: private land (${privateCheck.landType})`);
            console.log(`Filtering out camp on private land: ${camp.name} (${privateCheck.landType}: ${privateCheck.landName || 'unnamed'})`);
            return false;
          }

          // Skip if near a road marked as private
          if (isNearPrivateRoad(camp.lat, camp.lng)) {
            if (isDebugCamp) console.log(`[DEBUG] Camp at 38.466, -109.605 filtered: near private road`);
            console.log(`Filtering out camp near private road: ${camp.name}`);
            return false;
          }

          // NOTE: We do NOT filter individual OSM camp sites (Site 1, Site 2, etc.)
          // These are explicitly tagged camping locations and should be shown
          // The individual site filter only applies to derived spots (dead-ends)

          // Skip "Host" sites (camp hosts at established campgrounds)
          if (/^Host$/i.test(camp.name || '') || /CAMP HOST/i.test(camp.name || '')) {
            if (isDebugCamp) console.log(`[DEBUG] Camp at 38.466, -109.605 filtered: Host site`);
            return false;
          }

          // NOTE: We do NOT filter OSM camp sites by campground proximity
          // OSM camp sites are explicitly tagged camping locations and should be shown
          // The 0.25-mile campground proximity filter only applies to derived spots (dead-ends)
          if (isDebugCamp) console.log(`[DEBUG] Camp at 38.466, -109.605 PASSED all filters`);
          return true;
        })
        // Deduplicate camps that are very close to each other (within ~50 meters)
        // This removes duplicate RV park spots, individual pitches mapped separately, etc.
        .filter((camp, index, array) => {
          const DEDUP_THRESHOLD = 0.0005; // ~50 meters in degrees
          // Keep this camp only if no earlier camp is within threshold
          return !array.slice(0, index).some(earlier => {
            const latDiff = Math.abs(camp.lat - earlier.lat);
            const lngDiff = Math.abs(camp.lng - earlier.lng);
            return latDiff < DEDUP_THRESHOLD && lngDiff < DEDUP_THRESHOLD;
          });
        });

        // Remove derived spots (dead-ends) that are very close to OSM camp sites
        // OSM camp sites are explicitly tagged and should take precedence
        const DEDUP_THRESHOLD_MILES = 0.06; // ~100 meters
        const dedupedFromCamps = filteredDerivedSpots.filter(derivedSpot => {
          const nearCampSite = trulyDispersedCamps.some(camp =>
            getDistanceMiles(derivedSpot.lat, derivedSpot.lng, camp.lat, camp.lng) < DEDUP_THRESHOLD_MILES
          );
          return !nearCampSite;
        });

        // Also deduplicate derived spots that are very close to each other (~50 meters)
        const DERIVED_DEDUP_THRESHOLD = 0.0005; // ~50 meters in degrees
        const dedupedDerivedSpots = dedupedFromCamps.filter((spot, index, array) => {
          // Keep this spot only if no earlier spot is within threshold
          return !array.slice(0, index).some(earlier => {
            const latDiff = Math.abs(spot.lat - earlier.lat);
            const lngDiff = Math.abs(spot.lng - earlier.lng);
            return latDiff < DERIVED_DEDUP_THRESHOLD && lngDiff < DERIVED_DEDUP_THRESHOLD;
          });
        });

        console.log('Dispersed data:', {
          mvumRoads: mvum.length,
          blmRoads: blm.length,
          osmTracks: osm.length,
          establishedCampgrounds: allCampgrounds.length,
          osmCampsTotal: camps.length,
          osmCampsNearRoads: roadAccessibleCamps.length,
          trulyDispersedCamps: trulyDispersedCamps.length,
          derivedSpots: derivedSpots.length,
          filteredDerivedSpots: filteredDerivedSpots.length,
          dedupedDerivedSpots: dedupedDerivedSpots.length,
          privateLandAreas: privateLands.length,
        });

        // Combine all potential spots: truly dispersed OSM camp sites + deduped derived spots
        const allSpots = [...trulyDispersedCamps, ...dedupedDerivedSpots];

        // Filter to circular radius (bounding box may include corners beyond radiusMiles)
        const spotsWithinRadius = allSpots.filter(spot =>
          getDistanceMiles(lat, lng, spot.lat, spot.lng) <= radiusMiles
        );

        // Sort by score (highest first)
        spotsWithinRadius.sort((a, b) => b.score - a.score);

        setPotentialSpots(spotsWithinRadius);
      } catch (err) {
        console.error('Dispersed roads fetch error:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch roads');
      } finally {
        setLoading(false);
      }
    };

    fetchRoads();
  }, [lat, lng, radiusMiles]);

  return { mvumRoads, blmRoads, osmTracks, potentialSpots, establishedCampgrounds, loading, error };
}
