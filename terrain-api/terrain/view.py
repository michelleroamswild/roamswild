"""
Overlook View Analysis: horizon profiles and viewpoint quality scoring.

Computes horizon profiles for standing locations to assess overlook quality.
Uses log-spaced ray sampling for efficient coverage of near and far terrain.
"""
from __future__ import annotations

import math
import numpy as np
from dataclasses import dataclass
from typing import List, Optional, Tuple, Dict

from datetime import datetime, timedelta
import warnings

from .dem import DEMGrid
from .types import (
    HorizonSample, SunAlignment, OverlookView, SunPosition,
    StandingLocation, ViewExplanations, DistantGlowScore, VisualAnchor,
    AnchorLight, DistantGlowWindow, DistantGlowWindowSample,
)
from .sun import compute_sun_position, compute_sun_vector, find_sunrise_sunset


# Default parameters
DEFAULT_AZ_STEP_DEG = 5.0  # Sample every 5 degrees (72 directions)
DEFAULT_NUM_SAMPLES = 16   # Samples per azimuth (log-spaced)
DEFAULT_EYE_HEIGHT_M = 1.7
DEFAULT_FOV_DEG = 60.0

# Overlook scoring weights
WEIGHT_DEPTH = 0.35
WEIGHT_OPEN_SKY = 0.25
WEIGHT_COMPLEXITY = 0.20
WEIGHT_RIM_STRENGTH = 0.20

# Normalization constants
DEPTH_NORMALIZATION_M = 20000.0  # Max depth for normalization
COMPLEXITY_NORMALIZATION = 20    # Max peaks for normalization

# View cone parameters
CONE_RANGE_MIN_M = 1000.0   # Minimum cone range
CONE_RANGE_MAX_M = 5000.0   # Maximum cone range
CONE_RANGE_DEFAULT_M = 3000.0  # Default if depth missing

# =============================================================================
# Distant Atmospheric Glow Score (DAGS) Parameters
# =============================================================================
# DAGS scores viewpoints for their potential to capture distant atmospheric glow.
# This is viewpoint-first scoring (vs subject-centric glow scoring).
# Example: Needles Overlook at sunrise - standing on a rim, viewing 10-60km of
# layered canyons that catch the dawn light.

# Normalization constants for DAGS
DAGS_DEPTH_MAX_M = 30000.0   # 30km for "extreme distance" (depth_norm = 1.0)
DAGS_SUN_LOW_MAX_DEG = 15.0  # Sun altitude below this is "low" for golden light

# DAGS component weights (must sum to 1.0)
DAGS_WEIGHT_DEPTH = 0.25       # Long-distance visibility
DAGS_WEIGHT_OPEN = 0.20        # Open sector in viewing direction
DAGS_WEIGHT_RIM = 0.15         # Rim/elevated position
DAGS_WEIGHT_SUN_LOW = 0.15     # Sun is low (golden light)
DAGS_WEIGHT_SUN_CLEAR = 0.10   # Sun clears horizon
DAGS_WEIGHT_DIR = 0.15         # Directionality (side-lit or contra-jour)

# Directionality preference parameters
# We prefer side-lit (delta ~90°) or contra-jour (delta ~180°) views
DAGS_DIR_SIDE_MU = 90.0        # Side-lit peak (sun to your side)
DAGS_DIR_SIDE_SIGMA = 40.0     # Spread for side-lit preference
DAGS_DIR_CONTRA_MU = 180.0     # Contra-jour peak (sun behind you)
DAGS_DIR_CONTRA_SIGMA = 35.0   # Spread for contra-jour preference

# =============================================================================
# Visual Anchor Score (VAS) Parameters
# =============================================================================
# VAS detects salient features (ridgelines, spires, mesas) in the view cone.
# Enhances DAGS by rewarding views with distinct visual anchors.

# Salience component weights (used to compute per-azimuth salience)
VAS_WEIGHT_CURVATURE = 0.40    # High curvature = knobs, spires, ridges
VAS_WEIGHT_SLOPE_BREAK = 0.35  # High slope break = cliffs, ridgelines
VAS_WEIGHT_RELIEF = 0.25       # High micro-relief = dramatic terrain

# Normalization constants for salience computation
# Based on typical interesting terrain values (p95 in diverse AOIs)
VAS_CURVATURE_NORM = 0.08      # Curvature value for max score
VAS_SLOPE_BREAK_NORM = 20.0    # Slope break degrees for max score
VAS_RELIEF_NORM = 15.0         # Micro-relief meters for max score

# Anchor type classification thresholds
VAS_ANCHOR_SCORE_THRESHOLD = 0.25  # Minimum to qualify as an anchor
VAS_RIDGELINE_SLOPE_BREAK_MIN = 0.4  # Min normalized slope_break for RIDGELINE
VAS_SPIRES_CURVATURE_MIN = 0.4       # Min normalized curvature for SPIRES_KNOBS
VAS_LAYERED_COMPLEXITY_MIN = 6       # Min horizon_complexity for LAYERED_SKYLINE

# Neighborhood size for structure sampling (cells)
VAS_SAMPLE_NEIGHBORHOOD = 2    # Sample ±2 cells around horizon intercept (5x5)

# DAGS + VAS combination formula: dags * (0.7 + 0.3 * anchor_score)
# anchor_score=0 -> 0.7x DAGS, anchor_score=1 -> 1.0x DAGS
VAS_DAGS_BASE_MULT = 0.70      # Base multiplier when no anchor
VAS_DAGS_ANCHOR_MULT = 0.30    # Additional multiplier from anchor

# Multi-depth anchor search parameters
# Searches for anchors at multiple distances, not just horizon intercept
VAS_MULTI_DEPTH_MIN_M = 500.0       # Minimum search distance
VAS_MULTI_DEPTH_MAX_M = 30000.0     # Maximum search distance (cap)
VAS_MULTI_DEPTH_N_SAMPLES = 8       # Number of log-spaced distances per azimuth

# Mid-ground distance preference (Gaussian on log10(distance))
# Photographic anchors often work best at mid-distances (~6km)
VAS_DIST_PREF_MU = 3.778            # log10(6000m) ≈ 3.778
VAS_DIST_PREF_SIGMA = 0.45          # Width of preference Gaussian
VAS_DIST_PREF_BASE = 0.75           # Base weight when far from preferred distance
VAS_DIST_PREF_BOOST = 0.25          # Additional weight at preferred distance

# =============================================================================
# Light-at-Anchor (LAA) Parameters
# =============================================================================
# LAA scores whether the visual anchor feature is receiving direct sunlight.
# This adds "is the anchor glowing?" to "can I see the anchor?".

# Incidence normalization: inc_norm = clamp((incidence + 0.1) / 0.6, 0, 1)
# Shifts the range so slightly back-lit surfaces still get some score
LAA_INCIDENCE_SHIFT = 0.1      # Shift incidence positive
LAA_INCIDENCE_SCALE = 0.6      # Scale factor for normalization

# Shadow penalty: multiply by this factor if anchor is shadowed
LAA_SHADOW_PENALTY = 0.3       # Shadowed anchor gets 30% of base score

# Final score weighting with sun_low_norm
# anchor_light_score = inc_norm * (0.6 + 0.4 * sun_low_norm)
LAA_BASE_WEIGHT = 0.6          # Base weight for incidence
LAA_SUN_LOW_WEIGHT = 0.4       # Additional weight from low sun bonus

# Light type classification thresholds (based on angular difference)
LAA_FRONT_LIT_MAX_DELTA = 45.0       # delta < 45° is front-lit
LAA_SIDE_LIT_MAX_DELTA = 135.0       # 45° <= delta <= 135° is side-lit
LAA_FRONT_LIT_MIN_INCIDENCE = 0.15   # Minimum incidence for front-lit
LAA_SIDE_LIT_MIN_INCIDENCE = 0.10    # Minimum incidence for side-lit
LAA_BACK_LIT_MIN_INCIDENCE = 0.05    # Minimum incidence for back-lit

# Final score combination: distant_glow_with_anchor * (0.75 + 0.25 * anchor_light_score)
LAA_FINAL_BASE_MULT = 0.75     # Base multiplier for final score
LAA_FINAL_LIGHT_MULT = 0.25    # Additional multiplier from anchor light

# =============================================================================
# Glow Window Time-Series Parameters
# =============================================================================
# Evaluates distant_glow_final_score over time to find optimal shooting window.
# Accounts for shadows clearing anchor features over time.

# Time grid parameters
GLOW_WINDOW_SUNRISE_START = 0       # Minutes from sunrise to start evaluation
GLOW_WINDOW_SUNRISE_END = 75        # Minutes from sunrise to end evaluation
GLOW_WINDOW_SUNSET_START = -75      # Minutes from sunset to start evaluation
GLOW_WINDOW_SUNSET_END = 0          # Minutes from sunset to end evaluation
GLOW_WINDOW_STEP_MINUTES = 5        # Time step between evaluations

# Window threshold (relative to peak)
GLOW_WINDOW_GOOD_THRESHOLD = 0.65   # Timestep is "good" if score >= 0.65 * peak_score

# =============================================================================
# View Category Classification
# =============================================================================
# Categories for rim-overlook viewpoints based on view metrics.
# These help photographers quickly understand what type of shot to expect.

# Category constants
CATEGORY_EPIC_OVERLOOK = "EPIC_OVERLOOK"       # Big horizon, deep layers
CATEGORY_DRAMATIC_ENCLOSED = "DRAMATIC_ENCLOSED"  # Enclosed with complex skyline
CATEGORY_QUICK_SCENIC = "QUICK_SCENIC"         # Easy viewpoint, good quick stop

# Thresholds for category classification
EPIC_DEPTH_MIN_M = 5000.0      # Minimum depth_p90 for EPIC (5km sightlines)
EPIC_OPEN_SKY_MIN = 0.50       # Minimum open_sky_fraction for EPIC (50%)
EPIC_SCORE_FALLBACK = 0.75     # Fallback: high overlook_score alone qualifies

DRAMATIC_OPEN_SKY_MAX = 0.40   # Maximum open_sky_fraction for DRAMATIC (enclosed)
DRAMATIC_COMPLEXITY_MIN = 8    # Minimum horizon_complexity for DRAMATIC

# Sector openness parameters
# Instead of full 360° openness, we measure openness in a sector centered on best_bearing
# This better represents the actual shooting direction - a canyon rim enclosed behind
# but open forward should score well
SECTOR_HALF_WIDTH_DEG = 45.0   # Total sector width = 90° (±45° from best_bearing)


@dataclass
class HorizonProfile:
    """Complete horizon profile for a location."""
    samples: List[HorizonSample]
    lat: float
    lon: float
    eye_height_m: float

    @property
    def azimuths(self) -> np.ndarray:
        return np.array([s.azimuth_deg for s in self.samples])

    @property
    def horizon_alts(self) -> np.ndarray:
        return np.array([s.horizon_alt_deg for s in self.samples])

    @property
    def distances(self) -> np.ndarray:
        return np.array([s.distance_to_horizon_m for s in self.samples])


def compute_horizon_profile(
    dem: DEMGrid,
    lat: float,
    lon: float,
    eye_height_m: float = DEFAULT_EYE_HEIGHT_M,
    az_step_deg: float = DEFAULT_AZ_STEP_DEG,
    num_samples: int = DEFAULT_NUM_SAMPLES,
    max_distance_m: Optional[float] = None,
) -> HorizonProfile:
    """
    Compute 360° horizon profile from a viewpoint.

    For each azimuth, traces a ray and finds the maximum terrain angle
    (the effective horizon in that direction).

    Args:
        dem: DEMGrid with elevation data and local coords initialized
        lat: Viewpoint latitude
        lon: Viewpoint longitude
        eye_height_m: Observer eye height above ground
        az_step_deg: Azimuth step in degrees (smaller = more detail)
        num_samples: Number of distance samples per azimuth (log-spaced)
        max_distance_m: Maximum distance to check (default: grid diagonal)

    Returns:
        HorizonProfile with samples for each azimuth
    """
    # Ensure local coordinates are initialized
    if not dem.has_local_coords:
        dem.init_local_coords()

    # Convert viewpoint to local meters
    x0, y0 = dem.latlon_to_xy(lat, lon)

    # Get ground elevation at viewpoint
    ground_z = dem.sample_dem_z_xy(x0, y0)
    if math.isnan(ground_z):
        ground_z = 0.0
    eye_z = ground_z + eye_height_m

    # Distance bounds
    d_min = max(dem.cell_size_m, 10.0)
    d_max = max_distance_m if max_distance_m else min(dem.grid_diagonal_m, 25000.0)

    # Generate log-spaced distances
    if d_max > d_min:
        distances = np.logspace(np.log10(d_min), np.log10(d_max), num_samples)
    else:
        distances = np.array([d_min])

    # Scan all azimuths
    samples = []
    num_azimuths = int(360.0 / az_step_deg)

    for az_idx in range(num_azimuths):
        azimuth_deg = az_idx * az_step_deg
        azimuth_rad = math.radians(azimuth_deg)

        # Direction unit vector (azimuth: 0=N, 90=E)
        dir_x = math.sin(azimuth_rad)  # East component
        dir_y = math.cos(azimuth_rad)  # North component

        # Find maximum terrain angle along this azimuth
        max_terrain_angle_rad = float('-inf')
        max_terrain_distance = d_min

        for d in distances:
            x_m = x0 + dir_x * d
            y_m = y0 + dir_y * d

            terrain_z = dem.sample_dem_z_xy(x_m, y_m)

            if math.isnan(terrain_z):
                # Outside bounds, stop
                break

            # Terrain angle from eye level
            dz = terrain_z - eye_z
            terrain_angle_rad = math.atan(dz / d) if d > 0 else 0.0

            if terrain_angle_rad > max_terrain_angle_rad:
                max_terrain_angle_rad = terrain_angle_rad
                max_terrain_distance = d

        # Convert to degrees
        horizon_alt_deg = math.degrees(max_terrain_angle_rad) if max_terrain_angle_rad > float('-inf') else 0.0

        samples.append(HorizonSample(
            azimuth_deg=azimuth_deg,
            horizon_alt_deg=horizon_alt_deg,
            distance_to_horizon_m=max_terrain_distance,
        ))

    return HorizonProfile(
        samples=samples,
        lat=lat,
        lon=lon,
        eye_height_m=eye_height_m,
    )


def compute_view_metrics(profile: HorizonProfile) -> Tuple[float, float, float, int]:
    """
    Derive view metrics from a horizon profile.

    Returns:
        (open_sky_fraction, depth_p50_m, depth_p90_m, horizon_complexity)
    """
    horizon_alts = profile.horizon_alts
    distances = profile.distances

    # Open sky fraction: azimuths where horizon < 1°
    open_sky_fraction = float(np.sum(horizon_alts < 1.0) / len(horizon_alts))

    # Depth percentiles
    depth_p50_m = float(np.percentile(distances, 50))
    depth_p90_m = float(np.percentile(distances, 90))

    # Horizon complexity: count local maxima (peaks) in the profile
    # Wrap-around aware
    horizon_complexity = count_horizon_peaks(horizon_alts)

    return open_sky_fraction, depth_p50_m, depth_p90_m, horizon_complexity


def count_horizon_peaks(horizon_alts: np.ndarray, min_prominence: float = 2.0) -> int:
    """
    Count local maxima (peaks) in the horizon profile.

    A peak is a local maximum that is at least min_prominence degrees
    higher than its neighbors. Handles wrap-around.

    Args:
        horizon_alts: Array of horizon altitudes in degrees
        min_prominence: Minimum height above neighbors to count as peak

    Returns:
        Number of peaks
    """
    n = len(horizon_alts)
    if n < 3:
        return 0

    peaks = 0
    for i in range(n):
        prev_idx = (i - 1) % n
        next_idx = (i + 1) % n

        val = horizon_alts[i]
        prev_val = horizon_alts[prev_idx]
        next_val = horizon_alts[next_idx]

        # Local maximum check
        if val > prev_val and val > next_val:
            # Prominence check
            min_neighbor = min(prev_val, next_val)
            if val - min_neighbor >= min_prominence:
                peaks += 1

    return peaks


# =============================================================================
# Distant Atmospheric Glow Score (DAGS) Functions
# =============================================================================


def angular_diff_deg(a: float, b: float) -> float:
    """
    Compute the absolute angular difference between two bearings (0-180°).

    Args:
        a: First bearing in degrees (0-360)
        b: Second bearing in degrees (0-360)

    Returns:
        Absolute angular difference (0-180°)
    """
    diff = abs((a % 360.0) - (b % 360.0))
    if diff > 180.0:
        diff = 360.0 - diff
    return diff


