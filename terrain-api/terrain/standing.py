"""
Standing location finder: where should the photographer stand?

Finds flat ground with clear line of sight to the subject.
"""

import math
from dataclasses import dataclass
from .dem import DEMGrid
from .analysis import compute_slope_aspect
from .types import (
    StandingLocation, StandingProperties, LineOfSight, LOSSample,
    CandidateSearch, RejectedCandidate
)


@dataclass
class StandingCandidate:
    """A potential standing location."""
    lat: float
    lon: float
    elevation: float
    slope_deg: float
    distance_m: float
    bearing_deg: float


def find_standing_location(
    dem: DEMGrid,
    subject_lat: float,
    subject_lon: float,
    subject_elevation: float,
    subject_normal: tuple[float, float, float],
    slope_grid: "np.ndarray | None" = None,
    max_slope_deg: float = 15.0,
    min_distance_m: float = 50.0,
    max_distance_m: float = 500.0,
    step_m: float = 20.0,
    eye_height_m: float = 1.7,
) -> tuple[StandingLocation | None, CandidateSearch]:
    """
    Find a suitable standing location for photographing a subject.

    Strategy:
    1. Step backward from subject along the surface normal direction
    2. Find a location with:
       - Flat enough ground (slope < max_slope_deg)
       - Clear line of sight to subject
       - Not too close or too far

    Args:
        dem: DEMGrid
        subject_lat, subject_lon, subject_elevation: Subject location
        subject_normal: (Nx, Ny, Nz) surface normal
        slope_grid: Pre-computed slope grid (optional)
        max_slope_deg: Maximum slope for standing
        min_distance_m, max_distance_m: Distance range
        step_m: Step size when searching
        eye_height_m: Photographer eye height

    Returns:
        (StandingLocation or None, CandidateSearch with rejected candidates)
    """
    import numpy as np

    # Compute slope if not provided
    if slope_grid is None:
        slope_grid, _ = compute_slope_aspect(dem)

    Nx, Ny, Nz = subject_normal

    # Horizontal direction (opposite of where surface faces = toward viewer)
    # We want to stand where we can see the surface, so step back along -normal
    horizontal_mag = math.sqrt(Nx**2 + Ny**2)

    if horizontal_mag < 0.01:
        # Nearly horizontal surface, use a default direction
        step_east = 0.0
        step_north = -1.0  # Default: step south
    else:
        # Normalize horizontal component and reverse (step away from surface)
        step_east = -Nx / horizontal_mag
        step_north = -Ny / horizontal_mag

    # Camera bearing: direction from standing to subject
    camera_bearing = math.degrees(math.atan2(-step_east, -step_north)) % 360

    # Convert step to lat/lon
    meters_per_deg_lat = 111320.0
    meters_per_deg_lon = 111320.0 * math.cos(math.radians(subject_lat))

    rejected = []
    candidates_checked = 0
    selected_distance = 0.0

    # Search at increasing distances
    distance = min_distance_m
    while distance <= max_distance_m:
        candidates_checked += 1

        # Calculate candidate position
        offset_m_north = step_north * distance
        offset_m_east = step_east * distance

        cand_lat = subject_lat + offset_m_north / meters_per_deg_lat
        cand_lon = subject_lon + offset_m_east / meters_per_deg_lon

        # Check if within DEM bounds
        if (cand_lat < dem.bounds["south"] or cand_lat > dem.bounds["north"] or
            cand_lon < dem.bounds["west"] or cand_lon > dem.bounds["east"]):
            rejected.append(RejectedCandidate(
                distance_m=distance,
                lat=cand_lat,
                lon=cand_lon,
                reason="out_of_bounds",
            ))
            distance += step_m
            continue

        # Get elevation and slope at candidate
        try:
            cand_elevation = dem.get_elevation_bilinear(cand_lat, cand_lon)
            row, col = dem.lat_lon_to_indices(cand_lat, cand_lon)
            cand_slope = float(slope_grid[row, col])
        except (IndexError, ValueError):
            rejected.append(RejectedCandidate(
                distance_m=distance,
                lat=cand_lat,
                lon=cand_lon,
                reason="out_of_bounds",
            ))
            distance += step_m
            continue

        # Check slope
        if cand_slope > max_slope_deg:
            rejected.append(RejectedCandidate(
                distance_m=distance,
                lat=cand_lat,
                lon=cand_lon,
                reason="slope_too_steep",
                slope_deg=cand_slope,
            ))
            distance += step_m
            continue

        # Check line of sight
        los_result = check_line_of_sight(
            dem=dem,
            from_lat=cand_lat,
            from_lon=cand_lon,
            from_elevation=cand_elevation + eye_height_m,
            to_lat=subject_lat,
            to_lon=subject_lon,
            to_elevation=subject_elevation,
        )

        if not los_result.clear:
            rejected.append(RejectedCandidate(
                distance_m=distance,
                lat=cand_lat,
                lon=cand_lon,
                reason="no_line_of_sight",
            ))
            distance += step_m
            continue

        # Found a valid location!
        selected_distance = distance
        elevation_diff = subject_elevation - cand_elevation

        standing = StandingLocation(
            standing_id=1,  # Will be set by caller
            subject_id=0,  # Will be set by caller
            location={"lat": cand_lat, "lon": cand_lon},
            properties=StandingProperties(
                elevation_m=cand_elevation,
                slope_deg=cand_slope,
                distance_to_subject_m=distance,
                camera_bearing_deg=camera_bearing,
                elevation_diff_m=elevation_diff,
            ),
            line_of_sight=los_result,
            candidate_search=CandidateSearch(
                candidates_checked=candidates_checked,
                rejected=rejected,
                selected_at_distance_m=selected_distance,
            ),
        )

        return standing, CandidateSearch(
            candidates_checked=candidates_checked,
            rejected=rejected,
            selected_at_distance_m=selected_distance,
        )

    # No valid location found
    return None, CandidateSearch(
        candidates_checked=candidates_checked,
        rejected=rejected,
        selected_at_distance_m=0.0,
    )


