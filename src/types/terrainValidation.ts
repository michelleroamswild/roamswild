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
  // Geometry type: planar (walls, slabs) vs volumetric (boulders, knobs)
  // Volumetric subjects bypass face-direction filters, rely on camera-sun geometry
  geometry_type?: 'planar' | 'volumetric';
  face_direction_variance?: number; // Circular variance of face directions (degrees)
  volumetric_reason?: string; // e.g., "curvature:1.5" or "face_variance:72.3°"
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
  polygon: [number, number][]; // Region-grown subject polygon (bold layer)
  properties: SubjectProperties;
  incidence_series: IncidencePoint[];
  glow_window: GlowWindow | null;
  shadow_check: ShadowCheck;
  validation: SubjectValidation;
  candidate_search?: CandidateSearch;
  // ExploreArea polygon - original zone before region-growing (faint layer)
  explore_polygon?: [number, number][];
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

// View explanation strings
export interface ViewExplanations {
  short: string;  // <= 80 chars summary
  long: string;   // 1-2 sentences with details
}

// Visual Anchor Score (VAS) - salient features in the view cone
// Detects ridgelines, spires, mesas that provide focal interest
export interface VisualAnchor {
  // Overall anchor score 0-1
  anchor_score: number;
  // Anchor type classification
  anchor_type: 'RIDGELINE' | 'SPIRES_KNOBS' | 'LAYERED_SKYLINE' | 'NONE';
  // Location of the strongest anchor
  anchor_distance_m: number;      // Distance to the anchor feature
  anchor_bearing_deg: number;     // Bearing to the anchor within sector
  // Component scores that determined the type
  curvature_salience: number;     // Salience from curvature (knobs/spires)
  slope_break_salience: number;   // Salience from slope breaks (ridgelines)
  relief_salience: number;        // Salience from local relief
  // Human-readable explanations
  explanation_short: string;   // e.g., "Strong skyline anchor ~8km at 252°"
  explanation_long: string;    // Full explanation with anchor type
  // Debug fields (populated when debug=True)
  anchor_search_mode?: 'HORIZON_ONLY' | 'MULTI_DEPTH';  // Search mode used
  anchor_candidates_sampled?: number;  // Total candidates sampled (azimuths * distances)
  best_candidate_distance_m?: number;  // Same as anchor_distance_m (for debug clarity)
}

// Light-at-Anchor (LAA) - whether the anchor feature is lit
// Estimates if the visual anchor is receiving direct sunlight
export interface AnchorLight {
  // Sun incidence at anchor surface (dot product of normal and sun vector)
  // Range: -1 (facing away) to +1 (facing directly into sun)
  anchor_sun_incidence: number;
  // Light type classification based on geometry
  anchor_light_type: 'FRONT_LIT' | 'SIDE_LIT' | 'BACK_LIT' | 'RIM_LIT';
  // Shadow state at the anchor point
  anchor_shadowed: boolean;
  // Overall anchor light score 0-1
  anchor_light_score: number;
  // Anchor surface orientation (for debugging)
  anchor_slope_deg: number;
  anchor_aspect_deg: number;
  // Human-readable explanations
  explanation_short: string;   // e.g., "Anchor is side-lit (incidence 0.22)"
  explanation_long: string;    // Full explanation with shadow status
}

// Glow window time-series sample (debug only)
export interface DistantGlowWindowSample {
  minutes: number;                // Minutes from event (sunrise/sunset)
  final_score: number;            // distant_glow_final_score at this time
  anchor_light_score: number;     // anchor_light_score at this time
  anchor_shadowed: boolean;       // Whether anchor is shadowed
  sun_altitude_deg: number;       // Sun altitude
  sun_azimuth_deg: number;        // Sun azimuth
}

