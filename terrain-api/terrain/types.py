"""
Type definitions for terrain analysis.

These match the TypeScript types in src/types/terrainValidation.ts
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, Optional, List, Tuple, Dict
from datetime import datetime


@dataclass
class SunPosition:
    time_iso: str
    minutes_from_start: float
    azimuth_deg: float
    altitude_deg: float
    vector: Tuple[float, float, float]  # (Sx, Sy, Sz)


@dataclass
class IncidencePoint:
    minutes: float
    incidence: float
    glow_score: float      # Gaussian(0.7, 0.25) - optimal for front-lit glow
    texture_score: float   # Gaussian(0.2, 0.15) - optimal for side-lit texture


@dataclass
class GlowWindow:
    start_minutes: float
    end_minutes: float
    peak_minutes: float
    duration_minutes: float
    peak_incidence: float
    peak_glow_score: float
    peak_texture_score: float = 0.0  # Texture score at peak time


@dataclass
class ShadowSample:
    distance_m: float
    ray_z: float
    terrain_z: float
    blocked: bool
    # New fields for terrain angle analysis
    terrain_angle_deg: Optional[float] = None  # Angle from start to terrain at this distance


@dataclass
class BlockingPoint:
    """Location where sun ray is first blocked by terrain."""
    lat: float
    lon: float
    elevation_m: float
    distance_m: float
    terrain_angle_deg: float


@dataclass
class ShadowCheck:
    checked_at_minutes: float
    sun_azimuth_deg: float
    sun_altitude_deg: float
    samples: List[ShadowSample]
    sun_visible: bool
    # New fields for improved shadow analysis
    max_terrain_angle_deg: Optional[float] = None  # Maximum terrain angle encountered
    blocking_margin_deg: Optional[float] = None  # sun_altitude - max_terrain_angle (negative = blocked)
    first_blocked_distance_m: Optional[float] = None  # Distance to first blocker
    blocking_point: Optional[BlockingPoint] = None  # Location of first blocker


@dataclass
class StructureMetrics:
    """Multi-scale structure metrics for terrain classification."""
    # Local relief (elevation range)
    micro_relief_m: float      # Relief within 30-60m radius
    macro_relief_m: float      # Relief within 300-800m radius

    # Curvature metrics
    mean_curvature: float      # Average curvature (+ = convex, - = concave)
    max_curvature: float       # Peak curvature (ridges, knobs)
    curvature_variance: float  # Variability of curvature

    # Slope break metrics
    slope_break_score: float   # Mean |Δslope| in neighborhood (0-1 normalized)
    max_slope_break: float     # Maximum slope change (degrees)

    # Heterogeneity
    elevation_std: float       # Standard deviation of elevation
    slope_std: float           # Standard deviation of slope
    heterogeneity_score: float # Combined heterogeneity (0-1)

    # Combined scores
    structure_score: float     # Overall structure score (0-1)
    structure_class: str       # "micro-dramatic", "macro-dramatic", "flat-lit"

    # Per-cell structure analysis (for debugging zone quality)
    structure_score_at_centroid: float = 0.0  # Structure score at zone centroid
    max_structure_score_in_zone: float = 0.0  # Highest per-cell structure score
    max_structure_location: Optional[Tuple[float, float]] = None  # (lat, lon) of best cell
    distance_centroid_to_max_m: float = 0.0  # Distance from centroid to max location


@dataclass
class SubjectExplain:
    """Photographer-friendly explanations for technical values."""
    zone_type: str  # e.g., "Warm light zone - faces the sun for golden glow"
    aspect_offset: str  # e.g., "Facing almost directly into the sun"
    light_quality: str  # e.g., "Strong grazing light (dramatic texture)"
    sun_altitude: str  # e.g., "Very low sun (dramatic golden light)"
    best_time: str  # e.g., "Just after sunrise"
    window_duration: str  # e.g., "Good window (comfortable shooting time)"
    face_direction: str  # e.g., "Faces Southwest"
    slope: str  # e.g., "Moderate slope (textured hillside)"
    area: str  # e.g., "Large zone (explore for best angle)"
    summary: str  # One-sentence summary
    structure: Optional[str] = None  # e.g., "Micro-dramatic feature: 8.5m local relief"


@dataclass
class SubjectProperties:
    elevation_m: float
    slope_deg: float
    aspect_deg: float
    face_direction_deg: float
    area_m2: float
    normal: Tuple[float, float, float]  # (Nx, Ny, Nz)
    # Graduated confidence scoring
    confidence: float = 0.0  # 0-1 overall confidence
    score_breakdown: Optional[Dict] = None  # slope, prominence, curvature, coherence, size
    # Scale classification
    distance_from_center_m: float = 0.0
    classification: str = "monument-scale"  # "foreground", "human-scale", "monument-scale"
    # LIGHTING ZONE TYPE - primary classification based on sun relationship
    # "glow-zone": Faces toward sun (±60°), receives warm direct/angled light
    # "rim-zone": Perpendicular to sun (60-120°), receives backlit/edge light - DRAMATIC
    # "shadow-zone": Faces away from sun, in shadow
    lighting_zone_type: str = "glow-zone"
    aspect_offset_deg: float = 0.0  # Angular offset from sun direction
    # Subject type based on terrain character (secondary to lighting zone)
    # Surface moments: grazing light reveals texture, contrast, rhythm
    # Dramatic features: direct/angled light emphasizes form and mass
    subject_type: str = "dramatic-feature"  # "dramatic-feature" or "surface-moment"
    # Quality tier for ranking (primary features always rank above subtle)
    quality_tier: str = "primary"  # "primary" or "subtle"
    # Photographer-friendly explanations (generated by explain.py)
    explain: Optional[SubjectExplain] = None
    # Zone sizing (for subdivision validation)
    effective_width_m: Optional[float] = None  # sqrt(area) - approximate linear extent
    # Directional preference based on event (sunset favors W, sunrise favors E)
    directional_preference: float = 1.0  # 0-1 boost based on facing direction
    cardinal_direction: str = "W"  # e.g., "W", "NW", "SW", "E", "NE", etc.
    # Structure metrics - distinguishes dramatic features from flat-lit terrain
    structure: Optional[StructureMetrics] = None
    structure_class: str = "unknown"  # "micro-dramatic", "macro-dramatic", "flat-lit"
    is_dramatic: bool = True  # False for flat-lit terrain (not recommended)
    # Subject location snapping - indicates if centroid was moved to max structure
    snapped_to_max_structure: bool = False
    # Geometry type: planar (walls, slabs) vs volumetric (boulders, knobs)
    # Volumetric subjects bypass face-direction filters, rely on camera-sun geometry
    geometry_type: str = "planar"  # "planar" or "volumetric"
    face_direction_variance: float = 0.0  # Variance of face directions (high = volumetric)
    volumetric_reason: Optional[str] = None  # e.g., "curvature:1.5" or "face_variance:72.3°"


@dataclass
class SubjectValidation:
    normal_unit_length: float
    aspect_normal_match_deg: float
    glow_in_range: bool
    sun_visible_at_peak: bool


@dataclass
class Subject:
    subject_id: int
    centroid: Dict  # {"lat": float, "lon": float}
    polygon: List[Tuple[float, float]]  # [(lat, lon), ...] - region-grown subject polygon
    properties: SubjectProperties
    incidence_series: List[IncidencePoint]
    glow_window: Optional[GlowWindow]
    shadow_check: ShadowCheck
    validation: SubjectValidation
    candidate_search: Optional[Dict] = None  # Standing location search info
    # ExploreArea polygon - original zone before region-growing (faint layer)
    explore_polygon: Optional[List[Tuple[float, float]]] = None  # [(lat, lon), ...]
    # Parent subject ID for facet subjects (links facet to parent planar subject)
    parent_subject_id: Optional[int] = None


@dataclass
class LOSSample:
    t: float  # 0-1 along ray
    ray_z: float
    terrain_z: float
    blocked: bool


@dataclass
class LineOfSight:
    clear: bool
    eye_height_m: float
    target_height_m: float
    samples: List[LOSSample]


@dataclass
class RejectedCandidate:
    distance_m: float
    lat: float
    lon: float
    reason: Literal["slope_too_steep", "no_line_of_sight", "out_of_bounds"]
    slope_deg: Optional[float] = None


@dataclass
class CandidateSearch:
    candidates_checked: int
    rejected: List[RejectedCandidate]
    selected_at_distance_m: float


@dataclass
class StandingProperties:
    elevation_m: float  # Ground elevation at standing point
    slope_deg: float
    distance_to_subject_m: float
    camera_bearing_deg: float
    elevation_diff_m: float
    # Distance constraints (based on subject slope and area)
    min_valid_distance_m: Optional[float] = None
    max_valid_distance_m: Optional[float] = None
    # Geometry classification and validation
    classification: Optional[str] = None  # "glow" or "rim"
    geometry_deltas: Optional[Dict] = None  # Truth table deltas
    # LOS info
    los_min_clearance_m: Optional[float] = None  # Minimum clearance along ray
    target_height_offset_m: Optional[float] = None  # Target height offset used (based on structure class)
    # Accessibility info (distance to OSM roads/trails)
    accessibility_status: str = "unknown"  # "on-road", "near-road", "off-trail", "too-far", "too-steep", "unknown"
    distance_to_road_m: Optional[float] = None  # Distance to nearest road/trail
    nearest_road_type: Optional[str] = None  # OSM highway type (e.g., "track", "path")
    nearest_road_name: Optional[str] = None  # Road name if available
    # Elevation gain from access point
    uphill_gain_from_access_m: Optional[float] = None  # Uphill gain from road to standing
    downhill_gain_from_access_m: Optional[float] = None  # Downhill gain from road to standing
    # Landcover and adjusted approach values
    landcover_type: str = "unknown"  # desert, shrub, forest, wet, unknown
    landcover_multiplier: float = 1.0  # Terrain difficulty multiplier
    adjusted_distance_m: Optional[float] = None  # distance * multiplier
    adjusted_uphill_m: Optional[float] = None  # uphill * multiplier
    adjusted_downhill_m: Optional[float] = None  # downhill * multiplier
    # Approach difficulty classification
    approach_difficulty: str = "unknown"  # easy, moderate, hard, unknown
    approach_profile: str = "moderate"  # Profile used for limits (casual, moderate, spicy)
    # Rim/overlook metrics (for cell-based overlook candidates)
    rim_strength: Optional[float] = None  # 0-1 score from TPI (higher = more elevated)
    tpi_large_m: Optional[float] = None  # Large-scale TPI value
    # Access type classification for rim-overlook results
    # "road" = nearest access is a road/track, "trail" = path/footway, "none" = no access data
    access_type: str = "none"


@dataclass
class ShootingTiming:
    """Best times to shoot from this standing location."""
    best_time_minutes: float  # Minutes from event (sunrise/sunset)
    window_start_minutes: float
    window_end_minutes: float
    window_duration_minutes: float
    peak_light_quality: float  # 0-1 glow score at peak
    lighting_type: str  # "standard", "rim", "crest", "afterglow"
    # Sun altitude at peak time (for direct vs afterglow classification)
    sun_altitude_at_peak: Optional[float] = None  # degrees above/below horizon


@dataclass
class HorizonSample:
    """Single azimuth sample in a horizon profile."""
    azimuth_deg: float
    horizon_alt_deg: float  # Elevation angle to horizon (positive = terrain above eye level)
    distance_to_horizon_m: float  # Distance where horizon occurs


@dataclass
class SunAlignment:
    """Sun position relative to local horizon."""
    sun_azimuth_deg: float
    sun_altitude_deg: float
    horizon_alt_at_sun_az_deg: float  # Horizon altitude in sun's direction
    blocking_margin_deg: float  # sun_altitude - horizon_alt (negative = sun behind ridge)
    behind_ridge: bool  # True if sun is below local horizon


@dataclass
class ViewExplanations:
    """Human-readable explanations for view quality."""
    short: str  # <= 80 chars summary
    long: str   # 1-2 sentences with details


@dataclass
class VisualAnchor:
    """
    Visual Anchor Score (VAS) for detecting salient features in the view cone.

    Identifies whether there's a strong subject/anchor in the viewing direction -
    river bends, spires, mesas, ridgelines, dramatic skyline features that give
    the distant view a focal point.

    Used to enhance DAGS by rewarding views with distinct visual anchors.

    Multi-depth sampling: Searches for anchors at multiple distances along each
    azimuth (not just the horizon), finding mid-distance canyon walls, river
    gorges, and benches that make better photographic anchors.
    """
    # Overall anchor score 0-1
    anchor_score: float

    # Anchor type classification
    anchor_type: str = "NONE"  # "RIDGELINE", "SPIRES_KNOBS", "LAYERED_SKYLINE", "NONE"

    # Location of the strongest anchor
    anchor_distance_m: float = 0.0      # Distance to the anchor feature
    anchor_bearing_deg: float = 0.0     # Bearing to the anchor within sector

    # Component scores that determined the type
    curvature_salience: float = 0.0     # Salience from curvature (knobs/spires)
    slope_break_salience: float = 0.0   # Salience from slope breaks (ridgelines)
    relief_salience: float = 0.0        # Salience from local relief

    # Human-readable explanations
    explanation_short: str = ""   # e.g., "Strong skyline anchor ~8km at 252°"
    explanation_long: str = ""    # Full explanation with anchor type

    # Debug fields (populated when debug=True)
    anchor_search_mode: str = "MULTI_DEPTH"  # "HORIZON_ONLY" | "MULTI_DEPTH"
    anchor_candidates_sampled: int = 0        # Total candidates sampled (azimuths * distances)
    best_candidate_distance_m: float = 0.0    # Same as anchor_distance_m (for debug clarity)


@dataclass
class AnchorLight:
    """
    Light-at-Anchor score for estimating whether the anchor feature is lit.

    Computes whether the visual anchor (e.g., distant ridgeline, spire) is
    receiving direct sunlight based on surface orientation and shadow analysis.
    This adds "is the anchor glowing?" to "can I see the anchor?".
    """
    # Sun incidence at anchor surface (dot product of normal and sun vector)
    # Range: -1 (facing away) to +1 (facing directly into sun)
    anchor_sun_incidence: float

    # Light type classification based on geometry
    anchor_light_type: str = "BACK_LIT"  # "FRONT_LIT", "SIDE_LIT", "BACK_LIT", "RIM_LIT"

    # Shadow state at the anchor point
    anchor_shadowed: bool = False

    # Overall anchor light score 0-1
    anchor_light_score: float = 0.0

    # Anchor surface orientation (for debugging)
    anchor_slope_deg: float = 0.0
    anchor_aspect_deg: float = 0.0

    # Human-readable explanations
    explanation_short: str = ""   # e.g., "Anchor is side-lit (incidence 0.22)"
    explanation_long: str = ""    # Full explanation with shadow status


@dataclass
class DistantGlowWindowSample:
    """
    Single timestep sample in DAGS glow window time-series (debug only).

    Used for DISTANT_ATMOSPHERIC mode, not to be confused with subject-centric GlowWindow.
    """
    minutes: int                    # Minutes from event (sunrise/sunset)
    final_score: float              # distant_glow_final_score at this time
    anchor_light_score: float       # anchor_light_score at this time
    anchor_shadowed: bool           # Whether anchor is shadowed
    sun_altitude_deg: float         # Sun altitude
    sun_azimuth_deg: float          # Sun azimuth


@dataclass
class DistantGlowWindow:
    """
    Time-series glow window metrics for DISTANT_ATMOSPHERIC mode.

    Evaluates distant_glow_final_score over a time grid around sunrise/sunset
    to find the optimal shooting window. Accounts for shadows clearing the
    anchor feature over time.

    Note: This is distinct from the subject-centric GlowWindow class which
    uses peak_incidence and peak_glow_score for subject surfaces.
    """
    # Window bounds (minutes from event)
    start_minutes: int              # Start of good window
    end_minutes: int                # End of good window
    peak_minutes: int               # Time of peak score
    duration_minutes: int           # Length of good window

    # Peak metrics
    peak_score: float               # Maximum distant_glow_final_score
    peak_anchor_light_score: float  # anchor_light_score at peak time

    # Turning point detection
    sun_clears_ridge_minutes: Optional[int] = None  # First minute anchor becomes unshaded

    # Debug: full time-series (only when debug=True)
    score_series: Optional[List[DistantGlowWindowSample]] = None


@dataclass
class DistantGlowScore:
    """
    Distant Atmospheric Glow Score (DAGS) for viewpoint-first distant glow.

    This scores viewpoints for their potential to capture distant atmospheric glow -
    like layered canyon views at sunrise where the "glowing subjects" are miles away.

    Differs from subject-centric glow which scores terrain facing the sun.
    DAGS scores the VIEWPOINT for its ability to see distant layered terrain.
    """
    # Overall score 0-1
    distant_glow_score: float

    # Glow type classification
    distant_glow_type: str = "DISTANT_ATMOSPHERIC"  # Always this for DAGS

    # Component scores (all 0-1)
    depth_norm: float = 0.0       # Normalized depth (p90/30km)
    open_norm: float = 0.0        # Sector openness fraction
    rim_norm: float = 0.0         # Rim strength (TPI-based)
    sun_low_norm: float = 0.0     # Higher when sun is low (golden light)
    sun_clear_norm: float = 0.0   # Higher when sun clears horizon
    dir_norm: float = 0.0         # Directionality/contra-jour score

    # Directionality details
    view_bearing_deg: float = 0.0       # Best viewing direction
    sun_bearing_deg: float = 0.0        # Sun azimuth at event
    bearing_delta_deg: float = 0.0      # Angular difference
    directionality_type: str = "neutral"  # "side_lit", "contra_jour", "neutral"

    # Visual Anchor Score (VAS) - salient features in the view
    visual_anchor: Optional[VisualAnchor] = None

    # Combined DAGS + VAS score
    # Formula: dags * (0.7 + 0.3 * anchor_score)
    distant_glow_with_anchor_score: float = 0.0

    # Light-at-Anchor - is the anchor feature itself lit?
    anchor_light: Optional[AnchorLight] = None

    # Final combined score including anchor lighting
    # Formula: distant_glow_with_anchor_score * (0.75 + 0.25 * anchor_light_score)
    distant_glow_final_score: float = 0.0

    # Time-series glow window (computed when distant_glow_timeseries=True)
    glow_window: Optional[DistantGlowWindow] = None

    # Human-readable explanations
    explanation_short: str = ""   # e.g., "Distant layered glow potential (p90 18km)"
    explanation_long: str = ""    # Full explanation with directionality


@dataclass
class OverlookView:
    """View analysis for overlook/viewpoint locations."""
    # View metrics (full 360°)
    open_sky_fraction: float  # Fraction of azimuths with horizon < 1° (full 360°)
    depth_p50_m: float  # Median distance to horizon
    depth_p90_m: float  # 90th percentile distance to horizon
    horizon_complexity: int  # Number of peaks in horizon profile
    overlook_score: float  # Combined overlook quality score (0-1)

    # Best viewing direction
    best_bearing_deg: float  # Azimuth with best openness*depth
    fov_deg: float = 60.0  # Field of view for best bearing

    # Sector-based openness (in shooting direction)
    # More useful than full 360° for scoring - a canyon rim enclosed behind
    # but open forward should score well
    open_sky_sector_fraction: float = 0.0  # Fraction open in ±45° sector around best_bearing

    # View category classification
    # - EPIC_OVERLOOK: Big horizon, deep layers, wide-open views
    # - DRAMATIC_ENCLOSED: Enclosed canyon/valley with complex skyline, good for silhouettes
    # - QUICK_SCENIC: Easy viewpoint, good quick stop
    view_category: str = "QUICK_SCENIC"

    # View cone polygon for map rendering [[lat,lon], ...] - apex, left, right, apex (closed)
    view_cone: Optional[List[List[float]]] = None

    # Human-readable explanations
    explanations: Optional[ViewExplanations] = None

    # Sun alignment (optional - computed if sun_track available)
    sun_alignment: Optional[SunAlignment] = None

    # Distant Atmospheric Glow Score (DAGS) - viewpoint-first distant glow
    # Scores the viewpoint for capturing distant layered atmospheric glow
    # (e.g., sunrise over distant canyons from a rim overlook)
    distant_glow: Optional[DistantGlowScore] = None

    # Debug: full horizon profile (only if debug enabled)
    horizon_profile: Optional[List[HorizonSample]] = None


@dataclass
class StandingLocation:
    standing_id: int
    subject_id: Optional[int]  # None for rim_overlook standing locations
    location: Dict  # {"lat": float, "lon": float}
    properties: StandingProperties
    line_of_sight: LineOfSight
    candidate_search: CandidateSearch
    # Timing for best shot
    shooting_timing: Optional[ShootingTiming] = None
    # Navigation link (Google Maps)
    nav_link: Optional[str] = None
    # Overlook view analysis (optional - for rim/viewpoint locations)
    view: Optional[OverlookView] = None
    # Source type: "subject" (default) or "rim_overlook" (cell-based overlook detection)
    source: str = "subject"


@dataclass
class DebugLayer:
    type: Literal["raster", "geojson"]
    url: Optional[str] = None
    features: Optional[List] = None


@dataclass
class StructureDebug:
    """Debug info for structure computation."""
    enabled: bool  # Whether structure scoring is enabled
    computed_cells: int  # Total cells where structure was computed
    attached_to_subjects: int  # Subjects with structure data attached


@dataclass
class RimOverlookDebugStats:
    """Debug stats for rim overlook detection pipeline."""
    # Stage counts
    grid_cells_total: int = 0
    rim_mask_cells: int = 0
    rim_local_maxima_cells: int = 0
    maxima_found_total: int = 0  # Total local maxima found before any cap
    maxima_kept: int = 0  # Local maxima kept after max_candidates cap
    maxima_cap_used: int = 0  # Dynamic cap that was applied
    rim_candidates_selected: int = 0
    view_analyzed_total: int = 0  # Total candidates that got view analysis
    results_pre_dedup: int = 0  # Results before spatial deduplication
    results_post_dedup: int = 0  # Results after spatial deduplication (final)

    # TPI distribution stats (within AOI)
    tpi_large_m_p50: float = 0.0
    tpi_large_m_p90: float = 0.0
    tpi_large_m_p95: float = 0.0

    # Slope distribution stats
    slope_deg_pct_under_20: float = 0.0
    slope_deg_pct_under_25: float = 0.0
    slope_deg_pct_under_30: float = 0.0

    # View analysis stats (for candidates analyzed)
    depth_p90_m_p50: Optional[float] = None
    depth_p90_m_p90: Optional[float] = None
    avg_open_sky_fraction: Optional[float] = None
    avg_overlook_score: Optional[float] = None

    # Drop reason breakdown
    rejected_slope: int = 0
    rejected_tpi: int = 0
    rejected_edge: int = 0  # Rejected by edge gating
    rejected_nms: int = 0
    rejected_maxima_cap: int = 0  # Rejected by maxima cap
    rejected_topk: int = 0
    rejected_after_view_dedup: int = 0  # Rejected by spatial deduplication after view

    # Edge gating stats
    rim_mask_cells_before_edge_gate: int = 0
    rim_mask_cells_after_edge_gate: int = 0
    edge_mode: str = "STEEP_ADJACENCY"  # SLOPE_BREAK, STEEP_ADJACENCY, BOTH, NONE
    steep_cells_count: int = 0
    near_steep_cells_count: int = 0

    # Auto-threshold: chosen thresholds (after adjustment)
    chosen_tpi_threshold_m: Optional[float] = None
    chosen_slope_max_deg: Optional[float] = None
    chosen_view_candidates_k: Optional[int] = None
    auto_threshold_applied: bool = False

    # Access proximity stats (when access_bias is enabled)
    access_bias_applied: str = "NONE"  # Which bias mode was used
    pct_results_within_access_distance: Optional[float] = None  # % of final results within access_max_distance_m
    distance_to_access_p50_m: Optional[float] = None  # Median distance to nearest road/trail
    distance_to_access_p90_m: Optional[float] = None  # 90th percentile distance

    # Sample coordinates for debug visualization (only populated when debug=True)
    # Each is a list of dicts with lat, lon, and relevant metrics
    sample_rim_candidates: Optional[List[Dict]] = None  # Pre-NMS rim candidates (sampled)
    sample_local_maxima: Optional[List[Dict]] = None  # Post-NMS local maxima
    sample_view_analyzed: Optional[List[Dict]] = None  # Points that went through view analysis


@dataclass
class AnalysisMeta:
    request_id: str
    computed_at: str
    dem_source: str
    dem_bounds: Dict  # {"north", "south", "east", "west"}
    cell_size_m: float
    center_lat: float
    center_lon: float
    dem_resolution_m: Optional[float] = None
    dem_vertical_accuracy_m: Optional[float] = None
    dem_citation: Optional[str] = None
    # Debug info
    structure_debug: Optional[StructureDebug] = None
    rim_overlook_debug: Optional[RimOverlookDebugStats] = None


@dataclass
class LightingZoneMember:
    """A detected surface within a lighting zone."""
    subject_id: int
    centroid: Dict  # {"lat": float, "lon": float}
    area_m2: float
    mean_incidence: float
    distance_to_center_m: float


@dataclass
class LightingZone:
    """
    A terrain zone with consistent favorable lighting conditions.

    At 30m DEM resolution, this represents a promising area where
    micro-features (rock gardens, boulder fields, textured slabs)
    likely exist and will catch similar light.

    Guides photographers to terrain zones worth exploring on foot.
    """
    zone_id: int
    centroid: Dict  # {"lat": float, "lon": float}
    members: List[LightingZoneMember]
    # Zone properties
    member_count: int
    total_area_m2: float
    zone_radius_m: float  # Extent of the zone
    avg_incidence: float  # Average incidence (lower = better grazing light)
    avg_slope_deg: float
    dem_resolution_m: float  # Scale context
    # Scoring
    zone_score: float  # Likelihood of good micro-features
    score_breakdown: Dict  # consistency, coverage, lighting, accessibility
    # Timing
    best_time_minutes: Optional[float] = None
    glow_window_start: Optional[float] = None
    glow_window_end: Optional[float] = None
    # Zone character (what type of features likely exist here)
    zone_character: str = "mixed-terrain"  # "rocky-slopes", "textured-flats", "mixed-terrain"


# =============================================================================
# Multi-Anchor System Types
# =============================================================================
# ExploreArea: A lighting-eligible zone detected from terrain analysis
# Anchor: A specific photographic subject within an explore area
# ShotCandidate: A complete shooting opportunity (anchor + standing location)


@dataclass
class AnchorStructure:
    """Structure metrics at an anchor point."""
    structure_score: float
    micro_relief_m: float
    max_curvature: float
    max_slope_break: float
    structure_class: str  # "micro-dramatic", "macro-dramatic", "flat-lit"


@dataclass
class Anchor:
    """
    A specific photographic subject within an explore area.

    Anchors are local maxima of structure_score within a zone polygon.
    Each anchor represents a distinct feature worth photographing.
    """
    anchor_id: int
    location: Dict  # {"lat": float, "lon": float}
    # Local terrain properties at anchor
    elevation_m: float
    slope_deg: float
    aspect_deg: float
    face_direction_deg: float
    # Structure metrics
    structure: AnchorStructure
    # Geometry classification
    geometry_type: str = "planar"  # "planar" or "volumetric"
    volumetric_reason: Optional[str] = None


@dataclass
class ShotCandidate:
    """
    A complete shooting opportunity: anchor + standing location + lighting.

    This is what photographers actually use - a specific subject to shoot
    from a specific position with known lighting conditions.
    """
    shot_id: int
    anchor_id: int
    explore_area_id: int
    # Anchor location (the subject)
    anchor_location: Dict  # {"lat": float, "lon": float}
    # Standing location (the camera position)
    standing_location: Dict  # {"lat": float, "lon": float}
    standing_properties: StandingProperties
    line_of_sight: LineOfSight
    # Lighting and timing
    shooting_timing: Optional[ShootingTiming] = None
    lighting_zone_type: str = "glow-zone"  # "glow-zone", "rim-zone"
    # Quality metrics for ranking
    confidence: float = 0.0
    structure_score: float = 0.0
    # Navigation
    nav_link: Optional[str] = None
    # Debug info
    candidate_search: Optional[Dict] = None


@dataclass
class ExploreAreaMetrics:
    """Aggregate metrics for an explore area zone."""
    area_m2: float
    effective_width_m: float
    mean_slope_deg: float
    mean_elevation_m: float
    structure_class: str
    geometry_type: str
    confidence: float
    # Lighting
    lighting_zone_type: str
    aspect_offset_deg: float
    cardinal_direction: str
    directional_preference: float


@dataclass
class ExploreArea:
    """
    A lighting-eligible terrain zone with multiple photographic anchors.

    The polygon defines where good light exists. Anchors are the specific
    features within that zone worth photographing. Each anchor may have
    an associated shot candidate (standing location found).
    """
    explore_area_id: int
    # Zone polygon (the "explore area")
    centroid: Dict  # {"lat": float, "lon": float}
    polygon: List[Tuple[float, float]]  # [(lat, lon), ...]
    # Zone-level metrics
    metrics: ExploreAreaMetrics
    # Anchors within this zone (local structure maxima)
    anchors: List[Anchor] = field(default_factory=list)
    # Shot candidates (anchors with valid standing locations)
    shot_candidates: List[ShotCandidate] = field(default_factory=list)
    # Photographer explanation
    explain: Optional[SubjectExplain] = None


@dataclass
class TerrainAnalysisResult:
    meta: AnalysisMeta
    sun_track: List[SunPosition]
    # Legacy subject/standing format (for backwards compatibility)
    subjects: List[Subject] = field(default_factory=list)
    standing_locations: List[StandingLocation] = field(default_factory=list)
    # New multi-anchor format
    explore_areas: List[ExploreArea] = field(default_factory=list)
    shot_candidates: List[ShotCandidate] = field(default_factory=list)
    # Additional
    lighting_zones: List[LightingZone] = field(default_factory=list)
    debug_layers: Dict = field(default_factory=dict)


@dataclass
class AnalyzeRequest:
    lat: float
    lon: float
    date: str  # ISO date string
    event: Literal["sunrise", "sunset"]
    radius_km: float = 2.0
    dem_source: Literal["auto", "copernicus-glo30", "usgs-3dep", "aws-terrain-tiles"] = "auto"
    # Note: aws-terrain-tiles is for visualization ONLY, not analysis
    debug: bool = False  # Enable debug stats in response
    # Auto-threshold mode: adjusts TPI and slope thresholds per-request
    # to target a healthy number of rim candidates (5-15% of grid cells)
    auto_thresholds: bool = True
    # Access bias: bias rim-overlook results toward accessible locations near roads/trails
    # - "NONE": No access bias (default)
    # - "NEAR_ROADS": Bias toward locations near roads/tracks
    # - "NEAR_TRAILS": Bias toward locations near trails/paths
    # - "NEAR_ROADS_OR_TRAILS": Bias toward locations near any road or trail
    access_bias: Literal["NONE", "NEAR_ROADS", "NEAR_TRAILS", "NEAR_ROADS_OR_TRAILS"] = "NONE"
    access_max_distance_m: float = 800.0  # Max distance for full access bonus
