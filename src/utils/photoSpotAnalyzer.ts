/**
 * Photo Spot Analyzer
 *
 * Analyzes nearby geographic features and recommends the best spots
 * for photography based on sun position, feature type, and geometry.
 */

export interface PhotoFeature {
  id: number;
  type: 'node' | 'way' | 'relation';
  lat: number;
  lng: number;
  name: string | null;
  featureType: string;
  subType: string | null;
  elevation: number | null;
  direction: number | null;
  tags: Record<string, string>;
}

export interface PhotoOpportunity {
  type: 'reflection' | 'silhouette' | 'alpenglow' | 'golden_light' | 'viewpoint' | 'foreground';
  score: number;  // 0-100
  description: string;
  shootingDirection: number;  // Degrees to face
  shootingDirectionLabel: string;  // e.g., "Face WSW (255°)"
}

export interface RecommendedSpot {
  feature: PhotoFeature;
  distance: number;  // km from user
  bearing: number;   // degrees from user to feature
  bearingLabel: string;  // e.g., "NW"
  opportunities: PhotoOpportunity[];
  topOpportunity: PhotoOpportunity | null;
  overallScore: number;
  recommendation: string;
  arrivalTip: string | null;
}

/**
 * Calculate bearing from point A to point B
 */
function calculateBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;

  const x = Math.sin(dLng) * Math.cos(lat2Rad);
  const y = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
            Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);

  let bearing = Math.atan2(x, y) * 180 / Math.PI;
  bearing = (bearing + 360) % 360;

  return bearing;
}

/**
 * Calculate distance between two points in km
 */
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Get cardinal direction label from bearing
 */
function bearingToCardinal(bearing: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                      'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(bearing / 22.5) % 16;
  return directions[index];
}

/**
 * Format shooting direction
 */
function formatShootingDirection(degrees: number): string {
  const cardinal = bearingToCardinal(degrees);
  return `Face ${cardinal} (${Math.round(degrees)}°)`;
}

/**
 * Calculate angle difference (handles wrap-around)
 */
function angleDifference(a: number, b: number): number {
  let diff = Math.abs(a - b) % 360;
  if (diff > 180) diff = 360 - diff;
  return diff;
}

/**
 * Opposite direction (180° from input)
 */
function oppositeDirection(bearing: number): number {
  return (bearing + 180) % 360;
}

/**
 * Analyze a water feature for reflection potential
 */
function analyzeWaterReflection(
  bearing: number,
  sunAzimuth: number,
  distance: number,
  featureType: string
): PhotoOpportunity | null {
  // For reflections, the water should be in the general direction of the sun
  // Best when water is between you and the sun (within ~45° of sun direction)
  const angleToSun = angleDifference(bearing, sunAzimuth);

  if (angleToSun > 60) return null;

  // Score based on alignment (closer to sun direction = better)
  const alignmentScore = Math.max(0, 100 - (angleToSun * 1.5));

  // Bonus for lakes (calmer than coastline)
  const typeBonus = featureType === 'lake' || featureType === 'pond' ? 15 : 0;

  // Distance penalty (closer is better for reflections, up to a point)
  const distanceFactor = distance < 1 ? 1 : distance < 5 ? 0.9 : 0.7;

  const score = Math.min(100, (alignmentScore + typeBonus) * distanceFactor);

  if (score < 40) return null;

  // Shooting direction: face the water (toward the sun)
  const shootingDirection = bearing;

  return {
    type: 'reflection',
    score,
    description: angleToSun < 20
      ? 'Perfect alignment for golden reflections'
      : 'Good angle for sunset/sunrise reflections',
    shootingDirection,
    shootingDirectionLabel: formatShootingDirection(shootingDirection),
  };
}

/**
 * Analyze a peak/mountain for alpenglow potential
 */
function analyzeAlpenglow(
  bearing: number,
  sunAzimuth: number,
  elevation: number | null,
  distance: number
): PhotoOpportunity | null {
  // Alpenglow occurs on peaks OPPOSITE the sun
  // Mountains to the east catch light at sunset, west at sunrise
  const oppositeAzimuth = oppositeDirection(sunAzimuth);
  const angleFromOpposite = angleDifference(bearing, oppositeAzimuth);

  if (angleFromOpposite > 70) return null;

  // Score based on alignment with opposite direction
  const alignmentScore = Math.max(0, 100 - angleFromOpposite);

  // Elevation bonus (higher peaks catch more light)
  const elevationBonus = elevation
    ? Math.min(20, elevation / 200)  // Up to 20 bonus for 4000m+ peaks
    : 0;

  // Distance is less critical for alpenglow (can see from far)
  const distanceFactor = distance > 30 ? 0.7 : 1;

  const score = Math.min(100, (alignmentScore + elevationBonus) * distanceFactor);

  if (score < 35) return null;

  // Shooting direction: face the peak
  const shootingDirection = bearing;

  return {
    type: 'alpenglow',
    score,
    description: elevation && elevation > 2000
      ? `High peak (${elevation}m) - excellent alpenglow potential`
      : 'Mountain may catch pink/orange alpenglow after sunset',
    shootingDirection,
    shootingDirectionLabel: formatShootingDirection(shootingDirection),
  };
}

