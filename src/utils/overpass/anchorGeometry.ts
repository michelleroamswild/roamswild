import { Coord } from './types';
import { haversineDistance, polylineLength } from './extract';

/**
 * Result of anchor geometry extraction
 */
export interface AnchorGeometry {
  start: Coord;
  end: Coord;
  center: Coord;
  lengthMiles: number;
}

/**
 * Interpolate between two coordinates
 * @param a Start coordinate
 * @param b End coordinate
 * @param t Interpolation factor (0 = a, 1 = b)
 */
export function interpolateCoord(a: Coord, b: Coord, t: number): Coord {
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
  };
}

/**
 * Find the coordinate at a given distance along a polyline
 * @param coords Polyline coordinates
 * @param targetDistance Distance in miles from start
 * @returns Coordinate at the target distance, or last coord if distance exceeds length
 */
export function coordAtDistance(coords: Coord[], targetDistance: number): Coord {
  if (coords.length === 0) {
    throw new Error('Empty polyline');
  }
  if (coords.length === 1) {
    return coords[0];
  }
  if (targetDistance <= 0) {
    return coords[0];
  }

  let accumulated = 0;

  for (let i = 1; i < coords.length; i++) {
    const segmentLength = haversineDistance(coords[i - 1], coords[i]);
    const nextAccumulated = accumulated + segmentLength;

    if (nextAccumulated >= targetDistance) {
      // Target is within this segment
      const remainingDistance = targetDistance - accumulated;
      const t = segmentLength > 0 ? remainingDistance / segmentLength : 0;
      return interpolateCoord(coords[i - 1], coords[i], t);
    }

    accumulated = nextAccumulated;
  }

  // Target distance exceeds polyline length, return last coord
  return coords[coords.length - 1];
}

/**
 * Find the midpoint along a polyline by distance (not geometric centroid)
 * Returns the coordinate at 50% of the total polyline length
 * @param coords Polyline coordinates
 */
export function midpointAlongPolyline(coords: Coord[]): Coord {
  if (coords.length === 0) {
    throw new Error('Empty polyline');
  }
  if (coords.length === 1) {
    return coords[0];
  }

  const totalLength = polylineLength(coords);
  const halfLength = totalLength / 2;

  return coordAtDistance(coords, halfLength);
}

/**
 * Extract anchor geometry from a road segment polyline
 * @param coords Polyline coordinates (must have at least 2 points)
 * @returns AnchorGeometry with start, end, center, and length
 */
export function extractAnchorGeometry(coords: Coord[]): AnchorGeometry {
  if (coords.length < 2) {
    throw new Error('Polyline must have at least 2 coordinates');
  }

  const start = coords[0];
  const end = coords[coords.length - 1];
  const lengthMiles = polylineLength(coords);
  const center = midpointAlongPolyline(coords);

  return {
    start,
    end,
    center,
    lengthMiles: Math.round(lengthMiles * 1000) / 1000, // 3 decimal places
  };
}

/**
 * Find coordinate at a given percentage along the polyline
 * @param coords Polyline coordinates
 * @param percentage Percentage (0-100) along the polyline
 */
export function coordAtPercentage(coords: Coord[], percentage: number): Coord {
  if (coords.length === 0) {
    throw new Error('Empty polyline');
  }

  const clampedPct = Math.max(0, Math.min(100, percentage));
  const totalLength = polylineLength(coords);
  const targetDistance = (clampedPct / 100) * totalLength;

  return coordAtDistance(coords, targetDistance);
}

/**
 * Get multiple evenly-spaced points along a polyline
 * Useful for displaying the road segment on a map
 * @param coords Polyline coordinates
 * @param numPoints Number of points to return (including start and end)
 */
export function samplePolyline(coords: Coord[], numPoints: number): Coord[] {
  if (coords.length === 0) {
    return [];
  }
  if (numPoints <= 1) {
    return [midpointAlongPolyline(coords)];
  }
  if (numPoints === 2) {
    return [coords[0], coords[coords.length - 1]];
  }

  const result: Coord[] = [];
  const totalLength = polylineLength(coords);

  for (let i = 0; i < numPoints; i++) {
    const targetDistance = (i / (numPoints - 1)) * totalLength;
    result.push(coordAtDistance(coords, targetDistance));
  }

  return result;
}
