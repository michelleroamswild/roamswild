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
    """Check if a glow window exists and has reasonable duration."""
    if glow_window is None:
        return False
    return glow_window.duration_minutes >= 5.0  # At least 5 minutes of good light


@dataclass
class IlluminationAnalysis:
    """Complete illumination analysis for a subject."""
    incidence_series: list[IncidencePoint]
    glow_window: GlowWindow | None
    peak_sun_position: SunPosition | None
    glow_in_range: bool


def analyze_subject_illumination(
    normal: tuple[float, float, float],
    sun_track: list[SunPosition],
) -> IlluminationAnalysis:
    """
    Complete illumination analysis for a subject surface.

    Args:
        normal: Surface normal unit vector
        sun_track: List of sun positions

    Returns:
        IlluminationAnalysis with series, window, and validation
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

    return IlluminationAnalysis(
        incidence_series=series,
        glow_window=window,
        peak_sun_position=peak_sun,
        glow_in_range=is_glow_in_range(window),
    )
