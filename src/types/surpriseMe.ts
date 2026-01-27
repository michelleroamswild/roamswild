// ============================================
// Surprise Me Feature Types
// ============================================

// Enums matching database types
export type BiomeType = 'desert' | 'alpine' | 'forest' | 'coastal' | 'grassland';

export type DataSourceType =
  | 'pad_us'
  | 'osm'
  | 'usfs'
  | 'blm'
  | 'nps'
  | 'ridb'
  | 'noaa'
  | 'manual'
  | 'derived';

export type RoadSurfaceType =
  | 'paved'
  | 'gravel'
  | 'dirt'
  | '4wd_only'
  | 'no_vehicle_access';

export type VehicleType = 'sedan' | 'suv' | 'truck' | '4wd' | 'rv';

// ============================================
// Request Types
// ============================================

export interface SurpriseMeRequest {
  userId?: string;
  sessionId?: string;
  userLat: number;
  userLng: number;
  maxDistanceMiles: number;
  minDistanceMiles?: number;
  preferredDistanceMiles?: number;

  // User preferences
  userVehicle?: VehicleType;
  requiresCellService?: boolean;
  maxElevationFt?: number;
  excludeBiomes?: BiomeType[];

  // Advanced options
  skipDiversityBoost?: boolean;
  seed?: number; // For reproducible results (testing)
}

// ============================================
// Response Types
// ============================================

export interface BoundingBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RegionHighlight {
  id: string;
  name: string;
  description?: string;
  location?: LatLng;
  metadata?: Record<string, unknown>;
}

export interface TrailHighlight extends RegionHighlight {
  lengthMiles?: number;
  elevationGainFt?: number;
  difficulty?: 'easy' | 'moderate' | 'hard' | 'expert';
  trailType?: string;
}

export interface CampsiteHighlight extends RegionHighlight {
  siteCount?: number;
  campsiteType?: 'developed' | 'primitive' | 'dispersed';
  amenities?: string[];
  reservationUrl?: string;
}

export interface POIHighlight extends RegionHighlight {
  category?: string;
  hours?: string;
  website?: string;
}

export interface PhotoSpotHighlight extends RegionHighlight {
  bestTime?: string;
  features?: string[];
}

export interface ScoreComponents {
  publicLand: number;
  trailDensity: number;
  campsiteDensity: number;
  popularity: number;
  remoteness: number;
  seasonalAccess: number;
}

export interface ScoreBreakdown {
  base: number;
  distanceFactor: number;
  diversityMult: number;
  components: ScoreComponents;
}

export interface RegionScores {
  overall: number;
  breakdown: ScoreBreakdown;
}

export interface RegionAccess {
  roadType: RoadSurfaceType;
  recommendedVehicle: string;
  cautions: string[];
}

export interface SeasonalInfo {
  snowCoverPct: number;
  snowlineFt: number;
  conditionsAsOf: string; // ISO date
}

export interface RegionHighlights {
  topTrails: TrailHighlight[];
  campsites: CampsiteHighlight[];
  pointsOfInterest: POIHighlight[];
  photoSpots: PhotoSpotHighlight[];
}

export interface SurpriseMeRegion {
  id: string;
  name: string;
  slug: string;
  tagline?: string;
  description?: string;
  bounds: BoundingBox;
  center: LatLng;
  primaryBiome: BiomeType;
  secondaryBiomes?: BiomeType[];
  distanceMiles: number;
  driveTimeHours?: number;
  areaSqMiles?: number;
}

export interface SurpriseMeMeta {
  candidatesEvaluated: number;
  selectionAttempt: number;
  algorithmVersion: string;
  wasRelaxed?: boolean;
  relaxationsApplied?: string[];
}

// ============================================
// Scenic Drive Anchor Types
// ============================================

export interface ScenicAnchorRoad {
  name: string | null;
  ref: string | null;
  surface: 'paved' | 'gravel' | 'dirt' | 'unknown';
  highway: string;
}

export interface ScenicAnchorCoord {
  lat: number;
  lng: number;
}

export interface ScenicAnchorHighlight {
  type: 'viewpoint' | 'trail' | 'water' | 'camp';
  name: string | null;
  lat: number;
  lon: number;
  distanceMiles: number;
  isNamed: boolean;
}

export interface ScenicAnchor {
  road: ScenicAnchorRoad;
  start: ScenicAnchorCoord;
  end: ScenicAnchorCoord;
  center: ScenicAnchorCoord;
  lengthMiles: number;
  score: number;
}

export interface ScenicAnchorMeta {
  regionId: string;
  candidatesEvaluated: number;
  strategy: string;
  wasFallback: boolean;
  cacheHit: boolean;
  source: 'fresh' | 'cache' | 'stale_cache' | 'fallback';
}

