/**
 * Topographic Photo Spot Analyzer
 *
 * Analyzes terrain to find locations that would photograph well based on:
 * - Elevation advantage (overlooks)
 * - Clear sightlines toward sun
 * - Interesting terrain features catching the light
 */

export interface TopoPhotoSpot {
  lat: number;
  lng: number;
  elevation: number;
  score: number;
  type: 'overlook' | 'vantage_point' | 'open_vista' | 'feature_view';
  description: string;
  viewDirection: number;  // Best direction to face (degrees)
  viewDirectionLabel: string;
  prominence: number;  // How much higher than surroundings
  horizonClearance: number;  // Degrees of clear horizon toward sun
  accessible: boolean;
  accessType: 'road' | 'track' | 'trail' | 'path' | 'none';
  accessDistance: number;  // km to nearest access
}

interface ElevationPoint {
  lat: number;
  lng: number;
  elevation: number;
  distanceFromCenter: number;
  bearingFromCenter: number;
}

/**
 * Convert degrees to radians
 */
function toRad(deg: number): number {
  return deg * Math.PI / 180;
}

/**
 * Convert radians to degrees
 */
function toDeg(rad: number): number {
  return rad * 180 / Math.PI;
}

/**
 * Calculate distance between two points in km
 */
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Calculate bearing from point A to point B
 */
function calculateBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = toRad(lng2 - lng1);
  const lat1Rad = toRad(lat1);
  const lat2Rad = toRad(lat2);

  const x = Math.sin(dLng) * Math.cos(lat2Rad);
  const y = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
            Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);

  return (toDeg(Math.atan2(x, y)) + 360) % 360;
}

/**
 * Get point at distance and bearing from origin
 */
function pointAtBearing(lat: number, lng: number, bearing: number, distanceKm: number): { lat: number; lng: number } {
  const R = 6371;
  const lat1 = toRad(lat);
  const lng1 = toRad(lng);
  const brng = toRad(bearing);
  const d = distanceKm / R;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) +
    Math.cos(lat1) * Math.sin(d) * Math.cos(brng)
  );

  const lng2 = lng1 + Math.atan2(
    Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
    Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
  );

  return { lat: toDeg(lat2), lng: toDeg(lng2) };
}

/**
 * Get cardinal direction label
 */
function bearingToCardinal(bearing: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                      'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return directions[Math.round(bearing / 22.5) % 16];
}

/**
 * Angle difference (handles wrap-around)
 */