// Glow window time-series metrics for DISTANT_ATMOSPHERIC mode
// Evaluates distant_glow_final_score over time to find optimal shooting window
export interface DistantGlowWindow {
  // Window bounds (minutes from event)
  start_minutes: number;              // Start of good window
  end_minutes: number;                // End of good window
  peak_minutes: number;               // Time of peak score
  duration_minutes: number;           // Length of good window
  // Peak metrics
  peak_score: number;                 // Maximum distant_glow_final_score
  peak_anchor_light_score: number;    // anchor_light_score at peak time
  // Turning point detection
  sun_clears_ridge_minutes?: number;  // First minute anchor becomes unshaded
  // Debug: full time-series (only when debug=True)
  score_series?: DistantGlowWindowSample[];
}

// Distant Atmospheric Glow Score (DAGS) - viewpoint-first distant glow
// Scores viewpoints for capturing distant layered atmospheric glow
// (e.g., sunrise over distant canyons from a rim overlook)
export interface DistantGlowScore {
  // Overall score 0-1
  distant_glow_score: number;
  // Glow type classification
  distant_glow_type: 'DISTANT_ATMOSPHERIC';
  // Component scores (all 0-1)
  depth_norm: number;       // Normalized depth (p90/30km)
  open_norm: number;        // Sector openness fraction
  rim_norm: number;         // Rim strength (TPI-based)
  sun_low_norm: number;     // Higher when sun is low (golden light)
  sun_clear_norm: number;   // Higher when sun clears horizon
  dir_norm: number;         // Directionality/contra-jour score
  // Directionality details
  view_bearing_deg: number;       // Best viewing direction
  sun_bearing_deg: number;        // Sun azimuth at event
  bearing_delta_deg: number;      // Angular difference
  directionality_type: 'side_lit' | 'contra_jour' | 'neutral';
  // Visual Anchor Score (VAS) - salient features in the view
  visual_anchor?: VisualAnchor;
  // Combined DAGS + VAS score: dags * (0.7 + 0.3 * anchor_score)
  distant_glow_with_anchor_score: number;
  // Light-at-Anchor (LAA) - is the anchor feature lit?
  anchor_light?: AnchorLight;
  // Final combined score: combined * (0.75 + 0.25 * anchor_light_score)
  distant_glow_final_score: number;
  // Time-series glow window (computed when distant_glow_timeseries=True)
  glow_window?: DistantGlowWindow;
  // Human-readable explanations
  explanation_short: string;   // e.g., "Distant layered glow potential (p90 18km)"
  explanation_long: string;    // Full explanation with directionality
}

// Sun alignment analysis
export interface SunAlignment {
  alignment_type: 'backlit' | 'sidelit' | 'frontlit' | 'neutral';
  angle_to_best_deg: number;
  score: number;  // 0-1
}

// Horizon sample at a specific azimuth
export interface HorizonSample {
  azimuth_deg: number;
  elevation_angle_deg: number;
  depth_m: number;
}

// Overlook view analysis for standing locations
export interface OverlookView {
  open_sky_fraction: number;
  depth_p50_m: number;
  depth_p90_m: number;
  horizon_complexity: number;
  overlook_score: number;
  best_bearing_deg: number;
  fov_deg: number;
  // Sector openness in shooting direction (±45° from best_bearing)
  open_sky_sector_fraction?: number;
  // View category classification
  view_category?: 'EPIC_OVERLOOK' | 'DRAMATIC_ENCLOSED' | 'QUICK_SCENIC';
  view_cone?: [number, number][];  // Lat/lon polygon for map rendering
  explanations?: ViewExplanations;
  sun_alignment?: SunAlignment;
  // Distant Atmospheric Glow Score (DAGS) - viewpoint-first distant glow
  distant_glow?: DistantGlowScore;
  horizon_profile?: HorizonSample[];
}