/**
 * Analyze a feature for silhouette potential
 */
function analyzeSilhouette(
  bearing: number,
  sunAzimuth: number,
  featureType: string,
  distance: number
): PhotoOpportunity | null {
  // Silhouettes work when subject is between you and the sun
  const angleToSun = angleDifference(bearing, sunAzimuth);

  if (angleToSun > 40) return null;

  // Good silhouette subjects - expanded to include rock formations and geological features
  const goodSubjects = [
    'peak', 'lighthouse', 'arch', 'cliff', 'observation_tower',
    'rock_formation', 'ridge', 'canyon', 'ruins', 'saddle', 'geological'
  ];
  if (!goodSubjects.includes(featureType)) return null;

  const alignmentScore = Math.max(0, 100 - (angleToSun * 2));

  // Closer subjects make better silhouettes
  const distanceFactor = distance < 2 ? 1 : distance < 5 ? 0.85 : 0.6;

  // Rock formations and geological features get a bonus (dramatic shapes)
  const typeBonus = ['rock_formation', 'geological', 'arch'].includes(featureType) ? 10 : 0;

  const score = Math.min(100, (alignmentScore + typeBonus) * distanceFactor);

  if (score < 40) return null;

  // Shooting direction: face the subject (toward sun)
  const shootingDirection = bearing;

  // Format feature type for display
  const displayType = featureType.replace('_', ' ');

  return {
    type: 'silhouette',
    score,
    description: `${displayType} silhouetted against the sky`,
    shootingDirection,
    shootingDirectionLabel: formatShootingDirection(shootingDirection),
  };
}

/**
 * Analyze vertical features for golden light potential
 * Cliffs, rock formations, and canyons catch beautiful warm light at sunrise/sunset
 */
function analyzeGoldenLight(
  bearing: number,
  sunAzimuth: number,
  featureType: string,
  distance: number
): PhotoOpportunity | null {
  // Vertical surfaces facing the sun catch golden light
  // Feature should be ~90° from sun direction (sun hitting the face)
  const oppositeAzimuth = oppositeDirection(sunAzimuth);
  const angleFromOpposite = angleDifference(bearing, oppositeAzimuth);

  // Best when feature is facing toward us AND toward the sun (we're between sun and feature)
  // Or when feature is lit from the side (60-120° from sun)
  if (angleFromOpposite > 90) return null;

  // Vertical features that catch light well
  const verticalFeatures = ['cliff', 'rock_formation', 'canyon', 'ridge', 'geological', 'ruins'];
  if (!verticalFeatures.includes(featureType)) return null;

  // Score based on how well-lit the face will be
  const alignmentScore = Math.max(0, 100 - angleFromOpposite);

  // Distance factor - closer gives more detail in the warm light
  const distanceFactor = distance < 3 ? 1 : distance < 8 ? 0.85 : 0.6;

  // Feature type bonuses
  let typeBonus = 0;
  if (featureType === 'cliff') typeBonus = 15;
  else if (featureType === 'rock_formation') typeBonus = 12;
  else if (featureType === 'canyon') typeBonus = 10;

  const score = Math.min(100, (alignmentScore + typeBonus) * distanceFactor);

  if (score < 40) return null;

  // Shooting direction: face the lit feature
  const shootingDirection = bearing;
  const displayType = featureType.replace('_', ' ');

  return {
    type: 'golden_light',
    score,
    description: `${displayType} catching warm ${angleFromOpposite < 45 ? 'direct' : 'side'} light`,
    shootingDirection,
    shootingDirectionLabel: formatShootingDirection(shootingDirection),
  };
}

/**
 * Analyze a viewpoint
 */