def check_line_of_sight(
    dem: DEMGrid,
    from_lat: float,
    from_lon: float,
    from_elevation: float,
    to_lat: float,
    to_lon: float,
    to_elevation: float,
    num_samples: int = 20,
    target_height_m: float = 0.0,
) -> LineOfSight:
    """
    Check if there's clear line of sight between two points.

    Args:
        dem: DEMGrid
        from_lat, from_lon, from_elevation: Observer position
        to_lat, to_lon, to_elevation: Target position
        num_samples: Number of points to check along the ray
        target_height_m: Height above ground to check at target

    Returns:
        LineOfSight with clear flag and samples
    """
    samples = []
    clear = True

    for i in range(1, num_samples):
        t = i / num_samples

        # Interpolate position
        lat = from_lat + t * (to_lat - from_lat)
        lon = from_lon + t * (to_lon - from_lon)
        ray_z = from_elevation + t * (to_elevation + target_height_m - from_elevation)

        # Get terrain elevation
        try:
            terrain_z = dem.get_elevation_bilinear(lat, lon)
        except (IndexError, ValueError):
            terrain_z = 0.0

        blocked = ray_z < terrain_z

        samples.append(LOSSample(
            t=t,
            ray_z=ray_z,
            terrain_z=terrain_z,
            blocked=blocked,
        ))

        if blocked:
            clear = False
            # Continue to collect all samples for visualization

    return LineOfSight(
        clear=clear,
        eye_height_m=from_elevation,
        target_height_m=to_elevation + target_height_m,
        samples=samples,
    )


def compute_camera_bearing(
    standing_lat: float,
    standing_lon: float,
    subject_lat: float,
    subject_lon: float,
) -> float:
    """
    Compute the bearing from standing location to subject.

    Returns:
        Bearing in degrees (0 = North, 90 = East)
    """
    d_lat = subject_lat - standing_lat
    d_lon = subject_lon - standing_lon

    # Adjust for longitude scale
    d_lon_scaled = d_lon * math.cos(math.radians(standing_lat))

    bearing = math.degrees(math.atan2(d_lon_scaled, d_lat)) % 360
    return bearing
