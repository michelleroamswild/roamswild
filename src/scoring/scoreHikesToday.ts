/**
 * Best Hikes Today - Scoring Engine
 *
 * Deterministic scoring pipeline that ranks hikes for "today" based on
 * weather, trail conditions, light, effort match, and crowd factors.
 */

import {
  Hike,
  WeatherNow,
  SunInfo,
  ScoreBreakdown,
  ScoredHike,
  ScoringContext,
  UserPreference,
  EffortLevel,
  DANGEROUS_ALERTS,
} from "./types";

import {
  clamp01,
  lerp,
  inverseLerp,
  hoursUntil,
  isWithinHoursOf,
  tempComfortScore,
  windComfortScore,
  precipProbScore,
  cloudCoverLightScore,
  isSunsetFacingAspect,
  isSunriseFacingAspect,
  isDangerousAlert,
  formatHoursMinutes,
  roundTo,
} from "./helpers";

// ============================================================================
// SCORING WEIGHTS (must sum to 1.0)
// ============================================================================

const WEIGHTS = {
  weather: 0.30,
  conditions: 0.25,
  light: 0.20,
  effort_match: 0.15,
  crowd: 0.10,
} as const;

// ============================================================================
// WEATHER SCORE (0..1)
// ============================================================================

export interface WeatherScoreResult {
  score: number;
  reasons: string[];
  warnings: string[];
}

/**
 * Score weather conditions for hiking comfort.
 *
 * Components:
 * - Temperature comfort (55-75F optimal)
 * - Wind (best < 10 mph, penalize > 20 mph)
 * - Precipitation probability (penalize after 0.2, heavy > 0.6)
 * - Dangerous alerts trigger warnings
 */
export function scoreWeather(weather: WeatherNow): WeatherScoreResult {
  const reasons: string[] = [];
  const warnings: string[] = [];

  // Temperature component (weight: 0.4)
  const tempScore = tempComfortScore(weather.temp_f);
  if (tempScore >= 0.9) {
    reasons.push(`Comfortable ${Math.round(weather.temp_f)}°F`);
  } else if (tempScore >= 0.6) {
    reasons.push(`Acceptable ${Math.round(weather.temp_f)}°F`);
  } else if (weather.temp_f < 45) {
    reasons.push(`Cold (${Math.round(weather.temp_f)}°F)`);
  } else if (weather.temp_f > 85) {
    reasons.push(`Hot (${Math.round(weather.temp_f)}°F)`);
  }

  // Wind component (weight: 0.3)
  const windScore = windComfortScore(weather.wind_mph);
  if (windScore >= 0.9 && weather.wind_mph <= 10) {
    reasons.push("Low wind");
  } else if (weather.wind_mph > 20) {
    warnings.push(`Windy (${Math.round(weather.wind_mph)} mph)`);
  }

  // Precipitation component (weight: 0.3)
  const precipScore = precipProbScore(weather.precip_prob);
  if (precipScore >= 0.9) {
    reasons.push("Low chance of rain");
  } else if (weather.precip_prob > 0.5) {
    warnings.push(`${Math.round(weather.precip_prob * 100)}% chance of rain`);
  }

  // Check for dangerous alerts
  if (weather.alerts && weather.alerts.length > 0) {
    for (const alert of weather.alerts) {
      if (isDangerousAlert(alert, DANGEROUS_ALERTS)) {
        warnings.push(`Alert: ${alert}`);
      }
    }
  }

  // Weighted combination
  const score = clamp01(
    tempScore * 0.4 +
    windScore * 0.3 +
    precipScore * 0.3
  );

  return { score, reasons, warnings };
}

// ============================================================================
// TRAIL CONDITIONS SCORE (0..1)
// ============================================================================

export interface ConditionsScoreResult {
  score: number;
  reasons: string[];
  warnings: string[];
}

/**
 * Score trail conditions using available proxies.
 *
 * Factors:
 * - Seasonal closure risk
 * - Access road vs vehicle capability
 * - Mud risk (high precip + elevation)
 * - Ice risk (near freezing + precipitation)
 */