function analyzeViewpoint(
  bearing: number,
  sunAzimuth: number,
  viewpointDirection: number | null,
  distance: number
): PhotoOpportunity | null {
  // If viewpoint has a direction tag, check if it faces the sun
  if (viewpointDirection !== null) {
    const angleToSun = angleDifference(viewpointDirection, sunAzimuth);

    if (angleToSun > 90) return null;

    const score = Math.max(0, 100 - angleToSun);

    return {
      type: 'viewpoint',
      score,
      description: angleToSun < 30
        ? 'Viewpoint directly faces the sunset/sunrise'
        : 'Viewpoint has good sun angle',
      shootingDirection: viewpointDirection,
      shootingDirectionLabel: formatShootingDirection(viewpointDirection),
    };
  }

  // No direction info - give moderate score if reasonably close
  if (distance > 10) return null;

  return {
    type: 'viewpoint',
    score: 50,
    description: 'Established viewpoint - check if it faces the sun',
    shootingDirection: sunAzimuth,  // Suggest facing sun direction
    shootingDirectionLabel: formatShootingDirection(sunAzimuth),
  };
}

/**
 * Analyze for foreground interest
 */
function analyzeForeground(
  bearing: number,
  sunAzimuth: number,
  featureType: string,
  distance: number
): PhotoOpportunity | null {
  // Good foreground features when NOT in sun direction (side-lit or back-lit)
  const angleToSun = angleDifference(bearing, sunAzimuth);

  // Foreground works best at 45-135° from sun (side lighting)
  if (angleToSun < 30 || angleToSun > 150) return null;

  // Expanded list of good foreground subjects
  const goodForegrounds = [
    'waterfall', 'cliff', 'arch', 'beach', 'lighthouse',
    'rock_formation', 'cave', 'ruins', 'rapids', 'geological'
  ];
  if (!goodForegrounds.includes(featureType)) return null;

  // Best at around 60-90° (nice side light)
  const optimalAngle = 75;
  const angleScore = Math.max(0, 100 - Math.abs(angleToSun - optimalAngle));

  // Closer is better for foreground
  const distanceFactor = distance < 0.5 ? 1 : distance < 2 ? 0.8 : 0.5;

  // Bonus for particularly photogenic foreground subjects
  let typeBonus = 0;
  if (featureType === 'arch' || featureType === 'ruins') typeBonus = 10;
  else if (featureType === 'rock_formation' || featureType === 'cave') typeBonus = 8;

  const score = Math.min(100, (angleScore + typeBonus) * distanceFactor);

  if (score < 35) return null;

  // Format feature type for display
  const displayType = featureType.replace('_', ' ');

  // Shooting direction: face the sun with subject to the side
  return {
    type: 'foreground',
    score,
    description: `${displayType} as foreground with side lighting`,
    shootingDirection: sunAzimuth,
    shootingDirectionLabel: formatShootingDirection(sunAzimuth),
  };
}

/**
 * Get arrival tip based on feature and distance
 */
function getArrivalTip(feature: PhotoFeature, distance: number, isSunrise: boolean): string | null {
  if (distance > 10) {
    return `${Math.round(distance)} km away - plan for travel time`;
  }

  if (feature.featureType === 'viewpoint' || feature.featureType === 'observation_tower') {
    return isSunrise
      ? 'Arrive 30-45 min before sunrise for setup'
      : 'Popular spot - arrive early for best position';
  }

  if (feature.featureType === 'water' || feature.featureType === 'lake') {
    return 'Bring a polarizer for reflection control';
  }

  if (feature.featureType === 'peak' && feature.elevation && feature.elevation > 2000) {
    return 'Check trail conditions and allow extra time';
  }

  if (feature.featureType === 'cliff' || feature.featureType === 'canyon') {
    return 'Use caution near edges - bring wide angle lens';
  }

  if (feature.featureType === 'rock_formation' || feature.featureType === 'geological') {
    return 'Scout multiple angles for best composition';
  }

  if (feature.featureType === 'ruins') {
    return 'Check if access is restricted at sunset/sunrise';
  }

  if (feature.featureType === 'cave') {
    return 'Bring a tripod - cave interiors are dark';
  }

  if (feature.featureType === 'waterfall' || feature.featureType === 'rapids') {
    return 'Bring ND filter for silky water effect';
  }

  return null;
}

/**
 * Main function: Analyze all features and return ranked recommendations
 */
