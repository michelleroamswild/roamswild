/**
 * Seasonal Validation for Surprise Me
 *
 * Validates that a selected region is accessible based on:
 * - Current snowline and snow cover
 * - Road conditions and closures
 * - Vehicle capabilities
 */

import {
  BiomeType,
  RegionWithMetricsRow,
  RoadClosureRow,
  SeasonalValidationResult,
  RoadAccessResult,
  RoadSurfaceType,
  VehicleType,
  RerollResult,
  SurpriseMeRequest,
  REROLL_CONFIG,
  getRecommendedVehicle,
} from '@/types/surpriseMe';

// ============================================
// Snowline Lookup
// ============================================

/**
 * Snowline estimates by latitude and month (feet)
 * Based on Western US averages
 */
const SNOWLINE_TABLE: Record<number, Record<number, number>> = {
  // Month: { lat_band: snowline_ft }
  1: { 35: 5500, 40: 4500, 45: 3500, 48: 2500 },
  2: { 35: 5500, 40: 4500, 45: 3500, 48: 2500 },
  3: { 35: 6500, 40: 5500, 45: 4500, 48: 3500 },
  4: { 35: 7500, 40: 6500, 45: 5500, 48: 4500 },
  5: { 35: 8500, 40: 7500, 45: 6500, 48: 5500 },
  6: { 35: 10000, 40: 9000, 45: 8000, 48: 7000 },
  7: { 35: 11000, 40: 10500, 45: 9500, 48: 8500 },
  8: { 35: 11000, 40: 10500, 45: 9500, 48: 8500 },
  9: { 35: 11000, 40: 10500, 45: 9500, 48: 8500 },
  10: { 35: 9000, 40: 8000, 45: 7000, 48: 6000 },
  11: { 35: 7000, 40: 6000, 45: 5000, 48: 4000 },
  12: { 35: 5500, 40: 4500, 45: 3500, 48: 2500 },
};

/**
 * Get estimated snowline for a latitude and month
 */
export function getSnowlineEstimate(lat: number, month: number): number {
  const monthData = SNOWLINE_TABLE[month] || SNOWLINE_TABLE[6];

  // Find nearest latitude band
  const latBands = [35, 40, 45, 48];
  let closestBand = 40;
  let minDiff = Infinity;

  for (const band of latBands) {
    const diff = Math.abs(lat - band);
    if (diff < minDiff) {
      minDiff = diff;
      closestBand = band;
    }
  }

  const baseSnowline = monthData[closestBand];

  // Interpolate between bands for more accuracy
  const latDiff = lat - closestBand;
  const adjustment = latDiff * -200; // ~200ft per degree latitude

  return Math.round(baseSnowline + adjustment);
}

// ============================================
// Snow Validation
// ============================================

interface SnowValidationResult {
  valid: boolean;
  rejection?: string;
  snowlineFt: number;
  regionAboveSnowline: boolean;
}

/**
 * Validate region accessibility based on snow conditions
 */
export function validateSnowConditions(
  region: RegionWithMetricsRow,
  currentDate: Date = new Date()
): SnowValidationResult {
  // Get center latitude from bounding box
  const centerLat = (region.bbox_north + region.bbox_south) / 2;
  const month = currentDate.getMonth() + 1;

  // Get snowline estimate
  const snowlineFt = getSnowlineEstimate(centerLat, month);

  const elevationMin = region.elevation_min_ft ?? 0;
  const elevationAvg = region.elevation_avg_ft ?? 0;

  // Check if minimum elevation is above snowline
  if (elevationMin > snowlineFt + 500) {
    return {
      valid: false,
      rejection: 'Region minimum elevation above current snowline',
      snowlineFt,
      regionAboveSnowline: true,
    };
  }

  // Check if average elevation is snowbound in winter months
  const winterMonths = [12, 1, 2, 3];
  if (elevationAvg > snowlineFt && winterMonths.includes(month)) {
    return {
      valid: false,
      rejection: 'Average elevation snowbound in winter',
      snowlineFt,
      regionAboveSnowline: true,
    };
  }

  // Check stored snow cover if available
  const snowCoverPct = region.current_snow_cover_pct ?? 0;

  if (snowCoverPct > 70) {
    return {
      valid: false,
      rejection: `Region ${snowCoverPct}% snow covered`,
      snowlineFt,
      regionAboveSnowline: false,
    };
  }

  // Check snow cover with road access
  if (snowCoverPct > 40 && !region.has_paved_access) {
    return {
      valid: false,
      rejection: 'Significant snow cover without paved access',
      snowlineFt,
      regionAboveSnowline: false,
    };
  }

  return {
    valid: true,
    snowlineFt,
    regionAboveSnowline: elevationAvg > snowlineFt,
  };
}

// ============================================
// Road Access Validation
// ============================================

/**
 * Check if user's vehicle can handle the road surface
 */
