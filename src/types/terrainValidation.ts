/**
 * Types for Terrain Photo Moment Validation System
 *
 * These types define the data structures for the visual debugging
 * and validation interface for the photo-moment engine.
 */

// Sun position at a point in time
export interface SunPosition {
  time_iso: string;
  minutes_from_start: number;
  azimuth_deg: number;
  altitude_deg: number;
  vector: [number, number, number]; // [Sx, Sy, Sz]
}

// Incidence value at a point in time
export interface IncidencePoint {
  minutes: number;
  incidence: number;
  glow_score: number;
}

// Glow window details
export interface GlowWindow {
  start_minutes: number;
  end_minutes: number;
  peak_minutes: number;
  duration_minutes: number;
  peak_incidence: number;
  peak_glow_score: number;
}

// Shadow check sample
export interface ShadowSample {
  distance_m: number;
  ray_z: number;
  terrain_z: number;
  blocked: boolean;
}

// Shadow check result
export interface ShadowCheck {
  checked_at_minutes: number;
  sun_azimuth_deg: number;
  sun_altitude_deg: number;
  samples: ShadowSample[];
  sun_visible: boolean;
}

// Subject surface properties
export interface SubjectProperties {
  elevation_m: number;
  slope_deg: number;
  aspect_deg: number;
  face_direction_deg: number;
  area_m2: number;
  normal: [number, number, number]; // [Nx, Ny, Nz]
}

// Validation checks for a subject
export interface SubjectValidation {
  normal_unit_length: number;
  aspect_normal_match_deg: number;
  glow_in_range: boolean;
  sun_visible_at_peak: boolean;
}

// A detected subject surface
export interface Subject {
  subject_id: number;
  centroid: {
    lat: number;
    lon: number;
  };
  polygon: [number, number][]; // Array of [lat, lon]
  properties: SubjectProperties;
  incidence_series: IncidencePoint[];
  glow_window: GlowWindow | null;
  shadow_check: ShadowCheck;
  validation: SubjectValidation;
}

// Line of sight sample
export interface LOSSample {
  t: number; // 0-1 along ray
  ray_z: number;
  terrain_z: number;
  blocked: boolean;
}

// Line of sight result
export interface LineOfSight {
  clear: boolean;
  eye_height_m: number;
  target_height_m: number;
  samples: LOSSample[];
}

// Rejected standing candidate
export interface RejectedCandidate {
  distance_m: number;
  lat: number;
  lon: number;
  reason: 'slope_too_steep' | 'no_line_of_sight' | 'out_of_bounds';
  slope_deg?: number;
}

// Candidate search details
export interface CandidateSearch {
  candidates_checked: number;
  rejected: RejectedCandidate[];
  selected_at_distance_m: number;
}

// Standing location properties
export interface StandingProperties {
  elevation_m: number;
  slope_deg: number;
  distance_to_subject_m: number;
  camera_bearing_deg: number;
  elevation_diff_m: number;
}

// A computed standing location
export interface StandingLocation {
  standing_id: number;
  subject_id: number;
  location: {
    lat: number;
    lon: number;
  };
  properties: StandingProperties;
  line_of_sight: LineOfSight;
  candidate_search: CandidateSearch;
  nav_link?: string; // Google Maps navigation link
}

// Debug layer definition
export interface DebugLayer {
  type: 'raster' | 'geojson';
  url?: string;
  features?: any[];
}

// Analysis metadata
export interface AnalysisMeta {
  request_id: string;
  computed_at: string;
  dem_source: string;
  dem_bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  cell_size_m: number;
  center_lat: number;
  center_lon: number;
}

// Full analysis result
export interface TerrainAnalysisResult {
  meta: AnalysisMeta;
  sun_track: SunPosition[];
  subjects: Subject[];
  standing_locations: StandingLocation[];
  debug_layers: {
    dem_hillshade?: DebugLayer;
    normal_field?: DebugLayer;
  };
}

// Analysis request
export interface AnalyzeRequest {
  lat: number;
  lon: number;
  date: string;
  event: 'sunrise' | 'sunset';
  radius_km: number;
}

// Layer visibility state
export interface LayerVisibility {
  demShade: boolean;
  subjects: boolean;
  standing: boolean;
  sunVector: boolean;
  cameraVector: boolean;
  normals: boolean;
  viewshedRays: boolean;
  rejectedCandidates: boolean;
}

// Validation status
export type ValidationStatus = 'pass' | 'warn' | 'fail';

// Validation check result
export interface ValidationCheck {
  label: string;
  status: ValidationStatus;
  value: string | number;
  expected?: string;
}
