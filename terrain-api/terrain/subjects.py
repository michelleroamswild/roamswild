"""
Subject detection: find terrain features worth photographing.

Uses graduated confidence scoring instead of hard thresholds.
Small features can qualify if they have strong visual signals
(steep slope, good prominence, uniform facing direction).
"""
from __future__ import annotations

import numpy as np
from dataclasses import dataclass
from .dem import DEMGrid
from .analysis import compute_slope_aspect, compute_surface_normals, compute_curvature


@dataclass
class DetectedSubject:
    """A detected terrain subject (before full analysis)."""
    subject_id: int
    cells: list[tuple[int, int]]  # (row, col) indices
    centroid_row: float
    centroid_col: float
    centroid_lat: float
    centroid_lon: float
    mean_elevation: float
    mean_slope: float
    mean_aspect: float
    face_direction: float
    normal: tuple[float, float, float]
    area_m2: float
    # New: confidence scoring
    confidence: float  # 0-1 overall confidence
    score_breakdown: dict  # Individual score components


@dataclass
class SubjectScores:
    """Score components for subject detection."""
    slope_score: float      # How steep (dramatic lighting)
    prominence_score: float # How much it stands out
    curvature_score: float  # Convex catches light better
    coherence_score: float  # Uniform facing direction
    size_score: float       # Larger = more visual weight
    total: float            # Combined weighted score


def compute_cell_scores(
    dem: DEMGrid,
    slope_deg: np.ndarray,
    curvature: np.ndarray,
    prominence: np.ndarray,
) -> np.ndarray:
    """
    Compute per-cell confidence scores for being part of a photo subject.

    Returns array of scores 0-1 for each cell.
    """
    # Slope score: graduated from 15° to 60°
    # 15° = 0.0, 30° = 0.5, 45° = 0.75, 60°+ = 1.0
    slope_score = np.clip((slope_deg - 15) / 45, 0, 1)

    # Prominence score: graduated from 3m to 30m
    # 3m = 0.1, 10m = 0.5, 30m+ = 1.0
    prominence_score = np.clip((prominence - 3) / 27, 0.1, 1)

    # Curvature score: positive curvature is good (convex)
    # Normalize to 0-1 range
    curv_max = max(np.percentile(curvature, 95), 0.01)
    curvature_score = np.clip(curvature / curv_max, 0, 1)

    # Combined cell score (weighted)
    cell_score = (
        0.50 * slope_score +      # Slope is most important for drama
        0.30 * prominence_score + # Standing out matters
        0.20 * curvature_score    # Convexity helps light catch
    )

    return cell_score