function vehicleCanHandle(
  vehicleType: VehicleType | undefined,
  roadSurface: RoadSurfaceType
): boolean {
  const vehicleCapability: Record<VehicleType, RoadSurfaceType[]> = {
    sedan: ['paved'],
    suv: ['paved', 'gravel', 'dirt'],
    truck: ['paved', 'gravel', 'dirt'],
    '4wd': ['paved', 'gravel', 'dirt', '4wd_only'],
    rv: ['paved', 'gravel'],
  };

  // Default to SUV capability if not specified
  const capability = vehicleCapability[vehicleType ?? 'suv'];
  return capability.includes(roadSurface);
}

/**
 * Validate road access for a region
 */
export function validateRoadAccess(
  region: RegionWithMetricsRow,
  userVehicle?: VehicleType
): RoadAccessResult {
  const roadSurface = region.best_road_surface ?? 'gravel';
  const cautions: string[] = [];

  // Check if vehicle can handle the road
  if (!vehicleCanHandle(userVehicle, roadSurface)) {
    return {
      accessType: roadSurface,
      score: 0,
      recommendedVehicle: getRecommendedVehicle(roadSurface),
      cautions: [`Road conditions require ${getRecommendedVehicle(roadSurface)}`],
      rejected: true,
      rejectionReason: `Requires ${getRecommendedVehicle(roadSurface)}, which exceeds your vehicle's capability`,
    };
  }

  // No vehicle access
  if (roadSurface === 'no_vehicle_access') {
    return {
      accessType: roadSurface,
      score: 0,
      recommendedVehicle: 'N/A - hike in only',
      cautions: ['No vehicle access - must hike in'],
      rejected: true,
      rejectionReason: 'No vehicle access roads found',
    };
  }

  // Calculate access score
  const scoreByRoad: Record<RoadSurfaceType, number> = {
    paved: 100,
    gravel: 75,
    dirt: 50,
    '4wd_only': 25,
    no_vehicle_access: 0,
  };

  const score = scoreByRoad[roadSurface];

  // Add cautions
  if (roadSurface === 'dirt') {
    cautions.push('Dirt roads may be impassable when wet');
  }
  if (roadSurface === '4wd_only') {
    cautions.push('4WD required - expect rough conditions');
  }
  if (roadSurface === 'gravel' && userVehicle === 'sedan') {
    cautions.push('Gravel roads - proceed with caution in a sedan');
  }

  return {
    accessType: roadSurface,
    score,
    recommendedVehicle: getRecommendedVehicle(roadSurface),
    cautions,
    rejected: false,
  };
}

// ============================================
// Road Closure Validation
// ============================================

interface ClosureValidationResult {
  valid: boolean;
  rejection?: string;
  closures: RoadClosureRow[];
  allAccessClosed: boolean;
  primaryAccessClosed: boolean;
}

/**
 * Check active road closures for a region
 */
export function validateRoadClosures(
  closures: RoadClosureRow[],
  currentDate: Date = new Date()
): ClosureValidationResult {
  // Filter to active closures
  const activeClosures = closures.filter((closure) => {
    if (closure.start_date && new Date(closure.start_date) > currentDate) {
      return false; // Not yet started
    }
    if (closure.expected_end_date && new Date(closure.expected_end_date) < currentDate) {
      return false; // Already ended
    }
    return true;
  });

  if (activeClosures.length === 0) {
    return {
      valid: true,
      closures: [],
      allAccessClosed: false,
      primaryAccessClosed: false,
    };
  }

  // Check if all access is blocked
  const allAccess = activeClosures.filter((c) => c.is_full_closure);
  const primaryAccess = activeClosures.filter((c) => c.affects_primary_access);

  // If all roads are closed
  if (allAccess.length > 0 && allAccess.every((c) => c.is_full_closure)) {
    return {
      valid: false,
      rejection: 'All access routes currently closed',
      closures: activeClosures,
      allAccessClosed: true,
      primaryAccessClosed: true,
    };
  }

  // Primary access closed but alternates available
  if (primaryAccess.length > 0) {
    return {
      valid: true, // Still valid, just with caution
      closures: activeClosures,
      allAccessClosed: false,
      primaryAccessClosed: true,
    };
  }

  return {
    valid: true,
    closures: activeClosures,
    allAccessClosed: false,
    primaryAccessClosed: false,
  };
}

// ============================================
// Main Validation Function
// ============================================

/**
 * Full seasonal validation for a region
 */
