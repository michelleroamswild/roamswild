/**
 * Terrain-Based Photo Spot Analyzer
 *
 * Uses DEM (elevation) data to find photogenic terrain features:
 * - Aspect (slope facing direction) - west-facing for sunset glow
 * - Slope angle - steep faces for drama
 * - Ridge/cliff detection - sharp elevation changes
 * - Convex surfaces - highlight edges catch light beautifully
 *
 * Provides specific guidance like:
 * "This rock face is oriented 248° → best glow 15-25 min before sunset"
 */

export interface TerrainFeature {
  lat: number;
  lng: number;
  elevation: number;
  aspect: number;           // Direction the slope faces (degrees)
  aspectLabel: string;      // "West-facing", "SW-facing", etc.
  slope: number;            // Slope angle in degrees
  slopeCategory: 'flat' | 'gentle' | 'moderate' | 'steep' | 'cliff';
  featureType: 'ridge' | 'cliff' | 'slope' | 'peak' | 'valley' | 'saddle' | 'flat';
  curvature: 'convex' | 'concave' | 'flat';  // Convex catches light edges
  score: number;
  lightingWindow: string;   // "15-25 min before sunset"
  recommendation: string;
  distanceKm: number;
  bearing: number;
  bearingLabel: string;
  // Accessibility info
  accessible: boolean;
  accessType: 'road' | 'track' | 'trail' | 'path' | 'none';
  accessDistance: number;   // Distance to nearest access point in meters
  accessName: string | null;
}

interface AccessPoint {
  type: 'road' | 'track' | 'trail' | 'path';
  name: string | null;
  distance: number;
}

interface ElevationGrid {
  points: number[][];  // [row][col] elevation values
  latStart: number;
  lngStart: number;
  latStep: number;
  lngStep: number;
  rows: number;
  cols: number;
}

// Helper functions
function toRad(deg: number): number { return deg * Math.PI / 180; }
function toDeg(rad: number): number { return rad * 180 / Math.PI; }

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calculateBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = toRad(lng2 - lng1);
  const x = Math.sin(dLng) * Math.cos(toRad(lat2));
  const y = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return (toDeg(Math.atan2(x, y)) + 360) % 360;
}

function bearingToCardinal(bearing: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return directions[Math.round(bearing / 22.5) % 16];
}

function angleDiff(a: number, b: number): number {
  let diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function aspectToLabel(aspect: number): string {
  if (aspect < 0) return 'Flat';
  const cardinal = bearingToCardinal(aspect);
  return `${cardinal}-facing`;
}

function slopeToCategory(slope: number): 'flat' | 'gentle' | 'moderate' | 'steep' | 'cliff' {
  if (slope < 5) return 'flat';
  if (slope < 15) return 'gentle';
  if (slope < 30) return 'moderate';
  if (slope < 45) return 'steep';
  return 'cliff';
}

/**
 * Calculate aspect (slope facing direction) from elevation grid
 * Uses 3x3 neighborhood around each cell
 */
function calculateAspect(grid: ElevationGrid, row: number, col: number): number {
  if (row <= 0 || row >= grid.rows - 1 || col <= 0 || col >= grid.cols - 1) {
    return -1; // Edge cell
  }

  // Get 3x3 neighborhood
  const z = grid.points;
  const cellSizeM = haversineDistance(
    grid.latStart, grid.lngStart,
    grid.latStart + grid.latStep, grid.lngStart
  ) * 1000;

  // Calculate dz/dx and dz/dy using Horn's method
  const dzdx = ((z[row-1][col+1] + 2*z[row][col+1] + z[row+1][col+1]) -
                (z[row-1][col-1] + 2*z[row][col-1] + z[row+1][col-1])) / (8 * cellSizeM);
  const dzdy = ((z[row+1][col-1] + 2*z[row+1][col] + z[row+1][col+1]) -
                (z[row-1][col-1] + 2*z[row-1][col] + z[row-1][col+1])) / (8 * cellSizeM);

  if (dzdx === 0 && dzdy === 0) return -1; // Flat

  // Aspect in degrees (0 = North, 90 = East, etc.)
  let aspect = toDeg(Math.atan2(dzdy, -dzdx));
  if (aspect < 0) aspect += 360;
  return aspect;
}

/**
 * Calculate slope angle from elevation grid
 */
function calculateSlope(grid: ElevationGrid, row: number, col: number): number {
  if (row <= 0 || row >= grid.rows - 1 || col <= 0 || col >= grid.cols - 1) {
    return 0;
  }

  const z = grid.points;
  const cellSizeM = haversineDistance(
    grid.latStart, grid.lngStart,
    grid.latStart + grid.latStep, grid.lngStart
  ) * 1000;

  const dzdx = ((z[row-1][col+1] + 2*z[row][col+1] + z[row+1][col+1]) -
                (z[row-1][col-1] + 2*z[row][col-1] + z[row+1][col-1])) / (8 * cellSizeM);
  const dzdy = ((z[row+1][col-1] + 2*z[row+1][col] + z[row+1][col+1]) -
                (z[row-1][col-1] + 2*z[row-1][col] + z[row-1][col+1])) / (8 * cellSizeM);

  return toDeg(Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy)));
}

