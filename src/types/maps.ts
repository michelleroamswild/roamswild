export interface Coordinates {
  lat: number;
  lng: number;
}

export type StopType = 'hike' | 'gas' | 'camp' | 'viewpoint' | 'water' | 'food' | 'service' | 'cell';

export interface RouteStop {
  id: number;
  name: string;
  type: StopType;
  coordinates: Coordinates;
  duration: string;
  distance: string;
  description: string;
  elevation: string;
}

export interface PlaceResult {
  placeId: string;
  name: string;
  address: string;
  coordinates: Coordinates;
}
