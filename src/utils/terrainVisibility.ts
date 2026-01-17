/**
 * Terrain Visibility Analysis
 *
 * Determines if sunset/sunrise will be visible or blocked by terrain
 * by sampling elevation along the sun's azimuth ray.
 */

export interface TerrainPoint {
  lat: number;
  lng: number;
  distance: number;      // km from observer
  elevation: number;     // meters
  angularElevation: number; // degrees above horizon from observer
}

export type HorizonQuality =
  | 'clear'           // Can see to ~0° horizon
  | 'minimal'         // Terrain at 0-2°, barely affects sunset
  | 'low'             // Terrain at 2-4°, miss last few minutes
  | 'moderate'        // Terrain at 4-7°, miss lower sun but good colors
  | 'significant'     // Terrain at 7-12°, limited direct sun view
  | 'blocked';        // Terrain >12°, very limited sunset view

export interface HorizonProfile {
  observerElevation: number;
  azimuth: number;
  points: TerrainPoint[];
  maxTerrainAngle: number;      // highest terrain angle along ray
  maxTerrainDistance: number;   // distance to highest terrain
  effectiveHorizon: number;     // angle where sun will "set" behind terrain

  // Nuanced assessment
  quality: HorizonQuality;
  qualityLabel: string;
  qualityDescription: string;

  // Timing impact
  sunsetLostMinutes: number;    // approx minutes of sunset lost to terrain
  goldenHourVisible: number;    // percentage of golden hour sky visible (0-100)

  // For backwards compatibility
  isBlocked: boolean;           // true if terrain >7°
  clearanceAngle: number;       // degrees below terrain (negative = above horizon)
}

/**
 * Calculate destination point given start, bearing, and distance
 * Uses Haversine formula
 */
function destinationPoint(
  lat: number,
  lng: number,
  bearing: number,  // degrees from north
  distance: number  // km
): { lat: number; lng: number } {
  const R = 6371; // Earth's radius in km
  const d = distance / R;
  const brng = bearing * Math.PI / 180;
  const lat1 = lat * Math.PI / 180;
  const lng1 = lng * Math.PI / 180;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) +
    Math.cos(lat1) * Math.sin(d) * Math.cos(brng)
  );

  const lng2 = lng1 + Math.atan2(
    Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
    Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
  );

  return {
    lat: lat2 * 180 / Math.PI,
    lng: lng2 * 180 / Math.PI,
  };
}

/**
 * Calculate angular elevation of a point from observer
 * Accounts for Earth's curvature
 */
function calculateAngularElevation(
  observerElevation: number,  // meters
  targetElevation: number,    // meters
  distance: number            // km
): number {
  // Convert distance to meters
  const distanceM = distance * 1000;

  // Height difference
  const heightDiff = targetElevation - observerElevation;

  // Account for Earth's curvature (drop = distance² / (2 * R))
  // At 10km, Earth drops about 7.8m
  const earthRadius = 6371000; // meters
  const curvatureDrop = (distanceM * distanceM) / (2 * earthRadius);

  // Adjusted height difference (terrain appears lower due to curvature)
  const adjustedHeightDiff = heightDiff - curvatureDrop;

  // Angular elevation in degrees
  const angle = Math.atan2(adjustedHeightDiff, distanceM) * (180 / Math.PI);

  return angle;
}

/**
 * Generate sample points along an azimuth ray
 */
export function generateSamplePoints(
  lat: number,
  lng: number,
  azimuth: number,
  maxDistance: number = 50,  // km
  numPoints: number = 20
): Array<{ lat: number; lng: number; distance: number }> {
  const points: Array<{ lat: number; lng: number; distance: number }> = [];

  // Start sampling from 0.5km out (skip very close points)
  for (let i = 1; i <= numPoints; i++) {
    const distance = (i / numPoints) * maxDistance;
    const point = destinationPoint(lat, lng, azimuth, distance);
    points.push({
      ...point,
      distance,
    });
  }

  return points;
}

/**
 * Fetch elevation data from Open-Meteo API
 */