/**
 * Calculate curvature (convex = positive, concave = negative)
 */
function calculateCurvature(grid: ElevationGrid, row: number, col: number): 'convex' | 'concave' | 'flat' {
  if (row <= 0 || row >= grid.rows - 1 || col <= 0 || col >= grid.cols - 1) {
    return 'flat';
  }

  const z = grid.points;
  const center = z[row][col];

  // Average of neighbors
  const neighbors = [
    z[row-1][col-1], z[row-1][col], z[row-1][col+1],
    z[row][col-1],                  z[row][col+1],
    z[row+1][col-1], z[row+1][col], z[row+1][col+1]
  ];
  const avgNeighbor = neighbors.reduce((a, b) => a + b, 0) / 8;

  const diff = center - avgNeighbor;
  if (diff > 5) return 'convex';   // Center higher than surroundings
  if (diff < -5) return 'concave'; // Center lower than surroundings
  return 'flat';
}

/**
 * Detect feature type based on terrain characteristics
 */
function detectFeatureType(
  grid: ElevationGrid,
  row: number,
  col: number,
  slope: number,
  curvature: 'convex' | 'concave' | 'flat'
): 'ridge' | 'cliff' | 'slope' | 'peak' | 'valley' | 'saddle' | 'flat' {
  if (row <= 1 || row >= grid.rows - 2 || col <= 1 || col >= grid.cols - 2) {
    return 'flat';
  }

  const z = grid.points;
  const center = z[row][col];

  // Check if it's a local maximum (peak)
  const allNeighbors = [];
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      if (dr !== 0 || dc !== 0) {
        allNeighbors.push(z[row + dr]?.[col + dc] ?? center);
      }
    }
  }
  const maxNeighbor = Math.max(...allNeighbors);
  const minNeighbor = Math.min(...allNeighbors);

  if (center >= maxNeighbor) return 'peak';
  if (center <= minNeighbor) return 'valley';

  // Check for ridge (high in one direction, drops in perpendicular)
  const ns = (z[row-1][col] + z[row+1][col]) / 2;
  const ew = (z[row][col-1] + z[row][col+1]) / 2;
  if (center > ns + 10 && Math.abs(center - ew) < 5) return 'ridge';
  if (center > ew + 10 && Math.abs(center - ns) < 5) return 'ridge';

  // Saddle: higher than two opposite neighbors, lower than other two
  if ((center > z[row-1][col] && center > z[row+1][col] &&
       center < z[row][col-1] && center < z[row][col+1]) ||
      (center < z[row-1][col] && center < z[row+1][col] &&
       center > z[row][col-1] && center > z[row][col+1])) {
    return 'saddle';
  }

  if (slope > 40) return 'cliff';
  if (slope > 15) return 'slope';
  return 'flat';
}

/**
 * Generate lighting window recommendation
 */
function getLightingWindow(aspect: number, sunAzimuth: number, isSunrise: boolean): string {
  const diff = angleDiff(aspect, sunAzimuth);

  if (diff < 20) {
    // Directly facing sun
    return isSunrise ? '5-15 min after sunrise' : '15-25 min before sunset';
  } else if (diff < 45) {
    // Good angle for light
    return isSunrise ? '10-30 min after sunrise' : '10-30 min before sunset';
  } else if (diff > 135 && diff < 180) {
    // Opposite sun - alpenglow potential
    return isSunrise ? 'Pre-dawn alpenglow' : '5-15 min after sunset (alpenglow)';
  } else if (diff > 90) {
    // Side-lit - good for texture
    return 'Side-lighting for texture and depth';
  }
  return 'Golden hour';
}

