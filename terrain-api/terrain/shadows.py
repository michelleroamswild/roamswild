"""
Shadow checking: verify sun visibility from a point.

Uses ray marching in local tangent-plane coordinates for precision.
Employs terrain angle analysis for numerically stable blocker detection.
"""
from __future__ import annotations

import math
import numpy as np
from .dem import DEMGrid
from .types import ShadowSample, ShadowCheck, SunPosition, BlockingPoint


# Default tolerance for blocker detection (0.1 degrees)
DEFAULT_BLOCKER_EPS_RAD = math.radians(0.1)
# Early exit threshold (if blocked by more than this, stop searching)
EARLY_EXIT_MARGIN_RAD = math.radians(0.5)
# Default number of samples
DEFAULT_NUM_SAMPLES = 20


def check_shadow(
    dem: DEMGrid,
    point_lat: float,
    point_lon: float,
    point_elevation: float,
    sun_position: SunPosition,
    num_samples: int = DEFAULT_NUM_SAMPLES,
    blocker_eps_deg: float = 0.1,
) -> ShadowCheck:
    """
    Check if the sun is visible from a point using terrain angle analysis.

    Uses log-spaced sampling distances to efficiently cover near and far terrain.
    Determines blocking via terrain angle comparison (numerically stable).

    The terrain angle at distance d is: atan((terrain_z - start_z) / d)
    Sun is visible iff max(terrain_angle) <= sun_altitude + eps

    Args:
        dem: DEMGrid with elevation data
        point_lat: Latitude of the point
        point_lon: Longitude of the point
        point_elevation: Elevation of the point (meters)
        sun_position: Current sun position
        num_samples: Number of sample points along ray (default 20)
        blocker_eps_deg: Tolerance for blocker detection in degrees (default 0.1°)

    Returns:
        ShadowCheck with visibility result, samples, and terrain angle analysis
    """
    # Ensure local coordinates are initialized
    if not dem.has_local_coords:
        dem.init_local_coords()

    # Convert start point to local meters
    x0, y0 = dem.latlon_to_xy(point_lat, point_lon)
    start_z = point_elevation

    # Sun parameters
    azimuth_rad = math.radians(sun_position.azimuth_deg)
    altitude_rad = math.radians(sun_position.altitude_deg)
    blocker_eps_rad = math.radians(blocker_eps_deg)

    # Unit direction toward sun in horizontal plane
    # Azimuth: 0° = North, 90° = East
    dir_x = math.sin(azimuth_rad)  # East component
    dir_y = math.cos(azimuth_rad)  # North component

    # Compute log-spaced distances
    d_min = max(dem.cell_size_m, 10.0)
    d_max = min(dem.grid_diagonal_m, 25000.0)

    # Generate log-spaced distances
    if d_max > d_min:
        distances = np.logspace(
            np.log10(d_min),
            np.log10(d_max),
            num_samples
        )
    else:
        distances = np.array([d_min])

    # Ray marching with terrain angle analysis
    samples = []
    max_terrain_angle_rad = float('-inf')
    max_terrain_angle_distance = 0.0
    first_blocked_distance = None
    blocking_point = None
    sun_visible = True

    for d in distances:
        # Position at distance d toward sun
        x_m = x0 + dir_x * d
        y_m = y0 + dir_y * d

        # Sample terrain elevation
        terrain_z = dem.sample_dem_z_xy(x_m, y_m)

        # Check if outside bounds
        if math.isnan(terrain_z):
            # Outside bounds, stop sampling
            break

        # Compute terrain angle: angle from start point to terrain at this distance
        # Positive angle = terrain above start, negative = terrain below
        dz = terrain_z - start_z
        terrain_angle_rad = math.atan(dz / d) if d > 0 else 0.0
        terrain_angle_deg = math.degrees(terrain_angle_rad)

        # Compute expected ray height at this distance (for sample output)
        ray_z = start_z + d * math.tan(altitude_rad)

        # Check if this terrain blocks the sun
        blocked = terrain_angle_rad > (altitude_rad + blocker_eps_rad)

        # Track maximum terrain angle
        if terrain_angle_rad > max_terrain_angle_rad:
            max_terrain_angle_rad = terrain_angle_rad
            max_terrain_angle_distance = d

        # Record first blocking point
        if blocked and first_blocked_distance is None:
            first_blocked_distance = d
            sun_visible = False

            # Convert blocking location back to lat/lon
            block_lat, block_lon = dem.xy_to_latlon(x_m, y_m)
            blocking_point = BlockingPoint(
                lat=block_lat,
                lon=block_lon,
                elevation_m=float(terrain_z),
                distance_m=float(d),
                terrain_angle_deg=terrain_angle_deg,
            )

        samples.append(ShadowSample(
            distance_m=float(d),
            ray_z=float(ray_z),
            terrain_z=float(terrain_z),
            blocked=blocked,
            terrain_angle_deg=terrain_angle_deg,
        ))

        # Early exit: if already blocked by significant margin, stop
        if blocked and (terrain_angle_rad - altitude_rad) > EARLY_EXIT_MARGIN_RAD:
            break

    # Compute final metrics
    max_terrain_angle_deg = math.degrees(max_terrain_angle_rad) if max_terrain_angle_rad > float('-inf') else 0.0
    blocking_margin_deg = sun_position.altitude_deg - max_terrain_angle_deg

    return ShadowCheck(
        checked_at_minutes=sun_position.minutes_from_start,
        sun_azimuth_deg=sun_position.azimuth_deg,
        sun_altitude_deg=sun_position.altitude_deg,
        samples=samples,
        sun_visible=sun_visible,
        # New analysis fields
        max_terrain_angle_deg=max_terrain_angle_deg,
        blocking_margin_deg=blocking_margin_deg,
        first_blocked_distance_m=first_blocked_distance,
        blocking_point=blocking_point,
    )


