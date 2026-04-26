/**
 * Ray-casting algorithm to check if a point is inside a polygon
 */
export function isPointInPolygon(
  point: { lat: number; lng: number },
  polygon: { lat: number; lng: number }[]
): boolean {
  if (!polygon || polygon.length < 3) return false;

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;

    const intersect =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Check if a point is within any of the public land polygons
 */
export function isWithinAnyPublicLand(
  lat: number,
  lng: number,
  publicLands: { polygon?: { lat: number; lng: number }[] }[]
): boolean {
  return publicLands.some(
    (land) => land.polygon && isPointInPolygon({ lat, lng }, land.polygon)
  );
}

/**
 * Find which public land a point is within and return its name + protection metadata
 */
export function findContainingLand(
  lat: number,
  lng: number,
  publicLands: {
    name?: string;
    unitName?: string;
    managingAgency?: string;
    protectClass?: string;
    protectionTitle?: string;
    polygon?: { lat: number; lng: number }[];
  }[]
): { name: string; agency: string; protectClass?: string; protectionTitle?: string } | null {
  for (const land of publicLands) {
    if (land.polygon && isPointInPolygon({ lat, lng }, land.polygon)) {
      const name = land.unitName || land.name || '';
      return {
        name,
        agency: land.managingAgency || '',
        protectClass: land.protectClass,
        protectionTitle: land.protectionTitle,
      };
    }
  }
  return null;
}

/**
 * Check if a dead-end spot is actually near the interior of another road (false dead-end).
 * This happens when OSM tracks are split into segments that don't share exact coordinates.
 * Matches the logic in use-dispersed-roads.ts findDeadEnds() filter.
 */
export function isFalseDeadEnd(
  spot: { lat: number; lng: number; type: string },
  roads: { geometry?: { type: string; coordinates: [number, number][] } }[]
): boolean {
  if (spot.type !== 'dead-end') return false;

  const INTERSECTION_THRESHOLD = 0.00012;

  for (const road of roads) {
    if (!road.geometry?.coordinates?.length) continue;
    const coords = road.geometry.coordinates;

    if (coords.length < 5) continue;

    const startPt = { lng: coords[0][0], lat: coords[0][1] };
    const endPt = { lng: coords[coords.length - 1][0], lat: coords[coords.length - 1][1] };

    const distToStart = Math.abs(spot.lat - startPt.lat) + Math.abs(spot.lng - startPt.lng);
    if (distToStart < INTERSECTION_THRESHOLD * 2) continue;

    const distToEnd = Math.abs(spot.lat - endPt.lat) + Math.abs(spot.lng - endPt.lng);
    if (distToEnd < INTERSECTION_THRESHOLD * 2) continue;

    for (let i = 2; i < coords.length - 2; i++) {
      const pt = { lng: coords[i][0], lat: coords[i][1] };
      const latDiff = Math.abs(spot.lat - pt.lat);
      const lngDiff = Math.abs(spot.lng - pt.lng);
      if (latDiff < INTERSECTION_THRESHOLD && lngDiff < INTERSECTION_THRESHOLD) {
        return true;
      }
    }
  }
  return false;
}