export function scoreConditions(
  hike: Hike,
  weather: WeatherNow,
  userVehicle: "2wd" | "awd" | "4x4" = "awd"
): ConditionsScoreResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 1.0;

  // Seasonal closure risk
  if (hike.seasonal_closure_risk === "high") {
    score *= 0.5;
    warnings.push("High seasonal closure risk");
  } else if (hike.seasonal_closure_risk === "medium") {
    score *= 0.75;
    warnings.push("Possible seasonal restrictions");
  } else if (hike.seasonal_closure_risk === "low") {
    reasons.push("Trail typically open");
  }

  // Access road compatibility
  const roadType = hike.access_road_type || "unknown";
  if (roadType === "high_clearance") {
    if (userVehicle === "2wd") {
      score *= 0.4;
      warnings.push("High-clearance road (2WD not recommended)");
    } else if (userVehicle === "awd") {
      score *= 0.7;
      warnings.push("High-clearance road (4x4 recommended)");
    } else {
      reasons.push("4x4 access road");
    }
  } else if (roadType === "gravel") {
    if (userVehicle === "2wd") {
      score *= 0.85;
    }
    reasons.push("Gravel road access");
  } else if (roadType === "paved") {
    reasons.push("Paved road access");
  }

  // Mud risk: high precip + significant elevation = likely muddy trails
  if (weather.precip_prob > 0.5 && hike.elevation_gain_ft > 1000) {
    score *= 0.8;
    warnings.push("Muddy trail conditions likely");
  } else if (weather.precip_prob > 0.3 && hike.elevation_gain_ft > 500) {
    score *= 0.9;
  }

  // Ice risk: near freezing + precipitation
  if (weather.temp_f <= 35 && weather.precip_prob > 0.3) {
    score *= 0.6;
    warnings.push("Ice/frost risk on trail");
  } else if (weather.temp_f <= 40 && weather.precip_prob > 0.4) {
    score *= 0.8;
    warnings.push("Possible icy patches");
  }

  // Trailhead parking confidence
  if (hike.trailhead_parking_confidence === "low") {
    score *= 0.9;
    warnings.push("Limited parking at trailhead");
  } else if (hike.trailhead_parking_confidence === "high") {
    reasons.push("Good trailhead parking");
  }

  return { score: clamp01(score), reasons, warnings };
}

// ============================================================================
// LIGHT SCORE (0..1)
// ============================================================================

export interface LightScoreResult {
  score: number;
  reasons: string[];
}

/**
 * Score lighting conditions for scenery/photography.
 *
 * Factors:
 * - Proximity to golden hour (within 2.5h of sunrise/sunset)
 * - Cloud cover (partial = dramatic, overcast = flat)
 * - Aspect alignment with sun position
 */
export function scoreLight(
  hike: Hike,
  sun: SunInfo,
  weather: WeatherNow,
  nowIso: string
): LightScoreResult {
  const reasons: string[] = [];
  let score = 0.5; // Neutral baseline

  const hoursToSunrise = hoursUntil(nowIso, sun.sunrise);
  const hoursToSunset = hoursUntil(nowIso, sun.sunset);

  // Check if within golden hour windows
  const nearSunrise = hoursToSunrise > -1.5 && hoursToSunrise < 2.5;
  const nearSunset = hoursToSunset > -0.5 && hoursToSunset < 2.5;

  // Golden hour boost
  if (nearSunrise || nearSunset) {
    score += 0.3;

    if (nearSunset && hoursToSunset > 0) {
      const timeStr = formatHoursMinutes(hoursToSunset);
      reasons.push(`Golden hour in ${timeStr}`);
    } else if (nearSunrise && hoursToSunrise > 0) {
      const timeStr = formatHoursMinutes(hoursToSunrise);
      reasons.push(`Sunrise in ${timeStr}`);
    } else if (nearSunset && hoursToSunset <= 0 && hoursToSunset > -1.5) {
      reasons.push("Golden hour now");
    }
  }

  // Cloud cover for dramatic light
  const cloudScore = cloudCoverLightScore(weather.cloud_cover);
  score += (cloudScore - 0.5) * 0.3; // Adjust by cloud contribution

  if (weather.cloud_cover >= 0.3 && weather.cloud_cover <= 0.6) {
    reasons.push("Partial clouds for dramatic light");
  } else if (weather.cloud_cover >= 0.9) {
    reasons.push("Overcast (soft, flat light)");
  } else if (weather.cloud_cover < 0.1) {
    reasons.push("Clear skies");
  }

  // Aspect alignment bonus
  const aspect = hike.aspect;
  if (aspect && aspect !== "flat" && aspect !== "unknown") {
    // Sunset-facing aspects (W/SW/NW) within 3h of sunset
    if (isSunsetFacingAspect(aspect) && hoursToSunset > 0 && hoursToSunset <= 3) {
      score += 0.15;
      reasons.push(`${aspect}-facing (good for sunset)`);
    }
    // Sunrise-facing aspects (E/NE/SE) within 3h after sunrise
    else if (isSunriseFacingAspect(aspect) && hoursToSunrise <= 0 && hoursToSunrise > -3) {
      score += 0.15;
      reasons.push(`${aspect}-facing (catches morning light)`);
    }
  }

  // Viewpoint bonus
  if (hike.viewpoint_score && hike.viewpoint_score > 0.7) {
    score += 0.1;
    reasons.push("Scenic viewpoints");
  }

  return { score: clamp01(score), reasons };
}

