"""
Standing location finder: where should the photographer stand?

Uses constrained candidate search with hard truth-table constraints
to find valid standing positions for glow or rim photography.
"""
from __future__ import annotations

import math
import logging
from dataclasses import dataclass
from typing import Optional, Tuple, Dict, List
from .dem import DEMGrid
from .analysis import compute_slope_aspect
from .types import (
    StandingLocation, StandingProperties, LineOfSight, LOSSample,
    CandidateSearch, RejectedCandidate
)


@dataclass
class StandingCandidate:
    """A potential standing location with computed metrics."""
    lat: float
    lon: float
    elevation: float  # Ground elevation at standing point
    slope_deg: float
    distance_m: float
    camera_bearing_deg: float
    elevation_diff_m: float
    classification: str  # "glow" or "rim"
    deltas: Dict[str, float]  # Truth table deltas for validation
    score: float = 0.0
    # LOS info
    los_min_clearance_m: float = 0.0  # Minimum clearance along ray
    los_target_height_offset_m: float = 0.0  # Target height offset used


def angle_diff(a: float, b: float) -> float:
    """Compute minimum angular difference between two bearings (0-360)."""
    diff = abs(a - b) % 360
    return min(diff, 360 - diff)


def classify_standing_geometry(
    sun_azimuth: float,
    face_direction: float,
    camera_bearing: float,
    sun_altitude_deg: float = 15.0,
) -> Tuple[Optional[str], Dict[str, float]]:
    """
    Classify a standing position as glow, rim, or invalid.

    Truth table (standard):
    - GLOW: Δ(A_face, A_sun) <= 60° AND Δ(A_cam, A_sun) >= 90° AND Δ(A_cam, A_face) >= 120°
    - RIM: Δ(A_face, A_sun) in [60°, 120°] AND Δ(A_cam, A_sun) <= 45°
    - Invalid: Neither glow nor rim

    For low sun (altitude < 8°, e.g. sunrise/sunset golden hour):
    - GLOW camera constraint loosened: Δ(A_cam, A_sun) >= 60° (allows shooting partially into light)
    - Δ(A_cam, A_face) loosened to >= 90°

    Args:
        sun_azimuth: Sun azimuth in degrees
        face_direction: Subject face direction in degrees
        camera_bearing: Camera bearing from standing point to subject
        sun_altitude_deg: Sun altitude in degrees (default 15°, use lower for sunrise/sunset)

    Returns:
        (classification, deltas) where classification is "glow", "rim", or None
    """
    delta_face_sun = angle_diff(face_direction, sun_azimuth)
    delta_cam_sun = angle_diff(camera_bearing, sun_azimuth)
    delta_cam_face = angle_diff(camera_bearing, face_direction)

    deltas = {
        "delta_face_sun": delta_face_sun,
        "delta_cam_sun": delta_cam_sun,
        "delta_cam_face": delta_cam_face,
    }

    # Low sun threshold - when sun is below 8°, photographers often shoot into the light
    is_low_sun = sun_altitude_deg < 8.0

    # Check GLOW conditions:
    # - Face must be toward sun (delta <= 60°) - ALWAYS strict
    # - Camera vs sun: >= 90° normally, >= 60° for low sun (allows shooting into light)
    # - Camera vs face: >= 120° normally, >= 90° for low sun
    if is_low_sun:
        # Sunrise/sunset: allow shooting more into the light
        min_cam_sun = 60.0
        min_cam_face = 90.0
    else:
        # Standard: camera points away from sun
        min_cam_sun = 90.0
        min_cam_face = 120.0

    is_glow = (
        delta_face_sun <= 60 and
        delta_cam_sun >= min_cam_sun and
        delta_cam_face >= min_cam_face
    )

    if is_glow:
        return "glow", deltas

    # Check RIM conditions:
    # - Face at oblique angle to sun (60° <= delta <= 120°) for rim lighting
    # - Camera shooting toward sun (delta <= 45°) to see the bright edge
    is_rim = (
        60 <= delta_face_sun <= 120 and
        delta_cam_sun <= 45
    )

    if is_rim:
        return "rim", deltas

    return None, deltas


