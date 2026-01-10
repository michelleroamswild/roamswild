import { Coordinates, StopType } from './maps';

export interface TripDestination {
  id: string;
  placeId: string;
  name: string;
  address: string;
  coordinates: Coordinates;
}

export interface TripStop {
  id: string;
  name: string;
  type: StopType;
  coordinates: Coordinates;
  duration: string;
  distance: string;
  description: string;
  elevation?: string;
  day: number;
  placeId?: string;
  rating?: number;
  reviewCount?: number;
  note?: string;
}

export interface TripDay {
  day: number;
  date?: string;
  stops: TripStop[];
  campsite?: TripStop;
  hike?: TripStop;
  drivingDistance: string;
  drivingTime: string;
}

export type VehicleType = 'sedan' | 'suv' | '4wd' | 'rv';
export type LodgingType = 'dispersed' | 'campground' | 'cabin' | 'hotel' | 'mixed';
export type ActivityType = 'hiking' | 'biking' | 'climbing' | 'fishing' | 'photography' | 'wildlife';

export interface TripConfig {
  name: string;
  duration: number; // days
  startLocation?: TripDestination;
  destinations: TripDestination[];
  returnToStart: boolean;
  // Location-based trip mode (explore around a single location)
  baseLocation?: TripDestination;
  activitiesPerDay?: number;
  sameCampsite?: boolean; // Stay at the same campsite for entire trip
  // Vehicle and preferences
  vehicleType?: VehicleType;
  lodgingPreference?: LodgingType;
  activities?: ActivityType[];
}

export interface GeneratedTrip {
  id: string;
  config: TripConfig;
  days: TripDay[];
  totalDistance: string;
  totalDrivingTime: string;
  createdAt: string;
}