/**
 * Generate recommendation based on terrain analysis
 */
function generateRecommendation(
  aspect: number,
  slope: number,
  featureType: string,
  curvature: string,
  sunAzimuth: number,
  isSunrise: boolean
): string {
  const aspectDir = Math.round(aspect);
  const diff = angleDiff(aspect, sunAzimuth);
  const event = isSunrise ? 'sunrise' : 'sunset';

  let rec = '';

  // Aspect-based recommendation
  if (diff < 30) {
    rec = `This ${featureType} faces ${aspectDir}° — direct ${event} glow`;
  } else if (diff > 150) {
    rec = `Faces away from sun (${aspectDir}°) — alpenglow potential`;
  } else if (diff > 60 && diff < 120) {
    rec = `Side-lit orientation (${aspectDir}°) — dramatic shadows and texture`;
  } else {
    rec = `Oriented ${aspectDir}° — partial ${event} light`;
  }

  // Curvature bonus
  if (curvature === 'convex') {
    rec += '. Convex surface will catch highlight edges';
  }

  // Slope/feature type notes
  if (featureType === 'cliff') {
    rec += '. Steep cliff face for dramatic composition';
  } else if (featureType === 'ridge') {
    rec += '. Ridge line creates strong leading lines';
  } else if (featureType === 'peak') {
    rec += '. Summit provides 360° vantage';
  }

  return rec;
}

/**
 * Score a terrain feature for photography potential
 */
function scoreFeature(
  aspect: number,
  slope: number,
  featureType: string,
  curvature: string,
  sunAzimuth: number,
  distance: number
): number {
  let score = 40; // Base score

  const diff = angleDiff(aspect, sunAzimuth);

  // Aspect alignment with sun
  if (diff < 20) score += 30;      // Direct facing
  else if (diff < 45) score += 20; // Good angle
  else if (diff > 150) score += 25; // Alpenglow potential
  else if (diff > 70 && diff < 110) score += 15; // Side-lit

  // Slope drama
  if (slope > 40) score += 15;     // Cliff
  else if (slope > 25) score += 10; // Steep
  else if (slope > 15) score += 5;  // Moderate

  // Feature type bonus
  if (featureType === 'cliff') score += 10;
  else if (featureType === 'ridge') score += 8;
  else if (featureType === 'peak') score += 12;
  else if (featureType === 'saddle') score += 5;

  // Curvature bonus (convex catches light beautifully)
  if (curvature === 'convex') score += 10;

  // Distance penalty
  if (distance > 15) score -= 10;
  else if (distance > 10) score -= 5;

  return Math.min(100, Math.max(0, score));
}

/**
 * Fetch elevation grid from Open-Meteo
 */
async function fetchElevationGrid(
  centerLat: number,
  centerLng: number,
  radiusKm: number,
  gridSize: number,
  supabaseUrl: string,
  apiKey: string
): Promise<ElevationGrid> {
  // Calculate grid bounds
  const kmPerDegreeLat = 111.32;
  const kmPerDegreeLng = 111.32 * Math.cos(toRad(centerLat));

  const latRange = radiusKm / kmPerDegreeLat;
  const lngRange = radiusKm / kmPerDegreeLng;

  const latStep = (latRange * 2) / (gridSize - 1);
  const lngStep = (lngRange * 2) / (gridSize - 1);

  const latStart = centerLat - latRange;
  const lngStart = centerLng - lngRange;

  // Generate all grid points
  const points: Array<{ lat: number; lng: number }> = [];
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      points.push({
        lat: latStart + row * latStep,
        lng: lngStart + col * lngStep,
      });
    }
  }

  // Fetch elevations in batches (Open-Meteo has limits)
  const batchSize = 100;
  const allElevations: number[] = [];

  for (let i = 0; i < points.length; i += batchSize) {
    const batch = points.slice(i, i + batchSize);
    const lats = batch.map(p => p.lat.toFixed(4)).join(',');
    const lngs = batch.map(p => p.lng.toFixed(4)).join(',');

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
    allElevations.push(...(data.elevation || []));
  }

  // Reshape into 2D grid
  const gridPoints: number[][] = [];
  for (let row = 0; row < gridSize; row++) {
    gridPoints.push(allElevations.slice(row * gridSize, (row + 1) * gridSize));
  }

  return {
    points: gridPoints,
    latStart,
    lngStart,
    latStep,
    lngStep,
    rows: gridSize,
    cols: gridSize,
  };
}