def check_shadow_at_peak(
    dem: DEMGrid,
    point_lat: float,
    point_lon: float,
    point_elevation: float,
    sun_track: list[SunPosition],
    peak_minutes: float,
) -> ShadowCheck:
    """
    Check shadow at the peak illumination time.

    Args:
        dem: DEMGrid
        point_lat, point_lon, point_elevation: Subject location
        sun_track: List of sun positions
        peak_minutes: Time of peak illumination

    Returns:
        ShadowCheck at peak time
    """
    # Find sun position closest to peak
    peak_sun = min(sun_track, key=lambda s: abs(s.minutes_from_start - peak_minutes))

    return check_shadow(
        dem=dem,
        point_lat=point_lat,
        point_lon=point_lon,
        point_elevation=point_elevation,
        sun_position=peak_sun,
    )


def is_sun_visible_during_glow(
    dem: DEMGrid,
    point_lat: float,
    point_lon: float,
    point_elevation: float,
    sun_track: list[SunPosition],
    glow_start_minutes: float,
    glow_end_minutes: float,
    sample_count: int = 3,
) -> bool:
    """
    Check if sun is visible at any point during the glow window.

    Args:
        dem: DEMGrid
        point_lat, point_lon, point_elevation: Location
        sun_track: Sun positions
        glow_start_minutes, glow_end_minutes: Glow window
        sample_count: Number of times to check

    Returns:
        True if sun is visible at any checked time
    """
    # Sample times within the glow window
    duration = glow_end_minutes - glow_start_minutes
    step = duration / (sample_count + 1)

    for i in range(1, sample_count + 1):
        check_minutes = glow_start_minutes + i * step

        # Find closest sun position
        sun_pos = min(sun_track, key=lambda s: abs(s.minutes_from_start - check_minutes))

        result = check_shadow(
            dem=dem,
            point_lat=point_lat,
            point_lon=point_lon,
            point_elevation=point_elevation,
            sun_position=sun_pos,
        )

        if result.sun_visible:
            return True

    return False