export interface SurpriseMeSuccessResponse {
  success: true;
  region: SurpriseMeRegion;
  scores: RegionScores;
  highlights: RegionHighlights;
  access: RegionAccess;
  seasonal: SeasonalInfo;
  cautions: string[];
  explanation: string;
  meta: SurpriseMeMeta;
  // Scenic drive anchor (populated client-side)
  anchor?: ScenicAnchor;
  anchorHighlights?: ScenicAnchorHighlight[];
  anchorMeta?: ScenicAnchorMeta;
}

export interface SurpriseMeErrorResponse {
  success: false;
  error: 'NO_REGIONS_AVAILABLE' | 'VALIDATION_FAILED' | 'SERVICE_ERROR' | 'LOCATION_REQUIRED';
  message: string;
  suggestion?: string;
}

export type SurpriseMeResponse = SurpriseMeSuccessResponse | SurpriseMeErrorResponse;

// ============================================
// Database Row Types (snake_case)
// ============================================

export interface RegionRow {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  description: string | null;
  bounds: unknown; // PostGIS geometry
  center: unknown; // PostGIS geometry
  area_sq_miles: number | null;
  bbox_north: number;
  bbox_south: number;
  bbox_east: number;
  bbox_west: number;
  primary_biome: BiomeType | null;
  secondary_biomes: BiomeType[] | null;
  parent_region_id: string | null;
  region_type: string;
  h3_index: string | null;
  created_by_run_id: string | null;
  last_updated_by_run_id: string | null;
  is_active: boolean;
  is_curated: boolean;
  created_at: string;
  updated_at: string;
}