def get_target_height_offset(structure_class: str) -> float:
    """
    Get target height offset based on structure class.

    This represents the height above ground level to aim at when checking LOS.
    Dramatic features have vertical extent that should be visible even if
    the ground-level point is occluded.

    Args:
        structure_class: "micro-dramatic", "macro-dramatic", or "flat-lit"

    Returns:
        Height offset in meters
    """
    if structure_class == "macro-dramatic":
        return 15.0  # Large features like ridges, cliffs
    elif structure_class == "micro-dramatic":
        return 5.0   # Smaller features like rock outcrops
    else:
        return 0.0   # Flat terrain, aim at ground level


def find_standing_location(
    dem: DEMGrid,
    subject_lat: float,
    subject_lon: float,
    subject_elevation: float,
    subject_normal: tuple[float, float, float],
    slope_grid: "np.ndarray | None" = None,
    max_slope_deg: float = 20.0,  # Relaxed for rugged terrain (was 15°)
    glow_slope_bonus_deg: float = 5.0,  # Extra slope tolerance for glow (less critical stance)
    min_distance_m: float = 100.0,  # Allow closer for better composition (was 150m)
    max_distance_m: float = 1500.0,  # Configurable by subject size
    extended_search_bearing_deg: float = None,  # Direction for extended search if initial fails
    extended_search_max_m: float = 2500.0,  # Extended range for directional search
    step_m: float = 25.0,  # Sample every 25m
    eye_height_m: float = 1.7,
    sun_azimuth_deg: float = None,
    sun_altitude_deg: float = 5.0,  # Sun altitude for truth table (low sun loosens glow constraint)
    face_direction_deg: float = None,
    effective_width_m: float = None,
    structure_class: str = "unknown",
) -> Tuple[Optional[StandingLocation], CandidateSearch]:
    """
    Find a suitable standing location using constrained candidate search.

    Strategy:
    1. Generate candidate points in annulus around subject (150m-1500m)
    2. Apply hard filters: slope, LOS, truth table, wall trap, size trap
    3. Score remaining candidates
    4. Pick best candidate or reject subject

    Args:
        dem: DEMGrid with elevation data
        subject_lat, subject_lon, subject_elevation: Subject location
        subject_normal: (Nx, Ny, Nz) surface normal vector
        slope_grid: Pre-computed slope grid (optional)
        max_slope_deg: Maximum slope for standing (15° default)
        min_distance_m, max_distance_m: Distance range for search
        step_m: Step size for sampling (25m default)
        eye_height_m: Photographer eye height
        sun_azimuth_deg: Sun azimuth at peak (required for truth table)
        face_direction_deg: Subject face direction (required for truth table)
        effective_width_m: Subject effective width (for size trap)

    Returns:
        (StandingLocation or None, CandidateSearch with rejection details)
    """
    import numpy as np

    # Compute slope if not provided
    if slope_grid is None:
        slope_grid, _ = compute_slope_aspect(dem)

    # Compute face direction from normal if not provided
    if face_direction_deg is None:
        Nx, Ny, Nz = subject_normal
        horizontal_mag = math.sqrt(Nx**2 + Ny**2)
        if horizontal_mag > 0.01:
            face_direction_deg = math.degrees(math.atan2(Nx, Ny)) % 360
        else:
            face_direction_deg = 0.0

    # Validate required inputs
    if sun_azimuth_deg is None:
        logging.warning("Standing search: sun_azimuth_deg not provided, cannot validate geometry")
        return None, CandidateSearch(candidates_checked=0, rejected=[], selected_at_distance_m=0.0)

    # Convert meters to lat/lon
    meters_per_deg_lat = 111320.0
    meters_per_deg_lon = 111320.0 * math.cos(math.radians(subject_lat))

    all_rejected: List[RejectedCandidate] = []
    valid_candidates: List[StandingCandidate] = []
    total_candidates_checked = 0

    logging.info(
        f"Standing search: START at ({subject_lat:.4f}, {subject_lon:.4f}), "
        f"face={face_direction_deg:.1f}°, sun={sun_azimuth_deg:.1f}°"
    )

    # Search in annulus: sample points at different distances and angles
    # Use angular steps to create ring patterns around the subject
    num_angles = 36  # Sample every 10°
    distance = min_distance_m

    while distance <= max_distance_m:
        for angle_idx in range(num_angles):
            angle_rad = (angle_idx * 360.0 / num_angles) * math.pi / 180.0

            total_candidates_checked += 1

            # Calculate candidate position
            offset_m_north = distance * math.cos(angle_rad)
            offset_m_east = distance * math.sin(angle_rad)

            cand_lat = subject_lat + offset_m_north / meters_per_deg_lat
            cand_lon = subject_lon + offset_m_east / meters_per_deg_lon

            # Camera bearing: direction from standing position to subject
            camera_bearing = math.degrees(math.atan2(-offset_m_east, -offset_m_north)) % 360

            # === HARD FILTER 1: Bounds check ===
            if (cand_lat < dem.bounds["south"] or cand_lat > dem.bounds["north"] or
                cand_lon < dem.bounds["west"] or cand_lon > dem.bounds["east"]):
                all_rejected.append(RejectedCandidate(
                    distance_m=distance,
                    lat=cand_lat,
                    lon=cand_lon,
                    reason="out_of_bounds",
                ))
                continue

            # === Get elevation and slope ===
            try:
                cand_elevation = dem.get_elevation_bilinear(cand_lat, cand_lon)
                row, col = dem.lat_lon_to_indices(cand_lat, cand_lon)
                cand_slope = float(slope_grid[row, col])
            except (IndexError, ValueError):
                all_rejected.append(RejectedCandidate(
                    distance_m=distance,
                    lat=cand_lat,
                    lon=cand_lon,
                    reason="out_of_bounds",
                ))
                continue

            elevation_diff = subject_elevation - cand_elevation

            # === Pre-check: Truth table classification (needed for slope bonus) ===
            # Do truth table check early to determine if glow slope bonus applies
            classification, deltas = classify_standing_geometry(
                sun_azimuth=sun_azimuth_deg,
                face_direction=face_direction_deg,
                camera_bearing=camera_bearing,
                sun_altitude_deg=sun_altitude_deg,
            )

            # Determine effective slope threshold
            # Glow positions allow steeper slopes since stance is less critical for glow shots
            if classification == "glow":
                effective_max_slope = max_slope_deg + glow_slope_bonus_deg
            else:
                effective_max_slope = max_slope_deg

            # === HARD FILTER 2: Slope check (with glow bonus) ===
            if cand_slope > effective_max_slope:
                all_rejected.append(RejectedCandidate(
                    distance_m=distance,
                    lat=cand_lat,
                    lon=cand_lon,
                    reason="slope_too_steep",
                    slope_deg=cand_slope,
                ))
                continue

            # === HARD FILTER 3: Line of sight ===
            # Use target height offset based on structure class (macro +15m, micro +5m)
            # This aims at the visible feature, not the ground level
            target_height_offset = get_target_height_offset(structure_class)
            los_result = check_line_of_sight(
                dem=dem,
                from_lat=cand_lat,
                from_lon=cand_lon,
                from_elevation=cand_elevation + eye_height_m,
                to_lat=subject_lat,
                to_lon=subject_lon,
                to_elevation=subject_elevation,
                target_height_m=target_height_offset,
            )

            if not los_result.clear:
                all_rejected.append(RejectedCandidate(
                    distance_m=distance,
                    lat=cand_lat,
                    lon=cand_lon,
                    reason="no_line_of_sight",
                ))
                continue

            # Compute min clearance from LOS samples for logging
            los_min_clearance = min(
                (s.ray_z - s.terrain_z for s in los_result.samples),
                default=0.0
            )

            # === HARD FILTER 4: Truth table (glow/rim classification) ===
            # Classification already computed above for slope bonus determination
            if classification is None:
                all_rejected.append(RejectedCandidate(
                    distance_m=distance,
                    lat=cand_lat,
                    lon=cand_lon,
                    reason="invalid_geometry",
                ))
                continue

            # === HARD FILTER 5: Vertical wall trap ===
            # If standing at base of tall wall (elev_diff > 80m, distance < 300m) → reject
            if elevation_diff > 80 and distance < 300:
                all_rejected.append(RejectedCandidate(
                    distance_m=distance,
                    lat=cand_lat,
                    lon=cand_lon,
                    reason="vertical_wall_trap",
                ))
                continue

            # === HARD FILTER 6: Oversized subject trap ===
            # If subject is too large to fit in frame at this distance → reject
            # Using FOV ~ 60° → tan(30°) ≈ 0.577
            if effective_width_m is not None:
                max_visible_width = 2 * distance * 0.577  # tan(30°)
                if effective_width_m > max_visible_width:
                    all_rejected.append(RejectedCandidate(
                        distance_m=distance,
                        lat=cand_lat,
                        lon=cand_lon,
                        reason="subject_too_large",
                    ))
                    continue

            # === Candidate passed all filters! ===
            candidate = StandingCandidate(
                lat=cand_lat,
                lon=cand_lon,
                elevation=cand_elevation,
                slope_deg=cand_slope,
                distance_m=distance,
                camera_bearing_deg=camera_bearing,
                elevation_diff_m=elevation_diff,
                classification=classification,
                deltas=deltas,
                los_min_clearance_m=los_min_clearance,
                los_target_height_offset_m=target_height_offset,
            )

            # Score the candidate (lower slope, moderate distance preferred)
            candidate.score = score_candidate(candidate, min_distance_m, max_distance_m, face_direction_deg)
            valid_candidates.append(candidate)

        distance += step_m

    # === Extended directional search ===
    # If no candidates found in preferred direction, search further out in that direction
    if extended_search_bearing_deg is not None:
        # Check if we have any candidates near the preferred bearing
        preferred_bearing = extended_search_bearing_deg
        has_preferred = any(
            angle_diff(c.camera_bearing_deg, (preferred_bearing + 180) % 360) < 45
            for c in valid_candidates
        )

        if not has_preferred and max_distance_m < extended_search_max_m:
            logging.info(
                f"Standing search: EXTENDED SEARCH in bearing {preferred_bearing:.0f}° "
                f"from {max_distance_m:.0f}m to {extended_search_max_m:.0f}m"
            )

            # Search along the preferred bearing ± 30°
            extended_angles = [preferred_bearing - 30, preferred_bearing - 15, preferred_bearing,
                             preferred_bearing + 15, preferred_bearing + 30]

            distance = max_distance_m + step_m
            while distance <= extended_search_max_m:
                for ext_angle in extended_angles:
                    angle_rad = math.radians(ext_angle)
                    total_candidates_checked += 1

                    offset_m_north = distance * math.cos(angle_rad)
                    offset_m_east = distance * math.sin(angle_rad)

                    cand_lat = subject_lat + offset_m_north / meters_per_deg_lat
                    cand_lon = subject_lon + offset_m_east / meters_per_deg_lon

                    camera_bearing = math.degrees(math.atan2(-offset_m_east, -offset_m_north)) % 360

                    # Bounds check
                    if (cand_lat < dem.bounds["south"] or cand_lat > dem.bounds["north"] or
                        cand_lon < dem.bounds["west"] or cand_lon > dem.bounds["east"]):
                        continue

                    try:
                        cand_elevation = dem.get_elevation_bilinear(cand_lat, cand_lon)
                        row, col = dem.lat_lon_to_indices(cand_lat, cand_lon)
                        cand_slope = float(slope_grid[row, col])
                    except (IndexError, ValueError):
                        continue

                    elevation_diff = subject_elevation - cand_elevation

                    # Classification
                    classification, deltas = classify_standing_geometry(
                        sun_azimuth=sun_azimuth_deg,
                        face_direction=face_direction_deg,
                        camera_bearing=camera_bearing,
                        sun_altitude_deg=sun_altitude_deg,
                    )

                    # Slope check with glow bonus
                    effective_max_slope = max_slope_deg + glow_slope_bonus_deg if classification == "glow" else max_slope_deg
                    if cand_slope > effective_max_slope:
                        continue

                    # LOS check
                    target_height_offset = get_target_height_offset(structure_class)
                    los_result = check_line_of_sight(
                        dem=dem,
                        from_lat=cand_lat,
                        from_lon=cand_lon,
                        from_elevation=cand_elevation + eye_height_m,
                        to_lat=subject_lat,
                        to_lon=subject_lon,
                        to_elevation=subject_elevation,
                        target_height_m=target_height_offset,
                    )
                    if not los_result.clear:
                        continue

                    # Truth table
                    if classification is None:
                        continue

                    # Wall trap
                    if elevation_diff > 80 and distance < 300:
                        continue

                    # Size trap
                    if effective_width_m is not None:
                        max_visible_width = 2 * distance * 0.577
                        if effective_width_m > max_visible_width:
                            continue

                    # Valid candidate from extended search!
                    los_min_clearance = min((s.ray_z - s.terrain_z for s in los_result.samples), default=0.0)

                    candidate = StandingCandidate(
                        lat=cand_lat,
                        lon=cand_lon,
                        elevation=cand_elevation,
                        slope_deg=cand_slope,
                        distance_m=distance,
                        camera_bearing_deg=camera_bearing,
                        elevation_diff_m=elevation_diff,
                        classification=classification,
                        deltas=deltas,
                        los_min_clearance_m=los_min_clearance,
                        los_target_height_offset_m=target_height_offset,
                    )
                    candidate.score = score_candidate(candidate, min_distance_m, extended_search_max_m, face_direction_deg)
                    # Bonus for being in preferred direction (already included in directional_bonus)
                    valid_candidates.append(candidate)

                    logging.info(
                        f"Standing search: FOUND extended candidate at {distance:.0f}m, "
                        f"bearing {camera_bearing:.0f}°"
                    )

                distance += step_m

    # === Select best candidate ===
    if not valid_candidates:
        logging.warning(
            f"Standing search: FAILED at ({subject_lat:.6f}, {subject_lon:.6f}) - "
            f"checked {total_candidates_checked} candidates, all rejected"
        )
        return None, CandidateSearch(
            candidates_checked=total_candidates_checked,
            rejected=all_rejected,
            selected_at_distance_m=0.0,
        )

    # Sort by score (descending) and pick the best
    valid_candidates.sort(key=lambda c: c.score, reverse=True)
    best = valid_candidates[0]

    logging.info(
        f"Standing search: FOUND {best.classification} at ({best.lat:.6f}, {best.lon:.6f}), "
        f"distance={best.distance_m:.0f}m, camera_bearing={best.camera_bearing_deg:.1f}°"
    )
    logging.info(
        f"  stand_ground_elev={best.elevation:.1f}m, observer_height={best.elevation + eye_height_m:.1f}m (ground + {eye_height_m}m eye)"
    )
    logging.info(
        f"  target_ground_elev={subject_elevation:.1f}m, target_aim={subject_elevation + best.los_target_height_offset_m:.1f}m (+{best.los_target_height_offset_m:.0f}m {structure_class})"
    )
    logging.info(
        f"  LOS_min_clearance={best.los_min_clearance_m:+.1f}m, score={best.score:.2f}"
    )

    standing = StandingLocation(
        standing_id=1,  # Will be set by caller
        subject_id=0,  # Will be set by caller
        location={"lat": best.lat, "lon": best.lon},
        properties=StandingProperties(
            elevation_m=best.elevation,  # Ground elevation at standing point
            slope_deg=best.slope_deg,
            distance_to_subject_m=best.distance_m,
            camera_bearing_deg=best.camera_bearing_deg,
            elevation_diff_m=best.elevation_diff_m,
        ),
        line_of_sight=LineOfSight(
            clear=True,
            eye_height_m=best.elevation + eye_height_m,  # Ground + eye height
            target_height_m=subject_elevation + best.los_target_height_offset_m,  # Ground + structure offset
            samples=[],
        ),
        candidate_search=CandidateSearch(
            candidates_checked=total_candidates_checked,
            rejected=all_rejected,
            selected_at_distance_m=best.distance_m,
        ),
    )

    # Add classification, LOS clearance, and validation deltas to properties
    standing.properties.classification = best.classification
    standing.properties.geometry_deltas = best.deltas
    standing.properties.los_min_clearance_m = best.los_min_clearance_m
    standing.properties.target_height_offset_m = best.los_target_height_offset_m

    return standing, CandidateSearch(
        candidates_checked=total_candidates_checked,
        rejected=all_rejected,
        selected_at_distance_m=best.distance_m,
    )


