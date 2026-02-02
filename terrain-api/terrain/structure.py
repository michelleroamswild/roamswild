"""
Multi-scale Structure Scoring for Terrain Subject Detection

Distinguishes between:
- Actual dramatic terrain features (rocks, cliffs, ridges)
- Flat terrain that just happens to be tilted toward the sun

Key metrics:
1. Local relief: elevation range in micro (30-60m) and macro (300-800m) radii
2. Curvature / edge-ness: high |curvature| indicates ridges, knobs, cliff breaks
3. Slope breaks: high neighborhood Δslope indicates ledges/cliffs
4. Heterogeneity: uniform zones are downranked

Classifications:
- micro-dramatic: Joshua Tree rocks - high micro relief/curvature, small area
- macro-dramatic: El Cap style - high macro relief/slope break, may be large
- flat-lit: low structure - should not be recommended as dramatic
"""
from __future__ import annotations

import numpy as np
from dataclasses import dataclass
from typing import Optional, List, Tuple


@dataclass
class StructureMetrics:
    """Multi-scale structure metrics for a terrain region."""
    # Local relief (elevation range)
    micro_relief_m: float      # Relief within 30-60m radius
    macro_relief_m: float      # Relief within 300-800m radius

    # Curvature metrics
    mean_curvature: float      # Average curvature (+ = convex, - = concave)
    max_curvature: float       # Peak curvature (ridges, knobs)
    curvature_variance: float  # Variability of curvature

    # Slope break metrics
    slope_break_score: float   # Mean |Δslope| in neighborhood (0-1 normalized)
    max_slope_break: float     # Maximum slope change (degrees)

    # Heterogeneity
    elevation_std: float       # Standard deviation of elevation
    slope_std: float           # Standard deviation of slope
    heterogeneity_score: float # Combined heterogeneity (0-1)

    # Combined scores
    structure_score: float     # Overall structure score (0-1)
    structure_class: str       # "micro-dramatic", "macro-dramatic", "flat-lit"

    # Debug info
    cell_count: int
    area_m2: float

    # Per-cell structure analysis (for debugging zone quality)
    structure_score_at_centroid: float = 0.0  # Structure score at zone centroid
    max_structure_score_in_zone: float = 0.0  # Highest per-cell structure score
    max_structure_location: Optional[Tuple[float, float]] = None  # (lat, lon) of best cell
    distance_centroid_to_max_m: float = 0.0  # Distance from centroid to max location

    # TPI (Topographic Position Index) metrics
    # Positive TPI = ridges/overlooks (cell higher than surroundings)
    # Negative TPI = basins/valleys (cell lower than surroundings)
    tpi_small_m: float = 0.0   # TPI at ~400m radius (local position)
    tpi_large_m: float = 0.0   # TPI at ~2000m radius (landscape position)
    rim_strength: float = 0.0  # 0-1 score for rim/overlook candidacy (positive TPI)
    basin_strength: float = 0.0  # 0-1 score for basin/valley candidacy (negative TPI)
    is_rim_candidate: bool = False   # True if high TPI + reasonable slope
    is_basin_candidate: bool = False  # True if low (negative) TPI


# Thresholds for structure classification
MICRO_RELIEF_THRESHOLD = 5.0    # meters - minimum for micro-dramatic
MACRO_RELIEF_THRESHOLD = 30.0   # meters - minimum for macro-dramatic
CURVATURE_THRESHOLD = 0.02      # curvature units for "interesting" terrain
SLOPE_BREAK_THRESHOLD = 8.0     # degrees - significant slope change

# TPI (Topographic Position Index) parameters
TPI_SMALL_RADIUS_M = 400.0      # ~400m radius for local position
TPI_LARGE_RADIUS_M = 2000.0     # ~2000m radius for landscape position
TPI_THRESHOLD_M = 20.0          # meters - threshold for rim/basin classification
TPI_SLOPE_MAX_DEG = 20.0        # max slope for rim candidate (overlooks are walkable)
TPI_NORMALIZATION_M = 50.0      # meters - for normalizing strength to 0-1


# =============================================================================
# TPI (Topographic Position Index) using Integral Image
# =============================================================================

def summed_area_table(Z: np.ndarray) -> np.ndarray:
    """
    Compute summed-area table (integral image) for elevation grid.

    SAT[i,j] = sum of all Z values from (0,0) to (i,j) inclusive.
    This enables O(1) computation of any rectangular window sum.

    Args:
        Z: 2D elevation array

    Returns:
        SAT array with same shape as Z
    """
    # Use cumsum for efficiency
    sat = np.cumsum(np.cumsum(Z, axis=0), axis=1)
    return sat


def window_sum_from_sat(
    sat: np.ndarray,
    row: int,
    col: int,
    half_window: int,
) -> Tuple[float, int]:
    """
    Compute sum of values in a square window using the SAT.

    Window is centered at (row, col) with size (2*half_window+1) x (2*half_window+1).
    Handles edge clamping automatically.

    Args:
        sat: Summed-area table
        row: Center row index
        col: Center column index
        half_window: Half-width of window in cells

    Returns:
        (window_sum, window_count) - sum of values and number of cells in window
    """
    rows, cols = sat.shape

    # Clamp window bounds to grid
    r_min = max(0, row - half_window)
    r_max = min(rows - 1, row + half_window)
    c_min = max(0, col - half_window)
    c_max = min(cols - 1, col + half_window)

    # SAT formula: sum(r_min:r_max, c_min:c_max) =
    #   SAT[r_max, c_max]
    # - SAT[r_min-1, c_max] (if r_min > 0)
    # - SAT[r_max, c_min-1] (if c_min > 0)
    # + SAT[r_min-1, c_min-1] (if both > 0)

    total = sat[r_max, c_max]

    if r_min > 0:
        total -= sat[r_min - 1, c_max]

    if c_min > 0:
        total -= sat[r_max, c_min - 1]

    if r_min > 0 and c_min > 0:
        total += sat[r_min - 1, c_min - 1]

    count = (r_max - r_min + 1) * (c_max - c_min + 1)

    return float(total), count


def compute_window_mean_grid(
    Z: np.ndarray,
    half_window_cells: int,
) -> np.ndarray:
    """
    Compute mean elevation in square window around each cell using SAT.

    Args:
        Z: 2D elevation array
        half_window_cells: Half-width of window in cells

    Returns:
        2D array of same shape with window means
    """
    sat = summed_area_table(Z)
    rows, cols = Z.shape

    mean_grid = np.zeros_like(Z, dtype=np.float64)

    for r in range(rows):
        for c in range(cols):
            window_sum, count = window_sum_from_sat(sat, r, c, half_window_cells)
            mean_grid[r, c] = window_sum / count if count > 0 else Z[r, c]

    return mean_grid


