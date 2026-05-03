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
 * Equirectangular approximation: distance in meters from a point to a
 * line segment defined in lat/lng. Accurate to <1% for segments under
 * ~100m at continental-US latitudes — plenty for the 12m thresholds
 * used by the false-dead-end / intersection detectors.
 */
export function pointToSegmentMeters(
  pt: { lat: number; lng: number },
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const cosLat = Math.cos(((pt.lat + a.lat + b.lat) / 3) * Math.PI / 180);
  const ax = a.lng * 111320 * cosLat;
  const ay = a.lat * 110540;
  const bx = b.lng * 111320 * cosLat;
  const by = b.lat * 110540;
  const px = pt.lng * 111320 * cosLat;
  const py = pt.lat * 110540;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Check if a dead-end spot is actually mid-segment of another road
 * (false dead-end). Walks every segment of every road; flags when the
 * spot is within INTERSECTION_METERS of any segment, EXCEPT when the
 * spot is at one of that road's endpoints (which means it's a real
 * track-to-track junction — keep).
 *
 * Used by DispersedExplorer's client-side filter and the auto-pan save
 * pipeline. The previous implementation only checked vertices (not
 * segments) and missed T-intersections where the side-road endpoint
 * landed between two vertices of the main road.
 */
export function isFalseDeadEnd(
  spot: { lat: number; lng: number; type: string },
  roads: { geometry?: { type: string; coordinates: [number, number][] } }[]
): boolean {
  if (spot.type !== 'dead-end') return false;
  const spotPt = { lat: spot.lat, lng: spot.lng };

  const INTERSECTION_METERS = 12; // mid-segment hit → false dead-end
  const ENDPOINT_METERS = 25;     // spot is AT a road's endpoint → real junction, skip

  for (const road of roads) {
    const coords = road.geometry?.coordinates;
    if (!coords || coords.length < 2) continue;

    const start = { lng: coords[0][0], lat: coords[0][1] };
    const end = { lng: coords[coords.length - 1][0], lat: coords[coords.length - 1][1] };

    // If the spot is at this road's start or end, it's a track-to-track
    // junction (the dead-end road's own endpoint). Don't penalise.
    if (pointToSegmentMeters(spotPt, start, start) < ENDPOINT_METERS) continue;
    if (pointToSegmentMeters(spotPt, end, end) < ENDPOINT_METERS) continue;

    // Walk every segment. If the spot lies within INTERSECTION_METERS of
    // any segment, the dead-end is on this road's interior — flag it.
    for (let i = 0; i < coords.length - 1; i++) {
      const a = { lng: coords[i][0], lat: coords[i][1] };
      const b = { lng: coords[i + 1][0], lat: coords[i + 1][1] };
      if (pointToSegmentMeters(spotPt, a, b) < INTERSECTION_METERS) {
        return true;
      }
    }
  }
  return false;
}