/**
 * Check accessibility of points via OSM roads/trails
 * Queries Overpass API for nearby highways, tracks, and paths
 */
async function checkAccessibility(
  points: Array<{ lat: number; lng: number }>,
  supabaseUrl: string,
  apiKey: string
): Promise<Map<string, AccessPoint | null>> {
  const results = new Map<string, AccessPoint | null>();

  if (points.length === 0) return results;

  // Build Overpass query to find roads/trails near all points
  // We'll query a bounding box that covers all points plus buffer
  const lats = points.map(p => p.lat);
  const lngs = points.map(p => p.lng);
  const minLat = Math.min(...lats) - 0.01; // ~1km buffer
  const maxLat = Math.max(...lats) + 0.01;
  const minLng = Math.min(...lngs) - 0.01;
  const maxLng = Math.max(...lngs) + 0.01;

  const query = `[out:json][timeout:15];(way["highway"~"^(path|footway|track|trail|unclassified|tertiary|secondary|primary|bridleway|cycleway)$"](${minLat},${minLng},${maxLat},${maxLng}););out body geom;`;

  try {
    // Use one of the Overpass endpoints directly
    const endpoints = [
      "https://overpass-api.de/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
    ];

    let data: any = null;
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `data=${encodeURIComponent(query)}`,
        });
        if (response.ok) {
          data = await response.json();
          break;
        }
      } catch {
        continue;
      }
    }

    if (!data || !data.elements) {
      // Return all points as not accessible if query fails
      points.forEach(p => results.set(`${p.lat.toFixed(5)},${p.lng.toFixed(5)}`, null));
      return results;
    }

    // For each point, find the nearest road/trail
    for (const point of points) {
      const key = `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;
      let nearestAccess: AccessPoint | null = null;
      let nearestDist = Infinity;

      for (const element of data.elements) {
        if (element.type !== 'way' || !element.geometry) continue;

        const highway = element.tags?.highway;
        let accessType: AccessPoint['type'];

        // Categorize the highway type
        if (['path', 'footway', 'bridleway'].includes(highway)) {
          accessType = 'path';
        } else if (highway === 'track') {
          accessType = 'track';
        } else if (['trail', 'cycleway'].includes(highway)) {
          accessType = 'trail';
        } else {
          accessType = 'road';
        }

        // Find minimum distance to any node in this way
        for (const node of element.geometry) {
          const dist = haversineDistance(point.lat, point.lng, node.lat, node.lon) * 1000; // meters
          if (dist < nearestDist) {
            nearestDist = dist;
            nearestAccess = {
              type: accessType,
              name: element.tags?.name || null,
              distance: dist,
            };
          }
        }
      }

      // Consider accessible if within 500m of a road/trail
      if (nearestAccess && nearestDist <= 500) {
        results.set(key, nearestAccess);
      } else {
        results.set(key, null);
      }
    }
  } catch (err) {
    console.error('Accessibility check error:', err);
    // Return all as unknown on error
    points.forEach(p => results.set(`${p.lat.toFixed(5)},${p.lng.toFixed(5)}`, null));
  }

  return results;
}

/**
 * Check if a target point is visible from observer (viewshed analysis)
 * Uses line-of-sight ray casting through the elevation grid
 */
function isVisibleFromObserver(
  grid: ElevationGrid,
  observerRow: number,
  observerCol: number,
  observerElev: number,
  targetRow: number,
  targetCol: number,
  targetElev: number
): { visible: boolean; blockingElev: number | null; clearanceAngle: number } {
  // Add observer height (1.7m for standing person)
  const observerHeight = observerElev + 1.7;

  const numSteps = Math.max(Math.abs(targetRow - observerRow), Math.abs(targetCol - observerCol));
  if (numSteps === 0) return { visible: true, blockingElev: null, clearanceAngle: 90 };

  const rowStep = (targetRow - observerRow) / numSteps;
  const colStep = (targetCol - observerCol) / numSteps;

  // Calculate line-of-sight angle to target
  const distToTarget = Math.sqrt(
    Math.pow((targetRow - observerRow) * grid.latStep * 111320, 2) +
    Math.pow((targetCol - observerCol) * grid.lngStep * 111320 * Math.cos(toRad(grid.latStart)), 2)
  );
  const losAngleToTarget = toDeg(Math.atan2(targetElev - observerHeight, distToTarget));

  let maxBlockingAngle = -90;
  let blockingElev: number | null = null;

  // Check each point along the ray (excluding observer and target)
  for (let step = 1; step < numSteps; step++) {
    const checkRow = Math.round(observerRow + step * rowStep);
    const checkCol = Math.round(observerCol + step * colStep);

    if (checkRow < 0 || checkRow >= grid.rows || checkCol < 0 || checkCol >= grid.cols) {
      continue;
    }

    const checkElev = grid.points[checkRow][checkCol];

    // Calculate distance and angle to this intermediate point
    const distToPoint = Math.sqrt(
      Math.pow((checkRow - observerRow) * grid.latStep * 111320, 2) +
      Math.pow((checkCol - observerCol) * grid.lngStep * 111320 * Math.cos(toRad(grid.latStart)), 2)
    );

    const angleToPoint = toDeg(Math.atan2(checkElev - observerHeight, distToPoint));

    if (angleToPoint > maxBlockingAngle) {
      maxBlockingAngle = angleToPoint;
      blockingElev = checkElev;
    }
  }

  // Target is visible if LOS angle is greater than max blocking angle
  const visible = losAngleToTarget > maxBlockingAngle;
  const clearanceAngle = losAngleToTarget - maxBlockingAngle;

  return { visible, blockingElev: visible ? null : blockingElev, clearanceAngle };
}

/**
 * Check if sun can illuminate a feature from user's perspective
 * Feature must be visible AND in a direction where sun can light it
 */
function canSunIlluminateFeature(
  featureAspect: number,
  sunAzimuth: number,
  featureBearing: number
): { illuminated: boolean; illuminationType: 'direct' | 'side' | 'back' | 'none' } {
  // Feature aspect is direction it faces
  // For sun to illuminate it, sun must be roughly opposite to aspect (shining AT the face)
  const sunToFeatureAngle = angleDiff(sunAzimuth, (featureAspect + 180) % 360);

  if (sunToFeatureAngle < 45) {
    return { illuminated: true, illuminationType: 'direct' };
  } else if (sunToFeatureAngle < 90) {
    return { illuminated: true, illuminationType: 'side' };
  } else if (sunToFeatureAngle > 135) {
    return { illuminated: true, illuminationType: 'back' }; // Alpenglow/rim light
  }

  return { illuminated: false, illuminationType: 'none' };
}

/**
 * Main function: Analyze terrain to find photogenic features
 */
export async function analyzeTerrainFeatures(
  userLat: number,
  userLng: number,
  sunAzimuth: number,
  isSunrise: boolean = false,
  radiusKm: number = 10,
  supabaseUrl: string,
  apiKey: string
): Promise<TerrainFeature[]> {
  // Fetch elevation grid (15x15 = 225 points)
  const gridSize = 15;
  const grid = await fetchElevationGrid(
    userLat, userLng, radiusKm, gridSize, supabaseUrl, apiKey
  );

  // Find observer position in grid
  const observerRow = Math.round((userLat - grid.latStart) / grid.latStep);
  const observerCol = Math.round((userLng - grid.lngStart) / grid.lngStep);
  const observerElev = grid.points[observerRow]?.[observerCol] ?? 0;

  const features: TerrainFeature[] = [];

  // Analyze each grid cell
  for (let row = 1; row < grid.rows - 1; row++) {
    for (let col = 1; col < grid.cols - 1; col++) {
      const lat = grid.latStart + row * grid.latStep;
      const lng = grid.lngStart + col * grid.lngStep;
      const elevation = grid.points[row][col];

      const aspect = calculateAspect(grid, row, col);
      const slope = calculateSlope(grid, row, col);
      const curvature = calculateCurvature(grid, row, col);
      const featureType = detectFeatureType(grid, row, col, slope, curvature);

      // Skip flat, uninteresting terrain
      if (featureType === 'flat' && slope < 10 && curvature === 'flat') {
        continue;
      }

      // Skip if no clear aspect
      if (aspect < 0) continue;

      const distanceKm = haversineDistance(userLat, userLng, lat, lng);
      const bearing = calculateBearing(userLat, userLng, lat, lng);

      // VIEWSHED CHECK: Is this feature visible from user's position?
      const visibility = isVisibleFromObserver(
        grid, observerRow, observerCol, observerElev,
        row, col, elevation
      );

      if (!visibility.visible) {
        continue; // Skip features blocked by terrain
      }

      // Check if sun can illuminate this feature
      const illumination = canSunIlluminateFeature(aspect, sunAzimuth, bearing);

      let score = scoreFeature(aspect, slope, featureType, curvature, sunAzimuth, distanceKm);

      // Bonus for good visibility clearance
      if (visibility.clearanceAngle > 5) score += 5;
      if (visibility.clearanceAngle > 10) score += 5;

      // Bonus/penalty based on illumination type
      if (illumination.illuminationType === 'direct') score += 10;
      else if (illumination.illuminationType === 'side') score += 5;
      else if (illumination.illuminationType === 'back') score += 8; // Alpenglow
      else if (!illumination.illuminated) score -= 15;

      // Only include features with decent scores
      if (score < 50) continue;

      // Enhance recommendation with visibility info
      let recommendation = generateRecommendation(aspect, slope, featureType, curvature, sunAzimuth, isSunrise);
      recommendation += `. Unobstructed view from your position`;
      if (illumination.illuminationType === 'direct') {
        recommendation += ` — sun will directly illuminate this face`;
      } else if (illumination.illuminationType === 'back') {
        recommendation += ` — potential for rim light/alpenglow`;
      }

      features.push({
        lat,
        lng,
        elevation,
        aspect,
        aspectLabel: aspectToLabel(aspect),
        slope,
        slopeCategory: slopeToCategory(slope),
        featureType,
        curvature,
        score: Math.min(100, score),
        lightingWindow: getLightingWindow(aspect, sunAzimuth, isSunrise),
        recommendation,
        distanceKm,
        bearing,
        bearingLabel: bearingToCardinal(bearing),
        // Placeholder - will be filled after accessibility check
        accessible: false,
        accessType: 'none' as const,
        accessDistance: Infinity,
        accessName: null,
      });
    }
  }

  // Sort by score and deduplicate nearby features
  features.sort((a, b) => b.score - a.score);

  const deduped: TerrainFeature[] = [];
  for (const f of features) {
    const tooClose = deduped.some(d =>
      haversineDistance(d.lat, d.lng, f.lat, f.lng) < 1.5
    );
    if (!tooClose) {
      deduped.push(f);
    }
  }

  // Take top candidates and check accessibility
  const candidates = deduped.slice(0, 20);

  if (candidates.length > 0) {
    const accessibilityMap = await checkAccessibility(
      candidates.map(f => ({ lat: f.lat, lng: f.lng })),
      supabaseUrl,
      apiKey
    );

    // Update features with accessibility info
    for (const feature of candidates) {
      const key = `${feature.lat.toFixed(5)},${feature.lng.toFixed(5)}`;
      const access = accessibilityMap.get(key);

      if (access) {
        feature.accessible = true;
        feature.accessType = access.type;
        feature.accessDistance = Math.round(access.distance);
        feature.accessName = access.name;
        // Bonus for easy access
        if (access.type === 'road') feature.score = Math.min(100, feature.score + 10);
        else if (access.type === 'track') feature.score = Math.min(100, feature.score + 5);
        // Add access info to recommendation
        const accessDesc = access.name
          ? `${access.name} (${access.type})`
          : `${access.type}`;
        feature.recommendation += `. Access via ${accessDesc}, ${Math.round(access.distance)}m away`;
      } else {
        feature.accessible = false;
        feature.accessType = 'none';
        feature.accessDistance = Infinity;
        feature.accessName = null;
        // Penalty for no access
        feature.score = Math.max(0, feature.score - 20);
        feature.recommendation += `. No nearby trail/road found`;
      }
    }

    // Filter to only accessible features and re-sort by score
    const accessibleFeatures = candidates.filter(f => f.accessible);
    accessibleFeatures.sort((a, b) => b.score - a.score);

    return accessibleFeatures.slice(0, 10);
  }

  return [];
}