// ============================================================================
// EFFORT MATCH SCORE (0..1)
// ============================================================================

export interface EffortScoreResult {
  score: number;
  reasons: string[];
}

// Effort level target ranges
const EFFORT_TARGETS: Record<EffortLevel, { maxMiles: number; maxGain: number }> = {
  easy: { maxMiles: 3, maxGain: 700 },
  moderate: { maxMiles: 6, maxGain: 1800 },
  hard: { maxMiles: 12, maxGain: 4000 },
};

/**
 * Score how well hike matches user's effort preference.
 *
 * Uses smooth scoring rather than hard cutoffs.
 * Default effort = moderate.
 */
export function scoreEffortMatch(
  hike: Hike,
  userPreference?: UserPreference
): EffortScoreResult {
  const reasons: string[] = [];
  const effort = userPreference?.effort || "moderate";
  const targets = EFFORT_TARGETS[effort];

  // Override with explicit user preferences if provided
  const maxMiles = userPreference?.max_distance_miles ?? targets.maxMiles;
  const maxGain = userPreference?.max_gain_ft ?? targets.maxGain;

  // Distance score - smooth falloff beyond target
  let distanceScore: number;
  if (hike.distance_miles <= maxMiles) {
    // Within target - full score
    distanceScore = 1.0;
  } else if (hike.distance_miles <= maxMiles * 1.5) {
    // Up to 50% over - gradual reduction
    distanceScore = lerp(1.0, 0.6, inverseLerp(maxMiles, maxMiles * 1.5, hike.distance_miles));
  } else if (hike.distance_miles <= maxMiles * 2) {
    // Up to 100% over - stronger reduction
    distanceScore = lerp(0.6, 0.3, inverseLerp(maxMiles * 1.5, maxMiles * 2, hike.distance_miles));
  } else {
    // Way over - minimal score
    distanceScore = Math.max(0.1, 0.3 - (hike.distance_miles - maxMiles * 2) * 0.05);
  }

  // Elevation gain score - smooth falloff
  let gainScore: number;
  if (hike.elevation_gain_ft <= maxGain) {
    gainScore = 1.0;
  } else if (hike.elevation_gain_ft <= maxGain * 1.5) {
    gainScore = lerp(1.0, 0.6, inverseLerp(maxGain, maxGain * 1.5, hike.elevation_gain_ft));
  } else if (hike.elevation_gain_ft <= maxGain * 2) {
    gainScore = lerp(0.6, 0.3, inverseLerp(maxGain * 1.5, maxGain * 2, hike.elevation_gain_ft));
  } else {
    gainScore = Math.max(0.1, 0.3 - (hike.elevation_gain_ft - maxGain * 2) * 0.0001);
  }

  // Combined score (weighted average)
  const score = clamp01(distanceScore * 0.5 + gainScore * 0.5);

  // Generate reason
  const difficultyDesc = hike.distance_miles <= 3 && hike.elevation_gain_ft <= 700
    ? "Easy"
    : hike.distance_miles <= 6 && hike.elevation_gain_ft <= 1800
      ? "Moderate"
      : "Challenging";

  reasons.push(`${difficultyDesc} (${hike.distance_miles.toFixed(1)} mi, ${hike.elevation_gain_ft.toLocaleString()} ft)`);

  if (score >= 0.9) {
    reasons.push(`Matches ${effort} preference`);
  } else if (score < 0.5) {
    reasons.push(effort === "easy" ? "More challenging than preferred" : "May be easier than preferred");
  }

  return { score, reasons };
}

// ============================================================================
// CROWD SCORE (0..1)
// ============================================================================

export interface CrowdScoreResult {
  score: number;
  reasons: string[];
}

/**
 * Score expected crowd levels (1 = not crowded, good).
 *
 * Uses popularity if available, applies tolerance adjustment.
 */
