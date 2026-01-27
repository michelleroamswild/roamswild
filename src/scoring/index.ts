/**
 * Best Hikes Today - Scoring Module
 *
 * Exports all scoring functionality for ranking hikes based on
 * weather, conditions, light, effort, and crowd factors.
 */

// Main scoring function
export { scoreHikesToday } from "./scoreHikesToday";

// Individual scoring functions (for testing or custom use)
export {
  scoreWeather,
  scoreConditions,
  scoreLight,
  scoreEffortMatch,
  scoreCrowd,
  calculatePenalties,
} from "./scoreHikesToday";

// Types
export type {
  Hike,
  WeatherNow,
  SunInfo,
  ScoreBreakdown,
  ScoredHike,
  ScoringContext,
  UserPreference,
  LatLon,
  EffortLevel,
  CrowdTolerance,
  VehicleType,
} from "./types";

// Helper utilities (for advanced use)
export {
  clamp01,
  clamp,
  lerp,
  inverseLerp,
  gaussianLike,
  smoothStep,
  remap,
  hoursBetween,
  hoursUntil,
  isWithinHoursOf,
  isGoldenHour,
  isBlueHour,
  haversineDistanceMiles,
  formatHoursMinutes,
  tempComfortScore,
  windComfortScore,
  precipProbScore,
  cloudCoverLightScore,
} from "./helpers";
