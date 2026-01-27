export type OsmElementType = 'node' | 'way' | 'relation';

export interface Coord {
  lat: number;
  lng: number;
}

export interface Bbox {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface RawOsmNode {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

export interface RawOsmWay {
  type: 'way';
  id: number;
  center?: { lat: number; lon: number };
  geometry?: Array<{ lat: number; lon: number }>;
  tags?: Record<string, string>;
}

export interface RawOsmElement {
  type: OsmElementType;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: Array<{ lat: number; lon: number }>;
  tags?: Record<string, string>;
}

export interface NormalizedElement {
  id: number;
  osmType: OsmElementType;
  tags: Record<string, string>;
  coord?: Coord;
  center?: Coord;
  geometry?: Coord[];
}

export type SurfaceType = 'paved' | 'gravel' | 'dirt' | 'unknown';

export interface NormalizedRoad extends NormalizedElement {
  geometry: Coord[];
  name: string | null;
  ref: string | null;
  highway: string;
  surface: SurfaceType;
  tracktype: string | null;
}

export type PoiCategory = 'viewpoint' | 'peak' | 'water' | 'waterway' | 'parking';

export interface NormalizedPoi extends NormalizedElement {
  category: PoiCategory;
  name: string | null;
}

export interface OverpassResponse {
  elements: RawOsmElement[];
}