def gaussian_preference(x: float, mu: float, sigma: float) -> float:
    """
    Compute Gaussian preference score for a value.

    Returns 1.0 when x == mu, decays based on sigma.

    Args:
        x: Input value
        mu: Peak value (where result = 1.0)
        sigma: Spread parameter

    Returns:
        Score in [0, 1]
    """
    return math.exp(-((x - mu) ** 2) / (2 * sigma ** 2))


def compute_directionality_score(
    view_bearing_deg: float,
    sun_azimuth_deg: float,
) -> tuple:
    """
    Compute directionality score for distant atmospheric glow.

    We prefer:
    - Side-lit views (delta ~90°): sun to your side, creates depth shadows
    - Contra-jour views (delta ~180°): sun behind you, backlit terrain

    Args:
        view_bearing_deg: Best viewing direction (0-360)
        sun_azimuth_deg: Sun azimuth at event (0-360)

    Returns:
        Tuple of (dir_norm, delta_deg, directionality_type)
    """
    delta = angular_diff_deg(view_bearing_deg, sun_azimuth_deg)

    # Compute preference for side-lit and contra-jour
    side_pref = gaussian_preference(delta, DAGS_DIR_SIDE_MU, DAGS_DIR_SIDE_SIGMA)
    contra_pref = gaussian_preference(delta, DAGS_DIR_CONTRA_MU, DAGS_DIR_CONTRA_SIGMA)

    # Take the max (either side-lit OR contra-jour is good)
    dir_norm = max(side_pref, contra_pref)

    # Classify directionality type
    if contra_pref > side_pref and contra_pref > 0.5:
        dir_type = "contra_jour"
    elif side_pref > 0.5:
        dir_type = "side_lit"
    else:
        dir_type = "neutral"

    return dir_norm, delta, dir_type


def compute_distant_glow_score(
    depth_p90_m: float,
    open_sky_sector_fraction: float,
    rim_strength: float,
    sun_altitude_deg: float,
    blocking_margin_deg: float,
    view_bearing_deg: float,
    sun_azimuth_deg: float,
    visual_anchor: Optional[VisualAnchor] = None,
    anchor_light: Optional[AnchorLight] = None,
) -> DistantGlowScore:
    """
    Compute Distant Atmospheric Glow Score (DAGS) for a viewpoint.

    DAGS scores viewpoints for their potential to capture distant atmospheric glow -
    like layered canyon views at sunrise where the "glowing subjects" are miles away.

    Formula:
        DAGS = 0.25*depth_norm + 0.20*open_norm + 0.15*rim_norm +
               0.15*sun_low_norm + 0.10*sun_clear_norm + 0.15*dir_norm

    Combined with VAS:
        combined = dags * (0.70 + 0.30 * anchor_score)

    Final with anchor light:
        final = combined * (0.75 + 0.25 * anchor_light_score)

    Args:
        depth_p90_m: 90th percentile view depth in meters
        open_sky_sector_fraction: Openness in shooting direction (0-1)
        rim_strength: TPI-based rim strength (0-1)
        sun_altitude_deg: Sun altitude at event time
        blocking_margin_deg: Sun altitude - horizon altitude (negative = blocked)
        view_bearing_deg: Best viewing direction
        sun_azimuth_deg: Sun azimuth at event
        visual_anchor: Optional VisualAnchor with anchor score (from VAS)
        anchor_light: Optional AnchorLight with lighting score at anchor

    Returns:
        DistantGlowScore with all components and combined score
    """
    # Compute normalized components
    depth_norm = min(1.0, max(0.0, depth_p90_m / DAGS_DEPTH_MAX_M))
    open_norm = min(1.0, max(0.0, open_sky_sector_fraction))
    rim_norm = min(1.0, max(0.0, rim_strength))

    # Sun low norm: higher when sun is low (golden light)
    # sun_altitude_deg = 0 -> sun_low_norm = 1.0
    # sun_altitude_deg = 15 -> sun_low_norm = 0.0
    sun_low_norm = min(1.0, max(0.0, (DAGS_SUN_LOW_MAX_DEG - sun_altitude_deg) / DAGS_SUN_LOW_MAX_DEG))

    # Sun clear norm: higher when sun clears horizon
    # blocking_margin_deg = -1 -> sun_clear_norm = 0.0 (behind ridge)
    # blocking_margin_deg = 0 -> sun_clear_norm = 0.33
    # blocking_margin_deg = 2 -> sun_clear_norm = 1.0
    sun_clear_norm = min(1.0, max(0.0, (blocking_margin_deg + 1.0) / 3.0))

    # Directionality score
    dir_norm, delta_deg, dir_type = compute_directionality_score(
        view_bearing_deg, sun_azimuth_deg
    )

    # Compute final DAGS score
    distant_glow_score = (
        DAGS_WEIGHT_DEPTH * depth_norm +
        DAGS_WEIGHT_OPEN * open_norm +
        DAGS_WEIGHT_RIM * rim_norm +
        DAGS_WEIGHT_SUN_LOW * sun_low_norm +
        DAGS_WEIGHT_SUN_CLEAR * sun_clear_norm +
        DAGS_WEIGHT_DIR * dir_norm
    )

    # Compute combined score with visual anchor
    # Formula: dags * (0.70 + 0.30 * anchor_score)
    # anchor_score=0 -> 0.70x DAGS, anchor_score=1 -> 1.00x DAGS
    anchor_score = visual_anchor.anchor_score if visual_anchor else 0.0
    combined_score = min(1.0, distant_glow_score * (VAS_DAGS_BASE_MULT + VAS_DAGS_ANCHOR_MULT * anchor_score))

    # Compute final score with anchor light
    # Formula: combined * (0.75 + 0.25 * anchor_light_score)
    # anchor_light_score=0 -> 0.75x combined, anchor_light_score=1 -> 1.00x combined
    anchor_light_score = anchor_light.anchor_light_score if anchor_light else 0.0
    final_score = min(1.0, max(0.0, combined_score * (LAA_FINAL_BASE_MULT + LAA_FINAL_LIGHT_MULT * anchor_light_score)))

    # Generate explanations
    explanation_short, explanation_long = generate_distant_glow_explanations(
        distant_glow_score=distant_glow_score,
        depth_p90_m=depth_p90_m,
        view_bearing_deg=view_bearing_deg,
        sun_azimuth_deg=sun_azimuth_deg,
        delta_deg=delta_deg,
        dir_type=dir_type,
        blocking_margin_deg=blocking_margin_deg,
    )

    # Append anchor info to explanation if present
    if visual_anchor and visual_anchor.anchor_type != "NONE":
        explanation_long = explanation_long.rstrip('.') + f"; {visual_anchor.explanation_short}."

    # Append anchor light info to explanation if present
    if anchor_light:
        explanation_long = explanation_long.rstrip('.') + f"; {anchor_light.explanation_short}."

    return DistantGlowScore(
        distant_glow_score=distant_glow_score,
        distant_glow_type="DISTANT_ATMOSPHERIC",
        depth_norm=depth_norm,
        open_norm=open_norm,
        rim_norm=rim_norm,
        sun_low_norm=sun_low_norm,
        sun_clear_norm=sun_clear_norm,
        dir_norm=dir_norm,
        view_bearing_deg=view_bearing_deg,
        sun_bearing_deg=sun_azimuth_deg,
        bearing_delta_deg=delta_deg,
        directionality_type=dir_type,
        visual_anchor=visual_anchor,
        distant_glow_with_anchor_score=combined_score,
        anchor_light=anchor_light,
        distant_glow_final_score=final_score,
        explanation_short=explanation_short,
        explanation_long=explanation_long,
    )


def generate_distant_glow_explanations(
    distant_glow_score: float,
    depth_p90_m: float,
    view_bearing_deg: float,
    sun_azimuth_deg: float,
    delta_deg: float,
    dir_type: str,
    blocking_margin_deg: float,
) -> tuple:
    """
    Generate human-readable explanations for distant glow potential.

    Args:
        distant_glow_score: Overall DAGS score (0-1)
        depth_p90_m: 90th percentile view depth
        view_bearing_deg: Best viewing direction
        sun_azimuth_deg: Sun azimuth
        delta_deg: Angular difference between view and sun
        dir_type: Directionality type ("side_lit", "contra_jour", "neutral")
        blocking_margin_deg: Sun clearance above horizon

    Returns:
        Tuple of (short_explanation, long_explanation)
    """
    depth_km = depth_p90_m / 1000.0

    # Convert bearings to cardinal directions
    def bearing_to_cardinal(deg: float) -> str:
        directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
                      "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
        idx = int((deg + 11.25) / 22.5) % 16
        return directions[idx]

    view_cardinal = bearing_to_cardinal(view_bearing_deg)
    sun_cardinal = bearing_to_cardinal(sun_azimuth_deg)

    # Short explanation
    if depth_km >= 10.0:
        short = f"Distant layered glow potential (p90 {depth_km:.0f}km)"
    elif depth_km >= 5.0:
        short = f"Good distant glow potential ({depth_km:.1f}km depth)"
    else:
        short = f"Moderate distant views ({depth_km:.1f}km depth)"

    # Long explanation
    long_parts = []

    # Best facing and sun direction
    long_parts.append(f"Best facing {view_cardinal}")

    # Directionality explanation
    if dir_type == "side_lit":
        long_parts.append(f"sun {sun_cardinal} creates side-lit canyon layers")
    elif dir_type == "contra_jour":
        long_parts.append(f"sun {sun_cardinal} behind you for backlit depth")
    else:
        long_parts.append(f"sun at {sun_cardinal}")

    # Sun clearance
    if blocking_margin_deg > 2.0:
        long_parts.append(f"Sun clears skyline by {blocking_margin_deg:.1f}°")
    elif blocking_margin_deg > 0:
        long_parts.append(f"Sun just clears horizon ({blocking_margin_deg:.1f}°)")
    elif blocking_margin_deg > -1.0:
        long_parts.append("Sun near local horizon")
    else:
        long_parts.append(f"Sun blocked by {abs(blocking_margin_deg):.1f}°")

    long = "; ".join(long_parts) + "."

    return short, long


# =============================================================================
# Visual Anchor Score (VAS) Functions
# =============================================================================


def sample_structure_at_point(
    dem: DEMGrid,
    x_m: float,
    y_m: float,
    curvature: np.ndarray,
    slope_break: np.ndarray,
    elevations: np.ndarray,
    neighborhood_cells: int = VAS_SAMPLE_NEIGHBORHOOD,
) -> Tuple[float, float, float]:
    """
    Sample structure metrics at a point in local XY coordinates.

    Samples a small neighborhood around the point and returns max values
    for curvature, slope_break, and local relief (micro-relief).

    Args:
        dem: DEMGrid for coordinate conversion
        x_m: X coordinate in local meters
        y_m: Y coordinate in local meters
        curvature: Curvature grid (pre-computed)
        slope_break: Slope break grid (pre-computed)
        elevations: Elevation grid
        neighborhood_cells: Radius in cells for neighborhood sampling

    Returns:
        Tuple of (max_curvature, max_slope_break, micro_relief)
    """
    rows, cols = curvature.shape

    # Convert XY to row/col indices
    # Use dem's sample function approach - find nearest cell
    row_f = (dem.lats[0] - dem.xy_to_latlon(x_m, y_m)[0]) / (
        (dem.lats[0] - dem.lats[-1]) / (rows - 1)
    ) if rows > 1 else 0
    col_f = (dem.xy_to_latlon(x_m, y_m)[1] - dem.lons[0]) / (
        (dem.lons[-1] - dem.lons[0]) / (cols - 1)
    ) if cols > 1 else 0

    row = int(round(row_f))
    col = int(round(col_f))

    # Clamp to grid bounds
    row = max(0, min(rows - 1, row))
    col = max(0, min(cols - 1, col))

    # Define neighborhood bounds
    r_min = max(0, row - neighborhood_cells)
    r_max = min(rows, row + neighborhood_cells + 1)
    c_min = max(0, col - neighborhood_cells)
    c_max = min(cols, col + neighborhood_cells + 1)

    # Extract neighborhood
    curv_neighborhood = curvature[r_min:r_max, c_min:c_max]
    sb_neighborhood = slope_break[r_min:r_max, c_min:c_max]
    elev_neighborhood = elevations[r_min:r_max, c_min:c_max]

    # Compute metrics
    max_curvature = float(np.max(np.abs(curv_neighborhood))) if curv_neighborhood.size > 0 else 0.0
    max_slope_break = float(np.max(sb_neighborhood)) if sb_neighborhood.size > 0 else 0.0
    micro_relief = float(np.max(elev_neighborhood) - np.min(elev_neighborhood)) if elev_neighborhood.size > 0 else 0.0

    return max_curvature, max_slope_break, micro_relief


def compute_azimuth_salience(
    curvature: float,
    slope_break: float,
    relief: float,
) -> Tuple[float, float, float, float]:
    """
    Compute salience score for a single azimuth from structure metrics.

    Args:
        curvature: Max curvature in neighborhood
        slope_break: Max slope break in neighborhood
        relief: Micro-relief in neighborhood

    Returns:
        Tuple of (total_salience, curv_norm, sb_norm, relief_norm)
    """
    # Normalize each metric (0-1)
    curv_norm = min(1.0, curvature / VAS_CURVATURE_NORM)
    sb_norm = min(1.0, slope_break / VAS_SLOPE_BREAK_NORM)
    relief_norm = min(1.0, relief / VAS_RELIEF_NORM)

    # Weighted combination
    salience = (
        VAS_WEIGHT_CURVATURE * curv_norm +
        VAS_WEIGHT_SLOPE_BREAK * sb_norm +
        VAS_WEIGHT_RELIEF * relief_norm
    )

    return salience, curv_norm, sb_norm, relief_norm


def classify_anchor_type(
    curv_norm: float,
    sb_norm: float,
    anchor_score: float,
    horizon_complexity: int,
) -> str:
    """
    Classify the anchor type based on which metric dominates.

    Args:
        curv_norm: Normalized curvature score (0-1)
        sb_norm: Normalized slope break score (0-1)
        anchor_score: Overall anchor score (0-1)
        horizon_complexity: Number of peaks in horizon profile

    Returns:
        Anchor type: "RIDGELINE", "SPIRES_KNOBS", "LAYERED_SKYLINE", or "NONE"
    """
    if anchor_score < VAS_ANCHOR_SCORE_THRESHOLD:
        return "NONE"

    # Check which metric dominates
    if sb_norm >= VAS_RIDGELINE_SLOPE_BREAK_MIN and sb_norm > curv_norm:
        return "RIDGELINE"
    elif curv_norm >= VAS_SPIRES_CURVATURE_MIN:
        return "SPIRES_KNOBS"
    elif horizon_complexity >= VAS_LAYERED_COMPLEXITY_MIN:
        return "LAYERED_SKYLINE"
    elif anchor_score >= VAS_ANCHOR_SCORE_THRESHOLD:
        # Has some anchor but doesn't fit categories - use most dominant
        if sb_norm > curv_norm:
            return "RIDGELINE"
        else:
            return "SPIRES_KNOBS"

    return "NONE"


def generate_anchor_explanations(
    anchor_score: float,
    anchor_type: str,
    anchor_distance_m: float,
    anchor_bearing_deg: float,
) -> Tuple[str, str]:
    """
    Generate human-readable explanations for the visual anchor.

    Args:
        anchor_score: Overall anchor score (0-1)
        anchor_type: Classified anchor type
        anchor_distance_m: Distance to anchor
        anchor_bearing_deg: Bearing to anchor

    Returns:
        Tuple of (short_explanation, long_explanation)
    """
    def bearing_to_cardinal(deg: float) -> str:
        directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
                      "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
        idx = int((deg + 11.25) / 22.5) % 16
        return directions[idx]

    distance_km = anchor_distance_m / 1000.0
    bearing_cardinal = bearing_to_cardinal(anchor_bearing_deg)

    if anchor_type == "NONE":
        short = "Minimal distinct anchors in view"
        long = "Wide distant glow but minimal distinct anchors for focal interest."
        return short, long

    # Format distance
    if distance_km >= 10.0:
        dist_str = f"~{distance_km:.0f}km"
    else:
        dist_str = f"~{distance_km:.1f}km"

    # Type-specific descriptions
    type_desc = {
        "RIDGELINE": "ridgeline silhouette",
        "SPIRES_KNOBS": "spires/knobs",
        "LAYERED_SKYLINE": "layered skyline",
    }
    type_name = type_desc.get(anchor_type, "visual anchor")

    short = f"Strong skyline anchor {dist_str} at {int(anchor_bearing_deg)}° ({type_name})"
    long = f"Distinct {type_name} at {dist_str} bearing {bearing_cardinal} provides focal interest."

    return short, long


