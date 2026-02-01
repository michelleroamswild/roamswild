"""
Overlook View Analysis: horizon profiles and viewpoint quality scoring.

Computes horizon profiles for standing locations to assess overlook quality.
Uses log-spaced ray sampling for efficient coverage of near and far terrain.
"""
from __future__ import annotations

import math
import numpy as np
from dataclasses import dataclass
from typing import List, Optional, Tuple

from .dem import DEMGrid
from .types import (
    HorizonSample, SunAlignment, OverlookView, SunPosition,
    StandingLocation, ViewExplanations,
)


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
    open_sky_fraction: float,
    depth_p90_m: float,
    horizon_complexity: int,
    rim_strength: float = 0.0,
) -> float:
    """
    Compute overall overlook quality score.

    Args:
        open_sky_fraction: Fraction of open azimuths (0-1)
        depth_p90_m: 90th percentile view depth
        horizon_complexity: Number of horizon peaks
        rim_strength: TPI-based rim strength (0-1)

    Returns:
        overlook_score (0-1)
    """
    # Normalize inputs
    depth_norm = min(1.0, depth_p90_m / DEPTH_NORMALIZATION_M)
    complexity_norm = min(1.0, horizon_complexity / COMPLEXITY_NORMALIZATION)

    # Weighted combination
    score = (
        WEIGHT_DEPTH * depth_norm +
        WEIGHT_OPEN_SKY * open_sky_fraction +
        WEIGHT_COMPLEXITY * complexity_norm +
        WEIGHT_RIM_STRENGTH * rim_strength
    )

    return min(1.0, max(0.0, score))


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
) -> ViewExplanations:
    """
    Generate human-readable explanations for view quality.

    Args:
        overlook_score: Overall overlook quality (0-1)
        open_sky_fraction: Fraction of open azimuths
        depth_p90_m: 90th percentile view depth
        horizon_complexity: Number of horizon peaks
        rim_strength: TPI-based rim strength
        sun_alignment: Optional sun alignment data

    Returns:
        ViewExplanations with short and long descriptions
    """
    # Build descriptive phrases based on metrics
    open_sky_pct = int(open_sky_fraction * 100)
    depth_km = depth_p90_m / 1000.0

    # Short description components
    short_parts = []

    # Open sky description
    if open_sky_fraction >= 0.7:
        short_parts.append("Wide-open horizon")
    elif open_sky_fraction >= 0.4:
        short_parts.append("Partial horizon views")
    else:
        short_parts.append("Enclosed viewpoint")

    # Depth description
    if depth_p90_m >= 5000:
        short_parts.append("deep valley layers")
    elif depth_p90_m >= 2000:
        short_parts.append("good sightlines")
    else:
        short_parts.append("local views")

    # Combine short description (max 80 chars)
    short_desc = " + ".join(short_parts)
    if len(short_desc) > 80:
        short_desc = short_desc[:77] + "..."

    # Long description with details
    long_parts = []

    # Location type based on rim strength
    if rim_strength >= 0.5:
        long_parts.append("Rim viewpoint")
    elif rim_strength >= 0.2:
        long_parts.append("Elevated viewpoint")
    else:
        long_parts.append("Viewpoint")

    # View metrics
    metrics_desc = f"with {open_sky_pct}% open sky"
    if depth_km >= 1.0:
        metrics_desc += f" and long sightlines (p90 {depth_km:.1f} km)"
    long_parts.append(metrics_desc)

    # Horizon complexity
    if horizon_complexity >= 10:
        long_parts.append("Complex layered horizon.")
    elif horizon_complexity >= 5:
        long_parts.append("Interesting horizon profile.")

    # Sun alignment info
    if sun_alignment is not None:
        if sun_alignment.behind_ridge:
            margin = abs(sun_alignment.blocking_margin_deg)
            long_parts.append(f"Sun drops behind the ridge early (blocked by {margin:.1f}°).")
        else:
            margin = sun_alignment.blocking_margin_deg
            if margin > 0:
                long_parts.append(f"Sun clears the skyline by {margin:.1f}°.")

    # Combine long description
    long_desc = " ".join(long_parts)

    # Ensure short desc doesn't exceed 80 chars
    if len(short_desc) > 80:
        short_desc = short_desc[:77] + "..."

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

    # Derive view metrics
    open_sky_fraction, depth_p50_m, depth_p90_m, horizon_complexity = compute_view_metrics(profile)

    # Compute overlook score
    overlook_score = compute_overlook_score(
        open_sky_fraction=open_sky_fraction,
        depth_p90_m=depth_p90_m,
        horizon_complexity=horizon_complexity,
        rim_strength=rim_strength,
    )

    # Find best bearing
    best_bearing, _ = find_best_bearing(profile)

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

    # Generate human-readable explanations
    explanations = generate_view_explanations(
        overlook_score=overlook_score,
        open_sky_fraction=open_sky_fraction,
        depth_p90_m=depth_p90_m,
        horizon_complexity=horizon_complexity,
        rim_strength=rim_strength,
        sun_alignment=sun_alignment,
    )

    # Build output
    return OverlookView(
        open_sky_fraction=open_sky_fraction,
        depth_p50_m=depth_p50_m,
        depth_p90_m=depth_p90_m,
        horizon_complexity=horizon_complexity,
        overlook_score=overlook_score,
        best_bearing_deg=best_bearing,
        fov_deg=DEFAULT_FOV_DEG,
        view_cone=view_cone,
        explanations=explanations,
        sun_alignment=sun_alignment,
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