function angleDiff(a: number, b: number): number {
  let diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

interface AccessInfo {
  accessible: boolean;
  accessType: 'road' | 'track' | 'trail' | 'path' | 'none';
  accessDistance: number;
}

/**
 * Check accessibility via OSM roads/trails
 */
async function checkAccessibility(
  lat: number,
  lng: number,
  maxDistanceM: number = 500
): Promise<AccessInfo> {
  // Query Overpass for nearby highways/paths
  const query = `[out:json][timeout:10];(` +
    `way["highway"~"primary|secondary|tertiary|unclassified|residential|service|track|path|footway|bridleway"](around:${maxDistanceM},${lat},${lng});` +
    `);out body geom;`;

  try {
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!response.ok) {
      return { accessible: false, accessType: 'none', accessDistance: 999 };
    }

    const data = await response.json();
    if (!data.elements || data.elements.length === 0) {
      return { accessible: false, accessType: 'none', accessDistance: 999 };
    }

    // Find the closest access point
    let closestDist = 999;
    let closestType: AccessInfo['accessType'] = 'none';

    for (const way of data.elements) {
      if (!way.geometry) continue;
      const highway = way.tags?.highway || '';

      // Classify the road type
      let roadType: AccessInfo['accessType'] = 'path';
      if (['primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'service'].includes(highway)) {
        roadType = 'road';
      } else if (highway === 'track') {
        roadType = 'track';
      } else if (['footway', 'bridleway', 'path'].includes(highway)) {
        roadType = highway === 'footway' ? 'trail' : 'path';
      }

      // Check distance to each point in the way
      for (const node of way.geometry) {
        const dist = haversineDistance(lat, lng, node.lat, node.lon);
        if (dist < closestDist) {
          closestDist = dist;
          closestType = roadType;
        }
      }
    }

    return {
      accessible: closestDist < (maxDistanceM / 1000),
      accessType: closestType,
      accessDistance: closestDist,
    };
  } catch {
    return { accessible: false, accessType: 'none', accessDistance: 999 };
  }
}

/**
 * Fetch elevation for multiple points using Open-Meteo
 */
async function fetchElevations(
  points: Array<{ lat: number; lng: number }>,
  supabaseUrl: string,
  apiKey: string
): Promise<number[]> {
  // Open-Meteo accepts comma-separated coordinates
  const lats = points.map(p => p.lat.toFixed(4)).join(',');
  const lngs = points.map(p => p.lng.toFixed(4)).join(',');

  const response = await fetch(
    `${supabaseUrl}/functions/v1/openmeteo-proxy?lat=${lats}&lng=${lngs}&elevation_only=true`,
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'apikey': apiKey,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Elevation API error: ${response.status}`);
  }

  const data = await response.json();
  return data.elevation || [];
}

/**
 * Generate sample grid around a center point
 */
function generateSampleGrid(
  centerLat: number,
  centerLng: number,
  radiusKm: number,
  numRings: number = 4,
  pointsPerRing: number = 8
): Array<{ lat: number; lng: number; ring: number; bearing: number }> {
  const points: Array<{ lat: number; lng: number; ring: number; bearing: number }> = [];

  // Add center point
  points.push({ lat: centerLat, lng: centerLng, ring: 0, bearing: 0 });

  // Add rings of points
  for (let ring = 1; ring <= numRings; ring++) {
    const distance = (radiusKm / numRings) * ring;
    for (let i = 0; i < pointsPerRing; i++) {
      const bearing = (360 / pointsPerRing) * i;
      const point = pointAtBearing(centerLat, centerLng, bearing, distance);
      points.push({ ...point, ring, bearing });
    }
  }

  return points;
}

/**
 * Analyze a potential photo spot
 */
function analyzeSpot(
  point: ElevationPoint,
  allPoints: ElevationPoint[],
  sunAzimuth: number,
  userLat: number,
  userLng: number
): TopoPhotoSpot | null {
  // Calculate prominence (how much higher than nearby points)
  const nearbyPoints = allPoints.filter(p =>
    p !== point &&
    haversineDistance(point.lat, point.lng, p.lat, p.lng) < 3
  );

  if (nearbyPoints.length === 0) return null;

  const avgNearbyElev = nearbyPoints.reduce((sum, p) => sum + p.elevation, 0) / nearbyPoints.length;
  const prominence = point.elevation - avgNearbyElev;

  // Points in sun direction (for checking horizon clearance)
  const sunDirPoints = allPoints.filter(p => {
    const bearing = calculateBearing(point.lat, point.lng, p.lat, p.lng);
    return angleDiff(bearing, sunAzimuth) < 30;
  });

  // Calculate horizon clearance toward sun
  let horizonClearance = 90; // Assume clear unless blocked
  for (const p of sunDirPoints) {
    if (p === point) continue;
    const dist = haversineDistance(point.lat, point.lng, p.lat, p.lng);
    if (dist < 0.1) continue;
    const elevDiff = p.elevation - point.elevation;
    const angleToPoint = toDeg(Math.atan2(elevDiff, dist * 1000));
    if (angleToPoint > 0) {
      horizonClearance = Math.min(horizonClearance, 90 - angleToPoint);
    }
  }

  // Score the spot
  let score = 0;
  let type: TopoPhotoSpot['type'] = 'vantage_point';
  let description = '';

  // Prominence bonus (elevated spots are good)
  if (prominence > 50) {
    score += 30;
    type = 'overlook';
    description = `Elevated ${Math.round(prominence)}m above surroundings`;
  } else if (prominence > 20) {
    score += 20;
    description = `Slight elevation advantage (${Math.round(prominence)}m)`;
  } else if (prominence < -20) {
    // Lower spots can be good if looking UP at features catching light
    const oppositeAzimuth = (sunAzimuth + 180) % 360;
    const featuresInLight = allPoints.filter(p => {
      const bearing = calculateBearing(point.lat, point.lng, p.lat, p.lng);
      return angleDiff(bearing, oppositeAzimuth) < 45 && p.elevation > point.elevation + 50;
    });

    if (featuresInLight.length > 0) {
      score += 25;
      type = 'feature_view';
      description = 'View of elevated terrain catching sunset/sunrise light';
    }
  }

  // Horizon clearance toward sun
  if (horizonClearance > 10) {
    score += 25;
    description += description ? '. ' : '';
    description += 'Clear horizon toward sun';
  } else if (horizonClearance > 5) {
    score += 15;
  } else if (horizonClearance > 0) {
    score += 5;
  } else {
    // Blocked horizon - not great for sunset/sunrise
    score -= 20;
  }

  // Bonus for being at a reasonable distance from user (not too far)
  const distFromUser = haversineDistance(userLat, userLng, point.lat, point.lng);
  if (distFromUser < 5) {
    score += 10;
  } else if (distFromUser < 10) {
    score += 5;
  }

  // Check for open vista (low points all around = wide view)
  const lowerPoints = nearbyPoints.filter(p => p.elevation < point.elevation - 10);
  if (lowerPoints.length >= nearbyPoints.length * 0.6) {
    score += 15;
    type = prominence > 30 ? 'overlook' : 'open_vista';
    description += description ? '. ' : '';
    description += 'Wide open views';
  }

  if (score < 30) return null;

  // Best viewing direction is toward the sun for sunset colors
  const viewDirection = sunAzimuth;

  return {
    lat: point.lat,
    lng: point.lng,
    elevation: point.elevation,
    score: Math.min(100, Math.max(0, score)),
    type,
    description: description || 'Potential vantage point',
    viewDirection,
    viewDirectionLabel: `Face ${bearingToCardinal(viewDirection)} (${Math.round(viewDirection)}°)`,
    prominence,
    horizonClearance,
    // These will be filled in later by the main function
    accessible: false,
    accessType: 'none' as const,
    accessDistance: 999,
  };
}

/**
 * Main function: Analyze terrain around a location to find good photo spots
 */
export async function analyzeTopoPhotoSpots(
  userLat: number,
  userLng: number,
  sunAzimuth: number,
  radiusKm: number = 10,
  supabaseUrl: string,
  apiKey: string
): Promise<TopoPhotoSpot[]> {
  // Generate sample grid
  const gridPoints = generateSampleGrid(userLat, userLng, radiusKm, 5, 12);

  // Fetch elevations for all points
  const elevations = await fetchElevations(
    gridPoints.map(p => ({ lat: p.lat, lng: p.lng })),
    supabaseUrl,
    apiKey
  );

  // Combine into elevation points
  const elevationPoints: ElevationPoint[] = gridPoints.map((p, i) => ({
    lat: p.lat,
    lng: p.lng,
    elevation: elevations[i] || 0,
    distanceFromCenter: haversineDistance(userLat, userLng, p.lat, p.lng),
    bearingFromCenter: calculateBearing(userLat, userLng, p.lat, p.lng),
  }));

  // Analyze each point for photo potential
  const spots: TopoPhotoSpot[] = [];

  for (const point of elevationPoints) {
    // Skip the center point (user's location)
    if (point.distanceFromCenter < 0.5) continue;

    const spot = analyzeSpot(point, elevationPoints, sunAzimuth, userLat, userLng);
    if (spot) {
      spots.push(spot);
    }
  }

  // Sort by score and return top spots
  spots.sort((a, b) => b.score - a.score);

  // Deduplicate nearby spots (within 1km, keep highest scoring)
  const deduped: TopoPhotoSpot[] = [];
  for (const spot of spots) {
    const tooClose = deduped.some(s =>
      haversineDistance(s.lat, s.lng, spot.lat, spot.lng) < 1
    );
    if (!tooClose) {
      deduped.push(spot);
    }
  }

  // Check accessibility for top spots (limit API calls)
  const topSpots = deduped.slice(0, 12);
  const accessibleSpots: TopoPhotoSpot[] = [];

  for (const spot of topSpots) {
    const access = await checkAccessibility(spot.lat, spot.lng);
    spot.accessible = access.accessible;
    spot.accessType = access.accessType;
    spot.accessDistance = access.accessDistance;

    // Only include accessible spots
    if (spot.accessible) {
      accessibleSpots.push(spot);
    }
  }

  return accessibleSpots.slice(0, 8);
}