def compute_distance_preference(distance_m: float) -> float:
    """
    Compute mid-ground distance preference multiplier using Gaussian on log10(distance).

    Photographic anchors often work best at mid-distances (~6km).
    Formula: gaussian(log10(d), mu=log10(6000), sigma=0.45)

    Args:
        distance_m: Distance to anchor in meters

    Returns:
        Preference multiplier 0-1 (peaks at ~6km)
    """
    if distance_m <= 0:
        return 0.0

    log_dist = math.log10(distance_m)
    exponent = -0.5 * ((log_dist - VAS_DIST_PREF_MU) / VAS_DIST_PREF_SIGMA) ** 2
    return math.exp(exponent)


def compute_visual_anchor_score(
    dem: DEMGrid,
    profile: HorizonProfile,
    curvature: Optional[np.ndarray],
    slope_break: Optional[np.ndarray],
    elevations: np.ndarray,
    best_bearing_deg: float,
    fov_deg: float = DEFAULT_FOV_DEG,
    horizon_complexity: int = 0,
    use_multi_depth: bool = True,
) -> Optional[VisualAnchor]:
    """
    Compute Visual Anchor Score (VAS) for a viewpoint.

    Multi-depth mode (default): Searches for anchors at multiple distances along
    each azimuth using log-spaced sampling. This finds mid-distance canyon walls,
    river gorges, and benches that make better photographic anchors than the
    far horizon.

    Horizon-only mode: Samples only at horizon intercepts (legacy behavior).

    Args:
        dem: DEMGrid with elevation data and local coordinates
        profile: HorizonProfile with azimuth samples
        curvature: Curvature grid (optional - returns None if not provided)
        slope_break: Slope break grid (optional - returns None if not provided)
        elevations: Elevation grid
        best_bearing_deg: Center of viewing sector
        fov_deg: Field of view width
        horizon_complexity: Number of horizon peaks (for LAYERED_SKYLINE classification)
        use_multi_depth: If True, search at multiple distances; if False, horizon-only

    Returns:
        VisualAnchor with score and classification, or None if grids not available
    """
    # Skip if structure grids not available
    if curvature is None or slope_break is None:
        return None

    # Ensure local coordinates are initialized
    if not dem.has_local_coords:
        dem.init_local_coords()

    # Get viewpoint location in local XY
    x0, y0 = dem.latlon_to_xy(profile.lat, profile.lon)

    # Define sector bounds
    sector_half = fov_deg / 2.0
    sector_min = (best_bearing_deg - sector_half) % 360.0
    sector_max = (best_bearing_deg + sector_half) % 360.0

    # Track best anchor candidate
    best_salience = 0.0
    best_weighted_salience = 0.0
    best_azimuth = best_bearing_deg
    best_distance = 0.0
    best_curv_norm = 0.0
    best_sb_norm = 0.0
    best_relief_norm = 0.0
    candidates_sampled = 0

    # Sample each azimuth in the sector
    for sample in profile.samples:
        az = sample.azimuth_deg
        horizon_distance = sample.distance_to_horizon_m

        # Check if azimuth is in sector (handle wrap-around)
        in_sector = False
        if sector_min <= sector_max:
            in_sector = sector_min <= az <= sector_max
        else:
            # Sector wraps around 360
            in_sector = az >= sector_min or az <= sector_max

        if not in_sector:
            continue

        # Define search distances for this azimuth
        if use_multi_depth:
            # Multi-depth: log-spaced distances from min to min(horizon, max)
            d_min = VAS_MULTI_DEPTH_MIN_M
            d_max = min(horizon_distance, VAS_MULTI_DEPTH_MAX_M)

            if d_max <= d_min:
                # Horizon too close, just sample at horizon
                distances = [horizon_distance] if horizon_distance >= d_min else []
            else:
                # Generate log-spaced distances
                distances = np.logspace(
                    np.log10(d_min),
                    np.log10(d_max),
                    VAS_MULTI_DEPTH_N_SAMPLES
                ).tolist()
        else:
            # Horizon-only: just the horizon distance
            distances = [horizon_distance] if horizon_distance >= VAS_MULTI_DEPTH_MIN_M else []

        # Sample at each distance along this azimuth
        az_rad = math.radians(az)
        sin_az = math.sin(az_rad)
        cos_az = math.cos(az_rad)

        for distance in distances:
            candidates_sampled += 1

            # Compute XY coordinates at this distance
            x_d = x0 + sin_az * distance
            y_d = y0 + cos_az * distance

            # Sample structure at this point
            curv, sb, relief = sample_structure_at_point(
                dem=dem,
                x_m=x_d,
                y_m=y_d,
                curvature=curvature,
                slope_break=slope_break,
                elevations=elevations,
            )

            # Compute raw salience
            salience, curv_norm, sb_norm, relief_norm = compute_azimuth_salience(
                curvature=curv,
                slope_break=sb,
                relief=relief,
            )

            # Apply distance preference for anchor selection
            # (but store raw salience in output)
            dist_pref = compute_distance_preference(distance)
            weighted_salience = salience * (VAS_DIST_PREF_BASE + VAS_DIST_PREF_BOOST * dist_pref)

            # Track best (using weighted salience for selection)
            if weighted_salience > best_weighted_salience:
                best_weighted_salience = weighted_salience
                best_salience = salience  # Store raw salience
                best_azimuth = az
                best_distance = distance
                best_curv_norm = curv_norm
                best_sb_norm = sb_norm
                best_relief_norm = relief_norm

    # Classify anchor type
    anchor_type = classify_anchor_type(
        curv_norm=best_curv_norm,
        sb_norm=best_sb_norm,
        anchor_score=best_salience,
        horizon_complexity=horizon_complexity,
    )

    # Generate explanations
    short, long = generate_anchor_explanations(
        anchor_score=best_salience,
        anchor_type=anchor_type,
        anchor_distance_m=best_distance,
        anchor_bearing_deg=best_azimuth,
    )

    return VisualAnchor(
        anchor_score=best_salience,
        anchor_type=anchor_type,
        anchor_distance_m=best_distance,
        anchor_bearing_deg=best_azimuth,
        curvature_salience=best_curv_norm,
        slope_break_salience=best_sb_norm,
        relief_salience=best_relief_norm,
        explanation_short=short,
        explanation_long=long,
        anchor_search_mode="MULTI_DEPTH" if use_multi_depth else "HORIZON_ONLY",
        anchor_candidates_sampled=candidates_sampled,
        best_candidate_distance_m=best_distance,
    )


# =============================================================================
# Light-at-Anchor (LAA) Functions
# =============================================================================


def compute_surface_normal_at_point(
    slope_deg: float,
    aspect_deg: float,
) -> Tuple[float, float, float]:
    """
    Compute surface normal unit vector from slope and aspect at a single point.

    Convention:
    - X: East (+)
    - Y: North (+)
    - Z: Up (+)

    Args:
        slope_deg: Slope angle from horizontal (0=flat, 90=vertical)
        aspect_deg: Downslope direction (compass bearing, 0=N, 90=E)

    Returns:
        (Nx, Ny, Nz) unit normal vector
    """
    slope_rad = math.radians(slope_deg)
    aspect_rad = math.radians(aspect_deg)

    # Face direction is opposite of aspect (upslope direction)
    face_rad = aspect_rad + math.pi

    # Horizontal component of normal
    horiz = math.sin(slope_rad)

    # Normal components
    Nx = horiz * math.sin(face_rad)  # East component
    Ny = horiz * math.cos(face_rad)  # North component
    Nz = math.cos(slope_rad)          # Vertical component

    return (Nx, Ny, Nz)


def classify_anchor_light_type(
    delta_deg: float,
    incidence: float,
    anchor_shadowed: bool,
    sun_altitude_deg: float,
) -> str:
    """
    Classify the lighting type at the anchor based on geometry.

    Args:
        delta_deg: Angular difference between view bearing and sun azimuth
        incidence: Dot product of surface normal and sun vector (-1 to +1)
        anchor_shadowed: Whether the anchor is in shadow
        sun_altitude_deg: Sun altitude above horizon

    Returns:
        One of: "FRONT_LIT", "SIDE_LIT", "BACK_LIT", "RIM_LIT"
    """
    # RIM_LIT: Surface facing away from sun but sun is near horizon
    # and anchor is not shadowed - potential for edge glow
    if incidence <= 0 and not anchor_shadowed and sun_altitude_deg < 10.0:
        return "RIM_LIT"

    # FRONT_LIT: Camera and sun on same side, high incidence
    if delta_deg < LAA_FRONT_LIT_MAX_DELTA and incidence > LAA_FRONT_LIT_MIN_INCIDENCE:
        return "FRONT_LIT"

    # SIDE_LIT: Sun at ~90° to viewing direction
    if delta_deg <= LAA_SIDE_LIT_MAX_DELTA and incidence > LAA_SIDE_LIT_MIN_INCIDENCE:
        return "SIDE_LIT"

    # BACK_LIT: Camera opposite sun, low but positive incidence (atmospheric layering)
    if delta_deg > LAA_SIDE_LIT_MAX_DELTA and incidence > LAA_BACK_LIT_MIN_INCIDENCE:
        return "BACK_LIT"

    # Default to BACK_LIT for all other cases
    return "BACK_LIT"


def generate_anchor_light_explanations(
    incidence: float,
    light_type: str,
    anchor_shadowed: bool,
    anchor_light_score: float,
) -> Tuple[str, str]:
    """
    Generate human-readable explanations for anchor light conditions.

    Args:
        incidence: Sun incidence at anchor (-1 to +1)
        light_type: Light type classification
        anchor_shadowed: Whether anchor is in shadow
        anchor_light_score: Overall anchor light score

    Returns:
        (short_explanation, long_explanation)
    """
    # Format light type for display
    light_type_display = light_type.lower().replace("_", "-")

    # Short explanation
    if anchor_shadowed:
        short = f"Anchor shadowed ({light_type_display})"
    else:
        short = f"Anchor is {light_type_display} (incidence {incidence:.2f})"

    # Long explanation
    if anchor_shadowed:
        long = (
            f"Anchor feature is in shadow at this time, limiting glow potential. "
            f"Light type would be {light_type_display} with incidence {incidence:.2f}."
        )
    else:
        if light_type == "FRONT_LIT":
            long = (
                f"Anchor receives direct frontal light (incidence {incidence:.2f}). "
                f"Good for warm glowing surfaces facing the camera."
            )
        elif light_type == "SIDE_LIT":
            long = (
                f"Anchor is side-lit (incidence {incidence:.2f}). "
                f"Good for texture and depth in layered terrain."
            )
        elif light_type == "RIM_LIT":
            long = (
                f"Anchor has rim-light potential with low sun (incidence {incidence:.2f}). "
                f"May produce edge glow or silhouette effects."
            )
        else:  # BACK_LIT
            long = (
                f"Anchor is back-lit (incidence {incidence:.2f}). "
                f"Produces atmospheric layering with distant haze."
            )

    return short, long


def compute_anchor_light_score(
    dem: DEMGrid,
    anchor_lat: float,
    anchor_lon: float,
    sun_position: SunPosition,
    view_bearing_deg: float,
    slope_grid: Optional[np.ndarray] = None,
    aspect_grid: Optional[np.ndarray] = None,
    sun_low_norm: float = 0.5,
) -> Optional[AnchorLight]:
    """
    Compute Light-at-Anchor score for a visual anchor point.

    Estimates whether the anchor feature is lit by:
    1. Sampling surface orientation at anchor point
    2. Computing sun incidence (dot product of normal and sun vector)
    3. Running shadow check at anchor
    4. Classifying light type and computing score

    Args:
        dem: DEMGrid with elevation data
        anchor_lat: Latitude of anchor point
        anchor_lon: Longitude of anchor point
        sun_position: Sun position at event time
        view_bearing_deg: Viewing direction from camera to anchor
        slope_grid: Pre-computed slope grid (optional)
        aspect_grid: Pre-computed aspect grid (optional)
        sun_low_norm: Normalized sun altitude score (0-1, higher = lower sun)

    Returns:
        AnchorLight with incidence, light type, shadow status, and score
        Returns None if anchor is outside DEM bounds
    """
    # Ensure local coordinates are initialized
    if not dem.has_local_coords:
        dem.init_local_coords()

    # Get row/col from lat/lon directly using the DEM's coordinate arrays
    rows, cols = dem.elevations.shape

    # Check if anchor is within DEM bounds
    if (anchor_lat < dem.bounds["south"] or anchor_lat > dem.bounds["north"] or
        anchor_lon < dem.bounds["west"] or anchor_lon > dem.bounds["east"]):
        return None

    # Convert lat/lon to row/col indices
    # lats array goes from north (low row) to south (high row)
    lat_span = dem.lats[0] - dem.lats[-1]  # North - South (positive)
    lat_offset = dem.lats[0] - anchor_lat  # Distance from north edge
    row = int((lat_offset / lat_span) * (rows - 1)) if lat_span > 0 else 0

    # lons array goes from west (low col) to east (high col)
    lon_span = dem.lons[-1] - dem.lons[0]  # East - West (positive)
    lon_offset = anchor_lon - dem.lons[0]  # Distance from west edge
    col = int((lon_offset / lon_span) * (cols - 1)) if lon_span > 0 else 0

    # Clamp to valid range
    row = max(0, min(rows - 1, row))
    col = max(0, min(cols - 1, col))

    # Get slope and aspect at anchor
    if slope_grid is not None and aspect_grid is not None:
        anchor_slope = float(slope_grid[row, col])
        anchor_aspect = float(aspect_grid[row, col])
    else:
        # Compute locally if grids not provided
        from .analysis import compute_slope_aspect
        slope_grid_local, aspect_grid_local = compute_slope_aspect(dem)
        anchor_slope = float(slope_grid_local[row, col])
        anchor_aspect = float(aspect_grid_local[row, col])

    # Compute surface normal at anchor
    Nx, Ny, Nz = compute_surface_normal_at_point(anchor_slope, anchor_aspect)

    # Get sun vector
    Sx, Sy, Sz = sun_position.vector

    # Compute incidence (dot product)
    incidence = Nx * Sx + Ny * Sy + Nz * Sz

    # Check shadow at anchor
    from .shadows import check_shadow
    anchor_elevation = float(dem.elevations[row, col])
    shadow_check = check_shadow(
        dem=dem,
        point_lat=anchor_lat,
        point_lon=anchor_lon,
        point_elevation=anchor_elevation,
        sun_position=sun_position,
    )
    anchor_shadowed = not shadow_check.sun_visible

    # Compute angular difference between view and sun
    delta_deg = angular_diff_deg(view_bearing_deg, sun_position.azimuth_deg)

    # Classify light type
    light_type = classify_anchor_light_type(
        delta_deg=delta_deg,
        incidence=incidence,
        anchor_shadowed=anchor_shadowed,
        sun_altitude_deg=sun_position.altitude_deg,
    )

    # Compute anchor light score
    # inc_norm = clamp((incidence + 0.1) / 0.6, 0, 1)
    inc_norm = min(1.0, max(0.0, (incidence + LAA_INCIDENCE_SHIFT) / LAA_INCIDENCE_SCALE))

    # Apply shadow penalty
    if anchor_shadowed:
        inc_norm *= LAA_SHADOW_PENALTY

    # Boost for low sun: anchor_light_score = inc_norm * (0.6 + 0.4 * sun_low_norm)
    anchor_light_score = inc_norm * (LAA_BASE_WEIGHT + LAA_SUN_LOW_WEIGHT * sun_low_norm)
    anchor_light_score = min(1.0, max(0.0, anchor_light_score))

    # Generate explanations
    short, long = generate_anchor_light_explanations(
        incidence=incidence,
        light_type=light_type,
        anchor_shadowed=anchor_shadowed,
        anchor_light_score=anchor_light_score,
    )

    return AnchorLight(
        anchor_sun_incidence=incidence,
        anchor_light_type=light_type,
        anchor_shadowed=anchor_shadowed,
        anchor_light_score=anchor_light_score,
        anchor_slope_deg=anchor_slope,
        anchor_aspect_deg=anchor_aspect,
        explanation_short=short,
        explanation_long=long,
    )


