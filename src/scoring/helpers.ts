/**
 * Best Hikes Today - Helper Functions
 *
 * Pure utility functions for scoring calculations.
 */

/**
 * Clamp a value to [0, 1] range
 */
export function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/**
 * Clamp a value to arbitrary [min, max] range
 */
export function clamp(x: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, x));
}

/**
 * Linear interpolation between a and b
 * t=0 returns a, t=1 returns b
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

/**
 * Inverse lerp - returns t given a value between a and b
 * Returns 0 if x <= a, 1 if x >= b
 */
export function inverseLerp(a: number, b: number, x: number): number {
  if (a === b) return 0;
  return clamp01((x - a) / (b - a));
}

/**
 * Gaussian-like function for smooth scoring curves
 * Returns 1.0 at x=mu, tapering off based on sigma
 * Score falls to ~0.61 at 1 sigma, ~0.14 at 2 sigma
 */
export function gaussianLike(x: number, mu: number, sigma: number): number {
  const diff = x - mu;
  return Math.exp(-(diff * diff) / (2 * sigma * sigma));
}

/**
 * Smooth step function (cubic Hermite interpolation)
 * Returns 0 for x <= edge0, 1 for x >= edge1
 * Smooth transition between
 */
export function smoothStep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * Remap a value from one range to another
 */