export function scoreCrowd(
  hike: Hike,
  userPreference?: UserPreference
): CrowdScoreResult {
  const reasons: string[] = [];
  const tolerance = userPreference?.crowd_tolerance || "neutral";

  // If no popularity data, return neutral
  if (hike.popularity === undefined || hike.popularity === null) {
    return { score: 0.6, reasons: ["Crowd level unknown"] };
  }

  // Base crowd score: 1 - popularity (higher popularity = lower score)
  let crowdScore = 1 - hike.popularity;

  // Apply tolerance adjustment
  if (tolerance === "avoid") {
    // Amplify penalty for popular trails (square the deduction)
    crowdScore = Math.pow(crowdScore, 0.5); // Actually makes it more sensitive
    crowdScore = 1 - Math.pow(hike.popularity, 0.7); // More aggressive penalty
  } else if (tolerance === "dont_care") {
    // Dampen the crowd effect
    crowdScore = lerp(0.7, 1.0, crowdScore);
  }

  // Generate reason
  if (crowdScore >= 0.8) {
    reasons.push("Lower crowd likelihood");
  } else if (crowdScore >= 0.5) {
    reasons.push("Moderate popularity");
  } else {
    reasons.push("Popular trail (may be crowded)");
  }

  return { score: clamp01(crowdScore), reasons };
}

// ============================================================================
// PENALTIES & WARNINGS
// ============================================================================

export interface PenaltyResult {
  multiplier: number;
  warnings: string[];
}

/**
 * Calculate penalty multiplier (0..1) and generate warnings.
 *
 * Penalties:
 * - 0.4 for dangerous weather alerts
 * - 0.7 for wind > 30 mph
 * - 0.8 for precip_prob > 0.7
 * - 0.75 for vehicle/road mismatch
 * - 0.9 for low parking confidence
 */
export function calculatePenalties(
  hike: Hike,
  weather: WeatherNow,
  userVehicle: "2wd" | "awd" | "4x4" = "awd"
): PenaltyResult {
  let multiplier = 1.0;
  const warnings: string[] = [];

  // Dangerous weather alerts
  if (weather.alerts && weather.alerts.length > 0) {
    const hasDangerousAlert = weather.alerts.some(alert =>
      isDangerousAlert(alert, DANGEROUS_ALERTS)
    );
    if (hasDangerousAlert) {
      multiplier *= 0.4;
      warnings.push("Dangerous weather alert active");
    }
  }

  // High wind penalty
  if (weather.wind_mph > 30) {
    multiplier *= 0.7;
    warnings.push(`High winds (${Math.round(weather.wind_mph)} mph)`);
  }

  // High precipitation penalty
  if (weather.precip_prob > 0.7) {
    multiplier *= 0.8;
    warnings.push(`High rain chance (${Math.round(weather.precip_prob * 100)}%)`);
  }

  // Vehicle/road mismatch
  const roadType = hike.access_road_type || "unknown";
  if (roadType === "high_clearance" && userVehicle === "2wd") {
    multiplier *= 0.75;
    warnings.push("High-clearance vehicle recommended");
  }

  // Low parking confidence
  if (hike.trailhead_parking_confidence === "low") {
    multiplier *= 0.9;
    // Warning already added in conditions scoring
  }

  // Air quality (if available)
  if (weather.air_quality_index !== undefined && weather.air_quality_index > 150) {
    multiplier *= 0.7;
    warnings.push(`Poor air quality (AQI: ${weather.air_quality_index})`);
  }

  return { multiplier: clamp01(multiplier), warnings };
}

// ============================================================================
// REASON GENERATION
// ============================================================================

/**
 * Generate top 2-4 reasons for UI display.
 * Prioritizes the most impactful positive factors.
 */
