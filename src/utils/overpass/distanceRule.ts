import { Coord } from './types';
import { haversineDistance } from './extract';

/**
 * Recent anchor record from surprise history
 */
export interface RecentAnchor {
  lat: number;
  lng: number;
  recommendedAt?: Date;
}

/**
 * Distance thresholds for sporadic selection
 * Tries strictest first, then relaxes progressively
 */
export const DISTANCE_THRESHOLDS = {
  STRICT: 300,    // Default: 300 miles minimum from recent anchors
  RELAXED: 150,   // First fallback: 150 miles
  NONE: 0,        // Final fallback: no distance requirement
} as const;

/**
 * Default number of recent anchors to consider
 */
export const DEFAULT_RECENT_COUNT = 5;

/**
 * Check if a candidate passes the minimum distance rule
 * Returns true if candidate is at least minDistanceMiles from ALL recent anchors
 *
 * @param candidateCenter - The candidate anchor's center coordinate
 * @param recentCenters - Array of recent anchor centers
 * @param minDistanceMiles - Minimum required distance in miles
 */
export function passesDistanceRule(
  candidateCenter: Coord,
  recentCenters: RecentAnchor[],
  minDistanceMiles: number = DISTANCE_THRESHOLDS.STRICT
): boolean {
  // No recent anchors = always passes
  if (!recentCenters || recentCenters.length === 0) {
    return true;
  }

  // No distance requirement = always passes
  if (minDistanceMiles <= 0) {
    return true;
  }

  // Check distance to each recent anchor
  for (const recent of recentCenters) {
    const distance = haversineDistance(candidateCenter, { lat: recent.lat, lng: recent.lng });
    if (distance < minDistanceMiles) {
      return false;
    }
  }

  return true;
}

/**
 * Get the minimum distance from a candidate to any recent anchor
 *
 * @param candidateCenter - The candidate anchor's center coordinate
 * @param recentCenters - Array of recent anchor centers
 * @returns Minimum distance in miles, or Infinity if no recent centers
 */
export function getMinDistanceToRecent(
  candidateCenter: Coord,
  recentCenters: RecentAnchor[]
): number {
  if (!recentCenters || recentCenters.length === 0) {
    return Infinity;
  }

  let minDistance = Infinity;

  for (const recent of recentCenters) {
    const distance = haversineDistance(candidateCenter, { lat: recent.lat, lng: recent.lng });
    if (distance < minDistance) {
      minDistance = distance;
    }
  }

  return minDistance;
}

/**
 * Result of filtering candidates by distance rule
 */
export interface DistanceFilterResult<T> {
  /** Candidates that passed the distance rule */
  passing: T[];
  /** The threshold that was used */
  thresholdUsed: number;
  /** Whether a relaxed threshold was used */
  wasRelaxed: boolean;
}

/**
 * Filter candidates by distance rule with progressive relaxation
 *
 * Tries STRICT threshold first, then RELAXED, then NONE
 * Returns the first non-empty result
 *
 * @param candidates - Array of candidates with a center coordinate
 * @param recentCenters - Array of recent anchor centers
 * @param getCenter - Function to extract center coordinate from a candidate
 */
export function filterByDistanceRule<T>(
  candidates: T[],
  recentCenters: RecentAnchor[],
  getCenter: (candidate: T) => Coord
): DistanceFilterResult<T> {
  // No recent anchors = all pass at strict threshold
  if (!recentCenters || recentCenters.length === 0) {
    return {
      passing: candidates,
      thresholdUsed: DISTANCE_THRESHOLDS.STRICT,
      wasRelaxed: false,
    };
  }

  // Try strict threshold
  const strictPassing = candidates.filter(c =>
    passesDistanceRule(getCenter(c), recentCenters, DISTANCE_THRESHOLDS.STRICT)
  );

  if (strictPassing.length > 0) {
    return {
      passing: strictPassing,
      thresholdUsed: DISTANCE_THRESHOLDS.STRICT,
      wasRelaxed: false,
    };
  }

  // Try relaxed threshold
  const relaxedPassing = candidates.filter(c =>
    passesDistanceRule(getCenter(c), recentCenters, DISTANCE_THRESHOLDS.RELAXED)
  );

  if (relaxedPassing.length > 0) {
    return {
      passing: relaxedPassing,
      thresholdUsed: DISTANCE_THRESHOLDS.RELAXED,
      wasRelaxed: true,
    };
  }

  // Return all candidates with no distance requirement
  return {
    passing: candidates,
    thresholdUsed: DISTANCE_THRESHOLDS.NONE,
    wasRelaxed: true,
  };
}

/**
 * Sort candidates by distance from recent anchors (farthest first)
 * Useful when you want to maximize exploration variety
 *
 * @param candidates - Array of candidates with a center coordinate
 * @param recentCenters - Array of recent anchor centers
 * @param getCenter - Function to extract center coordinate from a candidate
 */
export function sortByFarthestFromRecent<T>(
  candidates: T[],
  recentCenters: RecentAnchor[],
  getCenter: (candidate: T) => Coord
): T[] {
  if (!recentCenters || recentCenters.length === 0) {
    return candidates;
  }

  return [...candidates].sort((a, b) => {
    const distA = getMinDistanceToRecent(getCenter(a), recentCenters);
    const distB = getMinDistanceToRecent(getCenter(b), recentCenters);
    return distB - distA; // Descending (farthest first)
  });
}

/**
 * Convert database result to RecentAnchor array
 */
export function parseRecentAnchors(
  dbRows: Array<{ anchor_lat: number; anchor_lng: number; recommended_at?: string }>
): RecentAnchor[] {
  return dbRows.map(row => ({
    lat: row.anchor_lat,
    lng: row.anchor_lng,
    recommendedAt: row.recommended_at ? new Date(row.recommended_at) : undefined,
  }));
}