def score_candidate(
    candidate: StandingCandidate,
    min_distance: float,
    max_distance: float,
    face_direction_deg: float = None,
) -> float:
    """
    Score a valid candidate for selection.

    Scoring factors:
    - Lower slope is better (0-15° range)
    - Moderate distance is preferred (not too close, not too far)
    - Reasonable elevation difference
    - For glow: directional bonus for standing in face direction
    """
    # Slope score: 1.0 at 0°, 0.0 at 15°
    slope_score = max(0, 1.0 - candidate.slope_deg / 15.0)

    # Distance score: prefer middle of range
    # Gaussian-like preference for middle distance
    optimal_distance = (min_distance + max_distance) / 2
    distance_range = max_distance - min_distance
    distance_deviation = abs(candidate.distance_m - optimal_distance) / (distance_range / 2)
    distance_score = max(0, 1.0 - distance_deviation * 0.5)

    # Elevation diff score: prefer moderate differences (good for composition)
    # Penalize extreme elevation differences
    elev_diff_abs = abs(candidate.elevation_diff_m)
    if elev_diff_abs < 10:
        elev_score = 0.8  # Very flat, less dramatic
    elif elev_diff_abs < 50:
        elev_score = 1.0  # Good for composition
    elif elev_diff_abs < 100:
        elev_score = 0.8  # Still reasonable
    else:
        elev_score = max(0.3, 1.0 - (elev_diff_abs - 100) / 200)

    # Glow gets slight preference over rim (more dramatic lighting)
    classification_bonus = 0.1 if candidate.classification == "glow" else 0.0

    # Directional bonus for glow: prefer standing in face direction
    # For glow, ideal camera bearing is 180° opposite face direction (shoot toward face)
    directional_bonus = 0.0
    if candidate.classification == "glow" and face_direction_deg is not None:
        ideal_camera_bearing = (face_direction_deg + 180) % 360
        bearing_diff = angle_diff(candidate.camera_bearing_deg, ideal_camera_bearing)
        # Max bonus at 0° diff, tapering to 0 at 90° diff
        # This bonus is significant (0.2) to prefer face-aligned positions
        if bearing_diff <= 90:
            directional_bonus = 0.2 * (1 - bearing_diff / 90)

    # Weighted combination
    score = (
        slope_score * 0.30 +
        distance_score * 0.25 +
        elev_score * 0.20 +
        classification_bonus * 0.05 +
        directional_bonus +  # Up to 0.2 bonus for face-aligned glow
        0.5  # Base score for passing all filters
    )

    return score