// Standing location properties
export interface StandingProperties {
  elevation_m: number;
  slope_deg: number;
  distance_to_subject_m: number;
  camera_bearing_deg: number;
  elevation_diff_m: number;
  // Rim/overlook metrics (for cell-based overlook candidates)
  rim_strength?: number;  // 0-1 score from TPI
  tpi_large_m?: number;   // Large-scale TPI value
  // Distance constraints (based on subject slope and area)
  min_valid_distance_m?: number;
  max_valid_distance_m?: number;
  // Accessibility info (distance to OSM roads/trails)
  accessibility_status?: 'on-road' | 'near-road' | 'off-trail' | 'too-far' | 'too-steep' | 'unknown';
  distance_to_road_m?: number;
  nearest_road_type?: string; // OSM highway type (e.g., "track", "path")
  nearest_road_name?: string;
  // Elevation gain from access point
  uphill_gain_from_access_m?: number;
  downhill_gain_from_access_m?: number;
  // Landcover and adjusted approach values
  landcover_type?: string; // desert, shrub, forest, wet, unknown
  landcover_multiplier?: number; // Terrain difficulty multiplier
  adjusted_distance_m?: number; // distance * multiplier
  adjusted_uphill_m?: number; // uphill * multiplier
  adjusted_downhill_m?: number; // downhill * multiplier
  // Approach difficulty classification
  approach_difficulty?: 'easy' | 'moderate' | 'hard' | 'unknown';
  approach_profile?: 'casual' | 'moderate' | 'spicy';
}