export function remap(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number {
  const t = inverseLerp(inMin, inMax, value);
  return lerp(outMin, outMax, t);
}

/**
 * Calculate hours difference between two ISO timestamps
 * Returns positive if target is after reference
 */
export function hoursBetween(referenceIso: string, targetIso: string): number {
  const ref = new Date(referenceIso).getTime();
  const target = new Date(targetIso).getTime();
  return (target - ref) / (1000 * 60 * 60);
}

/**
 * Calculate hours until a target time from now
 */
export function hoursUntil(nowIso: string, targetIso: string): number {
  return hoursBetween(nowIso, targetIso);
}

/**
 * Check if current time is within N hours of a target time (before or after)
 */
export function isWithinHoursOf(
  nowIso: string,
  targetIso: string,
  hours: number
): boolean {
  const diff = Math.abs(hoursBetween(nowIso, targetIso));
  return diff <= hours;
}

/**
 * Check if time is during "golden hour" (within 1.5 hours of sunrise/sunset)
 */
export function isGoldenHour(
  nowIso: string,
  sunrise: string,
  sunset: string
): boolean {
  return isWithinHoursOf(nowIso, sunrise, 1.5) || isWithinHoursOf(nowIso, sunset, 1.5);
}

/**
 * Check if time is during "blue hour" (within 30 min before sunrise or after sunset)
 */
export function isBlueHour(
  nowIso: string,
  sunrise: string,
  sunset: string
): boolean {
  const hoursToSunrise = hoursUntil(nowIso, sunrise);
  const hoursToSunset = hoursUntil(nowIso, sunset);

  // Blue hour is ~30 min before sunrise or after sunset
  return (hoursToSunrise > 0 && hoursToSunrise <= 0.5) ||
         (hoursToSunset < 0 && hoursToSunset >= -0.5);
}

/**
 * Calculate distance between two lat/lon points in miles (Haversine)
 */
export function haversineDistanceMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Check if an alert string contains dangerous keywords
 */
export function isDangerousAlert(alert: string, dangerousKeywords: readonly string[]): boolean {
  const lowerAlert = alert.toLowerCase();
  return dangerousKeywords.some(keyword => lowerAlert.includes(keyword.toLowerCase()));
}

/**
 * Format hours into a human-readable string
 */
export function formatHoursMinutes(hours: number): string {
  const h = Math.floor(Math.abs(hours));
  const m = Math.round((Math.abs(hours) - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Round to specified decimal places
 */
export function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Piecewise linear function for temperature comfort scoring
 * Returns 1.0 in optimal range, tapers off outside
 */
export function tempComfortScore(temp_f: number): number {
  // Optimal: 55-75F (score = 1.0)
  // Taper down: 40-55F and 75-90F
  // Low: <40F or >90F

  if (temp_f >= 55 && temp_f <= 75) {
    return 1.0;
  } else if (temp_f >= 45 && temp_f < 55) {
    // Cool but acceptable - linear taper from 0.6 to 1.0
    return lerp(0.6, 1.0, inverseLerp(45, 55, temp_f));
  } else if (temp_f > 75 && temp_f <= 85) {
    // Warm but acceptable - linear taper from 1.0 to 0.7
    return lerp(1.0, 0.7, inverseLerp(75, 85, temp_f));
  } else if (temp_f >= 35 && temp_f < 45) {
    // Cold - taper from 0.3 to 0.6
    return lerp(0.3, 0.6, inverseLerp(35, 45, temp_f));
  } else if (temp_f > 85 && temp_f <= 95) {
    // Hot - taper from 0.7 to 0.4
    return lerp(0.7, 0.4, inverseLerp(85, 95, temp_f));
  } else if (temp_f < 35) {
    // Very cold
    return Math.max(0.1, 0.3 - (35 - temp_f) * 0.02);
  } else {
    // Very hot (>95F)
    return Math.max(0.1, 0.4 - (temp_f - 95) * 0.03);
  }
}

/**
 * Wind comfort score
 * Best < 10 mph, penalize > 20 mph strongly
 */
export function windComfortScore(wind_mph: number): number {
  if (wind_mph <= 5) return 1.0;
  if (wind_mph <= 10) return lerp(1.0, 0.9, inverseLerp(5, 10, wind_mph));
  if (wind_mph <= 15) return lerp(0.9, 0.7, inverseLerp(10, 15, wind_mph));
  if (wind_mph <= 20) return lerp(0.7, 0.5, inverseLerp(15, 20, wind_mph));
  if (wind_mph <= 30) return lerp(0.5, 0.2, inverseLerp(20, 30, wind_mph));
  return Math.max(0.05, 0.2 - (wind_mph - 30) * 0.01);
}

/**
 * Precipitation probability score
 * Penalize linearly after 0.2, heavy penalty > 0.6
 */
export function precipProbScore(precip_prob: number): number {
  if (precip_prob <= 0.1) return 1.0;
  if (precip_prob <= 0.2) return lerp(1.0, 0.9, inverseLerp(0.1, 0.2, precip_prob));
  if (precip_prob <= 0.4) return lerp(0.9, 0.7, inverseLerp(0.2, 0.4, precip_prob));
  if (precip_prob <= 0.6) return lerp(0.7, 0.4, inverseLerp(0.4, 0.6, precip_prob));
  if (precip_prob <= 0.8) return lerp(0.4, 0.2, inverseLerp(0.6, 0.8, precip_prob));
  return lerp(0.2, 0.05, inverseLerp(0.8, 1.0, precip_prob));
}

/**
 * Cloud cover score for photography/scenery
 * Prefer partial clouds (0.3-0.7) for "drama"
 * Penalize fully overcast (>=0.9) and completely clear (<0.05) slightly
 */
export function cloudCoverLightScore(cloud_cover: number): number {
  // Optimal: 0.3-0.6 (partial clouds, dramatic light)
  if (cloud_cover >= 0.3 && cloud_cover <= 0.6) {
    return 1.0;
  }

  // Clear sky - still good, slight reduction
  if (cloud_cover < 0.3) {
    // 0.0 -> 0.85, 0.3 -> 1.0
    return lerp(0.85, 1.0, inverseLerp(0, 0.3, cloud_cover));
  }

  // Mostly cloudy - ok for soft light
  if (cloud_cover <= 0.8) {
    return lerp(1.0, 0.75, inverseLerp(0.6, 0.8, cloud_cover));
  }

  // Overcast - flat light
  return lerp(0.75, 0.5, inverseLerp(0.8, 1.0, cloud_cover));
}

/**
 * Check if hike aspect faces sunset direction (W/SW)
 */
export function isSunsetFacingAspect(aspect: string | undefined): boolean {
  return aspect === "W" || aspect === "SW" || aspect === "NW";
}

/**
 * Check if hike aspect faces sunrise direction (E/NE)
 */
export function isSunriseFacingAspect(aspect: string | undefined): boolean {
  return aspect === "E" || aspect === "NE" || aspect === "SE";
}
