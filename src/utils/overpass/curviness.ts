import { Coord } from './types';
import { haversineDistance, polylineLength } from './extract';

/**
 * Calculate straight-line distance between first and last points
 */
export function straightLineDistance(coords: Coord[]): number {
  if (coords.length < 2) return 0;
  return haversineDistance(coords[0], coords[coords.length - 1]);
}

/**
 * Calculate curviness ratio: polyline length / straight-line distance
 * Clamped to [1.0, 3.0] range
 */
export function curvinessRatio(coords: Coord[]): number {
  if (coords.length < 2) return 1.0;

  const polyLen = polylineLength(coords);
  const straightLen = straightLineDistance(coords);

  // Avoid division by zero for very short segments
  if (straightLen < 0.01) return 1.0;

  const ratio = polyLen / straightLen;
  return Math.max(1.0, Math.min(3.0, ratio));
}

/**
 * Convert curviness ratio to 0-1 score
 * Score increases with ratio until ~1.8 then plateaus
 *
 * Rationale:
 * - 1.0 = perfectly straight = 0 score
 * - 1.4 = mild curves = 0.5 score
 * - 1.8+ = very curvy = 1.0 score (plateau)
 */
export function curvinessScore(coords: Coord[]): number {
  const ratio = curvinessRatio(coords);

  // Linear interpolation from 1.0 to 1.8, then plateau
  // ratio 1.0 -> score 0
  // ratio 1.8 -> score 1.0
  // ratio > 1.8 -> score 1.0 (plateau)

  if (ratio <= 1.0) return 0;
  if (ratio >= 1.8) return 1.0;

  return (ratio - 1.0) / 0.8;
}

/**
 * Normalized curviness score with configurable plateau
 */
export function curvinessScoreCustom(
  coords: Coord[],
  plateauRatio: number = 1.8
): number {
  const ratio = curvinessRatio(coords);

  if (ratio <= 1.0) return 0;
  if (ratio >= plateauRatio) return 1.0;

  return (ratio - 1.0) / (plateauRatio - 1.0);
}