export function validateSeasonal(
  region: RegionWithMetricsRow,
  closures: RoadClosureRow[],
  userVehicle?: VehicleType,
  currentDate: Date = new Date()
): SeasonalValidationResult {
  // Step 1: Validate snow conditions
  const snowResult = validateSnowConditions(region, currentDate);
  if (!snowResult.valid) {
    return {
      valid: false,
      rejection: snowResult.rejection,
      snowCoverPct: region.current_snow_cover_pct ?? 0,
      snowlineFt: snowResult.snowlineFt,
      roadAccess: {
        accessType: region.best_road_surface ?? 'gravel',
        score: 0,
        recommendedVehicle: 'N/A',
        cautions: [],
        rejected: true,
        rejectionReason: snowResult.rejection,
      },
      closures: [],
    };
  }

  // Step 2: Validate road access
  const roadResult = validateRoadAccess(region, userVehicle);
  if (roadResult.rejected) {
    return {
      valid: false,
      rejection: roadResult.rejectionReason,
      snowCoverPct: region.current_snow_cover_pct ?? 0,
      snowlineFt: snowResult.snowlineFt,
      roadAccess: roadResult,
      closures: [],
    };
  }

  // Step 3: Validate road closures
  const closureResult = validateRoadClosures(closures, currentDate);
  if (!closureResult.valid) {
    return {
      valid: false,
      rejection: closureResult.rejection,
      snowCoverPct: region.current_snow_cover_pct ?? 0,
      snowlineFt: snowResult.snowlineFt,
      roadAccess: roadResult,
      closures: closureResult.closures,
    };
  }

  // Add closure cautions if primary access is closed
  if (closureResult.primaryAccessClosed) {
    roadResult.cautions.push('Primary access road closed - use alternate routes');
  }

  return {
    valid: true,
    snowCoverPct: region.current_snow_cover_pct ?? 0,
    snowlineFt: snowResult.snowlineFt,
    roadAccess: roadResult,
    closures: closureResult.closures,
  };
}

// ============================================
// Reroll Logic
// ============================================

type RejectionCategory = 'snow' | 'roads' | 'no_candidates' | 'unknown';

/**
 * Categorize a rejection reason
 */
function categorizeRejection(reason: string): RejectionCategory {
  const lowered = reason.toLowerCase();

  if (
    lowered.includes('snowline') ||
    lowered.includes('snow cover') ||
    lowered.includes('snowbound')
  ) {
    return 'snow';
  }

  if (
    lowered.includes('road') ||
    lowered.includes('4wd') ||
    lowered.includes('vehicle') ||
    lowered.includes('access')
  ) {
    return 'roads';
  }

  if (lowered.includes('no region') || lowered.includes('no candidates')) {
    return 'no_candidates';
  }

  return 'unknown';
}

/**
 * Determine how to adjust parameters for reroll
 */
export function handleReroll(
  rejectionReason: string,
  attemptNumber: number,
  originalParams: SurpriseMeRequest
): RerollResult {
  if (attemptNumber > REROLL_CONFIG.maxAttempts) {
    return { shouldRetry: false };
  }

  const category = categorizeRejection(rejectionReason);
  const newParams: Partial<SurpriseMeRequest> = {};
  let relaxation: string | undefined;

  switch (category) {
    case 'snow':
      // Try lower elevation regions
      newParams.maxElevationFt = (originalParams.maxElevationFt ?? 14000) - 1000;
      newParams.excludeBiomes = [...(originalParams.excludeBiomes ?? []), 'alpine'];
      relaxation = 'lower_max_elevation';
      break;

    case 'roads':
      // This usually means vehicle mismatch - can't easily fix
      // But we can try to find regions with better roads
      relaxation = 'prefer_better_roads';
      break;

    case 'no_candidates':
      // Progressively relax filters
      const relaxationIndex = Math.min(
        attemptNumber - 1,
        REROLL_CONFIG.relaxationOrder.length - 1
      );
      relaxation = REROLL_CONFIG.relaxationOrder[relaxationIndex];

      switch (relaxation) {
        case 'increase_max_distance':
          newParams.maxDistanceMiles =
            (originalParams.maxDistanceMiles ?? 200) + 50;
          break;
        case 'lower_trail_minimum':
          // This would need to be passed to the filter function
          break;
        case 'accept_higher_popularity':
          // This would adjust the scoring, not filters
          break;
        case 'skip_diversity_boost':
          newParams.skipDiversityBoost = true;
          break;
      }
      break;

    default:
      // Unknown rejection - just retry
      break;
  }

  return {
    shouldRetry: true,
    newParams,
    relaxationApplied: relaxation,
  };
}

// ============================================
// Caution Generation
// ============================================

/**
 * Generate cautions/warnings for a validated region
 */
export function generateCautions(
  validation: SeasonalValidationResult,
  region: RegionWithMetricsRow
): string[] {
  const cautions: string[] = [];

  // Snow cautions
  if (validation.snowCoverPct > 20) {
    cautions.push('Some snow may be present at higher elevations');
  }

  // Road cautions
  if (validation.roadAccess.accessType !== 'paved') {
    cautions.push(`Access via ${validation.roadAccess.accessType} roads`);
  }
  cautions.push(...validation.roadAccess.cautions);

  // Closure cautions
  if (validation.closures.length > 0) {
    const closureNames = validation.closures
      .slice(0, 2)
      .map((c) => c.road_name)
      .join(', ');
    cautions.push(`Some roads closed: ${closureNames}`);
  }

  // Cell coverage caution
  const cellCoverage = region.cell_coverage_pct ?? 0;
  if (cellCoverage < 30) {
    cautions.push('Limited cell service - download offline maps');
  }

  // High elevation caution
  const elevMax = region.elevation_max_ft ?? 0;
  if (elevMax > 10000) {
    cautions.push('High elevation area - be prepared for altitude');
  }

  // Desert heat caution
  const month = new Date().getMonth() + 1;
  if (region.primary_biome === 'desert' && [6, 7, 8].includes(month)) {
    cautions.push('Extreme heat possible - carry extra water');
  }

  return cautions;
}