def detect_subjects(
    dem: DEMGrid,
    slope_deg: np.ndarray,
    aspect_deg: np.ndarray,
    min_slope_deg: float = 15.0,      # Lowered from 30° - soft minimum
    min_prominence_m: float = 3.0,     # Lowered from 15m - soft minimum
    min_curvature: float = -0.5,       # Allow slightly concave
    min_cells: int = 1,                # Allow single-cell features
    min_confidence: float = 0.35,      # Minimum combined confidence to qualify
) -> list[DetectedSubject]:
    """
    Detect terrain subjects using graduated confidence scoring.

    Small features can qualify if they have compensating strengths:
    - A tiny but very steep outcrop
    - A modest slope with high prominence
    - A uniform-facing surface catching perfect light

    Args:
        dem: DEMGrid
        slope_deg: Slope array
        aspect_deg: Aspect array
        min_slope_deg: Soft minimum slope (lower contributes less, not excluded)
        min_prominence_m: Soft minimum prominence
        min_curvature: Soft minimum curvature
        min_cells: Minimum cells (can be 1 for small features)
        min_confidence: Minimum combined confidence score to include

    Returns:
        List of DetectedSubject objects, sorted by confidence
    """
    # Compute additional metrics
    curvature = compute_curvature(dem)
    prominence = _compute_simple_prominence(dem)

    # Compute per-cell confidence scores
    cell_scores = compute_cell_scores(dem, slope_deg, curvature, prominence)

    # Create candidate mask with very soft thresholds
    # These are just to reduce noise, not hard requirements
    candidates = (
        (slope_deg >= min_slope_deg) &
        (prominence >= min_prominence_m) &
        (curvature >= min_curvature) &
        (cell_scores >= 0.2)  # Minimum cell score to consider
    )

    # Find connected components
    labeled, num_features = _label_connected(candidates)

    # Compute surface normals
    Nx, Ny, Nz = compute_surface_normals(slope_deg, aspect_deg)

    subjects = []
    for label_id in range(1, num_features + 1):
        cells = list(zip(*np.where(labeled == label_id)))

        if len(cells) < min_cells:
            continue

        # Compute subject properties
        rows = [c[0] for c in cells]
        cols = [c[1] for c in cells]

        centroid_row = np.mean(rows)
        centroid_col = np.mean(cols)

        # Convert to lat/lon
        centroid_lat, centroid_lon = dem.indices_to_lat_lon(
            int(round(centroid_row)),
            int(round(centroid_col))
        )

        # Mean properties
        elevations = [dem.elevations[r, c] for r, c in cells]
        slopes = [slope_deg[r, c] for r, c in cells]
        aspects = [aspect_deg[r, c] for r, c in cells]
        prominences = [prominence[r, c] for r, c in cells]
        curvatures = [curvature[r, c] for r, c in cells]
        scores = [cell_scores[r, c] for r, c in cells]

        mean_elev = np.mean(elevations)
        mean_slope = np.mean(slopes)
        mean_prominence = np.mean(prominences)
        mean_curvature = np.mean(curvatures)

        # Circular mean for aspect
        mean_aspect = _circular_mean(aspects)
        face_dir = (mean_aspect + 180) % 360

        # Mean normal (then normalize)
        mean_Nx = np.mean([Nx[r, c] for r, c in cells])
        mean_Ny = np.mean([Ny[r, c] for r, c in cells])
        mean_Nz = np.mean([Nz[r, c] for r, c in cells])

        norm = np.sqrt(mean_Nx**2 + mean_Ny**2 + mean_Nz**2)
        if norm > 0:
            mean_Nx /= norm
            mean_Ny /= norm
            mean_Nz /= norm

        # Area
        area_m2 = len(cells) * dem.cell_size_m**2

        # Compute confidence scores
        subject_scores = _compute_subject_scores(
            mean_slope=mean_slope,
            mean_prominence=mean_prominence,
            mean_curvature=mean_curvature,
            aspects=aspects,
            area_m2=area_m2,
            cell_scores=scores,
        )

        # Skip if below confidence threshold
        if subject_scores.total < min_confidence:
            continue

        subjects.append(DetectedSubject(
            subject_id=label_id,
            cells=cells,
            centroid_row=centroid_row,
            centroid_col=centroid_col,
            centroid_lat=centroid_lat,
            centroid_lon=centroid_lon,
            mean_elevation=float(mean_elev),
            mean_slope=float(mean_slope),
            mean_aspect=float(mean_aspect),
            face_direction=float(face_dir),
            normal=(float(mean_Nx), float(mean_Ny), float(mean_Nz)),
            area_m2=float(area_m2),
            confidence=float(subject_scores.total),
            score_breakdown={
                "slope": float(subject_scores.slope_score),
                "prominence": float(subject_scores.prominence_score),
                "curvature": float(subject_scores.curvature_score),
                "coherence": float(subject_scores.coherence_score),
                "size": float(subject_scores.size_score),
            },
        ))

    # Sort by confidence (highest first), not just size
    subjects.sort(key=lambda s: -s.confidence)

    return subjects


def _compute_subject_scores(
    mean_slope: float,
    mean_prominence: float,
    mean_curvature: float,
    aspects: list[float],
    area_m2: float,
    cell_scores: list[float],
) -> SubjectScores:
    """
    Compute confidence scores for a subject.

    Each component is 0-1, weighted and combined into total.
    """
    # Slope score: 20° = 0.3, 35° = 0.7, 50°+ = 1.0
    slope_score = min(1.0, max(0.1, (mean_slope - 10) / 40))

    # Prominence score: 5m = 0.3, 15m = 0.6, 30m+ = 1.0
    prominence_score = min(1.0, max(0.1, (mean_prominence - 2) / 28))

    # Curvature score: positive = convex = good
    curvature_score = min(1.0, max(0.0, mean_curvature * 2 + 0.5))

    # Coherence score: how uniform is the facing direction?
    # Low variance in aspect = high coherence = better light behavior
    coherence_score = _compute_aspect_coherence(aspects)

    # Size score: graduated, but not dominant
    # 100m² = 0.3, 500m² = 0.5, 2000m²+ = 0.8 (never 1.0 to avoid over-weighting)
    size_score = min(0.8, max(0.2, 0.2 + 0.3 * np.log10(max(area_m2, 10)) / 3))

    # Mean cell quality (how good are the individual cells?)
    cell_quality = np.mean(cell_scores) if cell_scores else 0.5

    # Weighted combination
    # Slope and coherence matter most for photography
    total = (
        0.30 * slope_score +
        0.20 * prominence_score +
        0.10 * curvature_score +
        0.25 * coherence_score +   # Uniform facing = predictable light
        0.05 * size_score +        # Size is bonus, not requirement
        0.10 * cell_quality        # Average cell quality
    )

    return SubjectScores(
        slope_score=slope_score,
        prominence_score=prominence_score,
        curvature_score=curvature_score,
        coherence_score=coherence_score,
        size_score=size_score,
        total=total,
    )


