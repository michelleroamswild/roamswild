// Utility functions for hike-related features

/**
 * Generate an AllTrails search URL for a hike
 * Uses DuckDuckGo's redirect feature to go directly to the top AllTrails result
 * @param hikeName - Name of the hike/trail
 * @param lat - Latitude (optional, currently unused)
 * @param lng - Longitude (optional, currently unused)
 * @returns DuckDuckGo redirect URL that goes to AllTrails
 */
export function getAllTrailsUrl(hikeName: string, lat?: number, lng?: number): string {
  // Clean up the hike name for search
  // Remove common suffixes that might interfere with search
  let cleanName = hikeName
    .replace(/\s+/g, ' ')
    .replace(/\s*trail\s*$/i, '') // Remove trailing "trail"
    .replace(/\s*trailhead\s*$/i, '') // Remove trailing "trailhead"
    .trim();

  // Use DuckDuckGo's "I'm Feeling Ducky" (\ prefix) to redirect directly to top result
  const searchQuery = encodeURIComponent(`\\ ${cleanName} alltrails`);

  return `https://duckduckgo.com/?q=${searchQuery}`;
}

/**
 * Estimate trail length based on duration string
 * Assumes moderate hiking pace of ~2 mph on trails
 * @param duration - Duration string like "2-4h hike", "3h", "45 min"
 * @returns Estimated trail length string like "4-8 mi" or null if unable to estimate
 */
export function estimateTrailLength(duration: string): string | null {
  if (!duration) return null;

  const lower = duration.toLowerCase();

  // Average hiking speeds:
  // - Easy trail: 2-2.5 mph
  // - Moderate trail: 1.5-2 mph
  // - Difficult trail: 1-1.5 mph
  // We'll use 1.8 mph as average (accounting for breaks, elevation, etc.)
  const avgSpeed = 1.8;

  // Handle range format like "2-4h hike" or "2-4h"
  const rangeMatch = lower.match(/(\d+)-(\d+)\s*h/);
  if (rangeMatch) {
    const minHours = parseInt(rangeMatch[1], 10);
    const maxHours = parseInt(rangeMatch[2], 10);
    const minMiles = Math.round(minHours * avgSpeed);
    const maxMiles = Math.round(maxHours * avgSpeed);
    return `${minMiles}-${maxMiles} mi`;
  }

  // Handle "Xh Ym" format like "1h 30m"
  const hourMinMatch = lower.match(/(\d+)\s*h\s*(\d+)\s*m/);
  if (hourMinMatch) {
    const hours = parseInt(hourMinMatch[1], 10) + parseInt(hourMinMatch[2], 10) / 60;
    const miles = Math.round(hours * avgSpeed * 10) / 10;
    return `~${miles} mi`;
  }

  // Handle "X hours" or "Xh"
  const hourMatch = lower.match(/(\d+)\s*h/);
  if (hourMatch) {
    const hours = parseInt(hourMatch[1], 10);
    const miles = Math.round(hours * avgSpeed);
    return `~${miles} mi`;
  }

  // Handle "X min" or "X minutes"
  const minMatch = lower.match(/(\d+)\s*min/);
  if (minMatch) {
    const minutes = parseInt(minMatch[1], 10);
    const miles = Math.round((minutes / 60) * avgSpeed * 10) / 10;
    return `~${miles} mi`;
  }

  return null;
}

/**
 * Get a display string combining estimated length and AllTrails link text
 */
export function getTrailInfo(duration: string): { estimatedLength: string | null } {
  return {
    estimatedLength: estimateTrailLength(duration),
  };
}
