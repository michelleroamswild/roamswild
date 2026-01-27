import { Coord, NormalizedElement, NormalizedRoad, NormalizedPoi, PoiCategory } from './types';
import { classifySurface } from './roadFilter';

const HIGHWAY_CANDIDATES = ['secondary', 'tertiary', 'unclassified', 'track'];

export function isRoadWay(el: NormalizedElement): el is NormalizedRoad {
  if (el.osmType !== 'way') return false;
  if (!el.geometry || el.geometry.length < 2) return false;
  const highway = el.tags.highway;
  if (!highway || !HIGHWAY_CANDIDATES.includes(highway)) return false;
  return true;
}

export function extractRoadWays(elements: NormalizedElement[]): NormalizedRoad[] {
  return elements.filter(isRoadWay).map(el => ({
    ...el,
    geometry: el.geometry!,
    name: el.tags.name ?? null,
    ref: el.tags.ref ?? null,
    highway: el.tags.highway,
    surface: classifySurface(el.tags.surface) ?? 'unknown',
    tracktype: el.tags.tracktype ?? null,
  }));
}

const POI_MATCHERS: Array<{ match: (tags: Record<string, string>) => boolean; category: PoiCategory }> = [
  { match: t => t.tourism === 'viewpoint', category: 'viewpoint' },
  { match: t => t.natural === 'peak', category: 'peak' },
  { match: t => t.natural === 'spring' || t.natural === 'hot_spring' || t.amenity === 'drinking_water', category: 'water' },
  { match: t => t.waterway === 'waterfall', category: 'waterway' },
  { match: t => t.amenity === 'parking' && t.access !== 'private', category: 'parking' },
];

export function extractPois(elements: NormalizedElement[]): NormalizedPoi[] {
  const pois: NormalizedPoi[] = [];

  for (const el of elements) {
    if (!el.coord && !el.center) continue;

    for (const { match, category } of POI_MATCHERS) {
      if (match(el.tags)) {
        pois.push({
          ...el,
          category,
          name: el.tags.name ?? null,
        });
        break;
      }
    }
  }

  return pois;
}

export function haversineDistance(a: Coord, b: Coord): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;

  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function polylineLength(coords: Coord[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineDistance(coords[i - 1], coords[i]);
  }
  return total;
}

export function filterPoisWithinRadius(pois: NormalizedPoi[], center: Coord, radiusMiles: number): NormalizedPoi[] {
  return pois.filter(poi => {
    const coord = poi.center ?? poi.coord;
    if (!coord) return false;
    return haversineDistance(center, coord) <= radiusMiles;
  });
}
