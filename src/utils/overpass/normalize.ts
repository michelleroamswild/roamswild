import { Coord, NormalizedElement, RawOsmElement, OverpassResponse } from './types';

export function getElementCoord(el: NormalizedElement): Coord | undefined {
  return el.center ?? el.coord;
}

export function normalizeElement(raw: RawOsmElement): NormalizedElement | null {
  if (!raw || typeof raw.id !== 'number') return null;

  const tags = raw.tags ?? {};
  let coord: Coord | undefined;
  let center: Coord | undefined;
  let geometry: Coord[] | undefined;

  if (raw.type === 'node' && typeof raw.lat === 'number' && typeof raw.lon === 'number') {
    coord = { lat: raw.lat, lng: raw.lon };
  }

  if (raw.center && typeof raw.center.lat === 'number' && typeof raw.center.lon === 'number') {
    center = { lat: raw.center.lat, lng: raw.center.lon };
  }

  if (Array.isArray(raw.geometry) && raw.geometry.length > 0) {
    geometry = raw.geometry
      .filter(p => typeof p.lat === 'number' && typeof p.lon === 'number')
      .map(p => ({ lat: p.lat, lng: p.lon }));
    if (geometry.length === 0) geometry = undefined;
  }

  return { id: raw.id, osmType: raw.type, tags, coord, center, geometry };
}

export function normalizeResponse(response: OverpassResponse): NormalizedElement[] {
  if (!response?.elements || !Array.isArray(response.elements)) return [];

  const seen = new Set<string>();
  const results: NormalizedElement[] = [];

  for (const raw of response.elements) {
    const key = `${raw.type}-${raw.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const normalized = normalizeElement(raw);
    if (normalized) results.push(normalized);
  }

  return results;
}
