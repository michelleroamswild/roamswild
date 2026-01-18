"""
Subject detection: find terrain features worth photographing.

Subjects are steep, prominent surfaces that will catch sunrise/sunset light.
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


def detect_subjects(
    dem: DEMGrid,
    slope_deg: np.ndarray,
    aspect_deg: np.ndarray,
    min_slope_deg: float = 30.0,
    min_prominence_m: float = 15.0,
    min_curvature: float = 0.0,
    min_cells: int = 3,
) -> list[DetectedSubject]:
    """
    Detect terrain subjects (steep, prominent surfaces).

    Criteria:
    - slope_deg > min_slope_deg (steep enough to be visually interesting)
    - local_prominence > min_prominence_m (stands out from surroundings)
    - curvature > min_curvature (convex features preferred)

    Args:
        dem: DEMGrid
        slope_deg: Slope array
        aspect_deg: Aspect array
        min_slope_deg: Minimum slope to consider
        min_prominence_m: Minimum height above surroundings
        min_curvature: Minimum curvature score
        min_cells: Minimum contiguous cells to form a subject

    Returns:
        List of DetectedSubject objects
    """
    # Compute additional metrics
    curvature = compute_curvature(dem)
    prominence = _compute_simple_prominence(dem)

    # Create candidate mask
    candidates = (
        (slope_deg >= min_slope_deg) &
        (prominence >= min_prominence_m) &
        (curvature >= min_curvature)
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

        mean_elev = np.mean(elevations)
        mean_slope = np.mean(slopes)

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
        ))

    # Sort by area (largest first)
    subjects.sort(key=lambda s: -s.area_m2)

    return subjects


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