def _summarize_rejections(rejected: List[RejectedCandidate]) -> Dict[str, int]:
    """Summarize rejection reasons."""
    from collections import Counter
    return dict(Counter(r.reason for r in rejected))


def log_rejection_histogram(
    rejected: List[RejectedCandidate],
    total_checked: int,
    subject_info: str = "",
) -> None:
    """
    Log a detailed rejection breakdown histogram.

    Shows counts for each rejection reason with percentages.
    """
    from collections import Counter

    counts = Counter(r.reason for r in rejected)

    # Map internal reason names to user-friendly labels
    reason_labels = {
        "out_of_bounds": "Out of DEM bounds",
        "slope_too_steep": "Stand slope too steep",
        "no_line_of_sight": "Line of sight blocked",
        "invalid_geometry": "Truth table (not glow/rim)",
        "vertical_wall_trap": "Elev diff trap (wall)",
        "subject_too_large": "FOV/extent (too large)",
    }

    logging.warning("=" * 60)
    logging.warning(f"STANDING LOCATION REJECTION BREAKDOWN{subject_info}")
    logging.warning("=" * 60)
    logging.warning(f"Total candidates checked: {total_checked}")
    logging.warning(f"Total rejected: {len(rejected)}")
    logging.warning("-" * 60)

    # Sort by count descending
    for reason, count in sorted(counts.items(), key=lambda x: -x[1]):
        label = reason_labels.get(reason, reason)
        pct = 100 * count / total_checked if total_checked > 0 else 0
        bar_len = int(pct / 2)  # Max 50 chars for 100%
        bar = "█" * bar_len
        logging.warning(f"  {label:30s} {count:5d} ({pct:5.1f}%) {bar}")

    logging.warning("=" * 60)


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
    endpoint_exclusion_m: float = None,
) -> LineOfSight:
    """
    Check if there's clear line of sight between two points.

    Args:
        dem: DEMGrid
        from_lat, from_lon, from_elevation: Observer position
        to_lat, to_lon, to_elevation: Target position
        num_samples: Number of points to check along the ray
        target_height_m: Height above ground to check at target
        endpoint_exclusion_m: Ignore blockers within this distance of target.
                              If None, uses max(25m, 2×cell_size).
                              This prevents self-blocking by the subject terrain.

    Returns:
        LineOfSight with clear flag and samples
    """
    samples = []
    clear = True

    # Calculate total distance for endpoint exclusion
    meters_per_deg_lat = 111320.0
    meters_per_deg_lon = 111320.0 * math.cos(math.radians(from_lat))
    d_lat = to_lat - from_lat
    d_lon = to_lon - from_lon
    total_distance_m = math.sqrt((d_lat * meters_per_deg_lat)**2 + (d_lon * meters_per_deg_lon)**2)

    # Default endpoint exclusion: max(25m, 2×cell_size)
    if endpoint_exclusion_m is None:
        endpoint_exclusion_m = max(25.0, 2 * dem.cell_size_m)

    # Calculate t threshold for exclusion zone (what fraction of ray is excluded at end)
    if total_distance_m > 0:
        exclusion_t = 1.0 - (endpoint_exclusion_m / total_distance_m)
    else:
        exclusion_t = 1.0

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

        # Check if blocked, but ignore blockers in endpoint exclusion zone
        # This prevents self-blocking by the subject terrain feature
        in_exclusion_zone = t > exclusion_t
        blocked = ray_z < terrain_z and not in_exclusion_zone

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


