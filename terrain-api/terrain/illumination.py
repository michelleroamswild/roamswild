"""
Sun-surface illumination calculations.

Computes incidence angles, glow scores, and optimal lighting windows.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from .types import SunPosition, IncidencePoint, GlowWindow


def compute_incidence(
    normal: tuple[float, float, float],
    sun_vector: tuple[float, float, float],
) -> float:
    """
    Compute incidence angle (dot product of surface normal and sun vector).

    Args:
        normal: (Nx, Ny, Nz) surface normal unit vector
        sun_vector: (Sx, Sy, Sz) sun direction unit vector

    Returns:
        Incidence value in range [-1, 1]
        - ~1: Front-lit (sun directly facing surface) - flat lighting
        - ~0.2: Side/grazing light - OPTIMAL for photography
        - ~0: Grazing light
        - <0: Backlit (sun behind surface)
    """
    Nx, Ny, Nz = normal
    Sx, Sy, Sz = sun_vector

    return Nx * Sx + Ny * Sy + Nz * Sz


def compute_glow_score(
    incidence: float,
    target_incidence: float = 0.2,
    sigma: float = 0.15,
) -> float:
    """
    Compute glow score from incidence angle.

    Optimal glow occurs at grazing angles (~0.2 incidence) where
    light rakes across the surface creating texture and drama.

    Args:
        incidence: Dot product of normal and sun vector
        target_incidence: Optimal incidence for glow (default 0.2)
        sigma: Spread of the glow function

    Returns:
        Glow score in range [0, 1] where 1 = optimal
    """
    if incidence < 0:
        return 0.0  # Backlit, no glow

    # Gaussian centered at target incidence
    diff = incidence - target_incidence
    score = math.exp(-(diff ** 2) / (2 * sigma ** 2))

    return score


def compute_incidence_series(
    normal: tuple[float, float, float],
    sun_track: list[SunPosition],
) -> list[IncidencePoint]:
    """
    Compute incidence and glow score over time for a surface.

    Args:
        normal: Surface normal unit vector
        sun_track: List of sun positions over time

    Returns:
        List of IncidencePoint with incidence and glow_score at each time
    """
    series = []

    for sun_pos in sun_track:
        incidence = compute_incidence(normal, sun_pos.vector)
        glow = compute_glow_score(incidence)

        series.append(IncidencePoint(
            minutes=sun_pos.minutes_from_start,
            incidence=incidence,
            glow_score=glow,
        ))

    return series


def detect_glow_window(
    incidence_series: list[IncidencePoint],
    min_glow_score: float = 0.5,
    min_incidence: float = 0.05,
    max_incidence: float = 0.40,
) -> GlowWindow | None:
    """
    Detect the window of optimal lighting.

    Args:
        incidence_series: Time series of incidence/glow
        min_glow_score: Minimum glow score to consider "good"
        min_incidence: Minimum incidence for valid glow
        max_incidence: Maximum incidence for valid glow

    Returns:
        GlowWindow if found, None otherwise
    """
    # Find points within the glow range
    glow_points = [
        p for p in incidence_series
        if p.glow_score >= min_glow_score
        and min_incidence <= p.incidence <= max_incidence
    ]

    if not glow_points:
        return None

    # Find contiguous window
    start_minutes = min(p.minutes for p in glow_points)
    end_minutes = max(p.minutes for p in glow_points)

    # Find peak
    peak_point = max(glow_points, key=lambda p: p.glow_score)

    return GlowWindow(
        start_minutes=start_minutes,
        end_minutes=end_minutes,
        peak_minutes=peak_point.minutes,
        duration_minutes=end_minutes - start_minutes,
        peak_incidence=peak_point.incidence,
        peak_glow_score=peak_point.glow_score,
    )


def is_glow_in_range(glow_window: GlowWindow | None) -> bool:
    """
    Check if a glow window qualifies as photographically valuable.

    Short-duration glow (5-15 min) qualifies if peak quality is strong.
    Longer windows are always valuable even with moderate peak quality.
    """
    if glow_window is None:
        return False

    duration = glow_window.duration_minutes
    peak_score = glow_window.peak_glow_score

    # Short but intense glow (5-15 min): needs peak >= 0.8
    if 5.0 <= duration < 15.0:
        return peak_score >= 0.75

    # Medium duration (15-30 min): needs peak >= 0.6
    if 15.0 <= duration < 30.0:
        return peak_score >= 0.5

    # Long duration (30+ min): any reasonable glow works
    if duration >= 30.0:
        return peak_score >= 0.3

    # Very short (<5 min): only exceptional quality
    return peak_score >= 0.9


def compute_rim_light_score(
    incidence: float,
    sun_altitude_deg: float,
) -> float:
    """
    Compute rim/edge light score for backlit or edge-lit scenarios.

    Rim light occurs when sun is behind or beside the feature,
    creating a glowing edge/outline effect.

    Args:
        incidence: Dot product of normal and sun (negative = backlit)
        sun_altitude_deg: Sun elevation above horizon

    Returns:
        Rim light score 0-1, where 1 = strong rim light potential
    """
    # Rim light is best when:
    # 1. Surface is mostly backlit (incidence -0.3 to 0.1)
    # 2. Sun is low (10-30 degrees altitude)

    # Backlit score: strongest at incidence ~ -0.1
    if incidence < -0.5 or incidence > 0.2:
        backlit_score = 0.0
    elif incidence < 0:
        # Backlit: best around -0.1
        backlit_score = 1.0 - abs(incidence + 0.1) * 2
    else:
        # Slightly front-lit: diminishes quickly
        backlit_score = max(0, 1.0 - incidence * 5)

    # Low sun score: best at 15-25 degrees
    if sun_altitude_deg < 5 or sun_altitude_deg > 40:
        sun_score = 0.0
    elif sun_altitude_deg <= 25:
        sun_score = min(1.0, (sun_altitude_deg - 5) / 15)
    else:
        sun_score = max(0, 1.0 - (sun_altitude_deg - 25) / 15)

    return backlit_score * sun_score


def detect_edge_lighting(
    incidence_series: list[IncidencePoint],
    sun_track: list[SunPosition],
) -> dict:
    """
    Detect rim light, crest glow, and cap glow opportunities.

    Returns dict with:
        - has_rim_light: bool
        - rim_light_peak_minutes: float or None
        - rim_light_score: float
        - lighting_type: "rim" | "crest" | "cap" | "standard" | None
    """
    best_rim_score = 0.0
    best_rim_minutes = None

    for point, sun_pos in zip(incidence_series, sun_track):
        rim_score = compute_rim_light_score(
            point.incidence,
            sun_pos.altitude_deg,
        )
        if rim_score > best_rim_score:
            best_rim_score = rim_score
            best_rim_minutes = point.minutes

    # Classify the lighting type
    if best_rim_score >= 0.6:
        lighting_type = "rim"  # Strong rim/edge lighting
    elif best_rim_score >= 0.3:
        lighting_type = "crest"  # Crest/cap glow potential
    else:
        lighting_type = "standard"  # Normal front/side lighting

    return {
        "has_rim_light": best_rim_score >= 0.4,
        "rim_light_peak_minutes": best_rim_minutes if best_rim_score >= 0.4 else None,
        "rim_light_score": best_rim_score,
        "lighting_type": lighting_type,
    }


def detect_grazing_light(
    incidence_series: list[IncidencePoint],
    sun_track: list[SunPosition],
    max_sun_altitude_deg: float = 8.0,
    max_incidence_deg: float = 12.0,
) -> tuple[bool, float, float | None]:
    """
    Detect grazing light conditions for surface moment classification.

    Grazing light occurs when:
    - Sun altitude is low (< 8°) - sun near horizon
    - Incidence angle is low (< 12°) - light raking across surface

    Args:
        incidence_series: Incidence values over time
        sun_track: Sun positions over time
        max_sun_altitude_deg: Maximum sun altitude for grazing (default 8°)
        max_incidence_deg: Maximum incidence angle (converted from dot product)

    Returns:
        Tuple of (has_grazing_light, grazing_score, peak_minutes)
        - has_grazing_light: True if conditions met
        - grazing_score: Quality score 0-1
        - peak_minutes: Best time for grazing light (or None)
    """
    # Convert incidence threshold: incidence of 0.2 = ~12° from parallel
    # cos(12°) ≈ 0.978, so incidence < 0.2 means angle < ~12° from parallel
    max_incidence = math.cos(math.radians(90 - max_incidence_deg))

    best_grazing_score = 0.0
    best_minutes = None

    for point, sun_pos in zip(incidence_series, sun_track):
        # Check sun altitude
        if sun_pos.altitude_deg > max_sun_altitude_deg:
            continue

        # Check incidence - we want LOW incidence (grazing)
        # incidence near 0 = light parallel to surface
        if point.incidence > max_incidence or point.incidence < 0:
            continue

        # Compute grazing score
        # Best when sun altitude is very low (2-5°) and incidence is very low
        altitude_score = max(0, 1.0 - abs(sun_pos.altitude_deg - 3.5) / 5.0)
        incidence_score = max(0, 1.0 - point.incidence / max_incidence)

        grazing_score = altitude_score * 0.6 + incidence_score * 0.4

        if grazing_score > best_grazing_score:
            best_grazing_score = grazing_score
            best_minutes = point.minutes

    has_grazing = best_grazing_score >= 0.4

    return has_grazing, best_grazing_score, best_minutes


def classify_subject_type_by_lighting(
    mean_slope_deg: float,
    incidence_series: list[IncidencePoint],
    sun_track: list[SunPosition],
) -> tuple[str, bool]:
    """
    Classify subject type based on lighting conditions.

    Surface moments are NOT defined by slope or size. They are defined by
    how grazing light transforms subtle terrain into texture, contrast, or rhythm.

    Any terrain - steep or gentle - can become a surface moment when
    grazing light reveals its character.

    Dramatic features are subjects best captured with direct/angled light
    that emphasizes form and mass.

    Args:
        mean_slope_deg: Average slope (for reference, not classification)
        incidence_series: Incidence values over time
        sun_track: Sun positions over time

    Returns:
        Tuple of (subject_type, has_grazing_light)
        - subject_type: "dramatic-feature" or "surface-moment"
        - has_grazing_light: True if grazing conditions detected
    """
    # Check for grazing light conditions
    # Grazing light transforms terrain into texture, contrast, rhythm
    has_grazing, grazing_score, _ = detect_grazing_light(
        incidence_series, sun_track
    )

    # Surface moment: grazing light creates the visual interest
    # This can happen on any slope - the light is what matters
    if has_grazing and grazing_score >= 0.4:
        return "surface-moment", True

    # Dramatic feature: best captured with direct/angled light
    # emphasizing form, mass, and shadow
    return "dramatic-feature", has_grazing


@dataclass
class IlluminationAnalysis:
    """Complete illumination analysis for a subject."""
    incidence_series: list[IncidencePoint]
    glow_window: GlowWindow | None
    peak_sun_position: SunPosition | None
    glow_in_range: bool
    # Edge lighting detection
    edge_lighting: dict | None = None  # rim_light_score, lighting_type, etc.
    # Subject type classification based on lighting
    subject_type: str = "dramatic-feature"  # "dramatic-feature" or "surface-moment"
    has_grazing_light: bool = False  # True if grazing conditions detected


def analyze_subject_illumination(
    normal: tuple[float, float, float],
    sun_track: list[SunPosition],
    mean_slope_deg: float = 45.0,
) -> IlluminationAnalysis:
    """
    Complete illumination analysis for a subject surface.

    Detects both standard glow (front/side lit) and edge lighting
    (rim light, crest glow, cap glow). Also classifies subject type
    based on lighting conditions.

    Args:
        normal: Surface normal unit vector
        sun_track: List of sun positions
        mean_slope_deg: Average slope of the subject (for type classification)

    Returns:
        IlluminationAnalysis with series, windows, edge lighting, and type
    """
    series = compute_incidence_series(normal, sun_track)
    window = detect_glow_window(series)

    # Find sun position at peak (if window exists)
    peak_sun = None
    if window:
        for sun_pos in sun_track:
            if abs(sun_pos.minutes_from_start - window.peak_minutes) < 1.0:
                peak_sun = sun_pos
                break

    # Detect edge lighting opportunities
    edge_lighting = detect_edge_lighting(series, sun_track)

    # A subject qualifies if it has good standard glow OR good edge lighting
    has_good_lighting = is_glow_in_range(window) or edge_lighting.get("has_rim_light", False)

    # Classify subject type based on lighting conditions
    # Surface moments: gentle slopes (≤30°) with grazing light (sun <8°, incidence <12°)
    subject_type, has_grazing = classify_subject_type_by_lighting(
        mean_slope_deg, series, sun_track
    )

    # Surface moments also qualify if they have grazing light
    if has_grazing and not has_good_lighting:
        has_good_lighting = True

    return IlluminationAnalysis(
        incidence_series=series,
        glow_window=window,
        peak_sun_position=peak_sun,
        glow_in_range=has_good_lighting,
        edge_lighting=edge_lighting,
        subject_type=subject_type,
        has_grazing_light=has_grazing,
    )