def compute_tpi_grids(
    elevations: np.ndarray,
    cell_size_m: float,
    small_radius_m: float = TPI_SMALL_RADIUS_M,
    large_radius_m: float = TPI_LARGE_RADIUS_M,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Compute TPI (Topographic Position Index) grids at two scales.

    TPI = elevation - mean(neighborhood)
    Positive = higher than surroundings (ridges, overlooks)
    Negative = lower than surroundings (valleys, basins)

    Args:
        elevations: 2D elevation array
        cell_size_m: Cell size in meters
        small_radius_m: Target radius for small-scale TPI (~400m)
        large_radius_m: Target radius for large-scale TPI (~2000m)

    Returns:
        (tpi_small, tpi_large) - two TPI arrays
    """
    rows, cols = elevations.shape

    # Convert radius to half-window cells
    half_small = max(1, round(small_radius_m / cell_size_m))
    half_large = max(1, round(large_radius_m / cell_size_m))

    # Clamp to reasonable size (max half = min dimension // 2 - 1)
    max_half = min(rows, cols) // 2 - 1
    max_half = max(1, max_half)

    half_small = min(half_small, max_half)
    half_large = min(half_large, max_half)

    # Compute window means
    mean_small = compute_window_mean_grid(elevations, half_small)
    mean_large = compute_window_mean_grid(elevations, half_large)

    # TPI = elevation - mean
    tpi_small = elevations - mean_small
    tpi_large = elevations - mean_large

    return tpi_small, tpi_large


def compute_tpi_derived_fields(
    tpi_large: np.ndarray,
    slope_deg: np.ndarray,
    cells: List[Tuple[int, int]],
    tpi_threshold_m: float = TPI_THRESHOLD_M,
    slope_max_deg: float = TPI_SLOPE_MAX_DEG,
    normalization_m: float = TPI_NORMALIZATION_M,
) -> Tuple[float, float, float, float, bool, bool]:
    """
    Compute TPI-derived fields for a set of cells.

    Args:
        tpi_large: Large-scale TPI grid
        slope_deg: Slope grid in degrees
        cells: List of (row, col) cell indices
        tpi_threshold_m: Threshold for rim/basin classification
        slope_max_deg: Maximum slope for rim candidate
        normalization_m: Scale for normalizing strength to 0-1

    Returns:
        (mean_tpi_small, mean_tpi_large, rim_strength, basin_strength,
         is_rim_candidate, is_basin_candidate)
    """
    if not cells:
        return 0.0, 0.0, 0.0, 0.0, False, False

    # Get TPI values for cells
    tpi_values = np.array([tpi_large[r, c] for r, c in cells])
    slope_values = np.array([slope_deg[r, c] for r, c in cells])

    mean_tpi_large = float(np.mean(tpi_values))

    # Compute rim strength: how much the area is elevated above surroundings
    # Normalize positive TPI to 0-1 range
    if mean_tpi_large > 0:
        rim_strength = min(1.0, mean_tpi_large / normalization_m)
    else:
        rim_strength = 0.0

    # Compute basin strength: how much the area is depressed below surroundings
    # Normalize negative TPI to 0-1 range
    if mean_tpi_large < 0:
        basin_strength = min(1.0, abs(mean_tpi_large) / normalization_m)
    else:
        basin_strength = 0.0

    # Check rim candidate: high positive TPI + reasonable slope
    mean_slope = float(np.mean(slope_values))
    is_rim_candidate = (mean_tpi_large > tpi_threshold_m) and (mean_slope < slope_max_deg)

    # Check basin candidate: significantly negative TPI
    is_basin_candidate = mean_tpi_large < -tpi_threshold_m

    return mean_tpi_large, rim_strength, basin_strength, is_rim_candidate, is_basin_candidate


def compute_tpi_for_cell(
    row: int,
    col: int,
    tpi_small: np.ndarray,
    tpi_large: np.ndarray,
    slope_deg: np.ndarray,
    tpi_threshold_m: float = TPI_THRESHOLD_M,
    slope_max_deg: float = TPI_SLOPE_MAX_DEG,
    normalization_m: float = TPI_NORMALIZATION_M,
) -> Tuple[float, float, float, float, bool, bool]:
    """
    Compute TPI metrics for a single cell.

    Args:
        row, col: Cell indices
        tpi_small: Small-scale TPI grid
        tpi_large: Large-scale TPI grid
        slope_deg: Slope grid
        tpi_threshold_m: Threshold for rim/basin classification
        slope_max_deg: Maximum slope for rim candidate
        normalization_m: Scale for normalizing strength

    Returns:
        (tpi_small_m, tpi_large_m, rim_strength, basin_strength,
         is_rim_candidate, is_basin_candidate)
    """
    tpi_s = float(tpi_small[row, col])
    tpi_l = float(tpi_large[row, col])
    slope = float(slope_deg[row, col])

    # Rim strength
    rim_strength = min(1.0, max(0.0, tpi_l / normalization_m)) if tpi_l > 0 else 0.0

    # Basin strength
    basin_strength = min(1.0, max(0.0, abs(tpi_l) / normalization_m)) if tpi_l < 0 else 0.0

    # Candidates
    is_rim_candidate = (tpi_l > tpi_threshold_m) and (slope < slope_max_deg)
    is_basin_candidate = tpi_l < -tpi_threshold_m

    return tpi_s, tpi_l, rim_strength, basin_strength, is_rim_candidate, is_basin_candidate


def compute_local_relief(
    elevations: np.ndarray,
    cells: List[Tuple[int, int]],
    cell_size_m: float,
    radius_m: float,
) -> float:
    """
    Compute elevation range within a radius of each cell, then average.

    Args:
        elevations: DEM elevation grid
        cells: List of (row, col) cell indices
        cell_size_m: Size of each cell in meters
        radius_m: Search radius in meters

    Returns:
        Average local relief in meters
    """
    if not cells:
        return 0.0

    radius_cells = max(1, int(radius_m / cell_size_m))
    rows, cols = elevations.shape

    reliefs = []
    for row, col in cells:
        # Define neighborhood bounds
        r_min = max(0, row - radius_cells)
        r_max = min(rows, row + radius_cells + 1)
        c_min = max(0, col - radius_cells)
        c_max = min(cols, col + radius_cells + 1)

        neighborhood = elevations[r_min:r_max, c_min:c_max]
        if neighborhood.size > 0:
            relief = float(np.max(neighborhood) - np.min(neighborhood))
            reliefs.append(relief)

    return float(np.mean(reliefs)) if reliefs else 0.0


def compute_curvature_metrics(
    curvature: np.ndarray,
    cells: List[Tuple[int, int]],
) -> Tuple[float, float, float]:
    """
    Compute curvature statistics for a set of cells.

    Returns:
        (mean_curvature, max_abs_curvature, curvature_variance)
    """
    if not cells:
        return 0.0, 0.0, 0.0

    values = [curvature[r, c] for r, c in cells]

    mean_curv = float(np.mean(values))
    max_curv = float(np.max(np.abs(values)))
    var_curv = float(np.var(values))

    return mean_curv, max_curv, var_curv


def compute_slope_breaks(
    slope_deg: np.ndarray,
    cells: List[Tuple[int, int]],
    cell_size_m: float,
) -> Tuple[float, float]:
    """
    Compute slope break metrics - how much slope changes in the neighborhood.

    High slope breaks indicate ledges, cliffs, terrain discontinuities.

    Returns:
        (mean_slope_break, max_slope_break) in degrees
    """
    if not cells:
        return 0.0, 0.0

    rows, cols = slope_deg.shape

    slope_breaks = []
    for row, col in cells:
        # Get 3x3 neighborhood
        neighbors = []
        for dr in [-1, 0, 1]:
            for dc in [-1, 0, 1]:
                if dr == 0 and dc == 0:
                    continue
                nr, nc = row + dr, col + dc
                if 0 <= nr < rows and 0 <= nc < cols:
                    neighbors.append(slope_deg[nr, nc])

        if neighbors:
            center_slope = slope_deg[row, col]
            # Max difference from center to any neighbor
            max_diff = max(abs(center_slope - n) for n in neighbors)
            slope_breaks.append(max_diff)

    if not slope_breaks:
        return 0.0, 0.0

    return float(np.mean(slope_breaks)), float(np.max(slope_breaks))


def compute_heterogeneity(
    elevations: np.ndarray,
    slope_deg: np.ndarray,
    cells: List[Tuple[int, int]],
) -> Tuple[float, float, float]:
    """
    Compute heterogeneity metrics - how varied is the terrain?

    Low heterogeneity = uniform tilted plane (boring)
    High heterogeneity = varied terrain (interesting)

    Returns:
        (elevation_std, slope_std, heterogeneity_score)
    """
    if not cells:
        return 0.0, 0.0, 0.0

    elevs = [elevations[r, c] for r, c in cells]
    slopes = [slope_deg[r, c] for r, c in cells]

    elev_std = float(np.std(elevs))
    slope_std = float(np.std(slopes))

    # Normalize to 0-1 score
    # Typical interesting terrain: elev_std > 5m, slope_std > 5°
    elev_score = min(1.0, elev_std / 10.0)
    slope_score = min(1.0, slope_std / 10.0)

    heterogeneity = (elev_score + slope_score) / 2

    return elev_std, slope_std, heterogeneity


def compute_cell_structure_score(
    row: int,
    col: int,
    elevations: np.ndarray,
    slope_deg: np.ndarray,
    curvature: np.ndarray,
    cell_size_m: float,
) -> float:
    """
    Compute structure score for a single cell based on local metrics.

    Uses curvature (ridges/knobs) and slope breaks (cliffs/ledges) as
    the primary indicators of interesting structure at a specific location.

    Returns:
        Structure score 0-1 for this cell
    """
    rows, cols = elevations.shape

    # Get cell's curvature (absolute value - both convex and concave are interesting)
    cell_curvature = abs(curvature[row, col])
    curv_score = min(1.0, cell_curvature / 0.1)

    # Compute local slope break (max difference from neighbors)
    max_slope_diff = 0.0
    center_slope = slope_deg[row, col]
    for dr in [-1, 0, 1]:
        for dc in [-1, 0, 1]:
            if dr == 0 and dc == 0:
                continue
            nr, nc = row + dr, col + dc
            if 0 <= nr < rows and 0 <= nc < cols:
                diff = abs(center_slope - slope_deg[nr, nc])
                max_slope_diff = max(max_slope_diff, diff)
    slope_break_score = min(1.0, max_slope_diff / 20.0)  # 20° = max score

    # Compute local relief (5-cell radius)
    radius = 5
    r_min = max(0, row - radius)
    r_max = min(rows, row + radius + 1)
    c_min = max(0, col - radius)
    c_max = min(cols, col + radius + 1)
    neighborhood = elevations[r_min:r_max, c_min:c_max]
    local_relief = float(np.max(neighborhood) - np.min(neighborhood))
    relief_score = min(1.0, local_relief / 15.0)  # 15m = max score

    # Combined cell structure score
    # Weight curvature and slope breaks more heavily (they indicate actual features)
    cell_score = (
        0.35 * curv_score +
        0.35 * slope_break_score +
        0.30 * relief_score
    )

    return float(cell_score)


def compute_structure_metrics(
    elevations: np.ndarray,
    slope_deg: np.ndarray,
    curvature: np.ndarray,
    cells: List[Tuple[int, int]],
    cell_size_m: float,
    dem_grid=None,  # Optional DEMGrid for lat/lon conversion
    centroid_row: float = None,
    centroid_col: float = None,
    tpi_small: np.ndarray = None,  # Optional precomputed TPI grids
    tpi_large: np.ndarray = None,
) -> StructureMetrics:
    """
    Compute comprehensive structure metrics for a terrain region.

    Args:
        elevations: DEM elevation grid
        slope_deg: Slope grid in degrees
        curvature: Curvature grid
        cells: List of (row, col) cell indices for the region
        cell_size_m: Cell size in meters
        dem_grid: Optional DEMGrid for lat/lon conversion (for max location)
        centroid_row: Optional centroid row for per-cell analysis
        centroid_col: Optional centroid col for per-cell analysis
        tpi_small: Optional precomputed small-scale TPI grid
        tpi_large: Optional precomputed large-scale TPI grid

    Returns:
        StructureMetrics with all computed values
    """
    if not cells:
        return StructureMetrics(
            micro_relief_m=0.0,
            macro_relief_m=0.0,
            mean_curvature=0.0,
            max_curvature=0.0,
            curvature_variance=0.0,
            slope_break_score=0.0,
            max_slope_break=0.0,
            elevation_std=0.0,
            slope_std=0.0,
            heterogeneity_score=0.0,
            structure_score=0.0,
            structure_class="flat-lit",
            cell_count=0,
            area_m2=0.0,
            structure_score_at_centroid=0.0,
            max_structure_score_in_zone=0.0,
            max_structure_location=None,
            distance_centroid_to_max_m=0.0,
            tpi_small_m=0.0,
            tpi_large_m=0.0,
            rim_strength=0.0,
            basin_strength=0.0,
            is_rim_candidate=False,
            is_basin_candidate=False,
        )

    # 1. Local relief at two scales
    # Micro: 30-60m - for small features like rocks
    micro_relief = compute_local_relief(elevations, cells, cell_size_m, radius_m=45.0)

    # Macro: 300-800m - for large features like cliffs
    macro_relief = compute_local_relief(elevations, cells, cell_size_m, radius_m=500.0)

    # 2. Curvature metrics
    mean_curv, max_curv, var_curv = compute_curvature_metrics(curvature, cells)

    # 3. Slope breaks
    mean_slope_break, max_slope_break = compute_slope_breaks(slope_deg, cells, cell_size_m)

    # 4. Heterogeneity
    elev_std, slope_std, heterogeneity = compute_heterogeneity(elevations, slope_deg, cells)

    # 5. Compute combined structure score
    # Weight different factors based on importance

    # Micro relief score (0-1): 0m=0, 5m=0.5, 15m=1.0
    micro_score = min(1.0, micro_relief / 15.0)

    # Macro relief score (0-1): 0m=0, 30m=0.5, 100m=1.0
    macro_score = min(1.0, macro_relief / 100.0)

    # Curvature score (0-1): based on max curvature
    curv_score = min(1.0, max_curv / 0.1)

    # Slope break score (0-1): 0°=0, 10°=0.5, 30°=1.0
    slope_break_score = min(1.0, max_slope_break / 30.0)

    # Combined structure score
    # Favor either micro OR macro structure
    micro_structure = 0.5 * micro_score + 0.3 * curv_score + 0.2 * heterogeneity
    macro_structure = 0.4 * macro_score + 0.4 * slope_break_score + 0.2 * heterogeneity

    structure_score = max(micro_structure, macro_structure)

    # 6. Classify structure type
    structure_class = classify_structure(
        micro_relief=micro_relief,
        macro_relief=macro_relief,
        max_curvature=max_curv,
        max_slope_break=max_slope_break,
        heterogeneity=heterogeneity,
        area_m2=len(cells) * cell_size_m ** 2,
    )

    # 7. Per-cell structure analysis for debugging
    # Compute structure score at centroid and find max in zone
    structure_score_at_centroid = 0.0
    max_structure_score_in_zone = 0.0
    max_structure_cell = None
    max_structure_location = None
    distance_centroid_to_max_m = 0.0

    # Compute per-cell scores for all cells in zone
    cell_scores = []
    for row, col in cells:
        cell_score = compute_cell_structure_score(
            row, col, elevations, slope_deg, curvature, cell_size_m
        )
        cell_scores.append((row, col, cell_score))

        # Track max
        if cell_score > max_structure_score_in_zone:
            max_structure_score_in_zone = cell_score
            max_structure_cell = (row, col)

    # Compute score at centroid (use nearest cell)
    if centroid_row is not None and centroid_col is not None:
        centroid_r = int(round(centroid_row))
        centroid_c = int(round(centroid_col))
        # Make sure centroid is in bounds
        rows, cols = elevations.shape
        centroid_r = max(0, min(rows - 1, centroid_r))
        centroid_c = max(0, min(cols - 1, centroid_c))
        structure_score_at_centroid = compute_cell_structure_score(
            centroid_r, centroid_c, elevations, slope_deg, curvature, cell_size_m
        )

        # Compute distance from centroid to max
        if max_structure_cell:
            max_r, max_c = max_structure_cell
            # Distance in cells * cell_size
            dist_cells = np.sqrt((max_r - centroid_r)**2 + (max_c - centroid_c)**2)
            distance_centroid_to_max_m = float(dist_cells * cell_size_m)

    # Convert max cell to lat/lon if dem_grid provided
    if dem_grid is not None and max_structure_cell is not None:
        max_r, max_c = max_structure_cell
        max_lat, max_lon = dem_grid.indices_to_lat_lon(max_r, max_c)
        max_structure_location = (float(max_lat), float(max_lon))

    # 8. TPI (Topographic Position Index) metrics
    # Compute TPI grids if not provided
    if tpi_small is None or tpi_large is None:
        tpi_small_grid, tpi_large_grid = compute_tpi_grids(elevations, cell_size_m)
    else:
        tpi_small_grid, tpi_large_grid = tpi_small, tpi_large

    # Compute TPI-derived fields for the cells
    (mean_tpi_large, rim_strength, basin_strength,
     is_rim_candidate, is_basin_candidate) = compute_tpi_derived_fields(
        tpi_large=tpi_large_grid,
        slope_deg=slope_deg,
        cells=cells,
    )

    # Get mean small TPI as well
    tpi_small_values = [tpi_small_grid[r, c] for r, c in cells]
    mean_tpi_small = float(np.mean(tpi_small_values)) if tpi_small_values else 0.0

    return StructureMetrics(
        micro_relief_m=micro_relief,
        macro_relief_m=macro_relief,
        mean_curvature=mean_curv,
        max_curvature=max_curv,
        curvature_variance=var_curv,
        slope_break_score=slope_break_score,
        max_slope_break=max_slope_break,
        elevation_std=elev_std,
        slope_std=slope_std,
        heterogeneity_score=heterogeneity,
        structure_score=structure_score,
        structure_class=structure_class,
        cell_count=len(cells),
        area_m2=len(cells) * cell_size_m ** 2,
        structure_score_at_centroid=structure_score_at_centroid,
        max_structure_score_in_zone=max_structure_score_in_zone,
        max_structure_location=max_structure_location,
        distance_centroid_to_max_m=distance_centroid_to_max_m,
        # TPI fields
        tpi_small_m=mean_tpi_small,
        tpi_large_m=mean_tpi_large,
        rim_strength=rim_strength,
        basin_strength=basin_strength,
        is_rim_candidate=is_rim_candidate,
        is_basin_candidate=is_basin_candidate,
    )


def classify_structure(
    micro_relief: float,
    macro_relief: float,
    max_curvature: float,
    max_slope_break: float,
    heterogeneity: float,
    area_m2: float,
) -> str:
    """
    Classify terrain structure type.

    Returns:
        "micro-dramatic" - Joshua Tree rocks style
        "macro-dramatic" - El Cap style cliffs
        "flat-lit" - boring tilted terrain
    """
    # Check for micro-dramatic (small interesting features)
    # High local relief OR high curvature, even if small area
    is_micro_dramatic = (
        (micro_relief >= MICRO_RELIEF_THRESHOLD and max_curvature >= CURVATURE_THRESHOLD * 0.5) or
        (max_curvature >= CURVATURE_THRESHOLD and micro_relief >= MICRO_RELIEF_THRESHOLD * 0.5) or
        (micro_relief >= MICRO_RELIEF_THRESHOLD * 1.5)  # Very high micro relief alone
    )

    # Check for macro-dramatic (large cliff-like features)
    # High macro relief OR significant slope breaks
    is_macro_dramatic = (
        (macro_relief >= MACRO_RELIEF_THRESHOLD and max_slope_break >= SLOPE_BREAK_THRESHOLD * 0.5) or
        (max_slope_break >= SLOPE_BREAK_THRESHOLD and macro_relief >= MACRO_RELIEF_THRESHOLD * 0.5) or
        (macro_relief >= MACRO_RELIEF_THRESHOLD * 2)  # Very high macro relief alone
    )

    # Large uniform zones are suspicious - penalize
    # If area is huge but heterogeneity is low, it's probably flat-lit
    if area_m2 > 100000 and heterogeneity < 0.2:
        is_micro_dramatic = False
        if macro_relief < MACRO_RELIEF_THRESHOLD * 1.5:
            is_macro_dramatic = False

    if is_micro_dramatic and is_macro_dramatic:
        # Both scales are interesting - prefer micro for small areas
        if area_m2 < 10000:
            return "micro-dramatic"
        else:
            return "macro-dramatic"
    elif is_micro_dramatic:
        return "micro-dramatic"
    elif is_macro_dramatic:
        return "macro-dramatic"
    else:
        return "flat-lit"


def is_dramatic_structure(metrics: StructureMetrics) -> bool:
    """Check if structure metrics indicate dramatic terrain worth recommending."""
    return metrics.structure_class in ("micro-dramatic", "macro-dramatic")


# Structure score thresholds for region growing
STRUCTURE_THRESHOLD_MICRO = 0.60  # Higher threshold for micro-dramatic
STRUCTURE_THRESHOLD_MACRO = 0.55  # Slightly lower for macro-dramatic
STRUCTURE_THRESHOLD_DEFAULT = 0.50  # Fallback


def region_grow_from_anchor(
    anchor_row: int,
    anchor_col: int,
    elevations: np.ndarray,
    slope_deg: np.ndarray,
    curvature: np.ndarray,
    cell_size_m: float,
    structure_class: str = "micro-dramatic",
    zone_cells: Optional[List[Tuple[int, int]]] = None,
    max_cells: int = 500,
) -> List[Tuple[int, int]]:
    """
    Region-grow from anchor cell to build subject polygon with high structure.

    Only includes contiguous cells above the structure score threshold.
    The resulting polygon will contain the anchor and preserve high-structure area.

    Args:
        anchor_row: Row index of anchor cell (max structure location)
        anchor_col: Column index of anchor cell
        elevations: DEM elevation grid
        slope_deg: Slope grid in degrees
        curvature: Curvature grid
        cell_size_m: Cell size in meters
        structure_class: "micro-dramatic" or "macro-dramatic" (affects threshold)
        zone_cells: Optional set of cells to constrain growth within
        max_cells: Maximum cells to include (prevents runaway growth)

    Returns:
        List of (row, col) cells forming the high-structure subject polygon
    """
    rows, cols = elevations.shape

    # Select threshold based on structure class
    if structure_class == "micro-dramatic":
        threshold = STRUCTURE_THRESHOLD_MICRO
    elif structure_class == "macro-dramatic":
        threshold = STRUCTURE_THRESHOLD_MACRO
    else:
        threshold = STRUCTURE_THRESHOLD_DEFAULT

    # Convert zone_cells to set for fast lookup
    zone_set = set(zone_cells) if zone_cells else None

    # Compute anchor's structure score
    anchor_score = compute_cell_structure_score(
        anchor_row, anchor_col, elevations, slope_deg, curvature, cell_size_m
    )

    # If anchor itself is below threshold, lower threshold to include it
    # (the anchor was selected as max structure, so we should include it)
    effective_threshold = min(threshold, anchor_score - 0.05)
    effective_threshold = max(0.3, effective_threshold)  # Don't go too low

    # BFS region grow
    visited = set()
    subject_cells = []
    queue = [(anchor_row, anchor_col)]
    visited.add((anchor_row, anchor_col))

    while queue and len(subject_cells) < max_cells:
        row, col = queue.pop(0)

        # Compute structure score for this cell
        cell_score = compute_cell_structure_score(
            row, col, elevations, slope_deg, curvature, cell_size_m
        )

        # Include if above threshold
        if cell_score >= effective_threshold:
            subject_cells.append((row, col))

            # Add unvisited neighbors to queue
            for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                nr, nc = row + dr, col + dc

                # Check bounds
                if not (0 <= nr < rows and 0 <= nc < cols):
                    continue

                # Check if already visited
                if (nr, nc) in visited:
                    continue

                # Check if within zone (if zone constraint provided)
                if zone_set is not None and (nr, nc) not in zone_set:
                    continue

                visited.add((nr, nc))
                queue.append((nr, nc))

    # Ensure anchor is included even if score computation varies
    if (anchor_row, anchor_col) not in subject_cells:
        subject_cells.insert(0, (anchor_row, anchor_col))

    return subject_cells


def rebuild_subject_from_anchor(
    anchor_lat: float,
    anchor_lon: float,
    dem_grid,  # DEMGrid
    slope_deg: np.ndarray,
    curvature: np.ndarray,
    structure_class: str,
    zone_cells: Optional[List[Tuple[int, int]]] = None,
) -> Tuple[List[Tuple[int, int]], StructureMetrics]:
    """
    Rebuild subject polygon by region-growing from anchor location.

    Args:
        anchor_lat: Latitude of anchor (max structure location)
        anchor_lon: Longitude of anchor
        dem_grid: DEMGrid with elevations and coordinate conversion
        slope_deg: Slope grid in degrees
        curvature: Curvature grid
        structure_class: "micro-dramatic" or "macro-dramatic"
        zone_cells: Optional cells to constrain growth within

    Returns:
        Tuple of (new_cells, new_structure_metrics)
    """
    # Convert anchor lat/lon to row/col
    anchor_row, anchor_col = dem_grid.lat_lon_to_indices(anchor_lat, anchor_lon)

    # Region grow from anchor
    new_cells = region_grow_from_anchor(
        anchor_row=anchor_row,
        anchor_col=anchor_col,
        elevations=dem_grid.elevations,
        slope_deg=slope_deg,
        curvature=curvature,
        cell_size_m=dem_grid.cell_size_m,
        structure_class=structure_class,
        zone_cells=zone_cells,
    )

    # Compute structure metrics for new cells
    centroid_row = np.mean([r for r, c in new_cells])
    centroid_col = np.mean([c for r, c in new_cells])

    new_metrics = compute_structure_metrics(
        elevations=dem_grid.elevations,
        slope_deg=slope_deg,
        curvature=curvature,
        cells=new_cells,
        cell_size_m=dem_grid.cell_size_m,
        dem_grid=dem_grid,
        centroid_row=centroid_row,
        centroid_col=centroid_col,
    )

    return new_cells, new_metrics


def validate_subject_structure(
    subject_cells: List[Tuple[int, int]],
    zone_max_score: float,
    elevations: np.ndarray,
    slope_deg: np.ndarray,
    curvature: np.ndarray,
    cell_size_m: float,
    tolerance: float = 0.05,
) -> Tuple[bool, float, float, float]:
    """
    Sanity check: verify subject polygon captures the high-structure area.

    Args:
        subject_cells: Cells in subject polygon
        zone_max_score: Max structure score from zone-level analysis
        elevations: DEM elevation grid
        slope_deg: Slope grid
        curvature: Curvature grid
        cell_size_m: Cell size in meters
        tolerance: Allowed difference between subject max and zone max

    Returns:
        Tuple of (is_valid, subject_min, subject_median, subject_max)
    """
    if not subject_cells:
        return False, 0.0, 0.0, 0.0

    # Compute structure scores for all subject cells
    scores = []
    for row, col in subject_cells:
        score = compute_cell_structure_score(
            row, col, elevations, slope_deg, curvature, cell_size_m
        )
        scores.append(score)

    subject_min = float(np.min(scores))
    subject_median = float(np.median(scores))
    subject_max = float(np.max(scores))

    # Check if subject captures the high-structure area
    is_valid = subject_max >= zone_max_score - tolerance

    return is_valid, subject_min, subject_median, subject_max


# =============================================================================
# Per-Cell Rim Candidate Detection
# =============================================================================

@dataclass
class RimCandidate:
    """A single rim/overlook candidate cell."""
    row: int
    col: int
    lat: float
    lon: float
    elevation_m: float
    slope_deg: float
    tpi_large_m: float
    rim_strength: float


# Per-cell rim candidate thresholds (more permissive than zone-level)
RIM_CELL_TPI_THRESHOLD_M = 12.0     # Lower than zone-level (20m) to catch more candidates
RIM_CELL_SLOPE_MAX_DEG = 25.0       # Slightly steeper allowed for viewpoints
RIM_CELL_SLOPE_BREAK_THRESHOLD_DEG = 8.0  # Minimum slope break to qualify as edge/rim
RIM_CELL_STEEP_SLOPE_DEG = 35.0     # Slope threshold for "steep" cells
RIM_CELL_NEAR_STEEP_RADIUS = 2      # Radius in cells for steep adjacency check
RIM_NMS_NEIGHBORHOOD = 5            # Non-max suppression neighborhood (cells)
RIM_MAX_RAW_CANDIDATES = 500        # Cap on raw candidates before NMS

# Edge gating modes
RIM_EDGE_MODE_NONE = "NONE"
RIM_EDGE_MODE_SLOPE_BREAK = "SLOPE_BREAK"
RIM_EDGE_MODE_STEEP_ADJACENCY = "STEEP_ADJACENCY"
RIM_EDGE_MODE_BOTH = "BOTH"
RIM_EDGE_MODE_DEFAULT = RIM_EDGE_MODE_STEEP_ADJACENCY  # Default: steep adjacency


def compute_slope_break_grid(slope_deg: np.ndarray) -> np.ndarray:
    """
    Compute per-cell max slope break (edge-ness) efficiently using numpy.

    For each cell, computes the maximum absolute slope difference to any
    of its 8 neighbors. High values indicate edges, cliffs, rim boundaries.

    Args:
        slope_deg: Slope grid in degrees

    Returns:
        2D array of max slope break values (degrees) for each cell
    """
    rows, cols = slope_deg.shape

    # Pad the array to handle edges
    padded = np.pad(slope_deg, pad_width=1, mode='edge')

    # Compute max difference to any neighbor using rolling windows
    max_break = np.zeros_like(slope_deg, dtype=np.float64)

    # Offsets for 8 neighbors
    offsets = [(-1, -1), (-1, 0), (-1, 1),
               (0, -1),           (0, 1),
               (1, -1),  (1, 0),  (1, 1)]

    for dr, dc in offsets:
        neighbor = padded[1 + dr:rows + 1 + dr, 1 + dc:cols + 1 + dc]
        diff = np.abs(slope_deg - neighbor)
        max_break = np.maximum(max_break, diff)

    return max_break


def compute_near_steep_mask(
    slope_deg: np.ndarray,
    steep_slope_deg: float = RIM_CELL_STEEP_SLOPE_DEG,
    radius_cells: int = RIM_CELL_NEAR_STEEP_RADIUS,
) -> tuple:
    """
    Compute mask for cells that are near steep terrain (within radius).

    This is effective for canyon rims: finds walkable cells adjacent to drops.

    Args:
        slope_deg: Slope grid in degrees
        steep_slope_deg: Threshold for "steep" cells (default 35°)
        radius_cells: Radius in cells to search for steep neighbors (default 2)

    Returns:
        Tuple of (near_steep_mask, steep_mask, steep_count, near_steep_count)
    """
    rows, cols = slope_deg.shape

    # Step 1: Identify steep cells
    steep_mask = slope_deg > steep_slope_deg
    steep_count = int(np.sum(steep_mask))

    # Step 2: Dilate steep_mask by radius_cells using simple neighborhood max
    # This is equivalent to: near_steep[r,c] = any(steep within radius)
    near_steep_mask = np.zeros_like(steep_mask, dtype=bool)

    # Pad steep_mask for edge handling
    padded = np.pad(steep_mask, pad_width=radius_cells, mode='constant', constant_values=False)

    # For each cell, check if any cell in the radius is steep
    for dr in range(-radius_cells, radius_cells + 1):
        for dc in range(-radius_cells, radius_cells + 1):
            # Extract shifted view
            shifted = padded[
                radius_cells + dr:radius_cells + dr + rows,
                radius_cells + dc:radius_cells + dc + cols
            ]
            near_steep_mask = near_steep_mask | shifted

    near_steep_count = int(np.sum(near_steep_mask))

    return near_steep_mask, steep_mask, steep_count, near_steep_count


def compute_rim_candidate_mask(
    tpi_large: np.ndarray,
    slope_deg: np.ndarray,
    tpi_threshold_m: float = RIM_CELL_TPI_THRESHOLD_M,
    slope_max_deg: float = RIM_CELL_SLOPE_MAX_DEG,
    edge_mode: str = RIM_EDGE_MODE_DEFAULT,
    slope_break_threshold_deg: float = RIM_CELL_SLOPE_BREAK_THRESHOLD_DEG,
    steep_slope_deg: float = RIM_CELL_STEEP_SLOPE_DEG,
    near_steep_radius_cells: int = RIM_CELL_NEAR_STEEP_RADIUS,
    slope_break_grid: np.ndarray = None,
    return_debug: bool = False,
) -> np.ndarray:
    """
    Build per-cell rim candidate mask with edge-ness gating.

    A cell is a rim candidate if:
    - tpi_large > tpi_threshold_m (cell is higher than surroundings)
    - slope < slope_max_deg (cell is walkable)
    - Edge condition based on edge_mode:
      - SLOPE_BREAK: max_slope_break > slope_break_threshold_deg
      - STEEP_ADJACENCY: cell is within radius_cells of a steep cell
      - BOTH: either condition passes
      - NONE: no edge filtering (original behavior)

    Args:
        tpi_large: Large-scale TPI grid (elevation - neighborhood mean)
        slope_deg: Slope grid in degrees
        tpi_threshold_m: Minimum TPI for rim candidacy (default 12m)
        slope_max_deg: Maximum slope for rim candidacy (default 25°)
        edge_mode: Edge gating mode (SLOPE_BREAK, STEEP_ADJACENCY, BOTH, NONE)
        slope_break_threshold_deg: Minimum slope break for edge-ness (default 8°)
        steep_slope_deg: Threshold for steep cells (default 35°)
        near_steep_radius_cells: Radius for steep adjacency check (default 2)
        slope_break_grid: Pre-computed slope break grid (optional)
        return_debug: If True, return tuple with debug info

    Returns:
        If return_debug=False: Boolean mask where True = rim candidate cell
        If return_debug=True: Tuple of (rim_mask, debug_dict) with edge gating stats
    """
    # Base mask: high TPI + walkable slope
    base_mask = (tpi_large > tpi_threshold_m) & (slope_deg < slope_max_deg)
    cells_before_edge = int(np.sum(base_mask))

    debug_info = {
        'rim_mask_cells_before_edge_gate': cells_before_edge,
        'rim_mask_cells_after_edge_gate': 0,
        'edge_mode': edge_mode,
        'slope_break_threshold_deg': slope_break_threshold_deg,
        'steep_slope_deg': steep_slope_deg,
        'near_steep_radius_cells': near_steep_radius_cells,
        'steep_cells_count': 0,
        'near_steep_cells_count': 0,
    }

    # No edge filtering
    if edge_mode == RIM_EDGE_MODE_NONE:
        debug_info['rim_mask_cells_after_edge_gate'] = cells_before_edge
        if return_debug:
            return base_mask, debug_info
        return base_mask

    # Compute edge masks based on mode
    edge_mask = np.zeros_like(base_mask, dtype=bool)

    if edge_mode in (RIM_EDGE_MODE_SLOPE_BREAK, RIM_EDGE_MODE_BOTH):
        # Compute slope break grid if not provided
        if slope_break_grid is None:
            slope_break_grid = compute_slope_break_grid(slope_deg)
        slope_break_edge = slope_break_grid > slope_break_threshold_deg
        edge_mask = edge_mask | slope_break_edge

    if edge_mode in (RIM_EDGE_MODE_STEEP_ADJACENCY, RIM_EDGE_MODE_BOTH):
        near_steep_mask, steep_mask, steep_count, near_steep_count = compute_near_steep_mask(
            slope_deg=slope_deg,
            steep_slope_deg=steep_slope_deg,
            radius_cells=near_steep_radius_cells,
        )
        edge_mask = edge_mask | near_steep_mask
        debug_info['steep_cells_count'] = steep_count
        debug_info['near_steep_cells_count'] = near_steep_count

    # Final mask: base conditions + edge condition
    rim_mask = base_mask & edge_mask
    debug_info['rim_mask_cells_after_edge_gate'] = int(np.sum(rim_mask))

    if return_debug:
        return rim_mask, debug_info
    return rim_mask


def compute_rim_strength_grid(
    tpi_large: np.ndarray,
    normalization_m: float = TPI_NORMALIZATION_M,
) -> np.ndarray:
    """
    Compute per-cell rim strength (0-1) from TPI.

    Args:
        tpi_large: Large-scale TPI grid
        normalization_m: TPI value that maps to strength 1.0

    Returns:
        Rim strength grid (0-1), 0 for negative TPI
    """
    rim_strength = np.clip(tpi_large / normalization_m, 0.0, 1.0)
    # Zero out negative TPI (basins)
    rim_strength = np.where(tpi_large > 0, rim_strength, 0.0)
    return rim_strength


def extract_rim_candidates_nms(
    rim_mask: np.ndarray,
    rim_strength: np.ndarray,
    tpi_large: np.ndarray,
    slope_deg: np.ndarray,
    elevations: np.ndarray,
    dem_grid,  # DEMGrid for lat/lon conversion
    neighborhood_size: int = RIM_NMS_NEIGHBORHOOD,
    max_candidates: int = RIM_MAX_RAW_CANDIDATES,
    use_spatial_tiling: bool = False,
    tile_count: int = 16,  # 4x4 grid of tiles
) -> Tuple[List[RimCandidate], int]:
    """
    Extract distinct rim candidate points using non-maximum suppression.

    For each local maximum of rim_strength within the rim_mask,
    keeps only the strongest point in each neighborhood.

    Args:
        rim_mask: Boolean mask of rim candidate cells
        rim_strength: Per-cell rim strength grid (0-1)
        tpi_large: Large-scale TPI grid
        slope_deg: Slope grid
        elevations: Elevation grid
        dem_grid: DEMGrid for coordinate conversion
        neighborhood_size: Size of NMS neighborhood (cells, must be odd)
        max_candidates: Maximum candidates to return
        use_spatial_tiling: If True, select candidates evenly across spatial tiles
        tile_count: Number of tiles (must be a perfect square, e.g., 16 for 4x4)

    Returns:
        Tuple of (List of RimCandidate objects, total_maxima_found before cap)
    """
    rows, cols = rim_mask.shape

    # Ensure odd neighborhood
    if neighborhood_size % 2 == 0:
        neighborhood_size += 1
    half_n = neighborhood_size // 2

    # Apply mask to rim_strength (set non-candidates to 0)
    masked_strength = np.where(rim_mask, rim_strength, 0.0)

    # Find all candidate cells (where mask is True)
    candidate_indices = np.argwhere(rim_mask)

    if len(candidate_indices) == 0:
        return []

    # Sort by rim_strength descending
    strengths = [masked_strength[r, c] for r, c in candidate_indices]
    sorted_indices = np.argsort(strengths)[::-1]

    # Non-maximum suppression
    suppressed = np.zeros_like(rim_mask, dtype=bool)
    candidates = []

    for idx in sorted_indices:
        r, c = candidate_indices[idx]

        # Skip if already suppressed
        if suppressed[r, c]:
            continue

        # Check if this is a local maximum in the neighborhood
        r_min = max(0, r - half_n)
        r_max = min(rows, r + half_n + 1)
        c_min = max(0, c - half_n)
        c_max = min(cols, c + half_n + 1)

        neighborhood = masked_strength[r_min:r_max, c_min:c_max]
        local_max = np.max(neighborhood)

        # Only keep if this cell is the local maximum (or tied)
        if masked_strength[r, c] < local_max - 1e-6:
            continue

        # This is a local maximum - keep it
        lat, lon = dem_grid.indices_to_lat_lon(r, c)

        candidates.append(RimCandidate(
            row=int(r),
            col=int(c),
            lat=float(lat),
            lon=float(lon),
            elevation_m=float(elevations[r, c]),
            slope_deg=float(slope_deg[r, c]),
            tpi_large_m=float(tpi_large[r, c]),
            rim_strength=float(rim_strength[r, c]),
        ))

        # Suppress neighborhood
        suppressed[r_min:r_max, c_min:c_max] = True

    # Track total maxima found before any cap
    total_maxima_found = len(candidates)

    # Apply spatial tiling if requested and we have too many candidates
    if use_spatial_tiling and len(candidates) > max_candidates:
        candidates = _select_candidates_by_spatial_tiles(
            candidates, max_candidates, tile_count, rows, cols
        )
    elif len(candidates) > max_candidates:
        # Simple truncation by strength (already sorted)
        candidates = candidates[:max_candidates]

    return candidates, total_maxima_found


def _select_candidates_by_spatial_tiles(
    candidates: List[RimCandidate],
    max_candidates: int,
    tile_count: int,
    rows: int,
    cols: int,
) -> List[RimCandidate]:
    """
    Select candidates evenly distributed across spatial tiles.

    Divides the grid into tiles and selects top candidates from each tile
    to ensure spatial coverage across the AOI.
    """
    import math

    # Compute tile dimensions
    tiles_per_side = int(math.sqrt(tile_count))
    tile_rows = rows // tiles_per_side
    tile_cols = cols // tiles_per_side

    # Assign each candidate to a tile
    tile_candidates: Dict[Tuple[int, int], List[RimCandidate]] = {}
    for cand in candidates:
        tile_r = min(cand.row // tile_rows, tiles_per_side - 1)
        tile_c = min(cand.col // tile_cols, tiles_per_side - 1)
        tile_key = (tile_r, tile_c)
        if tile_key not in tile_candidates:
            tile_candidates[tile_key] = []
        tile_candidates[tile_key].append(cand)

    # Round-robin selection from tiles
    selected = []
    candidates_per_tile = max(1, max_candidates // len(tile_candidates))

    # First pass: take up to candidates_per_tile from each tile
    for tile_key, tile_cands in tile_candidates.items():
        # Candidates are already sorted by strength
        selected.extend(tile_cands[:candidates_per_tile])

    # Second pass: fill remaining slots with best remaining candidates
    if len(selected) < max_candidates:
        remaining = []
        for tile_key, tile_cands in tile_candidates.items():
            remaining.extend(tile_cands[candidates_per_tile:])
        # Sort remaining by strength and fill
        remaining.sort(key=lambda c: c.rim_strength, reverse=True)
        selected.extend(remaining[:max_candidates - len(selected)])

    # Sort final selection by strength
    selected.sort(key=lambda c: c.rim_strength, reverse=True)
    return selected[:max_candidates]


def get_structure_explanation(metrics: StructureMetrics) -> str:
    """Generate human-readable explanation of structure classification."""
    if metrics.structure_class == "micro-dramatic":
        features = []
        if metrics.micro_relief_m >= MICRO_RELIEF_THRESHOLD:
            features.append(f"{metrics.micro_relief_m:.1f}m local relief")
        if metrics.max_curvature >= CURVATURE_THRESHOLD:
            features.append("high curvature (ridges/knobs)")
        if not features:
            features.append("interesting micro-terrain")
        return f"Micro-dramatic feature: {', '.join(features)}"

    elif metrics.structure_class == "macro-dramatic":
        features = []
        if metrics.macro_relief_m >= MACRO_RELIEF_THRESHOLD:
            features.append(f"{metrics.macro_relief_m:.1f}m regional relief")
        if metrics.max_slope_break >= SLOPE_BREAK_THRESHOLD:
            features.append(f"{metrics.max_slope_break:.1f}° slope breaks (cliffs/ledges)")
        if not features:
            features.append("significant terrain structure")
        return f"Macro-dramatic feature: {', '.join(features)}"

    else:
        reasons = []
        if metrics.micro_relief_m < MICRO_RELIEF_THRESHOLD:
            reasons.append(f"low local relief ({metrics.micro_relief_m:.1f}m)")
        if metrics.macro_relief_m < MACRO_RELIEF_THRESHOLD:
            reasons.append(f"low regional relief ({metrics.macro_relief_m:.1f}m)")
        if metrics.heterogeneity_score < 0.2:
            reasons.append("uniform terrain")
        if not reasons:
            reasons.append("no significant structure")
        return f"Flat-lit terrain: {', '.join(reasons)}"