def compute_anchor_location(
    dem: DEMGrid,
    viewpoint_lat: float,
    viewpoint_lon: float,
    anchor_bearing_deg: float,
    anchor_distance_m: float,
) -> Tuple[float, float]:
    """
    Compute the lat/lon of an anchor point given viewpoint and bearing/distance.

    Args:
        dem: DEMGrid (used for coordinate conversion)
        viewpoint_lat: Latitude of viewpoint
        viewpoint_lon: Longitude of viewpoint
        anchor_bearing_deg: Bearing from viewpoint to anchor (0=N, 90=E)
        anchor_distance_m: Distance to anchor in meters

    Returns:
        (anchor_lat, anchor_lon)
    """
    if not dem.has_local_coords:
        dem.init_local_coords()

    # Convert viewpoint to local XY
    x0, y0 = dem.latlon_to_xy(viewpoint_lat, viewpoint_lon)

    # Compute anchor position in local XY
    bearing_rad = math.radians(anchor_bearing_deg)
    dx = anchor_distance_m * math.sin(bearing_rad)  # East component
    dy = anchor_distance_m * math.cos(bearing_rad)  # North component

    x_anchor = x0 + dx
    y_anchor = y0 + dy

    # Convert back to lat/lon
    anchor_lat, anchor_lon = dem.xy_to_latlon(x_anchor, y_anchor)

    return anchor_lat, anchor_lon


# =============================================================================
# Glow Window Time-Series Functions
# =============================================================================


def compute_sun_position_at_offset(
    base_sun_position: SunPosition,
    offset_minutes: float,
    event_type: str,
    lat: float,
    lon: float,
) -> SunPosition:
    """
    DEPRECATED: Use generate_glow_window_sun_track() instead for accurate ephemeris.

    This function uses a linear approximation (~0.25°/min) that is unreliable
    across latitudes and seasons.

    Compute sun position at a time offset from the base position.

    Uses simple solar geometry approximation for short time offsets.

    Args:
        base_sun_position: Sun position at event time (sunrise/sunset)
        offset_minutes: Minutes from event (positive = after event)
        event_type: "sunrise" or "sunset"
        lat: Observer latitude
        lon: Observer longitude

    Returns:
        SunPosition at the offset time
    """
    warnings.warn(
        "compute_sun_position_at_offset is deprecated. Use generate_glow_window_sun_track() "
        "with real ephemeris for accurate sun positions.",
        DeprecationWarning,
        stacklevel=2,
    )
    # Sun moves ~0.25° per minute in altitude near sunrise/sunset
    # Azimuth change is more complex but we can approximate
    altitude_rate_deg_per_min = 0.25 if event_type == "sunrise" else -0.25

    # For azimuth, sun moves roughly 15°/hour = 0.25°/minute
    # But this varies with season and latitude - use simple approximation
    azimuth_rate_deg_per_min = 0.25 if event_type == "sunrise" else 0.25

    new_altitude = base_sun_position.altitude_deg + offset_minutes * altitude_rate_deg_per_min
    new_azimuth = (base_sun_position.azimuth_deg + offset_minutes * azimuth_rate_deg_per_min) % 360.0

    # Compute new sun vector
    az_rad = math.radians(new_azimuth)
    alt_rad = math.radians(new_altitude)

    # Sun vector: (Sx, Sy, Sz) where X=East, Y=North, Z=Up
    Sx = math.sin(az_rad) * math.cos(alt_rad)
    Sy = math.cos(az_rad) * math.cos(alt_rad)
    Sz = math.sin(alt_rad)

    return SunPosition(
        time_iso=f"{base_sun_position.time_iso}+{offset_minutes}min",
        minutes_from_start=base_sun_position.minutes_from_start + offset_minutes,
        altitude_deg=new_altitude,
        azimuth_deg=new_azimuth,
        vector=(Sx, Sy, Sz),
    )


def generate_glow_window_sun_track(
    lat: float,
    lon: float,
    event_date: datetime,
    event_type: str,
) -> List[SunPosition]:
    """
    Generate sun track for glow window evaluation using real ephemeris.

    Precomputes sun positions at 5-minute intervals for the glow window:
    - Sunrise: minutes 0, 5, 10, ..., 75 (16 timesteps)
    - Sunset: minutes -75, -70, ..., 0 (16 timesteps)

    This replaces the deprecated linear approximation in compute_sun_position_at_offset().

    Design choice: Option A - compute sun_track at AOI center lat/lon and reuse
    for all viewpoints. This is fast (16 ephemeris calls per request) and the
    sun position difference across typical AOI sizes (5-20km) is negligible
    (<0.01° at most latitudes).

    Args:
        lat: Center latitude of AOI (or viewpoint latitude)
        lon: Center longitude of AOI (or viewpoint longitude)
        event_date: Date of the sunrise/sunset event
        event_type: "sunrise" or "sunset"

    Returns:
        List of SunPosition objects, one per timestep, sorted by minutes.
        Each SunPosition has minutes stored in minutes_from_start field.
    """
    # Find the event time (sunrise or sunset)
    event_time = find_sunrise_sunset(lat, lon, event_date, event_type)

    # Use event date as reference for consistent day-of-year calculations
    reference_date = event_date

    # Define time offsets based on event type
    if event_type == "sunrise":
        time_offsets = list(range(
            GLOW_WINDOW_SUNRISE_START,
            GLOW_WINDOW_SUNRISE_END + 1,
            GLOW_WINDOW_STEP_MINUTES
        ))
    else:
        time_offsets = list(range(
            GLOW_WINDOW_SUNSET_START,
            GLOW_WINDOW_SUNSET_END + 1,
            GLOW_WINDOW_STEP_MINUTES
        ))

    # Generate sun positions using real ephemeris
    sun_track: List[SunPosition] = []

    for minutes in time_offsets:
        dt = event_time + timedelta(minutes=minutes)
        azimuth, altitude = compute_sun_position(lat, lon, dt, reference_date)
        vector = compute_sun_vector(azimuth, altitude)

        sun_track.append(SunPosition(
            time_iso=dt.isoformat() + "Z",
            minutes_from_start=float(minutes),
            azimuth_deg=azimuth,
            altitude_deg=altitude,
            vector=vector,
        ))

    return sun_track


def compute_timestep_score(
    dem: DEMGrid,
    sun_position: SunPosition,
    view_bearing_deg: float,
    depth_p90_m: float,
    open_sky_sector_fraction: float,
    rim_strength: float,
    blocking_margin_deg: float,
    anchor_lat: float,
    anchor_lon: float,
    anchor_score: float,
    slope_grid: Optional[np.ndarray] = None,
    aspect_grid: Optional[np.ndarray] = None,
) -> Tuple[float, float, bool]:
    """
    Compute distant_glow_final_score at a single timestep.

    Recomputes only sun-dependent values: sun_low_norm, sun_clear_norm,
    dir_norm, and AnchorLight (incidence + shadow).

    Args:
        dem: DEMGrid with elevation data
        sun_position: Sun position at this timestep
        view_bearing_deg: Best viewing direction (fixed)
        depth_p90_m: View depth (fixed)
        open_sky_sector_fraction: Sector openness (fixed)
        rim_strength: TPI-based rim strength (fixed)
        blocking_margin_deg: Sun-horizon margin (recomputed from sun position)
        anchor_lat: Anchor latitude
        anchor_lon: Anchor longitude
        anchor_score: VAS anchor score (fixed)
        slope_grid: Pre-computed slope grid
        aspect_grid: Pre-computed aspect grid

    Returns:
        (final_score, anchor_light_score, anchor_shadowed)
    """
    # Recompute sun-dependent normalized components
    sun_low_norm = min(1.0, max(0.0,
        (DAGS_SUN_LOW_MAX_DEG - sun_position.altitude_deg) / DAGS_SUN_LOW_MAX_DEG))

    # Blocking margin based on sun altitude vs local horizon
    # For simplicity, use the blocking margin relative to sun altitude
    adjusted_margin = sun_position.altitude_deg  # Simplified: assume horizon at 0
    sun_clear_norm = min(1.0, max(0.0, (adjusted_margin + 1.0) / 3.0))

    # Directionality score
    dir_norm, _, _ = compute_directionality_score(
        view_bearing_deg, sun_position.azimuth_deg
    )

    # Compute DAGS base score (with fixed view metrics)
    depth_norm = min(1.0, max(0.0, depth_p90_m / DAGS_DEPTH_MAX_M))
    open_norm = min(1.0, max(0.0, open_sky_sector_fraction))
    rim_norm = min(1.0, max(0.0, rim_strength))

    dags = (
        DAGS_WEIGHT_DEPTH * depth_norm +
        DAGS_WEIGHT_OPEN * open_norm +
        DAGS_WEIGHT_RIM * rim_norm +
        DAGS_WEIGHT_SUN_LOW * sun_low_norm +
        DAGS_WEIGHT_SUN_CLEAR * sun_clear_norm +
        DAGS_WEIGHT_DIR * dir_norm
    )

    # Compute combined DAGS + VAS score
    combined_score = min(1.0, dags * (VAS_DAGS_BASE_MULT + VAS_DAGS_ANCHOR_MULT * anchor_score))

    # Compute anchor light at this timestep
    anchor_light = compute_anchor_light_score(
        dem=dem,
        anchor_lat=anchor_lat,
        anchor_lon=anchor_lon,
        sun_position=sun_position,
        view_bearing_deg=view_bearing_deg,
        slope_grid=slope_grid,
        aspect_grid=aspect_grid,
        sun_low_norm=sun_low_norm,
    )

    if anchor_light is not None:
        anchor_light_score = anchor_light.anchor_light_score
        anchor_shadowed = anchor_light.anchor_shadowed
    else:
        anchor_light_score = 0.0
        anchor_shadowed = True

    # Compute final score
    final_score = min(1.0, max(0.0,
        combined_score * (LAA_FINAL_BASE_MULT + LAA_FINAL_LIGHT_MULT * anchor_light_score)))

    return final_score, anchor_light_score, anchor_shadowed


def compute_glow_window(
    dem: DEMGrid,
    sun_track: List[SunPosition],
    view_bearing_deg: float,
    depth_p90_m: float,
    open_sky_sector_fraction: float,
    rim_strength: float,
    blocking_margin_deg: float,
    visual_anchor: VisualAnchor,
    viewpoint_lat: float,
    viewpoint_lon: float,
    slope_grid: Optional[np.ndarray] = None,
    aspect_grid: Optional[np.ndarray] = None,
    include_debug: bool = False,
) -> Optional[DistantGlowWindow]:
    """
    Compute glow window time-series for distant atmospheric glow.

    Evaluates distant_glow_final_score over a time grid around sunrise/sunset
    to find the optimal shooting window.

    Uses precomputed sun_track with real ephemeris positions instead of
    linear approximation, ensuring accurate timing across all latitudes/seasons.

    Args:
        dem: DEMGrid with elevation data
        sun_track: Precomputed sun positions from generate_glow_window_sun_track().
                   Each entry must have minutes_from_start set to the offset.
        view_bearing_deg: Best viewing direction
        depth_p90_m: View depth
        open_sky_sector_fraction: Sector openness
        rim_strength: TPI-based rim strength
        blocking_margin_deg: Sun-horizon margin at event time
        visual_anchor: VAS result with anchor location
        viewpoint_lat: Viewpoint latitude
        viewpoint_lon: Viewpoint longitude
        slope_grid: Pre-computed slope grid
        aspect_grid: Pre-computed aspect grid
        include_debug: If True, include full score_series in output

    Returns:
        DistantGlowWindow with peak, window metrics, and optional debug series
    """
    if visual_anchor is None or visual_anchor.anchor_type == "NONE":
        return None

    if not sun_track:
        return None

    # Compute anchor location
    anchor_lat, anchor_lon = compute_anchor_location(
        dem=dem,
        viewpoint_lat=viewpoint_lat,
        viewpoint_lon=viewpoint_lon,
        anchor_bearing_deg=visual_anchor.anchor_bearing_deg,
        anchor_distance_m=visual_anchor.anchor_distance_m,
    )

    # Evaluate at each timestep using precomputed sun positions
    samples: List[DistantGlowWindowSample] = []
    peak_score = 0.0
    peak_minutes = 0
    peak_anchor_light_score = 0.0
    sun_clears_ridge_minutes: Optional[int] = None
    previous_shadowed = True

    for sun_pos in sun_track:
        # Get minutes offset from the sun position
        offset = int(sun_pos.minutes_from_start)

        # Compute score at this timestep
        final_score, anchor_light_score, anchor_shadowed = compute_timestep_score(
            dem=dem,
            sun_position=sun_pos,
            view_bearing_deg=view_bearing_deg,
            depth_p90_m=depth_p90_m,
            open_sky_sector_fraction=open_sky_sector_fraction,
            rim_strength=rim_strength,
            blocking_margin_deg=blocking_margin_deg,
            anchor_lat=anchor_lat,
            anchor_lon=anchor_lon,
            anchor_score=visual_anchor.anchor_score,
            slope_grid=slope_grid,
            aspect_grid=aspect_grid,
        )

        # Record sample
        sample = DistantGlowWindowSample(
            minutes=offset,
            final_score=final_score,
            anchor_light_score=anchor_light_score,
            anchor_shadowed=anchor_shadowed,
            sun_altitude_deg=sun_pos.altitude_deg,
            sun_azimuth_deg=sun_pos.azimuth_deg,
        )
        samples.append(sample)

        # Track peak
        if final_score > peak_score:
            peak_score = final_score
            peak_minutes = offset
            peak_anchor_light_score = anchor_light_score

        # Detect sun clearing ridge (first transition from shadowed to clear)
        if previous_shadowed and not anchor_shadowed and sun_clears_ridge_minutes is None:
            sun_clears_ridge_minutes = offset
        previous_shadowed = anchor_shadowed

    # Find good window (contiguous run of timesteps >= 0.65 * peak_score)
    threshold = GLOW_WINDOW_GOOD_THRESHOLD * peak_score
    good_runs: List[Tuple[int, int]] = []
    current_run_start: Optional[int] = None

    for sample in samples:
        if sample.final_score >= threshold:
            if current_run_start is None:
                current_run_start = sample.minutes
        else:
            if current_run_start is not None:
                good_runs.append((current_run_start, samples[samples.index(sample) - 1].minutes))
                current_run_start = None

    # Close final run if still open
    if current_run_start is not None:
        good_runs.append((current_run_start, samples[-1].minutes))

    # Find longest run
    if good_runs:
        longest_run = max(good_runs, key=lambda r: r[1] - r[0])
        window_start = longest_run[0]
        window_end = longest_run[1]
        window_duration = window_end - window_start
    else:
        window_start = peak_minutes
        window_end = peak_minutes
        window_duration = 0

    return DistantGlowWindow(
        start_minutes=window_start,
        end_minutes=window_end,
        peak_minutes=peak_minutes,
        duration_minutes=window_duration,
        peak_score=peak_score,
        peak_anchor_light_score=peak_anchor_light_score,
        sun_clears_ridge_minutes=sun_clears_ridge_minutes,
        score_series=samples if include_debug else None,
    )


def compute_sector_openness(
    profile: HorizonProfile,
    center_bearing_deg: float,
    sector_half_width_deg: float = SECTOR_HALF_WIDTH_DEG,
) -> float:
    """
    Compute openness fraction within a sector centered on a bearing.

    This is more useful than full 360° openness for scoring viewpoints.
    A canyon rim that's enclosed behind but open forward should score well.

    Args:
        profile: HorizonProfile with azimuth samples
        center_bearing_deg: Center of the sector (typically best_bearing_deg)
        sector_half_width_deg: Half-width of the sector (default 45° = 90° total)

    Returns:
        Fraction of samples in sector with horizon_alt < 1° (0-1)
    """
    azimuths = profile.azimuths
    horizon_alts = profile.horizon_alts

    n = len(azimuths)
    if n == 0:
        return 0.0

    # Compute azimuth step (assumes uniform sampling)
    az_step = 360.0 / n

    # Normalize center bearing to 0-360
    center = center_bearing_deg % 360.0

    # Count samples within sector that are open (horizon < 1°)
    open_count = 0
    sector_count = 0

    for i, az in enumerate(azimuths):
        # Compute angular distance from center (wrap-around aware)
        diff = abs(az - center)
        if diff > 180.0:
            diff = 360.0 - diff

        # Check if within sector
        if diff <= sector_half_width_deg:
            sector_count += 1
            if horizon_alts[i] < 1.0:
                open_count += 1

    if sector_count == 0:
        return 0.0

    return float(open_count) / float(sector_count)


