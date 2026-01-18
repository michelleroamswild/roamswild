"""
Shadow checking: verify sun visibility from a point.

Uses ray marching to check if terrain blocks the sun.
"""
from __future__ import annotations

import math
from .dem import DEMGrid
from .types import ShadowSample, ShadowCheck, SunPosition


def check_shadow(
    dem: DEMGrid,
    point_lat: float,
    point_lon: float,
    point_elevation: float,
    sun_position: SunPosition,
    max_distance_m: float = 5000.0,
    sample_interval_m: float = 50.0,
) -> ShadowCheck:
    """
    Check if the sun is visible from a point by ray marching.

    Args:
        dem: DEMGrid with elevation data
        point_lat: Latitude of the point
        point_lon: Longitude of the point
        point_elevation: Elevation of the point (meters)
        sun_position: Current sun position
        max_distance_m: Maximum distance to check
        sample_interval_m: Distance between ray samples

    Returns:
        ShadowCheck with visibility result and samples
    """
    # Sun direction (toward sun)
    azimuth_rad = math.radians(sun_position.azimuth_deg)
    altitude_rad = math.radians(sun_position.altitude_deg)

    # Horizontal step direction (meters)
    dx_m = math.sin(azimuth_rad) * sample_interval_m  # East
    dy_m = math.cos(azimuth_rad) * sample_interval_m  # North

    # Vertical step (meters per horizontal step)
    dz_m = math.tan(altitude_rad) * sample_interval_m

    # Convert horizontal steps to lat/lon
    # Approximate: 1 degree lat ≈ 111320 m, 1 degree lon ≈ 111320 * cos(lat) m
    meters_per_deg_lat = 111320.0
    meters_per_deg_lon = 111320.0 * math.cos(math.radians(point_lat))

    d_lat = dy_m / meters_per_deg_lat
    d_lon = dx_m / meters_per_deg_lon

    samples = []
    current_lat = point_lat
    current_lon = point_lon
    ray_z = point_elevation
    distance = 0.0
    sun_visible = True

    num_steps = int(max_distance_m / sample_interval_m)

    for _ in range(num_steps):
        # Move along ray
        current_lat += d_lat
        current_lon += d_lon
        ray_z += dz_m
        distance += sample_interval_m

        # Check if we're outside the DEM bounds
        if (current_lat < dem.bounds["south"] or current_lat > dem.bounds["north"] or
            current_lon < dem.bounds["west"] or current_lon > dem.bounds["east"]):
            # Outside bounds, assume clear
            break

        # Get terrain elevation at this point
        try:
            terrain_z = dem.get_elevation_bilinear(current_lat, current_lon)
        except (IndexError, ValueError):
            break

        blocked = ray_z < terrain_z

        samples.append(ShadowSample(
            distance_m=distance,
            ray_z=ray_z,
            terrain_z=terrain_z,
            blocked=blocked,
        ))

        if blocked:
            sun_visible = False
            break  # Stop at first blockage

    return ShadowCheck(
        checked_at_minutes=sun_position.minutes_from_start,
        sun_azimuth_deg=sun_position.azimuth_deg,
        sun_altitude_deg=sun_position.altitude_deg,
        samples=samples,
        sun_visible=sun_visible,
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
