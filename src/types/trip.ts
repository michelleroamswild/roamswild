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

export interface TripConfig {
  name: string;
  duration: number; // days
  startLocation: TripDestination;
  destinations: TripDestination[];
  returnToStart: boolean;
}

export interface GeneratedTrip {
  id: string;
  config: TripConfig;
  days: TripDay[];
  totalDistance: string;
  totalDrivingTime: string;
  createdAt: string;
}