def find_best_bearing(
    profile: HorizonProfile,
    fov_deg: float = DEFAULT_FOV_DEG,
) -> Tuple[float, float]:
    """
    Find the best viewing bearing based on openness and depth.

    Scores each azimuth by a combination of:
    - Low horizon altitude (open view)
    - High distance to horizon (deep view)

    Args:
        profile: Horizon profile
        fov_deg: Field of view to consider (averages over this range)

    Returns:
        (best_bearing_deg, score)
    """
    horizon_alts = profile.horizon_alts
    distances = profile.distances
    azimuths = profile.azimuths

    n = len(azimuths)
    half_fov_samples = max(1, int((fov_deg / 2) / (360.0 / n)))

    best_score = float('-inf')
    best_bearing = 0.0

    for i in range(n):
        # Average over FOV range (wrap-around)
        indices = [(i + j) % n for j in range(-half_fov_samples, half_fov_samples + 1)]

        avg_horizon = np.mean([horizon_alts[j] for j in indices])
        avg_depth = np.mean([distances[j] for j in indices])

        # Score: prefer low horizon (open) and high depth
        # Normalize: horizon 0° = 1.0, horizon 45° = 0
        openness = max(0, 1.0 - avg_horizon / 45.0)
        depth_norm = min(1.0, avg_depth / DEPTH_NORMALIZATION_M)

        score = openness * depth_norm

        if score > best_score:
            best_score = score
            best_bearing = azimuths[i]

    return best_bearing, best_score


def compute_sun_alignment(
    profile: HorizonProfile,
    sun_position: SunPosition,
) -> SunAlignment:
    """
    Compute sun position relative to local horizon.

    Interpolates horizon altitude at the sun's azimuth to determine
    if sun is behind local terrain.

    Args:
        profile: Horizon profile
        sun_position: Sun position with azimuth and altitude

    Returns:
        SunAlignment with blocking info
    """
    # Find horizon altitude at sun's azimuth (interpolate)
    azimuths = profile.azimuths
    horizon_alts = profile.horizon_alts

    sun_az = sun_position.azimuth_deg % 360.0

    # Find bracketing samples
    n = len(azimuths)
    az_step = 360.0 / n

    idx_low = int(sun_az / az_step) % n
    idx_high = (idx_low + 1) % n

    # Linear interpolation
    az_low = azimuths[idx_low]
    az_high = azimuths[idx_high] if idx_high > idx_low else azimuths[idx_high] + 360.0
    sun_az_interp = sun_az if sun_az >= az_low else sun_az + 360.0

    if az_high > az_low:
        t = (sun_az_interp - az_low) / (az_high - az_low)
    else:
        t = 0.0

    horizon_at_sun = horizon_alts[idx_low] * (1 - t) + horizon_alts[idx_high] * t

    # Blocking analysis
    blocking_margin = sun_position.altitude_deg - horizon_at_sun
    behind_ridge = blocking_margin <= 0.1  # Sun at or below horizon

    return SunAlignment(
        sun_azimuth_deg=sun_position.azimuth_deg,
        sun_altitude_deg=sun_position.altitude_deg,
        horizon_alt_at_sun_az_deg=float(horizon_at_sun),
        blocking_margin_deg=float(blocking_margin),
        behind_ridge=behind_ridge,
    )


def compute_overlook_score(
    open_sky_sector_fraction: float,
    depth_p90_m: float,
    horizon_complexity: int,
    rim_strength: float = 0.0,
) -> float:
    """
    Compute overall overlook quality score.

    Uses sector-based openness (in shooting direction) rather than full 360°.
    This ensures a canyon rim that's enclosed behind but open forward scores well.

    Args:
        open_sky_sector_fraction: Fraction of open azimuths in shooting sector (0-1)
        depth_p90_m: 90th percentile view depth
        horizon_complexity: Number of horizon peaks
        rim_strength: TPI-based rim strength (0-1)

    Returns:
        overlook_score (0-1)
    """
    # Normalize inputs
    depth_norm = min(1.0, depth_p90_m / DEPTH_NORMALIZATION_M)
    complexity_norm = min(1.0, horizon_complexity / COMPLEXITY_NORMALIZATION)

    # Weighted combination (uses sector openness, not full 360°)
    score = (
        WEIGHT_DEPTH * depth_norm +
        WEIGHT_OPEN_SKY * open_sky_sector_fraction +
        WEIGHT_COMPLEXITY * complexity_norm +
        WEIGHT_RIM_STRENGTH * rim_strength
    )

    return min(1.0, max(0.0, score))


def classify_view_category(
    depth_p90_m: float,
    open_sky_fraction: float,
    horizon_complexity: int,
    overlook_score: float,
    open_sky_sector_fraction: Optional[float] = None,
) -> str:
    """
    Classify a viewpoint into one of three categories based on view metrics.

    Categories:
    - EPIC_OVERLOOK: Big horizon with deep layers. Wide-open views that
      showcase vast landscapes. Ideal for sunrise/sunset layered shots.
    - DRAMATIC_ENCLOSED: Enclosed canyon or valley with complex skyline.
      Good for silhouettes and dramatic framing. Think slot canyons, gorges.
    - QUICK_SCENIC: Easy viewpoint, good for a quick stop. Pleasant views
      but not as dramatic. Still worth visiting for casual photography.

    Args:
        depth_p90_m: 90th percentile view depth in meters
        open_sky_fraction: Full 360° openness (used for DRAMATIC check)
        horizon_complexity: Number of peaks in horizon profile
        overlook_score: Overall overlook quality score (0-1)
        open_sky_sector_fraction: Sector openness in shooting direction (used for EPIC check)

    Returns:
        Category string: EPIC_OVERLOOK, DRAMATIC_ENCLOSED, or QUICK_SCENIC
    """
    # Use sector openness for EPIC check if available, else fall back to full 360°
    epic_openness = open_sky_sector_fraction if open_sky_sector_fraction is not None else open_sky_fraction

    # EPIC_OVERLOOK: Deep sightlines AND wide-open in shooting direction OR very high score
    if (depth_p90_m >= EPIC_DEPTH_MIN_M and epic_openness >= EPIC_OPEN_SKY_MIN):
        return CATEGORY_EPIC_OVERLOOK
    if overlook_score >= EPIC_SCORE_FALLBACK:
        return CATEGORY_EPIC_OVERLOOK

    # DRAMATIC_ENCLOSED: Enclosed overall (low full 360° open sky) with complex skyline
    # Uses full 360° openness - that's the point of "enclosed"
    if open_sky_fraction < DRAMATIC_OPEN_SKY_MAX and horizon_complexity >= DRAMATIC_COMPLEXITY_MIN:
        return CATEGORY_DRAMATIC_ENCLOSED

    # QUICK_SCENIC: Everything else
    return CATEGORY_QUICK_SCENIC


def generate_view_cone(
    dem: DEMGrid,
    lat: float,
    lon: float,
    best_bearing_deg: float,
    fov_deg: float,
    depth_p50_m: Optional[float] = None,
) -> List[List[float]]:
    """
    Generate a view cone polygon for map rendering.

    The cone is a triangle with apex at the location, extending toward
    the best viewing direction.

    Args:
        dem: DEMGrid with local coordinate helpers
        lat: Apex latitude
        lon: Apex longitude
        best_bearing_deg: Center direction of the cone
        fov_deg: Field of view angle
        depth_p50_m: Median view depth (for cone range)

    Returns:
        List of [lat, lon] points: [apex, left, right, apex] (closed polygon)
    """
    # Ensure local coordinates are initialized
    if not dem.has_local_coords:
        dem.init_local_coords()

    # Convert apex to local meters
    x0, y0 = dem.latlon_to_xy(lat, lon)

    # Compute cone range: clamp depth_p50 to reasonable range
    if depth_p50_m is not None and depth_p50_m > 0:
        cone_range_m = max(CONE_RANGE_MIN_M, min(CONE_RANGE_MAX_M, depth_p50_m))
    else:
        cone_range_m = CONE_RANGE_DEFAULT_M

    # Compute left and right ray directions
    left_bearing_deg = (best_bearing_deg - fov_deg / 2) % 360.0
    right_bearing_deg = (best_bearing_deg + fov_deg / 2) % 360.0

    left_bearing_rad = math.radians(left_bearing_deg)
    right_bearing_rad = math.radians(right_bearing_deg)

    # Direction vectors (azimuth: 0=N, 90=E)
    # dx = sin(az), dy = cos(az)
    x_left = x0 + math.sin(left_bearing_rad) * cone_range_m
    y_left = y0 + math.cos(left_bearing_rad) * cone_range_m

    x_right = x0 + math.sin(right_bearing_rad) * cone_range_m
    y_right = y0 + math.cos(right_bearing_rad) * cone_range_m

    # Convert back to lat/lon
    lat_left, lon_left = dem.xy_to_latlon(x_left, y_left)
    lat_right, lon_right = dem.xy_to_latlon(x_right, y_right)

    # Return closed polygon: apex, left, right, apex
    return [
        [lat, lon],           # Apex
        [lat_left, lon_left], # Left edge
        [lat_right, lon_right], # Right edge
        [lat, lon],           # Close polygon
    ]


def generate_view_explanations(
    overlook_score: float,
    open_sky_fraction: float,
    depth_p90_m: float,
    horizon_complexity: int,
    rim_strength: float = 0.0,
    sun_alignment: Optional[SunAlignment] = None,
    view_category: str = CATEGORY_QUICK_SCENIC,
    open_sky_sector_fraction: Optional[float] = None,
) -> ViewExplanations:
    """
    Generate human-readable explanations for view quality.

    Explanations are tailored to the view category and prefer sector openness
    (in shooting direction) over full 360° openness when available.

    Args:
        overlook_score: Overall overlook quality (0-1)
        open_sky_fraction: Full 360° openness (0-1)
        depth_p90_m: 90th percentile view depth
        horizon_complexity: Number of horizon peaks
        rim_strength: TPI-based rim strength
        sun_alignment: Optional sun alignment data
        view_category: Category from classify_view_category()
        open_sky_sector_fraction: Sector openness in shooting direction (0-1)

    Returns:
        ViewExplanations with short and long descriptions
    """
    # Build descriptive phrases based on category and metrics
    full_pct = int(open_sky_fraction * 100)
    sector_pct = int(open_sky_sector_fraction * 100) if open_sky_sector_fraction is not None else full_pct
    depth_km = depth_p90_m / 1000.0

    # Detect "enclosed behind, open forward" scenario
    # This is when sector openness is much higher than full 360° openness
    enclosed_behind_open_forward = (
        open_sky_sector_fraction is not None and
        open_sky_sector_fraction >= 0.50 and
        open_sky_fraction < 0.40 and
        open_sky_sector_fraction - open_sky_fraction >= 0.25
    )

    # Category-specific short descriptions
    if view_category == CATEGORY_EPIC_OVERLOOK:
        # Emphasize big horizon and deep layers
        if depth_km >= 10.0:
            short_desc = f"Epic overlook with {depth_km:.0f}km sightlines"
        elif depth_km >= 5.0:
            short_desc = f"Big horizon + deep valley layers ({depth_km:.1f}km)"
        elif enclosed_behind_open_forward:
            short_desc = f"Open views forward ({sector_pct}%), enclosed behind"
        else:
            short_desc = f"Wide-open panoramic views ({sector_pct}% open)"

    elif view_category == CATEGORY_DRAMATIC_ENCLOSED:
        # Emphasize enclosed canyon and complex skyline
        if horizon_complexity >= 12:
            short_desc = "Dramatic canyon with complex skyline"
        elif horizon_complexity >= 8:
            short_desc = "Enclosed viewpoint + dramatic silhouettes"
        else:
            short_desc = "Enclosed canyon views"

    else:  # QUICK_SCENIC
        # Emphasize easy, pleasant viewpoint
        if depth_km >= 2.0:
            short_desc = f"Easy viewpoint with {depth_km:.1f}km views"
        elif sector_pct >= 50:
            short_desc = f"Quick scenic stop ({sector_pct}% open forward)"
        else:
            short_desc = "Pleasant local viewpoint"

    # Ensure short desc doesn't exceed 80 chars
    if len(short_desc) > 80:
        short_desc = short_desc[:77] + "..."

    # Long description with details - also category-aware
    long_parts = []

    # Category-specific opening
    if view_category == CATEGORY_EPIC_OVERLOOK:
        if rim_strength >= 0.5:
            long_parts.append("Epic rim overlook")
        else:
            long_parts.append("Expansive overlook")

        # Prefer sector openness, and call out enclosed-behind scenario
        if enclosed_behind_open_forward:
            long_parts.append(
                f"with {sector_pct}% open in shooting direction "
                f"(only {full_pct}% overall - enclosed behind you, but wide open toward the view)."
            )
        else:
            long_parts.append(f"with {sector_pct}% open views and deep sightlines ({depth_km:.1f}km).")
        long_parts.append("Great for layered sunrise/sunset shots.")

    elif view_category == CATEGORY_DRAMATIC_ENCLOSED:
        long_parts.append("Enclosed viewpoint")
        long_parts.append(f"with {horizon_complexity} horizon peaks creating dramatic framing.")
        if sun_alignment is not None and sun_alignment.behind_ridge:
            long_parts.append("Sun drops behind ridges early - excellent for silhouettes.")
        else:
            long_parts.append("Good for dramatic silhouettes and canyon atmosphere.")

    else:  # QUICK_SCENIC
        if rim_strength >= 0.3:
            long_parts.append("Elevated scenic viewpoint")
        else:
            long_parts.append("Accessible viewpoint")

        # Use sector openness if available
        if enclosed_behind_open_forward:
            long_parts.append(
                f"with {sector_pct}% open forward (enclosed behind you)."
            )
        else:
            long_parts.append(f"with {sector_pct}% open sky in shooting direction.")

        if depth_km >= 2.0:
            long_parts.append(f"Decent sightlines ({depth_km:.1f}km) for a quick photo stop.")
        else:
            long_parts.append("Good for a quick photo stop.")

    # Sun alignment info (for all categories, if relevant and not already mentioned)
    if sun_alignment is not None and view_category != CATEGORY_DRAMATIC_ENCLOSED:
        if sun_alignment.behind_ridge:
            margin = abs(sun_alignment.blocking_margin_deg)
            long_parts.append(f"Note: sun drops behind ridge early (blocked by {margin:.1f}°).")
        elif sun_alignment.blocking_margin_deg > 5.0:
            margin = sun_alignment.blocking_margin_deg
            long_parts.append(f"Sun clears the skyline by {margin:.1f}°.")

    # Combine long description
    long_desc = " ".join(long_parts)

    return ViewExplanations(
        short=short_desc,
        long=long_desc,
    )