function generateTopReasons(
  weatherResult: WeatherScoreResult,
  conditionsResult: ConditionsScoreResult,
  lightResult: LightScoreResult,
  effortResult: EffortScoreResult,
  crowdResult: CrowdScoreResult,
  breakdown: ScoreBreakdown
): string[] {
  // Collect all positive reasons with their associated scores
  const candidates: Array<{ reason: string; weight: number }> = [];

  // Weather reasons (weight by actual contribution)
  for (const reason of weatherResult.reasons) {
    if (!reason.toLowerCase().includes("cold") && !reason.toLowerCase().includes("hot")) {
      candidates.push({ reason, weight: breakdown.weather * WEIGHTS.weather });
    }
  }

  // Light reasons
  for (const reason of lightResult.reasons) {
    if (!reason.toLowerCase().includes("overcast")) {
      candidates.push({ reason, weight: breakdown.light * WEIGHTS.light });
    }
  }

  // Crowd reasons (if positive)
  if (breakdown.crowd >= 0.7) {
    for (const reason of crowdResult.reasons) {
      if (reason.toLowerCase().includes("lower")) {
        candidates.push({ reason, weight: breakdown.crowd * WEIGHTS.crowd });
      }
    }
  }

  // Conditions reasons (access-related positives)
  for (const reason of conditionsResult.reasons) {
    if (reason.includes("Paved") || reason.includes("parking") || reason.includes("open")) {
      candidates.push({ reason, weight: breakdown.conditions * WEIGHTS.conditions * 0.5 });
    }
  }

  // Sort by weight and take top 2-4
  candidates.sort((a, b) => b.weight - a.weight);

  // Always include effort info
  const effortReason = effortResult.reasons[0];
  const topReasons = candidates.slice(0, 3).map(c => c.reason);

  if (!topReasons.some(r => r.includes("mi,"))) {
    topReasons.push(effortReason);
  }

  // Ensure we have at least 2 reasons
  if (topReasons.length < 2 && weatherResult.reasons.length > 0) {
    topReasons.push(weatherResult.reasons[0]);
  }

  return topReasons.slice(0, 4);
}

// ============================================================================
// MAIN SCORING FUNCTION
// ============================================================================

/**
 * Score all hikes for "today" and return ranked results.
 *
 * Formula:
 *   base = 0.30*Weather + 0.25*Conditions + 0.20*Light + 0.15*Effort + 0.10*Crowd
 *   final = clamp01(base) * PenaltyMultiplier
 *   score_0_100 = round(final * 100)
 */
export function scoreHikesToday(
  hikes: Hike[],
  ctx: ScoringContext
): ScoredHike[] {
  const results: ScoredHike[] = [];
  const userVehicle = ctx.userPreference?.vehicle || "awd";

  for (const hike of hikes) {
    // Get weather and sun data for this hike
    const weather = ctx.weatherByHikeId[hike.id];
    const sun = ctx.sunByHikeId[hike.id];

    // Skip if missing required data
    if (!weather || !sun) {
      console.warn(`Missing weather/sun data for hike ${hike.id}, skipping`);
      continue;
    }

    // Calculate individual scores
    const weatherResult = scoreWeather(weather);
    const conditionsResult = scoreConditions(hike, weather, userVehicle);
    const lightResult = scoreLight(hike, sun, weather, ctx.nowIso);
    const effortResult = scoreEffortMatch(hike, ctx.userPreference);
    const crowdResult = scoreCrowd(hike, ctx.userPreference);
    const penaltyResult = calculatePenalties(hike, weather, userVehicle);

    // Build breakdown
    const breakdown: ScoreBreakdown = {
      weather: roundTo(weatherResult.score, 3),
      conditions: roundTo(conditionsResult.score, 3),
      light: roundTo(lightResult.score, 3),
      effort_match: roundTo(effortResult.score, 3),
      crowd: roundTo(crowdResult.score, 3),
      penalties: roundTo(penaltyResult.multiplier, 3),
    };

    // Calculate weighted base score
    const baseScore =
      WEIGHTS.weather * breakdown.weather +
      WEIGHTS.conditions * breakdown.conditions +
      WEIGHTS.light * breakdown.light +
      WEIGHTS.effort_match * breakdown.effort_match +
      WEIGHTS.crowd * breakdown.crowd;

    // Apply penalty multiplier
    const finalScore = clamp01(baseScore) * breakdown.penalties;
    const score_0_100 = Math.round(finalScore * 100);

    // Generate reasons and collect warnings
    const reasons_short = generateTopReasons(
      weatherResult,
      conditionsResult,
      lightResult,
      effortResult,
      crowdResult,
      breakdown
    );

    const allWarnings = [
      ...weatherResult.warnings,
      ...conditionsResult.warnings,
      ...penaltyResult.warnings,
    ];

    // Deduplicate warnings
    const warnings = [...new Set(allWarnings)];

    results.push({
      hike,
      score_0_100,
      breakdown,
      reasons_short,
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  }

  // Sort by score descending
  results.sort((a, b) => b.score_0_100 - a.score_0_100);

  return results;
}

// Re-export types for convenience
export type {
  Hike,
  WeatherNow,
  SunInfo,
  ScoreBreakdown,
  ScoredHike,
  ScoringContext,
  UserPreference,
} from "./types";
