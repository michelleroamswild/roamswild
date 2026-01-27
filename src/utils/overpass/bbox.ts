import { Bbox, Coord } from './types';

export function clampBbox(
  regionBbox: Bbox,
  regionCenter: Coord,
  maxDegreesLat: number = 0.6,
  maxDegreesLon: number = 0.8
): Bbox {
  const halfLat = maxDegreesLat / 2;
  const halfLon = maxDegreesLon / 2;

  return {
    north: Math.min(regionBbox.north, regionCenter.lat + halfLat),
    south: Math.max(regionBbox.south, regionCenter.lat - halfLat),
    east: Math.min(regionBbox.east, regionCenter.lng + halfLon),
    west: Math.max(regionBbox.west, regionCenter.lng - halfLon),
  };
}

export function splitBboxIntoTiles(bbox: Bbox, overlap: number = 0.01): Bbox[] {
  const midLat = (bbox.north + bbox.south) / 2;
  const midLng = (bbox.east + bbox.west) / 2;

  return [
    { north: bbox.north + overlap, south: midLat - overlap, east: midLng + overlap, west: bbox.west - overlap },
    { north: bbox.north + overlap, south: midLat - overlap, east: bbox.east + overlap, west: midLng - overlap },
    { north: midLat + overlap, south: bbox.south - overlap, east: midLng + overlap, west: bbox.west - overlap },
    { north: midLat + overlap, south: bbox.south - overlap, east: bbox.east + overlap, west: midLng - overlap },
  ];
}

export type BboxStrategy = 'clamped' | 'tiled' | 'fallback';

export interface BboxQueryResult {
  bbox: Bbox | Bbox[];
  roadCount: number;
  poiCount: number;
  strategy: BboxStrategy;
}

export async function executeBboxStrategy(
  regionBbox: Bbox,
  regionCenter: Coord,
  queryFn: (bbox: Bbox) => Promise<{ roadCount: number; poiCount: number; timeout?: boolean }>
): Promise<BboxQueryResult> {
  // Try clamped bbox first
  const clamped = clampBbox(regionBbox, regionCenter);
  const clampedResult = await queryFn(clamped);

  if (!clampedResult.timeout && clampedResult.roadCount >= 5) {
    return { bbox: clamped, ...clampedResult, strategy: 'clamped' };
  }

  // Try tiled approach
  const tiles = splitBboxIntoTiles(clamped);
  let totalRoads = 0;
  let totalPois = 0;

  for (const tile of tiles) {
    const tileResult = await queryFn(tile);
    if (!tileResult.timeout) {
      totalRoads += tileResult.roadCount;
      totalPois += tileResult.poiCount;
    }
  }

  if (totalRoads >= 5) {
    return { bbox: tiles, roadCount: totalRoads, poiCount: totalPois, strategy: 'tiled' };
  }

  // Fallback: use region center as single point
  return { bbox: clamped, roadCount: totalRoads, poiCount: totalPois, strategy: 'fallback' };
}
