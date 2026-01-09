export type StopType = 'destination' | 'gas' | 'water' | 'food' | 'camp' | 'viewpoint' | 'rest' | 'cell';

export interface TripStop {
  id: string;
  tripId: string;
  placeId?: string;
  name: string;
  address?: string;
  lat: number;
  lng: number;
  stopType: StopType;
  duration?: string;
  position: number;
}

export interface Trip {
  id: string;
  name: string;
  stops: TripStop[];
  createdAt: string;
  updatedAt: string;
}

// Database row types (snake_case from Supabase)
export interface TripRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface TripStopRow {
  id: string;
  trip_id: string;
  place_id: string | null;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  stop_type: string;
  duration: string | null;
  position: number;
  created_at: string;
}

// Helper to convert database row to app type
export function tripStopFromRow(row: TripStopRow): TripStop {
  return {
    id: row.id,
    tripId: row.trip_id,
    placeId: row.place_id || undefined,
    name: row.name,
    address: row.address || undefined,
    lat: row.lat,
    lng: row.lng,
    stopType: row.stop_type as StopType,
    duration: row.duration || undefined,
    position: row.position,
  };
}

export function tripFromRow(row: TripRow, stops: TripStopRow[]): Trip {
  return {
    id: row.id,
    name: row.name,
    stops: stops.map(tripStopFromRow).sort((a, b) => a.position - b.position),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