export interface RegionMetricsRow {
  id: string;
  region_id: string;
  public_land_pct: number | null;
  public_land_score: number | null;
  land_manager_breakdown: Record<string, number> | null;
  trail_count: number;
  trail_total_miles: number | null;
  trail_density_per_sq_mile: number | null;
  trail_density_score: number | null;
  trail_diversity_index: number | null;
  trail_types: Record<string, number> | null;
  campsite_count: number;
  dispersed_camping_allowed: boolean;
  campsite_density_score: number | null;
  campsite_types: Record<string, number> | null;
  review_count: number;
  monthly_bookings: number;
  wiki_presence_score: number | null;
  raw_popularity: number | null;
  popularity_percentile: number | null;
  popularity_score: number | null;
  distance_to_town_10k_miles: number | null;
  distance_to_interstate_miles: number | null;
  remoteness_score: number | null;
  elevation_min_ft: number | null;
  elevation_max_ft: number | null;
  elevation_avg_ft: number | null;
  elevation_gain_total_ft: number | null;
  typical_season_start: number | null;
  typical_season_end: number | null;
  current_snow_cover_pct: number | null;
  current_snowline_ft: number | null;
  seasonal_access_score: number | null;
  seasonal_last_updated: string | null;
  best_road_surface: RoadSurfaceType | null;
  has_paved_access: boolean;
  road_access_score: number | null;
  cell_coverage_pct: number | null;
  has_cell_coverage: boolean;
  quality_score: number | null;
  score_breakdown: Record<string, unknown> | null;
  score_computed_at: string | null;
  metrics_version: number;
  last_updated_by_run_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RegionWithMetricsRow extends RegionRow {
  // Joined metrics fields
  public_land_pct: number | null;
  public_land_score: number | null;
  trail_count: number;
  trail_density_score: number | null;
  campsite_count: number;
  dispersed_camping_allowed: boolean;
  campsite_density_score: number | null;
  popularity_score: number | null;
  popularity_percentile: number | null;
  remoteness_score: number | null;
  elevation_min_ft: number | null;
  elevation_avg_ft: number | null;
  elevation_max_ft: number | null;
  seasonal_access_score: number | null;
  best_road_surface: RoadSurfaceType | null;
  cell_coverage_pct: number | null;
  has_cell_coverage: boolean;
  quality_score: number | null;
}

export interface SurpriseHistoryRow {
  id: string;
  user_id: string | null;
  session_id: string | null;
  region_id: string;
  region_name: string;
  region_biome: BiomeType | null;
  request_params: Record<string, unknown> | null;
  user_lat: number | null;
  user_lng: number | null;
  distance_miles: number | null;
  score_at_selection: number | null;
  score_breakdown: Record<string, unknown> | null;
  candidates_count: number | null;
  selection_attempt: number | null;
  was_fallback: boolean;
  clicked_through: boolean;
  saved_to_trips: boolean;
  recommended_at: string;
  clicked_at: string | null;
}

export interface RegionFeatureRow {
  id: string;
  region_id: string;
  feature_type: string;
  external_id: string | null;
  name: string;
  description: string | null;
  location: unknown | null; // PostGIS geometry
  metadata: Record<string, unknown> | null;
  popularity_rank: number | null;
  quality_rank: number | null;
  source_type: DataSourceType | null;
  last_updated_by_run_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SeasonalConditionsRow {
  id: string;
  region_id: string;
  recorded_date: string;
  snow_cover_pct: number | null;
  snowline_ft: number | null;
  snow_depth_inches: number | null;
  roads_open_pct: number | null;
  primary_access_open: boolean | null;
  temp_high_f: number | null;
  temp_low_f: number | null;
  precip_chance_pct: number | null;
  active_alerts: Array<{ type: string; severity: string; message: string }> | null;
  source_type: DataSourceType | null;
  data_source_run_id: string | null;
  created_at: string;
}

export interface RoadClosureRow {
  id: string;
  region_id: string | null;
  road_name: string;
  road_segment: string | null;
  road_osm_id: number | null;
  closure_type: string | null;
  is_full_closure: boolean;
  affects_primary_access: boolean;
  closure_location: unknown | null; // PostGIS geometry
  start_date: string | null;
  expected_end_date: string | null;
  is_indefinite: boolean;
  source_url: string | null;
  source_agency: string | null;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// Internal Algorithm Types
// ============================================

export interface RegionCandidate {
  region: RegionWithMetricsRow;
  distanceMiles: number;
}

export interface ScoredCandidate {
  region: RegionWithMetricsRow;
  distanceMiles: number;
  score: number;
  breakdown: ScoreBreakdown;
}

export interface SeasonalValidationResult {
  valid: boolean;
  rejection?: string;
  snowCoverPct: number;
  snowlineFt: number;
  roadAccess: RoadAccessResult;
  closures: RoadClosureRow[];
}

export interface RoadAccessResult {
  accessType: RoadSurfaceType;
  score: number;
  recommendedVehicle: string;
  cautions: string[];
  rejected: boolean;
  rejectionReason?: string;
}

export interface RerollResult {
  shouldRetry: boolean;
  newParams?: Partial<SurpriseMeRequest>;
  relaxationApplied?: string;
}

// ============================================
// Scoring Configuration
// ============================================

export const SCORE_WEIGHTS = {
  publicLand: 0.20,
  trailDensity: 0.20,
  campsiteDensity: 0.15,
  popularity: 0.20,
  remoteness: 0.10,
  seasonalAccess: 0.15,
} as const;

export const HARD_FILTERS = {
  minPublicLandPct: 25,
  minTrailCount: 3,
  minSeasonalAccessScore: 40,
  minCampsiteCount: 1, // OR dispersed camping allowed
} as const;

export const REROLL_CONFIG = {
  maxAttempts: 5,
  relaxationOrder: [
    'increase_max_distance',
    'lower_trail_minimum',
    'accept_higher_popularity',
    'skip_diversity_boost',
  ],
} as const;

export const DIVERSITY_MULTIPLIERS = {
  fresh: 1.15,      // Biome not in recent 5
  recent1: 1.05,    // Appeared once
  recent2: 1.00,    // Appeared twice
  overused: 0.85,   // Appeared 3+ times
} as const;

// ============================================
// Helper Functions
// ============================================

export function isSurpriseMeSuccess(
  response: SurpriseMeResponse
): response is SurpriseMeSuccessResponse {
  return response.success === true;
}

export function isSurpriseMeError(
  response: SurpriseMeResponse
): response is SurpriseMeErrorResponse {
  return response.success === false;
}

export function getBiomeDisplayName(biome: BiomeType): string {
  const names: Record<BiomeType, string> = {
    desert: 'Desert',
    alpine: 'Alpine',
    forest: 'Forest',
    coastal: 'Coastal',
    grassland: 'Grassland',
  };
  return names[biome] || biome;
}

export function getRoadSurfaceDisplayName(surface: RoadSurfaceType): string {
  const names: Record<RoadSurfaceType, string> = {
    paved: 'Paved',
    gravel: 'Gravel',
    dirt: 'Dirt',
    '4wd_only': '4WD Only',
    no_vehicle_access: 'No Vehicle Access',
  };
  return names[surface] || surface;
}

export function getRecommendedVehicle(surface: RoadSurfaceType): string {
  const vehicles: Record<RoadSurfaceType, string> = {
    paved: 'Any vehicle',
    gravel: 'SUV or truck recommended',
    dirt: 'High clearance vehicle recommended',
    '4wd_only': '4WD required',
    no_vehicle_access: 'No vehicle access - hike in only',
  };
  return vehicles[surface] || 'Unknown';
}
