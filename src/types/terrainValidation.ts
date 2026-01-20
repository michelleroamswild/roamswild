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

// Multi-scale structure metrics
export interface StructureMetrics {
  // Local relief (elevation range)
  micro_relief_m: number;      // Relief within 30-60m radius
  macro_relief_m: number;      // Relief within 300-800m radius
  // Curvature metrics
  mean_curvature: number;
  max_curvature: number;
  curvature_variance: number;
  // Slope break metrics
  slope_break_score: number;   // Normalized 0-1
  max_slope_break: number;     // Degrees
  // Heterogeneity
  elevation_std: number;
  slope_std: number;
  heterogeneity_score: number; // Combined 0-1
  // Combined scores
  structure_score: number;     // Overall 0-1
  structure_class: string;     // "micro-dramatic", "macro-dramatic", "flat-lit"
  // Per-cell structure analysis (for debugging zone quality)
  structure_score_at_centroid?: number;  // Structure score at zone centroid
  max_structure_score_in_zone?: number;  // Highest per-cell structure score
  max_structure_location?: [number, number] | null;  // [lat, lon] of best cell
  distance_centroid_to_max_m?: number;  // Distance from centroid to max location
}

// Photographer-friendly explanations
export interface SubjectExplain {
  zone_type: string;       // e.g., "Warm light zone - faces the sun for golden glow"
  aspect_offset: string;   // e.g., "Facing almost directly into the sun"
  light_quality: string;   // e.g., "Strong grazing light (dramatic texture)"
  sun_altitude: string;    // e.g., "Very low sun (dramatic golden light)"
  best_time: string;       // e.g., "Just after sunrise"
  window_duration: string; // e.g., "Good window (comfortable shooting time)"
  face_direction: string;  // e.g., "Faces Southwest"
  slope: string;           // e.g., "Moderate slope (textured hillside)"
  area: string;            // e.g., "Large zone (explore for best angle)"
  summary: string;         // One-sentence summary
  structure?: string;      // e.g., "Micro-dramatic feature: 8.5m local relief"
}

// Subject surface properties
export interface SubjectProperties {
  elevation_m: number;
  slope_deg: number;
  aspect_deg: number;
  face_direction_deg: number;
  area_m2: number;
  normal: [number, number, number]; // [Nx, Ny, Nz]
  // Confidence scoring
  confidence?: number;
  score_breakdown?: Record<string, number>;
  // Scale classification
  distance_from_center_m?: number;
  classification?: string; // "foreground", "human-scale", "monument-scale"
  // Lighting zone classification
  lighting_zone_type?: string; // "glow-zone", "rim-zone", "shadow-zone"
  aspect_offset_deg?: number;  // Angular offset from sun direction
  subject_type?: string;       // "dramatic-feature" or "surface-moment"
  quality_tier?: string;       // "primary" or "subtle"
  // Photographer-friendly explanations
  explain?: SubjectExplain;
  // Zone sizing (for subdivision validation)
  effective_width_m?: number; // sqrt(area) - approximate linear extent
  // Directional preference based on event (sunset favors W, sunrise favors E)
  directional_preference?: number; // 0-1 boost based on facing direction
  cardinal_direction?: string; // e.g., "W", "NW", "SW", "E", "NE", etc.
  // Structure metrics - distinguishes dramatic features from flat-lit terrain
  structure?: StructureMetrics;
  structure_class?: string; // "micro-dramatic", "macro-dramatic", "flat-lit"
  is_dramatic?: boolean;    // False for flat-lit terrain (not recommended)
  // Subject location snapping - indicates if centroid was moved to max structure
  snapped_to_max_structure?: boolean;
}

// Validation checks for a subject
export interface SubjectValidation {
  normal_unit_length: number;
  aspect_normal_match_deg: number;
  glow_in_range: boolean;
  sun_visible_at_peak: boolean;
}

// Candidate search info for debugging
export interface CandidateSearch {
  candidates_checked: number;
  selected_at_distance_m: number;
  rejection_summary: Record<string, number>;
  sample_rejected?: Array<{
    lat: number;
    lon: number;
    distance_m: number;
    reason: string;
    slope_deg?: number;
  }>;
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
  candidate_search?: CandidateSearch;
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
  // Distance constraints (based on subject slope and area)
  min_valid_distance_m?: number;
  max_valid_distance_m?: number;
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

// Structure debug info
export interface StructureDebug {
  enabled: boolean;
  computed_cells: number;
  attached_to_subjects: number;
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
  dem_resolution_m?: number;
  dem_vertical_accuracy_m?: number;
  dem_citation?: string;
  structure_debug?: StructureDebug;
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
