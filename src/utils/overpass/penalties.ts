import { NormalizedRoad } from './types';

/**
 * Parse maxspeed tag to mph
 * Handles: "35", "35 mph", "50 km/h", "signals", null
 * Returns null if unparseable
 */
export function parseMaxspeedMph(tagValue: string | undefined | null): number | null {
  if (!tagValue) return null;

  const trimmed = tagValue.trim().toLowerCase();

  // Skip non-numeric values
  if (trimmed === 'signals' || trimmed === 'variable' || trimmed === 'walk' || trimmed === 'none') {
    return null;
  }

  // Try parsing km/h
  const kmhMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*km\/?h?$/);
  if (kmhMatch) {
    return Math.round(parseFloat(kmhMatch[1]) * 0.621371);
  }

  // Try parsing mph (explicit)
  const mphMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*mph?$/);
  if (mphMatch) {
    return Math.round(parseFloat(mphMatch[1]));
  }

  // Try parsing bare number (assume mph in US context)
  const bareMatch = trimmed.match(/^(\d+(?:\.\d+)?)$/);
  if (bareMatch) {
    return Math.round(parseFloat(bareMatch[1]));
  }

  return null;
}

export interface PenaltyResult {
  total: number;
  breakdown: {
    highwayType: number;
    lanes: number;
    maxspeed: number;
  };
}

/**
 * Calculate penalties for a road segment
 *
 * Penalties (subtracted from score):
 * - Secondary roads: -15 (unless high POI density)
 * - Lanes > 2: -10
 * - Maxspeed > 55 mph: -10
 * - Maxspeed > 65 mph: additional -5 (total -15)
 */
export function calculatePenalties(
  road: NormalizedRoad,
  poiScore: number = 0
): PenaltyResult {
  const breakdown = {
    highwayType: 0,
    lanes: 0,
    maxspeed: 0,
  };

  // Highway type penalty
  // Secondary roads are often busier/less scenic unless justified by POIs
  if (road.highway === 'secondary' && poiScore < 0.5) {
    breakdown.highwayType = -15;
  }

  // Lane penalty - more lanes = likely busier road
  const lanes = parseInt(road.tags.lanes || '0', 10);
  if (lanes > 2) {
    breakdown.lanes = -10;
  }

  // Maxspeed penalty - faster roads less suitable for scenic driving
  const maxspeed = parseMaxspeedMph(road.tags.maxspeed);
  if (maxspeed !== null) {
    if (maxspeed > 65) {
      breakdown.maxspeed = -15;
    } else if (maxspeed > 55) {
      breakdown.maxspeed = -10;
    }
  }

  return {
    total: breakdown.highwayType + breakdown.lanes + breakdown.maxspeed,
    breakdown,
  };
}

/**
 * Check if road has any disqualifying penalties
 */
export function hasDisqualifyingPenalties(road: NormalizedRoad): boolean {
  const lanes = parseInt(road.tags.lanes || '0', 10);
  const maxspeed = parseMaxspeedMph(road.tags.maxspeed);

  // Disqualify roads with 4+ lanes
  if (lanes >= 4) return true;

  // Disqualify roads with maxspeed > 70
  if (maxspeed !== null && maxspeed > 70) return true;

  return false;
}
