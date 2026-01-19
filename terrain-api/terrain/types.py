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
    glow_score: float


@dataclass
class GlowWindow:
    start_minutes: float
    end_minutes: float
    peak_minutes: float
    duration_minutes: float
    peak_incidence: float
    peak_glow_score: float


@dataclass
class ShadowSample:
    distance_m: float
    ray_z: float
    terrain_z: float
    blocked: bool


@dataclass
class ShadowCheck:
    checked_at_minutes: float
    sun_azimuth_deg: float
    sun_altitude_deg: float
    samples: List[ShadowSample]
    sun_visible: bool


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
    # Subject type based on lighting (not geometry)
    # Surface moments: grazing light reveals texture, contrast, rhythm
    # Dramatic features: direct/angled light emphasizes form and mass
    subject_type: str = "dramatic-feature"  # "dramatic-feature" or "surface-moment"
    # Quality tier for ranking (primary features always rank above subtle)
    quality_tier: str = "primary"  # "primary" or "subtle"


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
    polygon: List[Tuple[float, float]]  # [(lat, lon), ...]
    properties: SubjectProperties
    incidence_series: List[IncidencePoint]
    glow_window: Optional[GlowWindow]
    shadow_check: ShadowCheck
    validation: SubjectValidation


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
    elevation_m: float
    slope_deg: float
    distance_to_subject_m: float
    camera_bearing_deg: float
    elevation_diff_m: float


@dataclass
class ShootingTiming:
    """Best times to shoot from this standing location."""
    best_time_minutes: float  # Minutes from event (sunrise/sunset)
    window_start_minutes: float
    window_end_minutes: float
    window_duration_minutes: float
    peak_light_quality: float  # 0-1 glow score at peak
    lighting_type: str  # "standard", "rim", "crest"


@dataclass
class StandingLocation:
    standing_id: int
    subject_id: int
    location: Dict  # {"lat": float, "lon": float}
    properties: StandingProperties
    line_of_sight: LineOfSight
    candidate_search: CandidateSearch
    # Timing for best shot
    shooting_timing: Optional[ShootingTiming] = None
    # Navigation link (Google Maps)
    nav_link: Optional[str] = None


@dataclass
class DebugLayer:
    type: Literal["raster", "geojson"]
    url: Optional[str] = None
    features: Optional[List] = None


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


@dataclass
class TerrainAnalysisResult:
    meta: AnalysisMeta
    sun_track: List[SunPosition]
    subjects: List[Subject]
    standing_locations: List[StandingLocation]
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