export function analyzePhotoSpots(
  userLat: number,
  userLng: number,
  features: PhotoFeature[],
  sunAzimuth: number,
  isSunrise: boolean = false
): RecommendedSpot[] {
  const recommendations: RecommendedSpot[] = [];

  for (const feature of features) {
    const distance = calculateDistance(userLat, userLng, feature.lat, feature.lng);
    const bearing = calculateBearing(userLat, userLng, feature.lat, feature.lng);
    const bearingLabel = bearingToCardinal(bearing);

    const opportunities: PhotoOpportunity[] = [];

    // Analyze based on feature type
    const featureSubType = feature.subType || feature.featureType;

    // Water features - check for reflections
    if (['water', 'lake', 'pond', 'reservoir', 'beach'].includes(feature.featureType) ||
        ['lake', 'pond', 'reservoir'].includes(featureSubType)) {
      const reflection = analyzeWaterReflection(bearing, sunAzimuth, distance, featureSubType);
      if (reflection) opportunities.push(reflection);
    }

    // Peaks and saddles - check for alpenglow
    if (feature.featureType === 'peak' || feature.featureType === 'saddle') {
      const alpenglow = analyzeAlpenglow(bearing, sunAzimuth, feature.elevation, distance);
      if (alpenglow) opportunities.push(alpenglow);

      const silhouette = analyzeSilhouette(bearing, sunAzimuth, feature.featureType, distance);
      if (silhouette) opportunities.push(silhouette);
    }

    // Viewpoints
    if (feature.featureType === 'viewpoint' || feature.featureType === 'observation_tower') {
      const viewpoint = analyzeViewpoint(bearing, sunAzimuth, feature.direction, distance);
      if (viewpoint) opportunities.push(viewpoint);
    }

    // Silhouette subjects - expanded list
    const silhouetteSubjects = [
      'lighthouse', 'arch', 'cliff', 'rock_formation', 'ridge',
      'canyon', 'ruins', 'geological'
    ];
    if (silhouetteSubjects.includes(feature.featureType)) {
      const silhouette = analyzeSilhouette(bearing, sunAzimuth, feature.featureType, distance);
      if (silhouette) opportunities.push(silhouette);
    }

    // Vertical features catching golden light
    const verticalFeatures = ['cliff', 'rock_formation', 'canyon', 'ridge', 'geological', 'ruins'];
    if (verticalFeatures.includes(feature.featureType)) {
      const goldenLight = analyzeGoldenLight(bearing, sunAzimuth, feature.featureType, distance);
      if (goldenLight) opportunities.push(goldenLight);
    }

    // Foreground interest
    const foreground = analyzeForeground(bearing, sunAzimuth, feature.featureType, distance);
    if (foreground) opportunities.push(foreground);

    // Skip features with no opportunities
    if (opportunities.length === 0) continue;

    // Sort opportunities by score
    opportunities.sort((a, b) => b.score - a.score);
    const topOpportunity = opportunities[0];

    // Overall score is weighted average with top opportunity having more weight
    const overallScore = opportunities.length === 1
      ? topOpportunity.score
      : Math.round(topOpportunity.score * 0.7 + opportunities.slice(1).reduce((sum, o) => sum + o.score, 0) / opportunities.length * 0.3);

    // Generate recommendation text
    const name = feature.name || `Unnamed ${feature.featureType.replace('_', ' ')}`;
    let recommendation = '';

    if (topOpportunity.type === 'reflection') {
      recommendation = `${name} offers ${topOpportunity.score >= 80 ? 'excellent' : 'good'} reflection potential`;
    } else if (topOpportunity.type === 'alpenglow') {
      recommendation = `${name} will catch ${isSunrise ? 'morning' : 'evening'} alpenglow`;
    } else if (topOpportunity.type === 'silhouette') {
      recommendation = `${name} makes a dramatic silhouette against the sky`;
    } else if (topOpportunity.type === 'viewpoint') {
      recommendation = `${name} ${feature.direction ? 'faces the sun' : 'is an established viewpoint'}`;
    } else if (topOpportunity.type === 'foreground') {
      recommendation = `${name} provides interesting foreground with side lighting`;
    } else if (topOpportunity.type === 'golden_light') {
      recommendation = `${name} will catch warm ${isSunrise ? 'sunrise' : 'sunset'} light`;
    }

    recommendations.push({
      feature,
      distance,
      bearing,
      bearingLabel,
      opportunities,
      topOpportunity,
      overallScore,
      recommendation,
      arrivalTip: getArrivalTip(feature, distance, isSunrise),
    });
  }

  // Sort by overall score
  recommendations.sort((a, b) => b.overallScore - a.overallScore);

  return recommendations;
}

/**
 * Fetch features from Overpass API proxy
 */
export async function fetchNearbyFeatures(
  lat: number,
  lng: number,
  radiusKm: number,
  supabaseUrl: string,
  apiKey: string
): Promise<PhotoFeature[]> {
  const response = await fetch(
    `${supabaseUrl}/functions/v1/overpass-proxy?lat=${lat}&lng=${lng}&radius=${radiusKm}`,
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'apikey': apiKey,
      },
    }
  );

  if (!response.ok) {
    // Try to get error details from response body
    try {
      const errorData = await response.json();
      throw new Error(errorData.error || `API error: ${response.status}`);
    } catch {
      throw new Error(`API error: ${response.status}`);
    }
  }

  const data = await response.json();
  return data.features || [];
}
