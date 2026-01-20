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


# Thresholds for structure classification
MICRO_RELIEF_THRESHOLD = 5.0    # meters - minimum for micro-dramatic
MACRO_RELIEF_THRESHOLD = 30.0   # meters - minimum for macro-dramatic
CURVATURE_THRESHOLD = 0.02      # curvature units for "interesting" terrain
SLOPE_BREAK_THRESHOLD = 8.0     # degrees - significant slope change


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
