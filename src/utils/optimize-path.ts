// Path optimization for the trip wizard. Given a sequence of destinations
// the user picked (possibly out of order) and the trip's anchors (start
// location, optional fixed end), pick the destination ordering that
// minimizes total leg distance — so a Crater Lake → Cannon Beach → Bend
// entry doesn't zig-zag the user across the state.

interface PathPoint {
  lat: number;
  lng: number;
}

// Brute-force is fine up to ~8 destinations (40,320 perms). Beyond that the
// permutation count blows up; trips with more stops keep the user's order
// and a smarter heuristic can be added if it ever becomes a real case.
const BRUTE_FORCE_CAP = 8;

const haversineKm = (a: PathPoint, b: PathPoint): number => {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const permutations = <T,>(arr: T[]): T[][] => {
  if (arr.length <= 1) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const perm of permutations(rest)) {
      out.push([arr[i], ...perm]);
    }
  }
  return out;
};

export interface OptimizePathOptions<T extends PathPoint> {
  start: PathPoint;
  destinations: T[];
  // Fixed final point (e.g. user-set end location, or the start location for
  // round trips). Omit for open-ended trips that simply end at the last
  // destination.
  end?: PathPoint;
}

export interface OptimizePathResult<T> {
  ordered: T[];
  // True iff the optimized order differs from the input order.
  reordered: boolean;
}

export function optimizePath<T extends PathPoint>({
  start,
  destinations,
  end,
}: OptimizePathOptions<T>): OptimizePathResult<T> {
  if (destinations.length <= 1 || destinations.length > BRUTE_FORCE_CAP) {
    return { ordered: destinations, reordered: false };
  }

  const totalDistance = (order: T[]): number => {
    let dist = haversineKm(start, order[0]);
    for (let i = 1; i < order.length; i++) {
      dist += haversineKm(order[i - 1], order[i]);
    }
    if (end) dist += haversineKm(order[order.length - 1], end);
    return dist;
  };

  let bestOrder = destinations;
  let bestDistance = totalDistance(destinations);

  for (const perm of permutations(destinations)) {
    const dist = totalDistance(perm);
    if (dist < bestDistance) {
      bestDistance = dist;
      bestOrder = perm;
    }
  }

  const reordered = bestOrder.some((d, i) => d !== destinations[i]);
  return { ordered: bestOrder, reordered };
}
