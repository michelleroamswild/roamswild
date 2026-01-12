import { Coordinates, StopType } from './maps';

export interface TripDestination {
  id: string;
  placeId: string;
  name: string;
  address: string;
  coordinates: Coordinates;
  daysAtDestination?: number; // Optional user-specified days at this destination
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
  drivingTime?: string; // Driving time to this stop (e.g., "15 min each way")
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
export type PacePreference = 'relaxed' | 'moderate' | 'packed';

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
  // Hiking preferences
  hikingPreference?: 'none' | 'surprise' | 'daily'; // none = no hikes, surprise = AI picks best days, daily = hike every day
  // Advanced options
  startDate?: string; // ISO date string (YYYY-MM-DD)
  endDate?: string; // ISO date string (YYYY-MM-DD)
  departureTime?: string; // Time to leave starting location (HH:MM)
  dailyStartTime?: string; // Time to start activities each day (HH:MM)
  returnToCampTime?: string; // Time to be back at camp each day (HH:MM)
  pacePreference?: PacePreference;
  maxDrivingHoursPerDay?: number; // Maximum hours of driving per day
  travelOnlyFinalDay?: boolean; // No activities on final day (travel only)
}

export interface GeneratedTrip {
  id: string;
  config: TripConfig;
  days: TripDay[];
  totalDistance: string;
  totalDrivingTime: string;
  createdAt: string;
  ownerId?: string; // User ID of the trip owner (for sharing)
  collaboratorCount?: number; // Number of people this trip is shared with
}