def compute_overlook_view(
    dem: DEMGrid,
    lat: float,
    lon: float,
    rim_strength: float = 0.0,
    sun_position: Optional[SunPosition] = None,
    eye_height_m: float = DEFAULT_EYE_HEIGHT_M,
    az_step_deg: float = DEFAULT_AZ_STEP_DEG,
    num_samples: int = DEFAULT_NUM_SAMPLES,
    include_profile: bool = False,
    curvature: Optional[np.ndarray] = None,
    slope_break: Optional[np.ndarray] = None,
    slope_grid: Optional[np.ndarray] = None,
    aspect_grid: Optional[np.ndarray] = None,
    distant_glow_timeseries: bool = False,
    event_type: str = "sunrise",
    event_date: Optional[datetime] = None,
    sun_track: Optional[List[SunPosition]] = None,
    include_debug: bool = False,
) -> OverlookView:
    """
    Compute complete overlook view analysis for a location.

    Args:
        dem: DEMGrid with elevation data
        lat: Location latitude
        lon: Location longitude
        rim_strength: TPI-based rim strength (from structure metrics)
        sun_position: Optional sun position for alignment analysis
        eye_height_m: Observer eye height
        az_step_deg: Azimuth step for horizon profile
        num_samples: Samples per azimuth
        include_profile: If True, include full horizon profile in output
        curvature: Optional curvature grid for Visual Anchor Score (VAS)
        slope_break: Optional slope break grid for Visual Anchor Score (VAS)
        slope_grid: Optional slope grid for Light-at-Anchor (LAA)
        aspect_grid: Optional aspect grid for Light-at-Anchor (LAA)
        distant_glow_timeseries: If True, compute glow window time-series
        event_type: "sunrise" or "sunset" (for glow window time range)
        event_date: Date for glow window sun track (required if distant_glow_timeseries
                    is True and sun_track is not provided)
        sun_track: Precomputed sun track from generate_glow_window_sun_track().
                   If not provided and distant_glow_timeseries=True, will be
                   generated using event_date. Precompute once per request and
                   pass to multiple viewpoints for efficiency.
        include_debug: If True, include debug info (e.g., full score_series)

    Returns:
        OverlookView with all metrics
    """
    # Compute horizon profile
    profile = compute_horizon_profile(
        dem=dem,
        lat=lat,
        lon=lon,
        eye_height_m=eye_height_m,
        az_step_deg=az_step_deg,
        num_samples=num_samples,
    )

    # Derive view metrics (full 360°)
    open_sky_fraction, depth_p50_m, depth_p90_m, horizon_complexity = compute_view_metrics(profile)

    # Find best bearing first (needed for sector openness)
    best_bearing, _ = find_best_bearing(profile)

    # Compute sector openness centered on best bearing
    # This is more useful than full 360° - a canyon rim enclosed behind
    # but open forward should score well
    open_sky_sector_fraction = compute_sector_openness(
        profile=profile,
        center_bearing_deg=best_bearing,
        sector_half_width_deg=SECTOR_HALF_WIDTH_DEG,
    )

    # Compute overlook score using SECTOR openness (not full 360°)
    overlook_score = compute_overlook_score(
        open_sky_sector_fraction=open_sky_sector_fraction,
        depth_p90_m=depth_p90_m,
        horizon_complexity=horizon_complexity,
        rim_strength=rim_strength,
    )

    # Classify view category based on metrics
    # EPIC uses sector openness, DRAMATIC uses full 360° (for "enclosed" check)
    view_category = classify_view_category(
        depth_p90_m=depth_p90_m,
        open_sky_fraction=open_sky_fraction,
        horizon_complexity=horizon_complexity,
        overlook_score=overlook_score,
        open_sky_sector_fraction=open_sky_sector_fraction,
    )

    # Sun alignment (if sun position provided)
    sun_alignment = None
    if sun_position is not None:
        sun_alignment = compute_sun_alignment(profile, sun_position)

    # Generate view cone polygon for map rendering
    view_cone = generate_view_cone(
        dem=dem,
        lat=lat,
        lon=lon,
        best_bearing_deg=best_bearing,
        fov_deg=DEFAULT_FOV_DEG,
        depth_p50_m=depth_p50_m,
    )

    # Generate human-readable explanations (category-aware, uses sector openness)
    explanations = generate_view_explanations(
        overlook_score=overlook_score,
        open_sky_fraction=open_sky_fraction,
        depth_p90_m=depth_p90_m,
        horizon_complexity=horizon_complexity,
        rim_strength=rim_strength,
        sun_alignment=sun_alignment,
        view_category=view_category,
        open_sky_sector_fraction=open_sky_sector_fraction,
    )

    # Compute Visual Anchor Score (VAS) if structure grids available
    # VAS detects salient features (ridgelines, spires) in the view cone
    visual_anchor = None
    if curvature is not None and slope_break is not None:
        visual_anchor = compute_visual_anchor_score(
            dem=dem,
            profile=profile,
            curvature=curvature,
            slope_break=slope_break,
            elevations=dem.elevations,
            best_bearing_deg=best_bearing,
            fov_deg=DEFAULT_FOV_DEG,
            horizon_complexity=horizon_complexity,
        )

    # Compute Distant Atmospheric Glow Score (DAGS)
    # This is viewpoint-first scoring for capturing distant layered glow
    # Now includes Visual Anchor Score (VAS) and Light-at-Anchor (LAA) if computed
    distant_glow = None
    if sun_position is not None and sun_alignment is not None:
        # Compute Light-at-Anchor if we have an anchor and sun position
        anchor_light = None
        if visual_anchor is not None and visual_anchor.anchor_type != "NONE":
            # Compute anchor lat/lon from viewpoint + bearing/distance
            anchor_lat, anchor_lon = compute_anchor_location(
                dem=dem,
                viewpoint_lat=lat,
                viewpoint_lon=lon,
                anchor_bearing_deg=visual_anchor.anchor_bearing_deg,
                anchor_distance_m=visual_anchor.anchor_distance_m,
            )

            # Compute sun_low_norm for anchor light scoring
            sun_low_norm = min(1.0, max(0.0, (DAGS_SUN_LOW_MAX_DEG - sun_position.altitude_deg) / DAGS_SUN_LOW_MAX_DEG))

            anchor_light = compute_anchor_light_score(
                dem=dem,
                anchor_lat=anchor_lat,
                anchor_lon=anchor_lon,
                sun_position=sun_position,
                view_bearing_deg=best_bearing,
                slope_grid=slope_grid,
                aspect_grid=aspect_grid,
                sun_low_norm=sun_low_norm,
            )

        distant_glow = compute_distant_glow_score(
            depth_p90_m=depth_p90_m,
            open_sky_sector_fraction=open_sky_sector_fraction,
            rim_strength=rim_strength,
            sun_altitude_deg=sun_position.altitude_deg,
            blocking_margin_deg=sun_alignment.blocking_margin_deg,
            view_bearing_deg=best_bearing,
            sun_azimuth_deg=sun_position.azimuth_deg,
            visual_anchor=visual_anchor,
            anchor_light=anchor_light,
        )

        # Compute glow window time-series if requested
        if distant_glow_timeseries and visual_anchor is not None:
            # Use provided sun_track or generate one
            track_to_use = sun_track
            if track_to_use is None and event_date is not None:
                # Generate sun track using AOI center (Option A: fast, reusable)
                # This computes real ephemeris at 16 timesteps
                track_to_use = generate_glow_window_sun_track(
                    lat=lat,
                    lon=lon,
                    event_date=event_date,
                    event_type=event_type,
                )

            if track_to_use is not None:
                glow_window = compute_glow_window(
                    dem=dem,
                    sun_track=track_to_use,
                    view_bearing_deg=best_bearing,
                    depth_p90_m=depth_p90_m,
                    open_sky_sector_fraction=open_sky_sector_fraction,
                    rim_strength=rim_strength,
                    blocking_margin_deg=sun_alignment.blocking_margin_deg,
                    visual_anchor=visual_anchor,
                    viewpoint_lat=lat,
                    viewpoint_lon=lon,
                    slope_grid=slope_grid,
                    aspect_grid=aspect_grid,
                    include_debug=include_debug,
                )
                distant_glow.glow_window = glow_window

    # Build output
    return OverlookView(
        open_sky_fraction=open_sky_fraction,
        depth_p50_m=depth_p50_m,
        depth_p90_m=depth_p90_m,
        horizon_complexity=horizon_complexity,
        overlook_score=overlook_score,
        best_bearing_deg=best_bearing,
        fov_deg=DEFAULT_FOV_DEG,
        open_sky_sector_fraction=open_sky_sector_fraction,
        view_category=view_category,
        view_cone=view_cone,
        explanations=explanations,
        sun_alignment=sun_alignment,
        distant_glow=distant_glow,
        horizon_profile=profile.samples if include_profile else None,
    )


def select_overlook_candidates(
    standing_locations: List[StandingLocation],
    rim_strengths: Optional[dict] = None,
    max_candidates: int = 10,
    slope_max_deg: float = 20.0,
) -> List[Tuple[StandingLocation, float]]:
    """
    Select top candidates for overlook analysis.

    Prioritizes locations with:
    - High rim_strength (from TPI)
    - Reasonable slope (walkable viewpoint)

    Args:
        standing_locations: List of standing locations
        rim_strengths: Dict mapping standing_id -> rim_strength
        max_candidates: Maximum candidates to return
        slope_max_deg: Maximum slope for overlook candidate

    Returns:
        List of (StandingLocation, rim_strength) tuples
    """
    if rim_strengths is None:
        rim_strengths = {}

    candidates = []
    for loc in standing_locations:
        slope = loc.properties.slope_deg

        # Skip too steep
        if slope > slope_max_deg:
            continue

        rim_str = rim_strengths.get(loc.standing_id, 0.0)
        candidates.append((loc, rim_str))

    # Sort by rim_strength descending
    candidates.sort(key=lambda x: x[1], reverse=True)

    return candidates[:max_candidates]


# =============================================================================
# Rim-Based Overlook Discovery
# =============================================================================

# Spatial deduplication parameters
OVERLOOK_DEDUP_DISTANCE_M = 500.0   # Minimum distance between kept overlooks
OVERLOOK_MAX_RESULTS = 20           # Maximum overlook results to return
OVERLOOK_TOP_K_FOR_VIEW = 50        # Top K rim candidates to run view analysis on

# =============================================================================
# Auto-Threshold Parameters
# =============================================================================
# Adjusts TPI and slope thresholds per-request to target a healthy number of
# rim candidates. Helps ensure consistent yield across different terrain types.

# Default thresholds (before auto-adjustment)
DEFAULT_TPI_THRESHOLD_M = 12.0
DEFAULT_SLOPE_MAX_DEG = 25.0

# Target rim_mask fraction of total grid cells
AUTO_THRESHOLD_TARGET_MIN = 0.05    # Target at least 5% of cells
AUTO_THRESHOLD_TARGET_MAX = 0.15    # Target at most 15% of cells

# Threshold adjustment steps
TPI_RELAX_STEPS = [12.0, 10.0, 8.0, 6.0, 4.0]      # Relax (lower) if too few
TPI_TIGHTEN_STEPS = [12.0, 15.0, 18.0, 22.0, 30.0]  # Tighten (higher) if too many
SLOPE_RELAX_STEPS = [25.0, 28.0, 30.0, 32.0]        # Relax (higher) if too few
SLOPE_TIGHTEN_STEPS = [25.0, 22.0, 20.0, 18.0]      # Tighten (lower) if too many

# Clamps
TPI_THRESHOLD_MIN = 4.0
TPI_THRESHOLD_MAX = 30.0
SLOPE_MAX_DEG_MIN = 18.0
SLOPE_MAX_DEG_MAX = 32.0

# View analysis scaling - increased for better coverage on large AOIs
VIEW_CANDIDATES_MIN = 150   # Minimum candidates for view analysis
VIEW_CANDIDATES_MAX = 500   # Maximum candidates for view analysis
TARGET_RESULTS_MIN = 15     # If fewer results, increase view candidates
TARGET_RESULTS_MAX = 30     # Cap final results at this

# Local maxima cap scaling
MAXIMA_CAP_MIN = 500        # Minimum maxima to keep after NMS
MAXIMA_CAP_MAX = 2000       # Maximum maxima to keep after NMS
MAXIMA_CAP_DIVISOR = 100    # grid_cells / divisor = base cap


def compute_auto_thresholds(
    tpi_large: np.ndarray,
    slope_deg: np.ndarray,
    initial_tpi_threshold_m: float = DEFAULT_TPI_THRESHOLD_M,
    initial_slope_max_deg: float = DEFAULT_SLOPE_MAX_DEG,
) -> Tuple[float, float, dict]:
    """
    Compute auto-adjusted thresholds based on terrain distributions.

    Adjusts TPI threshold and slope max to target 5-15% of grid cells
    passing the rim candidate mask. This ensures consistent yield across
    different terrain types (low-relief vs rough terrain).

    Args:
        tpi_large: Large-scale TPI grid
        slope_deg: Slope grid in degrees
        initial_tpi_threshold_m: Starting TPI threshold
        initial_slope_max_deg: Starting max slope

    Returns:
        Tuple of (chosen_tpi_threshold_m, chosen_slope_max_deg, adjustment_info)
    """
    from .structure import compute_rim_candidate_mask

    rows, cols = tpi_large.shape
    total_cells = rows * cols

    if total_cells == 0:
        return initial_tpi_threshold_m, initial_slope_max_deg, {"adjusted": False}

    # Start with initial thresholds
    tpi_threshold = initial_tpi_threshold_m
    slope_max = initial_slope_max_deg

    # Compute initial mask
    rim_mask = compute_rim_candidate_mask(
        tpi_large=tpi_large,
        slope_deg=slope_deg,
        tpi_threshold_m=tpi_threshold,
        slope_max_deg=slope_max,
    )
    mask_fraction = float(np.sum(rim_mask)) / total_cells

    adjustment_info = {
        "adjusted": False,
        "initial_fraction": mask_fraction,
        "final_fraction": mask_fraction,
        "direction": "none",
        "iterations": 0,
    }

    # If already in target range, return as-is
    if AUTO_THRESHOLD_TARGET_MIN <= mask_fraction <= AUTO_THRESHOLD_TARGET_MAX:
        return tpi_threshold, slope_max, adjustment_info

    # Need to adjust
    adjustment_info["adjusted"] = True

    if mask_fraction < AUTO_THRESHOLD_TARGET_MIN:
        # Too few candidates - relax thresholds (lower TPI, higher slope)
        adjustment_info["direction"] = "relax"

        # Try relaxing TPI first
        for tpi_step in TPI_RELAX_STEPS:
            if tpi_step >= tpi_threshold:
                continue  # Skip if not actually relaxing

            rim_mask = compute_rim_candidate_mask(
                tpi_large=tpi_large,
                slope_deg=slope_deg,
                tpi_threshold_m=tpi_step,
                slope_max_deg=slope_max,
            )
            mask_fraction = float(np.sum(rim_mask)) / total_cells
            adjustment_info["iterations"] += 1

            if mask_fraction >= AUTO_THRESHOLD_TARGET_MIN:
                tpi_threshold = tpi_step
                break
            tpi_threshold = tpi_step

        # If still not enough, try relaxing slope
        if mask_fraction < AUTO_THRESHOLD_TARGET_MIN:
            for slope_step in SLOPE_RELAX_STEPS:
                if slope_step <= slope_max:
                    continue  # Skip if not actually relaxing

                rim_mask = compute_rim_candidate_mask(
                    tpi_large=tpi_large,
                    slope_deg=slope_deg,
                    tpi_threshold_m=tpi_threshold,
                    slope_max_deg=slope_step,
                )
                mask_fraction = float(np.sum(rim_mask)) / total_cells
                adjustment_info["iterations"] += 1

                if mask_fraction >= AUTO_THRESHOLD_TARGET_MIN:
                    slope_max = slope_step
                    break
                slope_max = slope_step

    elif mask_fraction > AUTO_THRESHOLD_TARGET_MAX:
        # Too many candidates - tighten thresholds (higher TPI, lower slope)
        adjustment_info["direction"] = "tighten"

        # Try tightening TPI first
        for tpi_step in TPI_TIGHTEN_STEPS:
            if tpi_step <= tpi_threshold:
                continue  # Skip if not actually tightening

            rim_mask = compute_rim_candidate_mask(
                tpi_large=tpi_large,
                slope_deg=slope_deg,
                tpi_threshold_m=tpi_step,
                slope_max_deg=slope_max,
            )
            mask_fraction = float(np.sum(rim_mask)) / total_cells
            adjustment_info["iterations"] += 1

            if mask_fraction <= AUTO_THRESHOLD_TARGET_MAX:
                tpi_threshold = tpi_step
                break
            tpi_threshold = tpi_step

        # If still too many, try tightening slope
        if mask_fraction > AUTO_THRESHOLD_TARGET_MAX:
            for slope_step in SLOPE_TIGHTEN_STEPS:
                if slope_step >= slope_max:
                    continue  # Skip if not actually tightening

                rim_mask = compute_rim_candidate_mask(
                    tpi_large=tpi_large,
                    slope_deg=slope_deg,
                    tpi_threshold_m=tpi_threshold,
                    slope_max_deg=slope_step,
                )
                mask_fraction = float(np.sum(rim_mask)) / total_cells
                adjustment_info["iterations"] += 1

                if mask_fraction <= AUTO_THRESHOLD_TARGET_MAX:
                    slope_max = slope_step
                    break
                slope_max = slope_step

    # Apply clamps
    tpi_threshold = max(TPI_THRESHOLD_MIN, min(TPI_THRESHOLD_MAX, tpi_threshold))
    slope_max = max(SLOPE_MAX_DEG_MIN, min(SLOPE_MAX_DEG_MAX, slope_max))

    adjustment_info["final_fraction"] = mask_fraction

    return tpi_threshold, slope_max, adjustment_info


# =============================================================================
# Access Proximity Bias
# =============================================================================
# Bias rim-overlook results toward accessible locations near roads/trails.
# This helps ensure results are practical to reach, not just "pixels on a rim".

# Road types (driveable or heavy-duty trails)
ROAD_HIGHWAY_TYPES = {
    'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
    'unclassified', 'residential', 'service', 'track',
}

# Trail types (foot/bike accessible)
TRAIL_HIGHWAY_TYPES = {
    'path', 'footway', 'cycleway', 'bridleway', 'steps', 'byway',
}

# Access bonus parameters
ACCESS_BONUS_MAX = 0.25  # Maximum ranking bonus for nearby access
ACCESS_DECAY_FACTOR = 2.0  # Bonus decays to 0 at this multiple of access_max_distance_m