def _compute_aspect_coherence(aspects: list[float]) -> float:
    """
    Compute how coherent (uniform) the facing directions are.

    High coherence = all cells face similar direction = predictable light.
    Returns 0-1 score.
    """
    if len(aspects) < 2:
        return 1.0  # Single cell is perfectly coherent

    # Use circular variance
    angles_rad = np.radians(aspects)
    mean_sin = np.mean(np.sin(angles_rad))
    mean_cos = np.mean(np.cos(angles_rad))

    # R is the mean resultant length (0 = scattered, 1 = all same direction)
    R = np.sqrt(mean_sin**2 + mean_cos**2)

    return float(R)


def _compute_simple_prominence(dem: DEMGrid) -> np.ndarray:
    """
    Simple prominence: height above minimum in 5-cell radius.
    """
    elev = dem.elevations
    padded = np.pad(elev, 5, mode="edge")

    # Rolling minimum using a simple approach
    prominence = np.zeros_like(elev)

    for i in range(elev.shape[0]):
        for j in range(elev.shape[1]):
            neighborhood = padded[i:i+11, j:j+11]
            local_min = np.min(neighborhood)
            prominence[i, j] = elev[i, j] - local_min

    return prominence


def _label_connected(mask: np.ndarray) -> tuple[np.ndarray, int]:
    """
    Label connected components in a boolean mask.

    Simple 4-connectivity flood fill implementation.
    """
    labeled = np.zeros_like(mask, dtype=int)
    current_label = 0

    def flood_fill(start_r: int, start_c: int, label: int):
        stack = [(start_r, start_c)]
        while stack:
            r, c = stack.pop()
            if r < 0 or r >= mask.shape[0] or c < 0 or c >= mask.shape[1]:
                continue
            if not mask[r, c] or labeled[r, c] != 0:
                continue
            labeled[r, c] = label
            stack.extend([(r-1, c), (r+1, c), (r, c-1), (r, c+1)])

    for i in range(mask.shape[0]):
        for j in range(mask.shape[1]):
            if mask[i, j] and labeled[i, j] == 0:
                current_label += 1
                flood_fill(i, j, current_label)

    return labeled, current_label


def _circular_mean(angles_deg: list[float]) -> float:
    """
    Compute circular mean of angles in degrees.
    """
    angles_rad = np.radians(angles_deg)
    mean_sin = np.mean(np.sin(angles_rad))
    mean_cos = np.mean(np.cos(angles_rad))
    return float(np.degrees(np.arctan2(mean_sin, mean_cos)) % 360)


def get_subject_polygon(
    dem: DEMGrid,
    cells: list[tuple[int, int]],
) -> list[tuple[float, float]]:
    """
    Get a simplified polygon boundary for a subject.

    Returns list of (lat, lon) points forming the boundary.
    """
    if not cells:
        return []

    # Simple convex hull approximation using corner cells
    rows = [c[0] for c in cells]
    cols = [c[1] for c in cells]

    # Get bounding box corners
    min_r, max_r = min(rows), max(rows)
    min_c, max_c = min(cols), max(cols)

    # Create polygon from bounding box (simplified)
    corners = [
        (min_r, min_c),
        (min_r, max_c),
        (max_r, max_c),
        (max_r, min_c),
    ]

    polygon = []
    for r, c in corners:
        lat, lon = dem.indices_to_lat_lon(r, c)
        polygon.append((lat, lon))

    return polygon
