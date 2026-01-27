/**
 * Best Hikes Today - Type Definitions
 *
 * Data models for hike scoring system.
 */

export type LatLon = { lat: number; lon: number };

export interface Hike {
  id: string;
  name: string;
  location: LatLon;
  distance_miles: number;
  elevation_gain_ft: number;
  duration_minutes_est?: number;

  // Accessibility / road
  access_road_type?: "paved" | "gravel" | "high_clearance" | "unknown";
  trailhead_parking_confidence?: "low" | "medium" | "high";

  // Experience hints (optional)
  popularity?: number;        // 0..1 normalized (1 = very popular)
  shade_fraction?: number;    // 0..1 (1 = mostly shaded)
  water_presence?: boolean;   // near lakes/rivers
  viewpoint_score?: number;   // 0..1 scenic likelihood
  aspect?: "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW" | "flat" | "unknown";
  seasonal_closure_risk?: "low" | "medium" | "high";
}

export interface WeatherNow {
  temp_f: number;
  wind_mph: number;
  precip_prob: number;          // 0..1
  precip_intensity?: number;    // mm/hr or similar normalized
  cloud_cover: number;          // 0..1
  visibility_miles?: number;
  alerts?: string[];            // e.g., ["wind advisory", "flash flood"]
  air_quality_index?: number;
}

export interface SunInfo {
  sunrise: string;              // ISO
  sunset: string;               // ISO
  solar_azimuth_deg: number;    // current or at target time
  solar_elevation_deg: number;  // current or at target time
}

export interface ScoreBreakdown {
  weather: number;      // 0..1
  conditions: number;   // 0..1 (mud/snow/closure/access proxies)
  light: number;        // 0..1
  effort_match: number; // 0..1
  crowd: number;        // 0..1 (1 = not crowded)
  penalties: number;    // 0..1 multiplier
}

export interface ScoredHike {
  hike: Hike;
  score_0_100: number;
  breakdown: ScoreBreakdown;
  reasons_short: string[];  // 2-4 bullets for UI
  warnings?: string[];      // safety/access warnings
}

export type EffortLevel = "easy" | "moderate" | "hard";
export type CrowdTolerance = "avoid" | "neutral" | "dont_care";
export type VehicleType = "2wd" | "awd" | "4x4";

export interface UserPreference {
  max_distance_miles?: number;
  max_gain_ft?: number;
  effort?: EffortLevel;
  crowd_tolerance?: CrowdTolerance;
  vehicle?: VehicleType;
}

export interface ScoringContext {
  user: LatLon;
  nowIso: string;
  weatherByHikeId: Record<string, WeatherNow>;
  sunByHikeId: Record<string, SunInfo>;
  userPreference?: UserPreference;
}

// Dangerous weather alert keywords
export const DANGEROUS_ALERTS = [
  "flash flood",
  "flood warning",
  "thunderstorm",
  "tornado",
  "extreme wind",
  "hurricane",
  "blizzard",
  "ice storm",
  "extreme heat",
  "extreme cold",
  "avalanche",
  "wildfire",
  "red flag",
] as const;