def classify_access_type(highway_type: Optional[str]) -> str:
    """
    Classify a highway type as 'road', 'trail', or 'none'.

    Args:
        highway_type: OSM highway type string

    Returns:
        'road', 'trail', or 'none'
    """
    if highway_type is None:
        return "none"
    if highway_type in ROAD_HIGHWAY_TYPES:
        return "road"
    if highway_type in TRAIL_HIGHWAY_TYPES:
        return "trail"
    return "none"


def compute_access_proximity(
    lat: float,
    lon: float,
    roads: List,  # List[RoadSegment] from accessibility.py
    access_bias: str = "NONE",
) -> Tuple[float, str, Optional[str]]:
    """
    Compute distance to nearest road/trail based on access bias mode.

    Args:
        lat: Candidate latitude
        lon: Candidate longitude
        roads: List of RoadSegment objects from OSM
        access_bias: "NONE", "NEAR_ROADS", "NEAR_TRAILS", or "NEAR_ROADS_OR_TRAILS"

    Returns:
        Tuple of (distance_m, access_type, nearest_road_type)
        - distance_m: Distance to nearest matching road/trail (inf if none)
        - access_type: "road", "trail", or "none"
        - nearest_road_type: OSM highway type of nearest match
    """
    from .accessibility import _point_to_segment_distance

    if access_bias == "NONE" or not roads:
        return float('inf'), "none", None

    # Determine which highway types to consider
    if access_bias == "NEAR_ROADS":
        valid_types = ROAD_HIGHWAY_TYPES
    elif access_bias == "NEAR_TRAILS":
        valid_types = TRAIL_HIGHWAY_TYPES
    elif access_bias == "NEAR_ROADS_OR_TRAILS":
        valid_types = ROAD_HIGHWAY_TYPES | TRAIL_HIGHWAY_TYPES
    else:
        return float('inf'), "none", None

    min_distance = float('inf')
    nearest_type = None

    for road in roads:
        # Skip roads not matching the bias filter
        if road.highway_type not in valid_types:
            continue

        coords = road.coords
        for i in range(len(coords) - 1):
            seg_start = coords[i]
            seg_end = coords[i + 1]

            distance, _ = _point_to_segment_distance(
                lat, lon, seg_start, seg_end
            )

            if distance < min_distance:
                min_distance = distance
                nearest_type = road.highway_type

    if min_distance == float('inf'):
        return float('inf'), "none", None

    access_type = classify_access_type(nearest_type)
    return min_distance, access_type, nearest_type


def compute_access_bonus(
    distance_m: float,
    access_max_distance_m: float,
) -> float:
    """
    Compute ranking bonus based on distance to access.

    Bonus is:
    - ACCESS_BONUS_MAX (0.25) if distance <= access_max_distance_m
    - Linearly decays to 0 at ACCESS_DECAY_FACTOR * access_max_distance_m
    - 0 beyond that

    Args:
        distance_m: Distance to nearest road/trail
        access_max_distance_m: Max distance for full bonus

    Returns:
        Bonus multiplier (0 to ACCESS_BONUS_MAX)
    """
    if distance_m <= access_max_distance_m:
        return ACCESS_BONUS_MAX

    decay_distance = access_max_distance_m * ACCESS_DECAY_FACTOR
    if distance_m >= decay_distance:
        return 0.0

    # Linear decay from access_max_distance_m to decay_distance
    t = (distance_m - access_max_distance_m) / (decay_distance - access_max_distance_m)
    return ACCESS_BONUS_MAX * (1.0 - t)


def apply_access_bias_to_candidates(
    rim_candidates: List,  # List[RimCandidate]
    roads: List,  # List[RoadSegment]
    access_bias: str,
    access_max_distance_m: float,
) -> List[Tuple]:
    """
    Apply access bias to rim candidates, returning ranked list with access info.

    Candidates are scored as:
        rank_score = rim_strength * (1 + access_bonus)

    This biases results toward accessible locations without completely
    excluding remote discoveries.

    Args:
        rim_candidates: List of RimCandidate from NMS
        roads: List of RoadSegment from OSM
        access_bias: Access bias mode
        access_max_distance_m: Max distance for full bonus

    Returns:
        List of (RimCandidate, rank_score, distance_m, access_type, highway_type)
        sorted by rank_score descending
    """
    scored = []

    for cand in rim_candidates:
        distance_m, access_type, highway_type = compute_access_proximity(
            lat=cand.lat,
            lon=cand.lon,
            roads=roads,
            access_bias=access_bias,
        )

        # Compute ranking bonus
        if access_bias == "NONE":
            bonus = 0.0
        else:
            bonus = compute_access_bonus(distance_m, access_max_distance_m)

        rank_score = cand.rim_strength * (1.0 + bonus)

        scored.append((cand, rank_score, distance_m, access_type, highway_type))

    # Sort by rank_score descending
    scored.sort(key=lambda x: x[1], reverse=True)

    return scored


def generate_access_explanation_snippet(
    distance_m: float,
    access_type: str,
    access_max_distance_m: float,
) -> Optional[str]:
    """
    Generate a short explanation snippet about accessibility.

    Args:
        distance_m: Distance to nearest road/trail
        access_type: "road", "trail", or "none"
        access_max_distance_m: Reference distance for "nearby"

    Returns:
        Explanation snippet or None if not relevant
    """
    if access_type == "none" or distance_m == float('inf'):
        return None

    if distance_m <= 50:
        if access_type == "road":
            return "Easy pullout right at the road"
        else:
            return "On or very near the trail"

    elif distance_m <= access_max_distance_m:
        dist_text = f"~{int(distance_m)}m"
        if access_type == "road":
            return f"Easy pullout nearby ({dist_text} from road)"
        else:
            return f"Short walk from trail ({dist_text})"

    elif distance_m <= access_max_distance_m * 2:
        dist_text = f"~{int(distance_m)}m"
        if access_type == "road":
            return f"Moderate walk from road ({dist_text})"
        else:
            return f"Moderate hike from trail ({dist_text})"

    return None


def update_view_explanations_with_access(
    standing: 'StandingLocation',
    access_max_distance_m: float = 800.0,
) -> None:
    """
    Update a standing location's view explanations to include access info.

    Modifies the standing's view.explanations in place if access info is available
    and worth mentioning (i.e., location is reasonably accessible).

    Args:
        standing: StandingLocation with view and properties populated
        access_max_distance_m: Reference distance for "nearby"
    """
    if standing.view is None or standing.view.explanations is None:
        return

    distance_m = standing.properties.distance_to_road_m
    access_type = standing.properties.access_type

    if distance_m is None or access_type == "none":
        return

    # Generate access snippet
    snippet = generate_access_explanation_snippet(
        distance_m=distance_m,
        access_type=access_type,
        access_max_distance_m=access_max_distance_m,
    )

    if snippet is None:
        return

    # Append to long explanation
    current_long = standing.view.explanations.long
    standing.view.explanations = ViewExplanations(
        short=standing.view.explanations.short,
        long=f"{current_long} {snippet}.",
    )


def rim_candidates_to_standing_locations(
    rim_candidates: List,  # List[RimCandidate] from structure.py
    start_id: int = 1000,  # Start IDs high to avoid collision with subject-based
) -> List[StandingLocation]:
    """
    Convert rim candidates directly to standing locations.

    For rim/overlook candidates, the candidate cell IS the standing location
    (we're looking OUT from the rim, not AT a subject).

    Args:
        rim_candidates: List of RimCandidate from extract_rim_candidates_nms
        start_id: Starting ID for standing locations

    Returns:
        List of StandingLocation objects
    """
    from .types import StandingLocation, StandingProperties, LineOfSight, CandidateSearch

    standing_locations = []

    for i, cand in enumerate(rim_candidates):
        # For overlooks, standing location = rim candidate location
        # There's no "subject" - we're looking at the view
        standing = StandingLocation(
            standing_id=start_id + i,
            subject_id=None,  # No subject association
            location={"lat": cand.lat, "lon": cand.lon},
            properties=StandingProperties(
                elevation_m=cand.elevation_m,
                slope_deg=cand.slope_deg,
                distance_to_subject_m=0.0,  # N/A for overlooks
                camera_bearing_deg=0.0,     # Will be set by view analysis
                elevation_diff_m=0.0,       # N/A for overlooks
            ),
            line_of_sight=LineOfSight(
                clear=True,  # N/A for overlooks
                eye_height_m=cand.elevation_m + 1.7,
                target_height_m=0.0,
                samples=[],
            ),
            candidate_search=CandidateSearch(
                candidates_checked=1,
                rejected=[],
                selected_at_distance_m=0.0,
            ),
            source="rim_overlook",  # Mark source for identification
        )

        # Store rim strength for later use
        standing.properties.rim_strength = cand.rim_strength
        standing.properties.tpi_large_m = cand.tpi_large_m

        standing_locations.append(standing)

    return standing_locations


def deduplicate_overlooks_spatially(
    overlook_standings: List[StandingLocation],
    min_distance_m: float = OVERLOOK_DEDUP_DISTANCE_M,
    max_results: int = OVERLOOK_MAX_RESULTS,
) -> List[StandingLocation]:
    """
    Deduplicate overlook standing locations spatially.

    After scoring by overlook_score:
    - Sort by overlook_score descending
    - Keep the top result
    - Reject any subsequent result within min_distance_m of an accepted one
    - Continue until max_results or candidates exhausted

    Args:
        overlook_standings: List of standing locations with view analysis completed
        min_distance_m: Minimum distance between kept results (default 500m)
        max_results: Maximum results to keep (default 20)

    Returns:
        Deduplicated list of standing locations
    """
    import math

    if not overlook_standings:
        return []

    # Sort by overlook_score descending
    # Standings without view analysis go to the end
    def get_score(s):
        if hasattr(s, 'view') and s.view is not None:
            return s.view.overlook_score
        return 0.0

    sorted_standings = sorted(overlook_standings, key=get_score, reverse=True)

    # Haversine distance helper
    def haversine_m(lat1, lon1, lat2, lon2):
        R = 6371000  # Earth radius in meters
        phi1, phi2 = math.radians(lat1), math.radians(lat2)
        dphi = math.radians(lat2 - lat1)
        dlambda = math.radians(lon2 - lon1)
        a = math.sin(dphi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda/2)**2
        return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1-a))

    kept = []

    for standing in sorted_standings:
        if len(kept) >= max_results:
            break

        lat = standing.location["lat"]
        lon = standing.location["lon"]

        # Check distance to all kept results
        too_close = False
        for kept_standing in kept:
            dist = haversine_m(
                lat, lon,
                kept_standing.location["lat"],
                kept_standing.location["lon"]
            )
            if dist < min_distance_m:
                too_close = True
                break

        if not too_close:
            kept.append(standing)

    return kept


