"""
Type definitions for terrain analysis.

These match the TypeScript types in src/types/terrainValidation.ts
"""

from dataclasses import dataclass, field
from typing import Literal
from datetime import datetime


@dataclass
class SunPosition:
    time_iso: str
    minutes_from_start: float
    azimuth_deg: float
    altitude_deg: float
    vector: tuple[float, float, float]  # (Sx, Sy, Sz)


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
    samples: list[ShadowSample]
    sun_visible: bool


@dataclass
class SubjectProperties:
    elevation_m: float
    slope_deg: float
    aspect_deg: float
    face_direction_deg: float
    area_m2: float
    normal: tuple[float, float, float]  # (Nx, Ny, Nz)


@dataclass
class SubjectValidation:
    normal_unit_length: float
    aspect_normal_match_deg: float
    glow_in_range: bool
    sun_visible_at_peak: bool


@dataclass
class Subject:
    subject_id: int
    centroid: dict  # {"lat": float, "lon": float}
    polygon: list[tuple[float, float]]  # [(lat, lon), ...]
    properties: SubjectProperties
    incidence_series: list[IncidencePoint]
    glow_window: GlowWindow | None
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
    samples: list[LOSSample]


@dataclass
class RejectedCandidate:
    distance_m: float
    lat: float
    lon: float
    reason: Literal["slope_too_steep", "no_line_of_sight", "out_of_bounds"]
    slope_deg: float | None = None


@dataclass
class CandidateSearch:
    candidates_checked: int
    rejected: list[RejectedCandidate]
    selected_at_distance_m: float


@dataclass
class StandingProperties:
    elevation_m: float
    slope_deg: float
    distance_to_subject_m: float
    camera_bearing_deg: float
    elevation_diff_m: float


@dataclass
class StandingLocation:
    standing_id: int
    subject_id: int
    location: dict  # {"lat": float, "lon": float}
    properties: StandingProperties
    line_of_sight: LineOfSight
    candidate_search: CandidateSearch


@dataclass
class DebugLayer:
    type: Literal["raster", "geojson"]
    url: str | None = None
    features: list | None = None


@dataclass
class AnalysisMeta:
    request_id: str
    computed_at: str
    dem_source: str
    dem_bounds: dict  # {"north", "south", "east", "west"}
    cell_size_m: float
    center_lat: float
    center_lon: float


@dataclass
class TerrainAnalysisResult:
    meta: AnalysisMeta
    sun_track: list[SunPosition]
    subjects: list[Subject]
    standing_locations: list[StandingLocation]
    debug_layers: dict = field(default_factory=dict)


@dataclass
class AnalyzeRequest:
    lat: float
    lon: float
    date: str  # ISO date string
    event: Literal["sunrise", "sunset"]
    radius_km: float = 2.0