// A computed standing location
export interface StandingLocation {
  standing_id: number;
  subject_id: number | null;  // null for rim_overlook standing locations
  location: {
    lat: number;
    lon: number;
  };
  properties: StandingProperties;
  line_of_sight: LineOfSight;
  candidate_search: CandidateSearch;
  nav_link?: string; // Google Maps navigation link
  view?: OverlookView; // Overlook/viewpoint analysis for rim candidates
  source?: 'subject' | 'rim_overlook'; // Source type for the standing location
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

// Sample rim candidate for debug visualization
export interface SampleRimCandidate {
  lat: number;
  lon: number;
  tpi_large_m: number;
  slope_deg: number;
}

// Sample local maxima for debug visualization
export interface SampleLocalMaxima {
  lat: number;
  lon: number;
  tpi_large_m: number;
  slope_deg: number;
  rim_strength: number;
  elevation_m: number;
}

// Sample view analyzed point for debug visualization
export interface SampleViewAnalyzed {
  lat: number;
  lon: number;
  overlook_score: number;
  depth_p90_m: number;
  open_sky_fraction: number;
  rim_strength: number;
}

// Rim overlook debug stats
export interface RimOverlookDebugStats {
  // Stage counts (funnel)
  grid_cells_total: number;
  rim_mask_cells: number;
  rim_local_maxima_cells: number;
  maxima_found_total: number;  // Total local maxima before cap
  maxima_kept: number;  // Local maxima kept after max_candidates cap
  maxima_cap_used: number;  // Dynamic cap that was applied
  rim_candidates_selected: number;
  view_analyzed_total: number;  // Total candidates that got view analysis
  results_pre_dedup: number;  // Results before spatial deduplication
  results_post_dedup: number;  // Results after spatial deduplication (final)
  // TPI distribution stats
  tpi_large_m_p50: number;
  tpi_large_m_p90: number;
  tpi_large_m_p95: number;
  // Slope distribution stats
  slope_deg_pct_under_20: number;
  slope_deg_pct_under_25: number;
  slope_deg_pct_under_30: number;
  // View analysis stats
  depth_p90_m_p50?: number;
  depth_p90_m_p90?: number;
  avg_open_sky_fraction?: number;
  avg_overlook_score?: number;
  // Drop reason breakdown
  rejected_slope: number;
  rejected_tpi: number;
  rejected_edge: number;  // Rejected by edge gating
  rejected_nms: number;
  rejected_maxima_cap: number;  // Rejected by maxima cap
  rejected_topk: number;
  rejected_after_view_dedup: number;  // Rejected by spatial deduplication
  // Edge gating stats
  rim_mask_cells_before_edge_gate: number;
  rim_mask_cells_after_edge_gate: number;
  edge_mode: 'SLOPE_BREAK' | 'STEEP_ADJACENCY' | 'BOTH' | 'NONE';
  steep_cells_count: number;
  near_steep_cells_count: number;
  // Auto-threshold info
  chosen_tpi_threshold_m?: number;
  chosen_slope_max_deg?: number;
  chosen_view_candidates_k?: number;
  auto_threshold_applied: boolean;
  // Access proximity stats
  access_bias_applied: string;
  pct_results_within_access_distance?: number;
  distance_to_access_p50_m?: number;
  distance_to_access_p90_m?: number;
  // Sample coordinates for debug visualization
  sample_rim_candidates?: SampleRimCandidate[];
  sample_local_maxima?: SampleLocalMaxima[];
  sample_view_analyzed?: SampleViewAnalyzed[];
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
  rim_overlook_debug?: RimOverlookDebugStats;
}

// =============================================================================
// Multi-Anchor System Types
// =============================================================================

// Structure metrics at an anchor point
export interface AnchorStructure {
  structure_score: number;
  micro_relief_m: number;
  max_curvature: number;
  max_slope_break: number;
  structure_class: string; // "micro-dramatic", "macro-dramatic", "flat-lit"
}

// A specific photographic subject within an explore area
export interface Anchor {
  anchor_id: number;
  location: { lat: number; lon: number };
  elevation_m: number;
  slope_deg: number;
  aspect_deg: number;
  face_direction_deg: number;
  structure: AnchorStructure;
  geometry_type: string; // "planar" or "volumetric"
  volumetric_reason?: string;
}

// Standing location properties (shared with StandingProperties)
export interface ShotStandingProperties {
  elevation_m: number;
  slope_deg: number;
  distance_to_subject_m: number;
  camera_bearing_deg: number;
  elevation_diff_m: number;
  classification?: string; // "glow" or "rim"
  min_valid_distance_m?: number;
  max_valid_distance_m?: number;
}

// Shooting timing information
export interface ShootingTiming {
  best_time_minutes: number;
  window_start_minutes: number;
  window_end_minutes: number;
  window_duration_minutes: number;
  peak_light_quality: number;
  lighting_type: string; // "standard", "rim", "crest", "afterglow"
  sun_altitude_at_peak?: number; // degrees above/below horizon at peak time
}

// A complete shooting opportunity: anchor + standing location + lighting
export interface ShotCandidate {
  shot_id: number;
  anchor_id: number;
  explore_area_id: number;
  anchor_location: { lat: number; lon: number };
  standing_location: { lat: number; lon: number };
  standing_properties: ShotStandingProperties;
  line_of_sight: LineOfSight;
  shooting_timing?: ShootingTiming;
  lighting_zone_type: string; // "glow-zone", "rim-zone"
  confidence: number;
  structure_score: number;
  nav_link?: string;
  candidate_search?: {
    candidates_checked: number;
    selected_at_distance_m: number;
    rejection_summary: Record<string, number>;
    sample_rejected: Array<{
      lat: number;
      lon: number;
      distance_m: number;
      reason: string;
    }>;
  };
}

// Aggregate metrics for an explore area zone
export interface ExploreAreaMetrics {
  area_m2: number;
  effective_width_m: number;
  mean_slope_deg: number;
  mean_elevation_m: number;
  structure_class: string;
  geometry_type: string;
  confidence: number;
  lighting_zone_type: string;
  aspect_offset_deg: number;
  cardinal_direction: string;
  directional_preference: number;
}

// A lighting-eligible terrain zone with multiple photographic anchors
export interface ExploreArea {
  explore_area_id: number;
  centroid: { lat: number; lon: number };
  polygon: [number, number][]; // [(lat, lon), ...]
  metrics: ExploreAreaMetrics;
  anchors: Anchor[];
  shot_candidates: ShotCandidate[];
  explain?: SubjectExplain;
}

// Full analysis result
export interface TerrainAnalysisResult {
  meta: AnalysisMeta;
  sun_track: SunPosition[];
  // Legacy format (for backwards compatibility)
  subjects: Subject[];
  standing_locations: StandingLocation[];
  // New multi-anchor format
  explore_areas: ExploreArea[];
  shot_candidates: ShotCandidate[];
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
  debug?: boolean;  // Enable debug stats in response
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