def generate_rim_overlook_standings(
    dem: DEMGrid,
    tpi_large: np.ndarray,
    slope_deg: np.ndarray,
    elevations: np.ndarray,
    sun_position: Optional[SunPosition] = None,
    tpi_threshold_m: float = DEFAULT_TPI_THRESHOLD_M,
    slope_max_deg: float = DEFAULT_SLOPE_MAX_DEG,
    top_k_for_view: int = OVERLOOK_TOP_K_FOR_VIEW,
    max_results: int = OVERLOOK_MAX_RESULTS,
    dedup_distance_m: float = OVERLOOK_DEDUP_DISTANCE_M,
    collect_debug_stats: bool = False,
    auto_thresholds: bool = True,
    roads: Optional[List] = None,
    access_bias: str = "NONE",
    access_max_distance_m: float = 800.0,
    curvature: Optional[np.ndarray] = None,
    slope_break: Optional[np.ndarray] = None,
) -> Tuple[List[StandingLocation], Optional[dict]]:
    """
    Complete pipeline for generating rim-based overlook standing locations.

    Steps:
    1. (Optional) Auto-adjust thresholds based on terrain distribution
    2. Build per-cell rim candidate mask
    3. Extract distinct candidates via NMS
    4. (Optional) Apply access bias to rank candidates near roads/trails higher
    5. Convert to standing locations
    6. Run overlook view analysis on top K
    7. Deduplicate spatially
    8. Return final results

    Args:
        dem: DEMGrid with elevation data
        tpi_large: Large-scale TPI grid (precomputed)
        slope_deg: Slope grid
        elevations: Elevation grid
        sun_position: Optional sun position for alignment analysis
        tpi_threshold_m: TPI threshold for rim candidacy (may be auto-adjusted)
        slope_max_deg: Max slope for rim candidacy (may be auto-adjusted)
        top_k_for_view: Number of top candidates to run view analysis on
        max_results: Maximum results after deduplication
        dedup_distance_m: Minimum distance between results
        collect_debug_stats: If True, collect and return debug statistics
        auto_thresholds: If True, auto-adjust thresholds to target 5-15% rim cells
        roads: List of RoadSegment from OSM (for access bias)
        access_bias: "NONE", "NEAR_ROADS", "NEAR_TRAILS", or "NEAR_ROADS_OR_TRAILS"
        access_max_distance_m: Max distance for full access bonus
        curvature: Optional curvature grid for Visual Anchor Score (VAS)
        slope_break: Optional slope break grid for Visual Anchor Score (VAS)

    Returns:
        Tuple of (List of StandingLocation objects, debug_stats dict or None)
    """
    import logging
    from .structure import (
        compute_rim_candidate_mask,
        compute_rim_strength_grid,
        extract_rim_candidates_nms,
        RIM_EDGE_MODE_DEFAULT,
        compute_slope_break_grid,
    )

    rows, cols = tpi_large.shape
    total_cells = rows * cols

    # Step 0: Auto-adjust thresholds if enabled
    chosen_tpi = tpi_threshold_m
    chosen_slope = slope_max_deg
    chosen_top_k = top_k_for_view
    auto_applied = False

    if auto_thresholds and total_cells > 0:
        chosen_tpi, chosen_slope, adjust_info = compute_auto_thresholds(
            tpi_large=tpi_large,
            slope_deg=slope_deg,
            initial_tpi_threshold_m=tpi_threshold_m,
            initial_slope_max_deg=slope_max_deg,
        )
        auto_applied = adjust_info.get("adjusted", False)

        if auto_applied:
            logging.info(
                f"Auto-threshold: Adjusted TPI {tpi_threshold_m:.1f}→{chosen_tpi:.1f}m, "
                f"slope {slope_max_deg:.1f}→{chosen_slope:.1f}° "
                f"(direction: {adjust_info.get('direction')}, "
                f"fraction: {adjust_info.get('initial_fraction', 0):.3f}→{adjust_info.get('final_fraction', 0):.3f})"
            )

    # Initialize debug stats
    debug_stats = None
    if collect_debug_stats:
        debug_stats = {
            'grid_cells_total': total_cells,
            'rim_mask_cells': 0,
            'rim_local_maxima_cells': 0,
            'maxima_found_total': 0,  # Total local maxima before cap
            'maxima_kept': 0,  # Local maxima kept after max_candidates cap
            'maxima_cap_used': 0,  # The dynamic cap applied
            'rim_candidates_selected': 0,
            'view_analyzed_total': 0,  # Total candidates that got view analysis
            'results_pre_dedup': 0,  # Results before spatial deduplication
            'results_post_dedup': 0,  # Results after spatial deduplication (final)
            # TPI stats
            'tpi_large_m_p50': float(np.percentile(tpi_large, 50)),
            'tpi_large_m_p90': float(np.percentile(tpi_large, 90)),
            'tpi_large_m_p95': float(np.percentile(tpi_large, 95)),
            # Slope stats
            'slope_deg_pct_under_20': float(np.sum(slope_deg < 20) / total_cells * 100) if total_cells > 0 else 0,
            'slope_deg_pct_under_25': float(np.sum(slope_deg < 25) / total_cells * 100) if total_cells > 0 else 0,
            'slope_deg_pct_under_30': float(np.sum(slope_deg < 30) / total_cells * 100) if total_cells > 0 else 0,
            # View analysis stats (populated later)
            'depth_p90_m_p50': None,
            'depth_p90_m_p90': None,
            'avg_open_sky_fraction': None,
            'avg_overlook_score': None,
            # Drop reason breakdown
            'rejected_slope': 0,
            'rejected_tpi': 0,
            'rejected_edge': 0,  # Rejected by edge gating (not near steep/slope break)
            'rejected_nms': 0,
            'rejected_maxima_cap': 0,  # Rejected by maxima cap
            'rejected_topk': 0,
            'rejected_after_view_dedup': 0,  # Rejected by spatial deduplication
            # Edge gating stats
            'rim_mask_cells_before_edge_gate': 0,
            'rim_mask_cells_after_edge_gate': 0,
            'edge_mode': 'STEEP_ADJACENCY',
            'steep_cells_count': 0,
            'near_steep_cells_count': 0,
            # Auto-threshold info
            'chosen_tpi_threshold_m': chosen_tpi,
            'chosen_slope_max_deg': chosen_slope,
            'chosen_view_candidates_k': chosen_top_k,
            'auto_threshold_applied': auto_applied,
            # Access proximity stats
            'access_bias_applied': access_bias,
            'pct_results_within_access_distance': None,
            'distance_to_access_p50_m': None,
            'distance_to_access_p90_m': None,
        }

        # Count rejections by reason for mask stage (using chosen thresholds)
        tpi_pass = tpi_large > chosen_tpi
        slope_pass = slope_deg < chosen_slope
        debug_stats['rejected_tpi'] = int(np.sum(~tpi_pass))
        debug_stats['rejected_slope'] = int(np.sum(tpi_pass & ~slope_pass))

    # Step 1: Build per-cell rim candidate mask (using chosen thresholds + edge gating)
    rim_mask, edge_debug = compute_rim_candidate_mask(
        tpi_large=tpi_large,
        slope_deg=slope_deg,
        tpi_threshold_m=chosen_tpi,
        slope_max_deg=chosen_slope,
        edge_mode=RIM_EDGE_MODE_DEFAULT,  # STEEP_ADJACENCY by default
        return_debug=True,
    )

    mask_count = int(np.sum(rim_mask))
    before_edge = edge_debug.get('rim_mask_cells_before_edge_gate', mask_count)
    logging.info(
        f"Rim overlook: {mask_count} cells pass rim mask "
        f"(TPI>{chosen_tpi:.1f}m, slope<{chosen_slope:.1f}°, "
        f"edge mode={edge_debug.get('edge_mode')}, "
        f"before edge gate={before_edge})"
    )

    if collect_debug_stats:
        debug_stats['rim_mask_cells'] = mask_count
        # Edge gating debug stats
        debug_stats['rim_mask_cells_before_edge_gate'] = edge_debug.get('rim_mask_cells_before_edge_gate', mask_count)
        debug_stats['rim_mask_cells_after_edge_gate'] = edge_debug.get('rim_mask_cells_after_edge_gate', mask_count)
        debug_stats['edge_mode'] = edge_debug.get('edge_mode', 'NONE')
        debug_stats['steep_cells_count'] = edge_debug.get('steep_cells_count', 0)
        debug_stats['near_steep_cells_count'] = edge_debug.get('near_steep_cells_count', 0)
        # Update rejected counts to include edge rejection
        debug_stats['rejected_edge'] = edge_debug.get('rim_mask_cells_before_edge_gate', 0) - edge_debug.get('rim_mask_cells_after_edge_gate', 0)

        # Sample pre-NMS rim candidates for debug visualization
        # Take up to 200 random samples from mask cells
        mask_indices = np.argwhere(rim_mask)
        sample_count = min(200, len(mask_indices))
        if sample_count > 0:
            sample_idx = np.random.choice(len(mask_indices), size=sample_count, replace=False)
            sample_rim_candidates = []
            for idx in sample_idx:
                row, col = mask_indices[idx]
                lat, lon = dem.indices_to_lat_lon(int(row), int(col))
                sample_rim_candidates.append({
                    'lat': float(lat),
                    'lon': float(lon),
                    'tpi_large_m': float(tpi_large[row, col]),
                    'slope_deg': float(slope_deg[row, col]),
                })
            debug_stats['sample_rim_candidates'] = sample_rim_candidates

    if mask_count == 0:
        logging.info("Rim overlook: No rim candidate cells found")
        return [], debug_stats

    # Step 2: Compute rim strength grid
    rim_strength = compute_rim_strength_grid(tpi_large)

    # Step 3: Extract distinct candidates via NMS with spatial tiling
    # Dynamic maxima cap based on AOI size: larger AOIs get more candidates
    # Formula: min(2000, max(500, grid_cells / 100))
    dynamic_maxima_cap = min(MAXIMA_CAP_MAX, max(MAXIMA_CAP_MIN, total_cells // MAXIMA_CAP_DIVISOR))
    logging.info(f"Rim overlook: Dynamic maxima cap = {dynamic_maxima_cap} (from {total_cells} grid cells)")

    # Use spatial tiling to ensure even distribution across AOI
    rim_candidates, total_maxima_found = extract_rim_candidates_nms(
        rim_mask=rim_mask,
        rim_strength=rim_strength,
        tpi_large=tpi_large,
        slope_deg=slope_deg,
        elevations=elevations,
        dem_grid=dem,
        neighborhood_size=5,
        max_candidates=dynamic_maxima_cap,
        use_spatial_tiling=True,  # Enable spatial tiling to prevent clustering
        tile_count=16,  # 4x4 grid
    )

    nms_count = len(rim_candidates)
    logging.info(f"Rim overlook: {nms_count} candidates after NMS (from {mask_count} cells, {total_maxima_found} total maxima found)")

    if collect_debug_stats:
        debug_stats['rim_local_maxima_cells'] = nms_count
        debug_stats['maxima_found_total'] = total_maxima_found  # Total before cap
        debug_stats['maxima_kept'] = nms_count  # After max_candidates cap
        debug_stats['maxima_cap_used'] = dynamic_maxima_cap
        debug_stats['rejected_nms'] = mask_count - total_maxima_found  # Rejected by NMS itself
        debug_stats['rejected_maxima_cap'] = max(0, total_maxima_found - nms_count)  # Rejected by cap

        # Sample local maxima (post-NMS) for debug visualization
        sample_local_maxima = []
        for cand in rim_candidates[:200]:  # Take up to 200 maxima
            sample_local_maxima.append({
                'lat': float(cand.lat),
                'lon': float(cand.lon),
                'tpi_large_m': float(cand.tpi_large_m),
                'slope_deg': float(cand.slope_deg),
                'rim_strength': float(cand.rim_strength),
                'elevation_m': float(cand.elevation_m),
            })
        debug_stats['sample_local_maxima'] = sample_local_maxima

    if not rim_candidates:
        return [], debug_stats

    # Scale view_analyzed_k based on maxima count
    # More maxima = analyze more candidates for better coverage
    # Formula: min(500, max(150, sqrt(maxima_found_total) * 12))
    # Example: 1000 maxima -> sqrt(1000)*12 = ~379 view candidates
    scaled_view_k = min(VIEW_CANDIDATES_MAX, max(VIEW_CANDIDATES_MIN, int(math.sqrt(total_maxima_found) * 12)))
    # Don't exceed what we have
    chosen_top_k = min(scaled_view_k, nms_count)
    logging.info(f"Rim overlook: Scaling view analysis K to {chosen_top_k} (formula gave {scaled_view_k}, have {nms_count} maxima)")

    # Step 4: Apply access bias ranking (if enabled) before selecting top-K
    # This biases results toward accessible locations without excluding remote ones
    access_info_map = {}  # Maps (lat, lon) -> (distance_m, access_type, highway_type)

    if access_bias != "NONE" and roads:
        logging.info(f"Rim overlook: Applying access bias '{access_bias}' with max distance {access_max_distance_m}m")

        # Get scored candidates with access info
        scored_candidates = apply_access_bias_to_candidates(
            rim_candidates=rim_candidates,
            roads=roads,
            access_bias=access_bias,
            access_max_distance_m=access_max_distance_m,
        )

        # Store access info for later use
        for cand, rank_score, distance_m, access_type, highway_type in scored_candidates:
            key = (cand.lat, cand.lon)
            access_info_map[key] = (distance_m, access_type, highway_type)

        # Extract reordered candidates
        rim_candidates = [item[0] for item in scored_candidates]

    # Step 5: Convert to standing locations
    standings = rim_candidates_to_standing_locations(rim_candidates)

    # Populate access info on standings
    for standing in standings:
        key = (standing.location["lat"], standing.location["lon"])
        if key in access_info_map:
            distance_m, access_type, highway_type = access_info_map[key]
            standing.properties.distance_to_road_m = distance_m if distance_m != float('inf') else None
            standing.properties.access_type = access_type
            standing.properties.nearest_road_type = highway_type

    # Step 6: Run overlook view analysis on top K (already sorted by access-biased rank)
    # If no access bias, sort by rim_strength
    if access_bias == "NONE" or not roads:
        standings.sort(key=lambda s: getattr(s.properties, 'rim_strength', 0), reverse=True)

    # Use chosen_top_k (may be increased if yield is low)
    top_standings = standings[:chosen_top_k]

    if collect_debug_stats:
        debug_stats['rim_candidates_selected'] = len(top_standings)
        debug_stats['rejected_topk'] = len(standings) - len(top_standings)

    logging.info(f"Rim overlook: Running view analysis on top {len(top_standings)} candidates")

    # Collect view metrics for debug stats
    depth_p90_values = []
    open_sky_values = []
    overlook_score_values = []

    # Compute slope_break grid if not provided but needed for VAS
    if slope_break is None and curvature is not None:
        slope_break = compute_slope_break_grid(slope_deg)

    for standing in top_standings:
        rim_strength_val = getattr(standing.properties, 'rim_strength', 0.0)
        view = compute_overlook_view(
            dem=dem,
            lat=standing.location["lat"],
            lon=standing.location["lon"],
            rim_strength=rim_strength_val,
            sun_position=sun_position,
            include_profile=False,
            curvature=curvature,
            slope_break=slope_break,
        )
        standing.view = view
        # Update camera bearing to best viewing direction
        standing.properties.camera_bearing_deg = view.best_bearing_deg

        # Update explanations with access info if available
        if access_bias != "NONE":
            update_view_explanations_with_access(standing, access_max_distance_m)

        # Collect metrics for debug stats
        if collect_debug_stats:
            depth_p90_values.append(view.depth_p90_m)
            open_sky_values.append(view.open_sky_fraction)
            overlook_score_values.append(view.overlook_score)

    if collect_debug_stats:
        if depth_p90_values:
            debug_stats['depth_p90_m_p50'] = float(np.percentile(depth_p90_values, 50))
            debug_stats['depth_p90_m_p90'] = float(np.percentile(depth_p90_values, 90))
            debug_stats['avg_open_sky_fraction'] = float(np.mean(open_sky_values))
            debug_stats['avg_overlook_score'] = float(np.mean(overlook_score_values))

        # Sample view analyzed points for debug visualization
        sample_view_analyzed = []
        for standing in top_standings:
            view = standing.view
            sample_view_analyzed.append({
                'lat': float(standing.location['lat']),
                'lon': float(standing.location['lon']),
                'overlook_score': float(view.overlook_score) if view else 0.0,
                'depth_p90_m': float(view.depth_p90_m) if view else 0.0,
                'open_sky_fraction': float(view.open_sky_fraction) if view else 0.0,
                'rim_strength': float(getattr(standing.properties, 'rim_strength', 0.0)),
            })
        debug_stats['sample_view_analyzed'] = sample_view_analyzed

    # Track total analyzed for debug stats
    all_analyzed = list(top_standings)
    view_analyzed_total = len(top_standings)

    # Step 6: Deduplicate spatially (first pass)
    final_standings = deduplicate_overlooks_spatially(
        overlook_standings=top_standings,
        min_distance_m=dedup_distance_m,
        max_results=max_results,
    )

    # Track pre-dedup count (all analyzed candidates)
    results_pre_dedup = len(top_standings)

    # Step 6b: Yield boost - if results are too few and we have more candidates,
    # increase top_k and run view analysis on additional candidates
    if (auto_thresholds and
        len(final_standings) < TARGET_RESULTS_MIN and
        len(standings) > chosen_top_k and
        chosen_top_k < VIEW_CANDIDATES_MAX):

        # Calculate how many more candidates to analyze
        boost_k = min(VIEW_CANDIDATES_MAX, len(standings))
        additional_standings = standings[chosen_top_k:boost_k]

        logging.info(
            f"Rim overlook: Yield boost - analyzing {len(additional_standings)} additional candidates "
            f"(had {len(final_standings)} results, target >= {TARGET_RESULTS_MIN})"
        )

        for standing in additional_standings:
            rim_strength_val = getattr(standing.properties, 'rim_strength', 0.0)
            view = compute_overlook_view(
                dem=dem,
                lat=standing.location["lat"],
                lon=standing.location["lon"],
                rim_strength=rim_strength_val,
                sun_position=sun_position,
                include_profile=False,
                curvature=curvature,
                slope_break=slope_break,
            )
            standing.view = view
            standing.properties.camera_bearing_deg = view.best_bearing_deg

            # Update explanations with access info if available
            if access_bias != "NONE":
                update_view_explanations_with_access(standing, access_max_distance_m)

            if collect_debug_stats:
                depth_p90_values.append(view.depth_p90_m)
                open_sky_values.append(view.open_sky_fraction)
                overlook_score_values.append(view.overlook_score)

        # Re-deduplicate with all analyzed candidates
        all_analyzed = top_standings + additional_standings
        view_analyzed_total = len(all_analyzed)
        results_pre_dedup = len(all_analyzed)

        final_standings = deduplicate_overlooks_spatially(
            overlook_standings=all_analyzed,
            min_distance_m=dedup_distance_m,
            max_results=max_results,
        )

        chosen_top_k = boost_k

        if collect_debug_stats and depth_p90_values:
            debug_stats['depth_p90_m_p50'] = float(np.percentile(depth_p90_values, 50))
            debug_stats['depth_p90_m_p90'] = float(np.percentile(depth_p90_values, 90))
            debug_stats['avg_open_sky_fraction'] = float(np.mean(open_sky_values))
            debug_stats['avg_overlook_score'] = float(np.mean(overlook_score_values))

        logging.info(f"Rim overlook: After yield boost, {len(final_standings)} results")

    # Cap results if too many
    if len(final_standings) > TARGET_RESULTS_MAX:
        final_standings = final_standings[:TARGET_RESULTS_MAX]
        logging.info(f"Rim overlook: Capped to {TARGET_RESULTS_MAX} results")

    # Final counts
    results_post_dedup = len(final_standings)

    if collect_debug_stats:
        debug_stats['view_analyzed_total'] = view_analyzed_total
        debug_stats['results_pre_dedup'] = results_pre_dedup
        debug_stats['results_post_dedup'] = results_post_dedup
        debug_stats['rejected_after_view_dedup'] = results_pre_dedup - results_post_dedup
        debug_stats['rejected_topk'] = len(standings) - view_analyzed_total
        debug_stats['chosen_view_candidates_k'] = chosen_top_k

    logging.info(
        f"Rim overlook: {len(final_standings)} final results after spatial dedup "
        f"(min distance {dedup_distance_m}m)"
    )

    # Generate nav links and collect access stats
    access_distances = []
    for standing in final_standings:
        lat = standing.location["lat"]
        lon = standing.location["lon"]
        standing.nav_link = f"https://www.google.com/maps?q={lat},{lon}"

        # Collect access distance for debug stats
        if standing.properties.distance_to_road_m is not None:
            access_distances.append(standing.properties.distance_to_road_m)

    # Compute access debug stats
    if collect_debug_stats and access_distances:
        within_max = sum(1 for d in access_distances if d <= access_max_distance_m)
        debug_stats['pct_results_within_access_distance'] = float(within_max / len(access_distances) * 100)
        debug_stats['distance_to_access_p50_m'] = float(np.percentile(access_distances, 50))
        debug_stats['distance_to_access_p90_m'] = float(np.percentile(access_distances, 90))

    return final_standings, debug_stats


def add_view_analysis_to_locations(
    dem: DEMGrid,
    standing_locations: List[StandingLocation],
    rim_strengths: Optional[dict] = None,
    sun_position: Optional[SunPosition] = None,
    max_candidates: int = 10,
    include_profile: bool = False,
) -> List[StandingLocation]:
    """
    Add overlook view analysis to standing locations.

    Only computes view analysis for top K candidates to keep runtime low.

    Args:
        dem: DEMGrid with elevation data
        standing_locations: List of standing locations
        rim_strengths: Dict mapping standing_id -> rim_strength
        sun_position: Optional sun position for alignment analysis
        max_candidates: Maximum locations to analyze
        include_profile: If True, include full horizon profile

    Returns:
        Updated standing locations (modified in place)
    """
    # Select candidates
    candidates = select_overlook_candidates(
        standing_locations=standing_locations,
        rim_strengths=rim_strengths,
        max_candidates=max_candidates,
    )

    # Compute view for each candidate
    for loc, rim_strength in candidates:
        view = compute_overlook_view(
            dem=dem,
            lat=loc.location["lat"],
            lon=loc.location["lon"],
            rim_strength=rim_strength,
            sun_position=sun_position,
            include_profile=include_profile,
        )
        loc.view = view

    return standing_locations