def log_terrain_profile_along_bearing(
    dem: DEMGrid,
    subject_lat: float,
    subject_lon: float,
    subject_elevation: float,
    bearing_deg: float,
    min_distance_m: float = 100.0,
    max_distance_m: float = 1500.0,
    step_m: float = 50.0,
    eye_height_m: float = 1.7,
) -> Dict[str, any]:
    """
    Log terrain profile along a specific bearing from subject.

    Useful for diagnosing why standing locations fail in a direction.

    Args:
        dem: DEMGrid
        subject_lat, subject_lon, subject_elevation: Subject location
        bearing_deg: Direction to profile (0=N, 90=E, 180=S, 270=W)
        min_distance_m, max_distance_m: Range to profile
        step_m: Step size
        eye_height_m: Observer eye height

    Returns:
        Dict with profile data and rejection analysis
    """
    import numpy as np
    from .analysis import compute_slope_aspect

    slope_grid, _ = compute_slope_aspect(dem)

    meters_per_deg_lat = 111320.0
    meters_per_deg_lon = 111320.0 * math.cos(math.radians(subject_lat))

    bearing_rad = math.radians(bearing_deg)

    profile = []

    logging.warning("=" * 70)
    logging.warning(f"TERRAIN PROFILE ALONG BEARING {bearing_deg:.0f}° FROM ({subject_lat:.6f}, {subject_lon:.6f})")
    logging.warning("=" * 70)
    logging.warning(f"{'Dist(m)':>8} {'Elev(m)':>8} {'Slope°':>7} {'LOS':>5} {'ElevDiff':>9} Notes")
    logging.warning("-" * 70)

    distance = min_distance_m
    while distance <= max_distance_m:
        # Candidate is at bearing FROM subject, so camera points back
        offset_m_north = distance * math.cos(bearing_rad)
        offset_m_east = distance * math.sin(bearing_rad)

        cand_lat = subject_lat + offset_m_north / meters_per_deg_lat
        cand_lon = subject_lon + offset_m_east / meters_per_deg_lon

        try:
            cand_elev = dem.get_elevation_bilinear(cand_lat, cand_lon)
            row, col = dem.lat_lon_to_indices(cand_lat, cand_lon)
            cand_slope = float(slope_grid[row, col])
        except (IndexError, ValueError):
            cand_elev = 0
            cand_slope = 0

        elev_diff = subject_elevation - cand_elev

        # Check LOS
        los_result = check_line_of_sight(
            dem=dem,
            from_lat=cand_lat,
            from_lon=cand_lon,
            from_elevation=cand_elev + eye_height_m,
            to_lat=subject_lat,
            to_lon=subject_lon,
            to_elevation=subject_elevation,
            target_height_m=5.0,  # Assume micro-dramatic
        )

        los_status = "OK" if los_result.clear else "BLOCK"

        # Identify issues
        issues = []
        if cand_slope > 25:
            issues.append(f"STEEP({cand_slope:.0f}°)")
        elif cand_slope > 20:
            issues.append(f"steep({cand_slope:.0f}°)")
        if not los_result.clear:
            issues.append("blocked")
        if elev_diff > 80 and distance < 300:
            issues.append("wall-trap")

        notes = ", ".join(issues) if issues else "viable"

        logging.warning(
            f"{distance:>8.0f} {cand_elev:>8.1f} {cand_slope:>7.1f} {los_status:>5} {elev_diff:>+9.1f} {notes}"
        )

        profile.append({
            "distance_m": distance,
            "lat": cand_lat,
            "lon": cand_lon,
            "elevation_m": cand_elev,
            "slope_deg": cand_slope,
            "los_clear": los_result.clear,
            "elev_diff_m": elev_diff,
        })

        distance += step_m

    logging.warning("=" * 70)

    # Summary
    viable_count = sum(1 for p in profile if p["los_clear"] and p["slope_deg"] <= 25)
    steep_count = sum(1 for p in profile if p["slope_deg"] > 20)
    blocked_count = sum(1 for p in profile if not p["los_clear"])

    logging.warning(f"SUMMARY: {viable_count} viable, {steep_count} steep (>20°), {blocked_count} LOS blocked")
    logging.warning("=" * 70)

    return {
        "bearing_deg": bearing_deg,
        "profile": profile,
        "viable_count": viable_count,
        "steep_count": steep_count,
        "blocked_count": blocked_count,
    }
