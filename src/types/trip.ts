import { Coordinates, StopType } from './maps';

export interface GeoBounds {
  ne: Coordinates;
  sw: Coordinates;
}

export interface DestinationActivity {
  id: string;
  name: string;
  placeId?: string;
  coordinates?: Coordinates;
  type?: ActivityType;
  notes?: string;
  source: 'user' | 'ai-suggestion';
}

export interface TripDestination {
  id: string;
  placeId: string;
  name: string;
  address: string;
  coordinates: Coordinates;
  daysAtDestination?: number; // Optional user-specified days at this destination
  // Region support: when true, this destination represents an area (e.g.
  // "Oregon Coast") rather than a single point. The generator should expand
  // it into specific stops within `bounds`.
  isRegion?: boolean;
  bounds?: GeoBounds;
  // Activity sourcing for this destination. When `aiActivities` is true (the
  // default), the AI fills in highlights/attractions. When false, only the
  // user-picked entries in `activities` are used.
  aiActivities?: boolean;
  activities?: DestinationActivity[];
  // When true, extra days at this destination get a "town time" activity stop
  // (walk the town, food, shops). Off by default — the destination is just an
  // anchor and extra-day timelines stay activity + camp.
  exploreTown?: boolean;
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
  bookingUrl?: string; // URL to book this campsite (for RIDB sites)
  isReservable?: boolean; // Whether this campsite can be reserved online
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
export type LodgingType = 'dispersed' | 'campground' | 'cabin' | 'hotel' | 'mixed' | 'other';
export type ActivityType =
  | 'hiking'
  | 'biking'
  | 'climbing'
  | 'fishing'
  | 'photography'
  | 'wildlife'
  | 'offroading'
  | 'water'
  | 'scenic_driving';
// Self-rated difficulty level. Maps to UGRC difficulty (Easy/Moderate/Difficult)
// and OSM sac_scale: easy=T1, moderate=T2-T3, hard=T4+.
export type DifficultyLevel = 'easy' | 'moderate' | 'hard';
export type PacePreference = 'relaxed' | 'moderate' | 'packed';
// Direct = drive straight, minimal detours. Scenic = find cool stops along
// the way. Surfaced when total drive is long enough to matter.
export type TravelStyle = 'direct' | 'scenic';

export interface DestinationLodging {
  destinationId: string;
  lodgingType: LodgingType;
  customLocation?: {
    name: string;
    coordinates: Coordinates;
    placeId?: string;
  };
}

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
  useSameLodgingType?: boolean; // true = same lodging at all destinations, false = per-destination
  destinationLodging?: DestinationLodging[]; // Per-destination lodging when useSameLodgingType is false
  activities?: ActivityType[];
  offroadVehicleType?: '4wd-high' | 'awd-medium'; // Vehicle capability for offroading
  // Per-activity difficulty self-rating, used by the POI scorer to gate
  // candidates by user fit. Only set when the corresponding activity is
  // selected. Default = 'moderate'.
  hikingDifficulty?: DifficultyLevel;
  bikingDifficulty?: DifficultyLevel;
  // Hiking preferences
  hikingPreference?: 'none' | 'surprise' | 'daily'; // none = no hikes, surprise = AI picks best days, daily = hike every day
  // Advanced options
  startDate?: string; // ISO date string (YYYY-MM-DD)
  endDate?: string; // ISO date string (YYYY-MM-DD)
  departureTime?: string; // Time to leave starting location (HH:MM)
  dailyStartTime?: string; // Time to start activities each day (HH:MM)
  returnToCampTime?: string; // Time to be back at camp each day (HH:MM)
  pacePreference?: PacePreference;
  travelStyle?: TravelStyle;
  maxDrivingHoursPerDay?: number; // Maximum hours of driving per day
  travelOnlyFinalDay?: boolean; // No activities on final day (travel only)
  completedAt?: string; // ISO date string when trip was marked complete
}

export interface CachedPhotoHotspot {
  id: string;
  name: string;
  lat: number;
  lng: number;
  photoCount: number;
  samplePhotoUrl?: string;
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
  // Cached photo hotspots
  cachedPhotoHotspots?: CachedPhotoHotspot[];
  photoHotspotsHash?: string; // Hash of search points to detect when to refetch
  // Set when the wizard reordered destinations to avoid backtracking. Stored
  // for the UI to surface a "we reordered your stops" notice. Names only —
  // we don't need to round-trip ids/coords for the notice.
  reorderedDestinations?: {
    original: string[];
    optimized: string[];
  };
}