export async function fetchElevations(
  points: Array<{ lat: number; lng: number }>,
  supabaseUrl: string,
  apiKey: string
): Promise<number[]> {
  // Open-Meteo accepts comma-separated coordinates
  const lats = points.map(p => p.lat.toFixed(6)).join(',');
  const lngs = points.map(p => p.lng.toFixed(6)).join(',');

  // Use our proxy to avoid CORS issues
  const response = await fetch(
    `${supabaseUrl}/functions/v1/openmeteo-proxy?lat=${lats}&lng=${lngs}&elevation_only=true`,
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'apikey': apiKey,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Elevation API error: ${response.status}`);
  }

  const data = await response.json();

  // Open-Meteo returns elevation array
  if (data.elevation && Array.isArray(data.elevation)) {
    return data.elevation;
  }

  throw new Error('Invalid elevation response');
}

/**
 * Analyze terrain visibility along sunset/sunrise azimuth
 */
export async function analyzeHorizonProfile(
  observerLat: number,
  observerLng: number,
  observerElevation: number,  // meters (can estimate from Open-Meteo if unknown)
  azimuth: number,            // degrees from north
  sunAltitude: number = 0,    // sun altitude to check against (0° at sunset)
  supabaseUrl: string,
  apiKey: string,
  maxDistance: number = 30,   // km to check
  numPoints: number = 15
): Promise<HorizonProfile> {
  // Generate sample points along the azimuth
  const samplePoints = generateSamplePoints(
    observerLat,
    observerLng,
    azimuth,
    maxDistance,
    numPoints
  );

  // Fetch elevations for all points
  const elevations = await fetchElevations(samplePoints, supabaseUrl, apiKey);

  // Calculate angular elevation for each point
  const points: TerrainPoint[] = samplePoints.map((point, i) => ({
    ...point,
    elevation: elevations[i],
    angularElevation: calculateAngularElevation(
      observerElevation,
      elevations[i],
      point.distance
    ),
  }));

  // Find maximum terrain angle (effective horizon)
  let maxTerrainAngle = -90;
  let maxTerrainDistance = 0;

  for (const point of points) {
    if (point.angularElevation > maxTerrainAngle) {
      maxTerrainAngle = point.angularElevation;
      maxTerrainDistance = point.distance;
    }
  }

  // The effective horizon is the max terrain angle (or 0 if terrain is below horizon)
  const effectiveHorizon = Math.max(0, maxTerrainAngle);

  // Determine quality based on effective horizon angle
  let quality: HorizonQuality;
  let qualityLabel: string;
  let qualityDescription: string;

  if (effectiveHorizon <= 0.5) {
    quality = 'clear';
    qualityLabel = 'Clear Horizon';
    qualityDescription = 'Unobstructed view to the horizon. You\'ll see the full sunset.';
  } else if (effectiveHorizon <= 2) {
    quality = 'minimal';
    qualityLabel = 'Nearly Clear';
    qualityDescription = 'Very slight terrain, barely noticeable. Full sunset colors visible.';
  } else if (effectiveHorizon <= 4) {
    quality = 'low';
    qualityLabel = 'Low Obstruction';
    qualityDescription = 'Distant hills/terrain. Miss the last few minutes but great colors.';
  } else if (effectiveHorizon <= 7) {
    quality = 'moderate';
    qualityLabel = 'Moderate Terrain';
    qualityDescription = 'Sun sets behind terrain earlier. Still good golden hour and sky colors.';
  } else if (effectiveHorizon <= 12) {
    quality = 'significant';
    qualityLabel = 'Significant Terrain';
    qualityDescription = 'Mountains or hills block lower sun. Focus on sky colors and alpenglow.';
  } else {
    quality = 'blocked';
    qualityLabel = 'High Obstruction';
    qualityDescription = 'Tall terrain limits direct sunset view. Best for reflected light and sky.';
  }

  // Estimate minutes of sunset lost
  // Sun moves ~0.25° per minute near horizon, so 4 minutes per degree
  const sunsetLostMinutes = Math.round(effectiveHorizon * 4);

  // Estimate golden hour visibility (golden hour is ~6° to 0°)
  // If terrain is at 3°, you see 3° to 6° = 50% of golden hour direct sun
  const goldenHourVisible = Math.max(0, Math.min(100, ((6 - effectiveHorizon) / 6) * 100));

  // Legacy compatibility
  const isBlocked = effectiveHorizon > 7;
  const clearanceAngle = -effectiveHorizon;

  return {
    observerElevation,
    azimuth,
    points,
    maxTerrainAngle,
    maxTerrainDistance,
    effectiveHorizon,
    quality,
    qualityLabel,
    qualityDescription,
    sunsetLostMinutes,
    goldenHourVisible,
    isBlocked,
    clearanceAngle,
  };
}

/**
 * Get observer elevation from Open-Meteo
 */
export async function getElevation(
  lat: number,
  lng: number,
  supabaseUrl: string,
  apiKey: string
): Promise<number> {
  const elevations = await fetchElevations([{ lat, lng }], supabaseUrl, apiKey);
  return elevations[0];
}
