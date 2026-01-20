"""
Subject detection with explicit separation of three concepts:

1. LIT TERRAIN - Areas receiving favorable light (glow or rim-light)
2. PHOTOGRAPHIC SUBJECT - Distinct features within lit terrain worth photographing
3. SHOOTING POSITION - Plausible location to photograph the subject

A zone is only valid if ALL THREE exist.

Zone sizing:
- Use effective_width = sqrt(area) instead of raw area
- Zones wider than MAX_ZONE_WIDTH_M (~1000m) are subdivided
- This ensures zones are human-navigable and compositionally coherent

Detection philosophy:
- Detect lit terrain first (based on sun angle and face direction)
- Identify photographic subjects within lit areas
- Validate shooting positions exist before returning zones
"""
from __future__ import annotations

import numpy as np
from dataclasses import dataclass
from typing import Optional
from .dem import DEMGrid
from .analysis import compute_slope_aspect, compute_surface_normals, compute_curvature
from .structure import StructureMetrics, compute_structure_metrics, is_dramatic_structure, get_structure_explanation


# Scale classifications for photographic composition
# Based on distance from camera and feature size
FOREGROUND_MAX_M = 30.0      # 0-30m: foreground interest (small rocks, plants)
HUMAN_SCALE_MAX_M = 150.0    # 30-150m: human-scale features (boulders, outcrops)
# Beyond 150m: monument-scale features (cliffs, peaks, walls)

# Surface moments are NOT defined by slope or size.
# They are defined by how grazing light transforms terrain into
# texture, contrast, or rhythm. Any slope can be a surface moment
# when the lighting conditions reveal its character.
#
# See illumination.py for classification based on grazing light:
# - Sun altitude < 8° (low sun near horizon)
# - Incidence angle < 12° (light raking across surface)


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
    # Confidence scoring
    confidence: float  # 0-1 overall confidence
    score_breakdown: dict  # Individual score components
    # Distance-based scale classification
    distance_from_center_m: float = 0.0
    classification: str = "monument-scale"  # "foreground", "human-scale", "monument-scale"
    # Subject type: dramatic features vs small surface moments
    subject_type: str = "dramatic-feature"  # "dramatic-feature" or "surface-moment"
    # Quality tier: "primary" or "subtle" (surface moments are subtle/experimental)
    quality_tier: str = "primary"
    # Structure metrics - distinguishes actual features from flat-lit terrain
    structure: Optional[StructureMetrics] = None
    structure_class: str = "unknown"  # "micro-dramatic", "macro-dramatic", "flat-lit"
    is_dramatic: bool = True  # False for flat-lit terrain
    # Geometry type: planar (walls, slabs) vs volumetric (boulders, knobs)
    # Volumetric subjects don't have a single face direction - bypass face-based filters
    geometry_type: str = "planar"  # "planar" or "volumetric"
    face_direction_variance: float = 0.0  # Variance of face directions across cells
    volumetric_reason: Optional[str] = None  # e.g., "curvature:1.5" or "face_variance:72.3°"
    # Parent polygon ID (for multi-anchor extraction - tracks which explore area this anchor came from)
    parent_polygon_id: Optional[int] = None


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


def _haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance in meters between two lat/lon points."""
    R = 6371000  # Earth radius in meters
    phi1, phi2 = np.radians(lat1), np.radians(lat2)
    dphi = np.radians(lat2 - lat1)
    dlambda = np.radians(lon2 - lon1)
    a = np.sin(dphi/2)**2 + np.cos(phi1) * np.cos(phi2) * np.sin(dlambda/2)**2
    return 2 * R * np.arctan2(np.sqrt(a), np.sqrt(1-a))


def _classify_by_distance(distance_m: float) -> str:
    """
    Classify subject by distance from camera position.

    Returns:
        "foreground" - 0-30m, small features for composition
        "human-scale" - 30-150m, boulders and outcrops
        "monument-scale" - 150m+, cliffs, peaks, walls
    """
    if distance_m <= FOREGROUND_MAX_M:
        return "foreground"
    elif distance_m <= HUMAN_SCALE_MAX_M:
        return "human-scale"
    return "monument-scale"


def _classify_subject_type_preliminary(mean_slope: float) -> str:
    """
    Preliminary subject type - will be refined by illumination analysis.

    Final classification as "surface-moment" requires lighting conditions:
    - Sun altitude < 8° AND incidence < 12° (grazing light)
    - Slopes up to 30° can qualify

    Returns:
        "pending" - to be classified by illumination analysis
    """
    # All subjects start as pending, classified by lighting conditions later
    # Only exclude extremely steep slopes (>30°) from surface moment consideration
    if mean_slope > 30.0:
        return "dramatic-feature"  # Too steep for grazing light moments
    return "pending"  # Will be classified based on lighting


def detect_subjects(
    dem: DEMGrid,
    slope_deg: np.ndarray,
    aspect_deg: np.ndarray,
    center_lat: float = None,
    center_lon: float = None,
    min_slope_deg: float = 15.0,      # Soft minimum for dramatic features
    min_prominence_m: float = 3.0,     # Soft minimum prominence
    min_curvature: float = -0.5,       # Allow slightly concave
    min_cells: int = 1,                # Allow single-cell features
    min_confidence: float = 0.35,      # Minimum confidence for dramatic features
    foreground_confidence: float = 0.25,  # Lower threshold for foreground
    surface_moment_confidence: float = 0.20,  # Even lower for surface moments
    detect_surface_moments: bool = True,  # Enable micro-feature detection
) -> list[DetectedSubject]:
    """
    Detect terrain subjects using graduated confidence scoring.

    Detects two types of subjects:
    1. Dramatic features: Traditional cliffs, rock faces with steep slopes
    2. Surface moments: Micro-features with gentle slopes that catch subtle light

    Small features can qualify if they have compensating strengths:
    - A tiny but very steep outcrop
    - A modest slope with high prominence
    - A uniform-facing surface catching perfect light

    Args:
        dem: DEMGrid
        slope_deg: Slope array
        aspect_deg: Aspect array
        center_lat: Camera/analysis center latitude (for distance calc)
        center_lon: Camera/analysis center longitude
        min_slope_deg: Soft minimum slope for dramatic features
        min_prominence_m: Soft minimum prominence
        min_curvature: Soft minimum curvature
        min_cells: Minimum cells (can be 1 for small features)
        min_confidence: Minimum confidence for dramatic features
        foreground_confidence: Lower threshold for foreground features
        surface_moment_confidence: Threshold for surface moments (micro-features)
        detect_surface_moments: Whether to detect gentle-slope micro-features

    Returns:
        List of DetectedSubject objects, sorted by confidence
    """
    # Use DEM center if not specified
    if center_lat is None or center_lon is None:
        bounds = dem.bounds
        center_lat = (bounds["north"] + bounds["south"]) / 2
        center_lon = (bounds["east"] + bounds["west"]) / 2

    # Compute additional metrics
    curvature = compute_curvature(dem)
    prominence = _compute_simple_prominence(dem)

    # Compute per-cell confidence scores
    cell_scores = compute_cell_scores(dem, slope_deg, curvature, prominence)

    # Create candidate mask for terrain that can receive directional light
    #
    # IMPORTANT: Very flat terrain (< 8°) produces near-vertical surface normals
    # that are insensitive to sun direction. Require minimum slope for meaningful
    # directional lighting effects.
    #
    # PHILOSOPHY: Detect LIGHTING ZONES, not micro-surfaces
    # - Large continuous slopes are better than small features
    # - Use dilation to merge adjacent terrain into coherent zones
    # - Both glow-facing and rim-light terrain are valuable
    MIN_MEANINGFUL_SLOPE = 8.0  # Lowered to capture more terrain variety

    if detect_surface_moments:
        # Broad detection: any terrain that might catch interesting light
        # Very permissive to capture large continuous slopes
        candidates = (
            (slope_deg >= MIN_MEANINGFUL_SLOPE) &  # Required for directional lighting
            (prominence >= 0.3) &  # Minimal relief requirement
            (cell_scores >= 0.05)  # Very permissive baseline
        )
    else:
        # Traditional dramatic feature detection (steeper requirements)
        candidates = (
            (slope_deg >= max(min_slope_deg, MIN_MEANINGFUL_SLOPE)) &
            (prominence >= min_prominence_m) &
            (curvature >= min_curvature) &
            (cell_scores >= 0.15)
        )

    # Find connected components using 8-connectivity (includes diagonals)
    # USE DILATION to merge nearby terrain into larger coherent zones
    # This favors large continuous slopes over micro-features
    labeled, num_features = _label_connected(candidates, connectivity=8, dilate_iterations=2)

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

        # Calculate distance from center and classify by distance
        distance_m = _haversine_distance(
            center_lat, center_lon, centroid_lat, centroid_lon
        )
        classification = _classify_by_distance(distance_m)

        # Preliminary subject type classification (will be refined by lighting)
        subject_type = _classify_subject_type_preliminary(mean_slope)

        # Compute STRUCTURE METRICS - distinguishes dramatic features from flat-lit terrain
        structure_metrics = compute_structure_metrics(
            elevations=dem.elevations,
            slope_deg=slope_deg,
            curvature=curvature,
            cells=cells,
            cell_size_m=dem.cell_size_m,
            dem_grid=dem,
            centroid_row=centroid_row,
            centroid_col=centroid_col,
        )
        structure_class = structure_metrics.structure_class
        is_dramatic = is_dramatic_structure(structure_metrics)

        # Compute confidence scores (with classification context for relative sizing)
        subject_scores = _compute_subject_scores(
            mean_slope=mean_slope,
            mean_prominence=mean_prominence,
            mean_curvature=mean_curvature,
            aspects=aspects,
            area_m2=area_m2,
            cell_scores=scores,
            classification=classification,
            subject_type=subject_type,
        )

        # Boost confidence for dramatic structure, penalize flat-lit
        if is_dramatic:
            # Boost based on structure score
            structure_boost = structure_metrics.structure_score * 0.2
            subject_scores = SubjectScores(
                slope_score=subject_scores.slope_score,
                prominence_score=subject_scores.prominence_score,
                curvature_score=subject_scores.curvature_score,
                coherence_score=subject_scores.coherence_score,
                size_score=subject_scores.size_score,
                total=min(1.0, subject_scores.total + structure_boost),
            )
        else:
            # Penalize flat-lit terrain
            structure_penalty = 0.15
            subject_scores = SubjectScores(
                slope_score=subject_scores.slope_score,
                prominence_score=subject_scores.prominence_score,
                curvature_score=subject_scores.curvature_score,
                coherence_score=subject_scores.coherence_score,
                size_score=subject_scores.size_score,
                total=max(0.0, subject_scores.total - structure_penalty),
            )

        # Apply type-appropriate and scale-appropriate confidence threshold
        # Surface moments have lowest threshold (micro-features)
        # Foreground features have lower threshold
        # Dramatic background features have standard threshold
        if subject_type == "surface-moment":
            effective_threshold = surface_moment_confidence
        elif classification == "foreground":
            effective_threshold = foreground_confidence
        elif classification == "human-scale":
            effective_threshold = min_confidence * 0.9
        else:
            effective_threshold = min_confidence

        # Skip if below confidence threshold
        if subject_scores.total < effective_threshold:
            continue

        # Determine quality tier based on structure and type
        # flat-lit terrain is always "subtle" (not recommended for dramatic shots)
        # Surface moments are also "subtle"
        # Only dramatic structure with good lighting gets "primary"
        if not is_dramatic:
            quality_tier = "subtle"  # Flat-lit terrain - not dramatic
        elif subject_type == "surface-moment":
            quality_tier = "subtle"  # Surface moments - experimental
        else:
            quality_tier = "primary"

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
                # Structure metrics for debugging
                "micro_relief_m": float(structure_metrics.micro_relief_m),
                "macro_relief_m": float(structure_metrics.macro_relief_m),
                "max_curvature": float(structure_metrics.max_curvature),
                "max_slope_break": float(structure_metrics.max_slope_break),
                "heterogeneity": float(structure_metrics.heterogeneity_score),
                "structure_score": float(structure_metrics.structure_score),
            },
            distance_from_center_m=float(distance_m),
            classification=classification,
            subject_type=subject_type,
            quality_tier=quality_tier,
            structure=structure_metrics,
            structure_class=structure_class,
            is_dramatic=is_dramatic,
        ))

    # Sort by quality tier first (primary before subtle), then by confidence
    # This ensures dramatic features always rank above surface moments
    tier_order = {"primary": 0, "subtle": 1}
    subjects.sort(key=lambda s: (tier_order.get(s.quality_tier, 1), -s.confidence))

    return subjects


def _compute_subject_scores(
    mean_slope: float,
    mean_prominence: float,
    mean_curvature: float,
    aspects: list[float],
    area_m2: float,
    cell_scores: list[float],
    classification: str = "monument-scale",
    subject_type: str = "dramatic-feature",
) -> SubjectScores:
    """
    Compute confidence scores for a subject.

    Each component is 0-1, weighted and combined into total.
    Size is normalized relative to classification (foreground features
    don't need to be large to score well).

    Surface moments (micro-features) use different scoring:
    - Gentle slopes are valued, not penalized
    - Coherence is critical (uniform facing catches subtle light)
    - Small size is expected and appropriate
    """
    # Surface moments have different slope scoring
    # They value gentle, consistent slopes that catch subtle light
    if subject_type == "surface-moment":
        # For surface moments: 8° = 0.5, 15° = 0.8, 20° = 0.6 (too steep)
        # Peak at around 12-18° - gentle enough for subtle light
        if mean_slope < 8:
            slope_score = max(0.3, mean_slope / 16)  # Too flat
        elif mean_slope <= 20:
            slope_score = min(1.0, 0.5 + (mean_slope - 8) / 24)  # Sweet spot
        else:
            slope_score = max(0.4, 1.0 - (mean_slope - 20) / 30)  # Getting too steep
    else:
        # Dramatic features: 20° = 0.3, 35° = 0.7, 50°+ = 1.0
        slope_score = min(1.0, max(0.1, (mean_slope - 10) / 40))

    # Prominence score: scaled by classification and type
    if subject_type == "surface-moment":
        # Surface moments: 0.5m = 0.4, 2m = 0.7, 5m+ = 1.0 (tiny features)
        prominence_score = min(1.0, max(0.3, (mean_prominence + 0.5) / 5))
    elif classification == "foreground":
        # 1m = 0.3, 3m = 0.6, 8m+ = 1.0 (small features)
        prominence_score = min(1.0, max(0.2, (mean_prominence - 0.5) / 7.5))
    elif classification == "human-scale":
        # 3m = 0.3, 8m = 0.6, 20m+ = 1.0
        prominence_score = min(1.0, max(0.1, (mean_prominence - 1) / 19))
    else:
        # 5m = 0.3, 15m = 0.6, 30m+ = 1.0 (monument scale)
        prominence_score = min(1.0, max(0.1, (mean_prominence - 2) / 28))

    # Curvature score: positive = convex = good
    curvature_score = min(1.0, max(0.0, mean_curvature * 2 + 0.5))

    # Coherence score: how uniform is the facing direction?
    # Critical for surface moments - they need consistent facing to catch light
    coherence_score = _compute_aspect_coherence(aspects)

    # Size score: FAVOR LARGE CONTINUOUS SLOPES
    # No caps - bigger lighting zones are better for photography
    # Logarithmic scaling to reward size without extreme bias
    #
    # Philosophy: Large continuous slopes catch consistent light
    # and give photographers more composition options
    if area_m2 <= 100:
        # Small features: minimal score
        size_score = 0.2 + 0.2 * (area_m2 / 100)
    elif area_m2 <= 1000:
        # Medium features: moderate score
        size_score = 0.4 + 0.3 * np.log10(area_m2 / 100)
    elif area_m2 <= 10000:
        # Large features: good score
        size_score = 0.7 + 0.2 * np.log10(area_m2 / 1000)
    else:
        # Very large zones: excellent score (no cap)
        size_score = 0.9 + 0.1 * min(1.0, np.log10(area_m2 / 10000))

    # Mean cell quality (how good are the individual cells?)
    cell_quality = np.mean(cell_scores) if cell_scores else 0.5

    # Weighted combination - FAVOR LARGE CONTINUOUS SLOPES
    # Size now has significant weight to reward large lighting zones
    if subject_type == "surface-moment":
        # Surface moments: coherence, size, and slope matter
        # Large uniform-facing areas catch consistent subtle light
        total = (
            0.20 * slope_score +       # Slope in sweet spot
            0.10 * prominence_score +  # Less important
            0.10 * curvature_score +   # Helps catch light
            0.30 * coherence_score +   # Critical: uniform facing
            0.25 * size_score +        # LARGE zones are better
            0.05 * cell_quality
        )
    else:
        # Dramatic features: slope, coherence, and size all matter
        # Large continuous slopes give photographers options
        total = (
            0.25 * slope_score +
            0.15 * prominence_score +
            0.10 * curvature_score +
            0.25 * coherence_score +
            0.20 * size_score +        # LARGE zones are better
            0.05 * cell_quality
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


def _label_connected(
    mask: np.ndarray,
    connectivity: int = 8,
    dilate_iterations: int = 1,
) -> tuple[np.ndarray, int]:
    """
    Label connected components in a boolean mask.

    Uses morphological dilation to merge nearby cells before labeling,
    which helps group terrain features that span multiple DEM cells.

    Args:
        mask: Boolean mask of candidate cells
        connectivity: 4 or 8 (8 includes diagonals)
        dilate_iterations: Morphological dilation iterations to merge nearby cells
                          (1 = merge cells 1 step apart, good for 30m DEM)

    Returns:
        (labeled_array, num_features)
    """
    working_mask = mask.copy()

    # Apply morphological dilation to merge nearby cells
    # This helps connect terrain features that span multiple DEM cells
    if dilate_iterations > 0:
        for _ in range(dilate_iterations):
            dilated = working_mask.copy()
            # Dilate by shifting in all directions and OR'ing
            if connectivity == 8:
                # 8-connectivity: include diagonals
                shifts = [(-1, 0), (1, 0), (0, -1), (0, 1),
                         (-1, -1), (-1, 1), (1, -1), (1, 1)]
            else:
                # 4-connectivity
                shifts = [(-1, 0), (1, 0), (0, -1), (0, 1)]

            for dr, dc in shifts:
                shifted = np.zeros_like(working_mask)
                if dr > 0:
                    shifted[dr:, :] = working_mask[:-dr, :]
                elif dr < 0:
                    shifted[:dr, :] = working_mask[-dr:, :]
                else:
                    shifted[:, :] = working_mask[:, :]

                if dc > 0:
                    shifted2 = np.zeros_like(shifted)
                    shifted2[:, dc:] = shifted[:, :-dc]
                    shifted = shifted2
                elif dc < 0:
                    shifted2 = np.zeros_like(shifted)
                    shifted2[:, :dc] = shifted[:, -dc:]
                    shifted = shifted2

                dilated = dilated | shifted
            working_mask = dilated

    # Label connected components using flood fill with specified connectivity
    labeled = np.zeros_like(mask, dtype=int)
    current_label = 0

    if connectivity == 8:
        neighbors = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
    else:
        neighbors = [(-1, 0), (1, 0), (0, -1), (0, 1)]

    def flood_fill(start_r: int, start_c: int, label: int):
        stack = [(start_r, start_c)]
        while stack:
            r, c = stack.pop()
            if r < 0 or r >= working_mask.shape[0] or c < 0 or c >= working_mask.shape[1]:
                continue
            if not working_mask[r, c] or labeled[r, c] != 0:
                continue
            labeled[r, c] = label
            for dr, dc in neighbors:
                stack.append((r + dr, c + dc))

    for i in range(working_mask.shape[0]):
        for j in range(working_mask.shape[1]):
            if working_mask[i, j] and labeled[i, j] == 0:
                current_label += 1
                flood_fill(i, j, current_label)

    # Mask back to only original candidate cells
    # (dilated cells helped connect, but we only report original candidates)
    labeled = labeled * mask.astype(int)

    # Relabel to ensure contiguous labels after masking
    unique_labels = np.unique(labeled[labeled > 0])
    if len(unique_labels) > 0:
        relabeled = np.zeros_like(labeled)
        for new_label, old_label in enumerate(unique_labels, start=1):
            relabeled[labeled == old_label] = new_label
        labeled = relabeled
        num_features = len(unique_labels)
    else:
        num_features = 0

    return labeled, num_features


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


# =============================================================================
# Lighting Zone Detection (Scale-Aware)
# =============================================================================
# At 30m DEM resolution, each detected surface represents a macro terrain patch.
# We detect "lighting zones" - areas with consistent favorable lighting that
# indicate promising terrain for photographers to explore on foot.
#
# This is NOT object-level clustering. The goal is to guide photographers to
# zones where micro-features (rock gardens, boulder fields) likely exist.


@dataclass
class ZoneCandidate:
    """A surface candidate for zone grouping."""
    subject_id: int
    lat: float
    lon: float
    area_m2: float
    slope_deg: float
    mean_incidence: float
    glow_peak_minutes: float


def detect_lighting_zones(
    subjects: list,  # List of Subject objects
    dem_resolution_m: float = 30.0,
    min_members: int = 3,
    max_avg_incidence: float = 0.26,  # ~15° from grazing
) -> list:
    """
    Detect terrain zones with consistent favorable lighting.

    Scale-aware: zone radius is 3-6× DEM resolution.
    At 30m DEM, this means 90-180m zones.

    Args:
        subjects: List of analyzed Subject objects
        dem_resolution_m: DEM cell size (defines feature scale)
        min_members: Minimum surfaces to form a zone (≥3)
        max_avg_incidence: Maximum average incidence for zone

    Returns:
        List of LightingZone objects
    """
    from .types import LightingZone, LightingZoneMember

    # Zone radius scales with DEM resolution (3-6× resolution)
    # Use 6× for better grouping at coarse resolution
    zone_radius = dem_resolution_m * 6  # ~180m for 30m DEM

    # Filter to surface moments (grazing light candidates)
    surface_moments = [
        s for s in subjects
        if s.properties.subject_type == "surface-moment"
    ]

    if len(surface_moments) < min_members:
        return []

    # Build candidates
    candidates = []
    for s in surface_moments:
        if s.incidence_series:
            incidences = [p.incidence for p in s.incidence_series if p.incidence > 0]
            mean_inc = np.mean(incidences) if incidences else 0.5
        else:
            mean_inc = 0.5

        peak_minutes = s.glow_window.peak_minutes if s.glow_window else 30.0

        candidates.append(ZoneCandidate(
            subject_id=s.subject_id,
            lat=s.centroid["lat"],
            lon=s.centroid["lon"],
            area_m2=s.properties.area_m2,
            slope_deg=s.properties.slope_deg,
            mean_incidence=mean_inc,
            glow_peak_minutes=peak_minutes,
        ))

    # Group by spatial proximity
    zones = _group_into_zones(candidates, zone_radius, min_members)

    # Build and score zones
    result = []
    zone_id = 1

    for zone_candidates in zones:
        avg_incidence = np.mean([c.mean_incidence for c in zone_candidates])

        # Skip zones with poor lighting consistency
        if avg_incidence > max_avg_incidence:
            continue

        # Compute zone centroid
        center_lat = np.mean([c.lat for c in zone_candidates])
        center_lon = np.mean([c.lon for c in zone_candidates])

        # Compute zone extent
        distances = [
            _haversine_distance(center_lat, center_lon, c.lat, c.lon)
            for c in zone_candidates
        ]
        zone_extent = max(distances) if distances else 0

        # Build members
        members = []
        for c, dist in zip(zone_candidates, distances):
            members.append(LightingZoneMember(
                subject_id=c.subject_id,
                centroid={"lat": c.lat, "lon": c.lon},
                area_m2=c.area_m2,
                mean_incidence=c.mean_incidence,
                distance_to_center_m=dist,
            ))

        # Zone properties
        total_area = sum(c.area_m2 for c in zone_candidates)
        avg_slope = np.mean([c.slope_deg for c in zone_candidates])

        # Compute zone score
        score, breakdown = _compute_zone_score(
            member_count=len(zone_candidates),
            total_area_m2=total_area,
            avg_incidence=avg_incidence,
            zone_extent_m=zone_extent,
            dem_resolution_m=dem_resolution_m,
        )

        # Classify zone character
        zone_character = _classify_zone_character(avg_slope, total_area, len(zone_candidates))

        # Timing from best-lit member
        best_member = min(zone_candidates, key=lambda c: c.mean_incidence)
        all_peaks = [c.glow_peak_minutes for c in zone_candidates]

        result.append(LightingZone(
            zone_id=zone_id,
            centroid={"lat": center_lat, "lon": center_lon},
            members=members,
            member_count=len(members),
            total_area_m2=total_area,
            zone_radius_m=zone_extent,
            avg_incidence=avg_incidence,
            avg_slope_deg=avg_slope,
            dem_resolution_m=dem_resolution_m,
            zone_score=score,
            score_breakdown=breakdown,
            best_time_minutes=best_member.glow_peak_minutes,
            glow_window_start=min(all_peaks) - 10,
            glow_window_end=max(all_peaks) + 10,
            zone_character=zone_character,
        ))
        zone_id += 1

    result.sort(key=lambda z: -z.zone_score)
    return result


def _group_into_zones(
    candidates: list[ZoneCandidate],
    radius_m: float,
    min_members: int,
) -> list[list[ZoneCandidate]]:
    """Group candidates into zones using distance-based clustering."""
    if not candidates:
        return []

    assigned = set()
    zones = []

    for i, seed in enumerate(candidates):
        if i in assigned:
            continue

        zone = [seed]
        assigned.add(i)

        for j, other in enumerate(candidates):
            if j in assigned:
                continue
            dist = _haversine_distance(seed.lat, seed.lon, other.lat, other.lon)
            if dist <= radius_m:
                zone.append(other)
                assigned.add(j)

        if len(zone) >= min_members:
            zones.append(zone)
        else:
            for c in zone:
                assigned.discard(candidates.index(c))

    return zones


def _compute_zone_score(
    member_count: int,
    total_area_m2: float,
    avg_incidence: float,
    zone_extent_m: float,
    dem_resolution_m: float,
) -> tuple[float, dict]:
    """
    Score a lighting zone based on photographic potential.

    Higher scores indicate zones more likely to contain
    interesting micro-features with good lighting.
    """
    # Consistency: more detected surfaces = more consistent terrain
    # 3 = 0.5, 5 = 0.7, 8+ = 1.0
    consistency_score = min(1.0, 0.3 + 0.1 * member_count)

    # Coverage: larger total area suggests more exploration potential
    # Scaled to DEM resolution
    cell_area = dem_resolution_m ** 2
    coverage_ratio = total_area_m2 / (cell_area * 10)  # vs 10 cells
    coverage_score = min(1.0, 0.3 + 0.7 * coverage_ratio)

    # Lighting quality: lower incidence = better grazing
    # 0.05 = 1.0, 0.15 = 0.6, 0.25 = 0.2
    lighting_score = max(0.0, 1.0 - avg_incidence * 4)

    # Accessibility: smaller zones are easier to explore
    # Normalized to expected zone size (3-6× resolution)
    expected_radius = dem_resolution_m * 4.5
    if zone_extent_m <= expected_radius:
        accessibility_score = 1.0
    else:
        accessibility_score = max(0.4, expected_radius / zone_extent_m)

    # Combined score
    total = (
        0.25 * consistency_score +
        0.20 * coverage_score +
        0.35 * lighting_score +
        0.20 * accessibility_score
    )

    breakdown = {
        "consistency": consistency_score,
        "coverage": coverage_score,
        "lighting": lighting_score,
        "accessibility": accessibility_score,
    }

    return total, breakdown


def _classify_zone_character(
    avg_slope: float,
    total_area: float,
    member_count: int,
) -> str:
    """
    Classify likely terrain character of the zone.

    Helps photographers understand what to expect.
    """
    if avg_slope >= 15:
        return "rocky-slopes"  # Steeper = likely rock faces, outcrops
    elif avg_slope <= 8 and total_area > 5000:
        return "textured-flats"  # Gentle, extensive = slabs, pavements
    else:
        return "mixed-terrain"  # Varied = boulder fields, rock gardens


# =============================================================================
# Effective Width & Zone Subdivision
# =============================================================================
# Large lighting zones need to be broken into sub-zones that are:
# - Human-navigable (can walk across in reasonable time)
# - Compositionally coherent (photographer can frame the scene)

MAX_ZONE_WIDTH_M = 1000.0  # Maximum effective width before subdivision
MIN_ZONE_WIDTH_M = 100.0   # Minimum meaningful zone width


def compute_effective_width(area_m2: float) -> float:
    """
    Compute effective width of a zone from its area.

    Uses sqrt(area) as a proxy for the linear extent of the zone.
    This works well for roughly circular or square zones.

    Args:
        area_m2: Zone area in square meters

    Returns:
        Effective width in meters
    """
    return np.sqrt(area_m2)


def should_subdivide_zone(area_m2: float, max_width_m: float = MAX_ZONE_WIDTH_M) -> bool:
    """
    Determine if a zone should be subdivided based on effective width.

    Args:
        area_m2: Zone area in square meters
        max_width_m: Maximum allowed effective width

    Returns:
        True if zone should be subdivided
    """
    effective_width = compute_effective_width(area_m2)
    return effective_width > max_width_m


def estimate_subdivision_count(area_m2: float, max_width_m: float = MAX_ZONE_WIDTH_M) -> int:
    """
    Estimate how many sub-zones a large zone should be divided into.

    Args:
        area_m2: Zone area in square meters
        max_width_m: Maximum allowed effective width per sub-zone

    Returns:
        Number of sub-zones needed (minimum 1)
    """
    effective_width = compute_effective_width(area_m2)
    if effective_width <= max_width_m:
        return 1

    # Each sub-zone should be about max_width_m × max_width_m
    target_subzone_area = max_width_m ** 2
    return max(1, int(np.ceil(area_m2 / target_subzone_area)))


def subdivide_zone_cells(
    cells: list[tuple[int, int]],
    dem: DEMGrid,
    max_width_m: float = MAX_ZONE_WIDTH_M,
) -> list[list[tuple[int, int]]]:
    """
    Subdivide a large zone into smaller, navigable sub-zones.

    Uses k-means style clustering based on spatial proximity.

    Args:
        cells: List of (row, col) cell indices for the zone
        dem: DEMGrid for coordinate conversion
        max_width_m: Maximum effective width per sub-zone

    Returns:
        List of cell lists, one per sub-zone
    """
    if not cells:
        return []

    # Calculate current area
    area_m2 = len(cells) * dem.cell_size_m ** 2

    # Check if subdivision needed
    if not should_subdivide_zone(area_m2, max_width_m):
        return [cells]

    n_clusters = estimate_subdivision_count(area_m2, max_width_m)

    if n_clusters <= 1:
        return [cells]

    # Convert cells to coordinates for clustering
    coords = np.array([(r, c) for r, c in cells], dtype=float)

    # Simple k-means clustering
    # Initialize cluster centers evenly spaced
    rows = coords[:, 0]
    cols = coords[:, 1]

    # Initialize centers using a grid pattern
    n_sqrt = int(np.ceil(np.sqrt(n_clusters)))
    row_steps = np.linspace(rows.min(), rows.max(), n_sqrt + 2)[1:-1]
    col_steps = np.linspace(cols.min(), cols.max(), n_sqrt + 2)[1:-1]

    centers = []
    for r in row_steps:
        for c in col_steps:
            if len(centers) < n_clusters:
                centers.append([r, c])

    # Ensure we have exactly n_clusters centers
    while len(centers) < n_clusters:
        # Add random centers from data points
        idx = np.random.randint(len(coords))
        centers.append(coords[idx].tolist())

    centers = np.array(centers[:n_clusters])

    # K-means iterations
    for _ in range(20):  # Max iterations
        # Assign cells to nearest center
        assignments = np.zeros(len(coords), dtype=int)
        for i, coord in enumerate(coords):
            distances = np.sqrt(np.sum((centers - coord) ** 2, axis=1))
            assignments[i] = np.argmin(distances)

        # Update centers
        new_centers = np.zeros_like(centers)
        for k in range(n_clusters):
            mask = assignments == k
            if np.any(mask):
                new_centers[k] = coords[mask].mean(axis=0)
            else:
                new_centers[k] = centers[k]

        # Check convergence
        if np.allclose(centers, new_centers, atol=0.5):
            break
        centers = new_centers

    # Group cells by cluster assignment
    subzones = [[] for _ in range(n_clusters)]
    for i, (r, c) in enumerate(cells):
        cluster_id = assignments[i]
        subzones[cluster_id].append((r, c))

    # Filter out empty clusters
    subzones = [sz for sz in subzones if len(sz) > 0]

    return subzones


# =============================================================================
# Slope-Dependent Alignment Rules
# =============================================================================
# Gentle slopes need tighter alignment to produce visible glow.
# Steeper slopes can catch light from wider angles.

def get_max_glow_alignment(slope_deg: float) -> float:
    """
    Get maximum alignment offset for glow based on slope.

    Gentle slopes need tighter alignment to catch meaningful light.
    Steep slopes can produce glow from wider angles.

    Args:
        slope_deg: Surface slope in degrees

    Returns:
        Maximum alignment offset in degrees (one side)
    """
    if slope_deg < 10:
        return 30.0   # ±30° for very gentle slopes
    elif slope_deg < 15:
        return 45.0   # ±45° for moderate slopes
    else:
        return 60.0   # ±60° for steep slopes


def is_glow_alignment_valid(
    aspect_offset_deg: float,
    slope_deg: float,
) -> bool:
    """
    Check if a surface's alignment is valid for glow based on its slope.

    Args:
        aspect_offset_deg: Angular offset from sun direction (0 = facing sun)
        slope_deg: Surface slope in degrees

    Returns:
        True if alignment is valid for this slope
    """
    max_alignment = get_max_glow_alignment(slope_deg)
    return abs(aspect_offset_deg) <= max_alignment


# =============================================================================
# Pre-Illumination Orientation Filter
# =============================================================================
# Filter out subjects that face away from the sun BEFORE illumination analysis.
# This improves efficiency and prevents misclassification of opposite-facing terrain.

def filter_by_orientation(
    subjects: list[DetectedSubject],
    event: str,
    sun_azimuth_deg: float = None,
) -> tuple[list[DetectedSubject], list[dict]]:
    """
    Filter subjects by orientation relative to sun direction.

    Rejects surfaces that:
    1. Face away from the sun (aspect_offset > 120°)
    2. Have unfavorable directional preference (<0.2 with no rim potential)

    This filter runs BEFORE detailed illumination analysis for efficiency.
    It prevents east-facing slopes at sunset (or west-facing at sunrise)
    from being processed further.

    Args:
        subjects: List of DetectedSubject to filter
        event: "sunrise" or "sunset"
        sun_azimuth_deg: Optional sun azimuth (if None, uses default for event)

    Returns:
        Tuple of (passed_subjects, rejection_log)
        rejection_log contains debug info for each rejected subject
    """
    import logging
    from .illumination import compute_directional_preference, _get_cardinal_direction

    # Default sun azimuth based on event
    if sun_azimuth_deg is None:
        sun_azimuth_deg = 270.0 if event == "sunset" else 90.0

    MAX_ASPECT_OFFSET = 120.0  # Hard limit for any lighting zone
    MIN_DIRECTIONAL_PREF = 0.2  # Below this, reject unless rim-capable

    passed = []
    rejections = []
    volumetric_bypassed = 0

    for subj in subjects:
        # BYPASS: Volumetric subjects skip face-direction filtering
        # They don't have a single face - rely on camera-sun geometry instead
        if getattr(subj, 'geometry_type', 'planar') == 'volumetric':
            passed.append(subj)
            volumetric_bypassed += 1
            logging.debug(
                f"Pre-filter BYPASS: subject {subj.subject_id} is volumetric "
                f"(curvature={subj.structure.max_curvature if subj.structure else 0:.2f}, "
                f"face_var={getattr(subj, 'face_direction_variance', 0):.1f}°)"
            )
            continue

        face_dir = subj.face_direction
        cardinal = _get_cardinal_direction(face_dir)
        dir_pref = compute_directional_preference(face_dir, event)

        # Compute aspect offset from sun
        diff = abs(face_dir - sun_azimuth_deg) % 360
        aspect_offset = min(diff, 360 - diff)

        # Check 1: Hard reject if facing away from sun (planar subjects only)
        if aspect_offset > MAX_ASPECT_OFFSET:
            rejections.append({
                "subject_id": subj.subject_id,
                "reason": "facing_away",
                "face_direction": face_dir,
                "cardinal": cardinal,
                "aspect_offset": aspect_offset,
                "directional_pref": dir_pref,
            })
            logging.debug(
                f"Pre-filter REJECT: subject {subj.subject_id} faces {cardinal} "
                f"(offset={aspect_offset:.0f}° > {MAX_ASPECT_OFFSET}°, pref={dir_pref:.2f})"
            )
            continue

        # Check 2: Reject very unfavorable directions (unless rim-capable angle)
        is_rim_angle = 60 < aspect_offset <= 120
        if dir_pref < MIN_DIRECTIONAL_PREF and not is_rim_angle:
            rejections.append({
                "subject_id": subj.subject_id,
                "reason": "unfavorable_direction",
                "face_direction": face_dir,
                "cardinal": cardinal,
                "aspect_offset": aspect_offset,
                "directional_pref": dir_pref,
            })
            logging.debug(
                f"Pre-filter REJECT: subject {subj.subject_id} unfavorable {cardinal} "
                f"(pref={dir_pref:.2f} < {MIN_DIRECTIONAL_PREF}, not rim-capable)"
            )
            continue

        # Subject passes pre-filter
        logging.debug(
            f"Pre-filter PASS: subject {subj.subject_id} {cardinal} "
            f"(offset={aspect_offset:.0f}°, pref={dir_pref:.2f})"
        )
        passed.append(subj)

    logging.info(
        f"Orientation pre-filter: {len(subjects)} subjects -> "
        f"{len(passed)} passed ({volumetric_bypassed} volumetric bypass), {len(rejections)} rejected"
    )

    return passed, rejections


# =============================================================================
# Geometry Classification: Planar vs Volumetric
# =============================================================================
# Volumetric subjects (boulders, knobs) don't have a single face direction.
# They should bypass face-direction-based orientation filters and rely on
# standing location truth table (camera-sun geometry) for glow/rim classification.

# Thresholds for volumetric classification
# Volumetric = face_variance >= 60 OR (curvature >= 0.8 AND micro_relief >= 8m)
VOLUMETRIC_MIN_CURVATURE = 0.8       # Curvature threshold (requires relief too)
VOLUMETRIC_MIN_MICRO_RELIEF = 8.0    # Micro relief threshold in meters
VOLUMETRIC_MIN_FACE_VARIANCE = 60.0  # High variance = faces point many directions (degrees)


def compute_face_direction_variance(
    cells: list[tuple[int, int]],
    aspect_deg: np.ndarray,
) -> float:
    """
    Compute circular variance of face directions across cells.

    Uses circular statistics since angles wrap at 360°.
    Returns variance in degrees (0 = all same direction, ~100+ = very mixed).
    """
    if len(cells) < 2:
        return 0.0

    # Collect face directions
    face_dirs = []
    for row, col in cells:
        aspect = aspect_deg[row, col]
        face_dir = (aspect + 180) % 360
        face_dirs.append(face_dir)

    face_dirs = np.array(face_dirs)

    # Circular mean and variance using complex exponentials
    angles_rad = np.radians(face_dirs)
    mean_x = np.mean(np.cos(angles_rad))
    mean_y = np.mean(np.sin(angles_rad))

    # R is the mean resultant length (0 = uniform distribution, 1 = all same)
    R = np.sqrt(mean_x**2 + mean_y**2)

    # Circular variance: 1 - R (0 = no variance, 1 = max variance)
    circular_var = 1 - R

    # Convert to degrees for interpretability (0-180 scale)
    # sqrt(2 * circular_var) * 180/pi gives approximate angular deviation
    variance_deg = np.degrees(np.sqrt(2 * circular_var)) if circular_var > 0 else 0.0

    return variance_deg


def classify_geometry_type(
    structure: Optional[StructureMetrics],
    face_direction_variance: float,
) -> tuple[str, Optional[str]]:
    """
    Classify subject geometry as 'planar' or 'volumetric'.

    Volumetric if:
    - face_direction_variance >= 60° (cells face many different directions)
    - OR (max_curvature >= 0.8 AND micro_relief >= 8m)

    Planar subjects (walls, slabs, ridges) have consistent face direction
    and should use face-based orientation filtering.

    Volumetric subjects (boulders, knobs) don't have a dominant face and
    should bypass face-based filters, relying on camera-sun geometry instead.

    Returns:
        (geometry_type, volumetric_reason) - reason is None for planar
    """
    # Check face direction variance first (high variance = volumetric)
    if face_direction_variance >= VOLUMETRIC_MIN_FACE_VARIANCE:
        return ("volumetric", f"face_variance:{face_direction_variance:.1f}°")

    # Check curvature AND micro relief together (both required)
    if structure:
        has_curvature = structure.max_curvature >= VOLUMETRIC_MIN_CURVATURE
        has_relief = structure.micro_relief_m >= VOLUMETRIC_MIN_MICRO_RELIEF
        if has_curvature and has_relief:
            return ("volumetric", f"curvature:{structure.max_curvature:.2f}+relief:{structure.micro_relief_m:.1f}m")

    return ("planar", None)


# =============================================================================
# Multi-Anchor Extraction from Polygons
# =============================================================================
# Each polygon (explore area) can yield multiple subject anchors based on
# local maxima of structure_score. This treats the polygon as a container,
# not the subject itself.

# Anchor extraction parameters
ANCHOR_MIN_SEPARATION_M = 60.0    # Minimum distance between anchors
ANCHOR_MIN_COUNT = 1              # Minimum anchors per polygon
ANCHOR_MAX_COUNT = 7              # Maximum anchors per polygon
ANCHOR_MIN_STRUCTURE_SCORE = 0.3  # Minimum structure score for an anchor


@dataclass
class AnchorPoint:
    """A subject anchor point extracted from a polygon."""
    row: int
    col: int
    lat: float
    lon: float
    structure_score: float
    # Local metrics at anchor location
    elevation_m: float
    slope_deg: float
    aspect_deg: float
    curvature: float


def extract_anchors_from_polygon(
    polygon: DetectedSubject,
    dem: 'DEMGrid',
    slope_deg: np.ndarray,
    aspect_deg: np.ndarray,
    curvature: np.ndarray,
    elevations: np.ndarray,
    cell_size_m: float,
    min_separation_m: float = ANCHOR_MIN_SEPARATION_M,
    min_count: int = ANCHOR_MIN_COUNT,
    max_count: int = ANCHOR_MAX_COUNT,
    min_structure_score: float = ANCHOR_MIN_STRUCTURE_SCORE,
) -> list[AnchorPoint]:
    """
    Extract multiple subject anchors from a polygon based on local structure maxima.

    The polygon represents an "explore area" - terrain with favorable lighting.
    Anchors are the actual subjects to photograph within that area.

    Algorithm:
    1. Compute structure_score for each cell in polygon
    2. Find local maxima (cells higher than all 8 neighbors)
    3. Filter maxima by min_structure_score
    4. Greedy selection: keep top anchors with >= min_separation_m between them
    5. Return 1-7 anchors (at least 1, at most max_count)

    Args:
        polygon: DetectedSubject representing the explore area
        dem: DEMGrid for coordinate conversion
        slope_deg, aspect_deg, curvature, elevations: terrain arrays
        cell_size_m: cell size in meters
        min_separation_m: minimum distance between anchors
        min/max_count: anchor count bounds
        min_structure_score: threshold for anchor quality

    Returns:
        List of AnchorPoint objects, sorted by structure_score descending
    """
    from .structure import compute_cell_structure_score

    cells = polygon.cells
    if not cells:
        return []

    # Step 1: Compute structure score for each cell
    cell_scores = {}  # (row, col) -> score
    for row, col in cells:
        score = compute_cell_structure_score(
            row, col, elevations, slope_deg, curvature, cell_size_m
        )
        cell_scores[(row, col)] = score

    # Step 2: Find local maxima (cells with score > all 8 neighbors)
    cell_set = set(cells)
    local_maxima = []

    for (row, col), score in cell_scores.items():
        if score < min_structure_score:
            continue

        is_maximum = True
        for dr in [-1, 0, 1]:
            for dc in [-1, 0, 1]:
                if dr == 0 and dc == 0:
                    continue
                nr, nc = row + dr, col + dc
                if (nr, nc) in cell_set:
                    neighbor_score = cell_scores.get((nr, nc), 0)
                    if neighbor_score >= score:  # >= means not a strict maximum
                        is_maximum = False
                        break
            if not is_maximum:
                break

        if is_maximum:
            lat, lon = dem.indices_to_lat_lon(row, col)
            local_maxima.append(AnchorPoint(
                row=row,
                col=col,
                lat=float(lat),
                lon=float(lon),
                structure_score=score,
                elevation_m=float(elevations[row, col]),
                slope_deg=float(slope_deg[row, col]),
                aspect_deg=float(aspect_deg[row, col]),
                curvature=float(curvature[row, col]),
            ))

    # If no local maxima found, use the global max
    if not local_maxima and cells:
        best_cell = max(cell_scores.items(), key=lambda x: x[1])
        (row, col), score = best_cell
        lat, lon = dem.indices_to_lat_lon(row, col)
        local_maxima.append(AnchorPoint(
            row=row,
            col=col,
            lat=float(lat),
            lon=float(lon),
            structure_score=score,
            elevation_m=float(elevations[row, col]),
            slope_deg=float(slope_deg[row, col]),
            aspect_deg=float(aspect_deg[row, col]),
            curvature=float(curvature[row, col]),
        ))

    # Step 3: Sort by structure score descending
    local_maxima.sort(key=lambda a: -a.structure_score)

    # Step 4: Greedy selection with separation constraint
    selected = []
    for anchor in local_maxima:
        if len(selected) >= max_count:
            break

        # Check distance to all already-selected anchors
        too_close = False
        for existing in selected:
            dist = _haversine_distance(
                anchor.lat, anchor.lon,
                existing.lat, existing.lon
            )
            if dist < min_separation_m:
                too_close = True
                break

        if not too_close:
            selected.append(anchor)

    # Ensure at least min_count (use top scoring even if close)
    if len(selected) < min_count and local_maxima:
        for anchor in local_maxima:
            if anchor not in selected:
                selected.append(anchor)
            if len(selected) >= min_count:
                break

    return selected


def create_subject_from_anchor(
    anchor: AnchorPoint,
    parent_polygon: DetectedSubject,
    dem: 'DEMGrid',
    slope_deg: np.ndarray,
    aspect_deg: np.ndarray,
    curvature: np.ndarray,
    Nx: np.ndarray,
    Ny: np.ndarray,
    Nz: np.ndarray,
    subject_id: int,
) -> DetectedSubject:
    """
    Create a DetectedSubject from an anchor point within a parent polygon.

    The anchor becomes the subject centroid. Properties are computed from a
    small neighborhood around the anchor (not the entire polygon).

    Args:
        anchor: AnchorPoint to create subject from
        parent_polygon: The explore area polygon containing this anchor
        dem, slope_deg, etc.: terrain arrays
        subject_id: unique ID for this subject

    Returns:
        DetectedSubject centered on the anchor
    """
    from .structure import compute_structure_metrics

    row, col = anchor.row, anchor.col
    rows, cols = slope_deg.shape

    # Use a small neighborhood around anchor for local properties (5-cell radius = ~150m)
    radius = 5
    local_cells = []
    for dr in range(-radius, radius + 1):
        for dc in range(-radius, radius + 1):
            nr, nc = row + dr, col + dc
            if 0 <= nr < rows and 0 <= nc < cols:
                # Only include cells that are part of the parent polygon
                if (nr, nc) in set(parent_polygon.cells):
                    local_cells.append((nr, nc))

    # If no local cells (shouldn't happen), use just the anchor cell
    if not local_cells:
        local_cells = [(row, col)]

    # Compute local mean properties
    local_slopes = [slope_deg[r, c] for r, c in local_cells]
    local_aspects = [aspect_deg[r, c] for r, c in local_cells]
    local_elevs = [dem.elevations[r, c] for r, c in local_cells]

    mean_slope = float(np.mean(local_slopes))
    mean_aspect = float(_circular_mean(local_aspects))
    mean_elev = float(np.mean(local_elevs))
    face_dir = float((mean_aspect + 180) % 360)

    # Local surface normal
    local_Nx = [Nx[r, c] for r, c in local_cells]
    local_Ny = [Ny[r, c] for r, c in local_cells]
    local_Nz = [Nz[r, c] for r, c in local_cells]
    mean_Nx = float(np.mean(local_Nx))
    mean_Ny = float(np.mean(local_Ny))
    mean_Nz = float(np.mean(local_Nz))
    norm = float(np.sqrt(mean_Nx**2 + mean_Ny**2 + mean_Nz**2))
    if norm > 0:
        mean_Nx = float(mean_Nx / norm)
        mean_Ny = float(mean_Ny / norm)
        mean_Nz = float(mean_Nz / norm)

    # Area: use local neighborhood area
    area_m2 = float(len(local_cells) * dem.cell_size_m ** 2)

    # Compute structure metrics for local neighborhood
    structure = compute_structure_metrics(
        elevations=dem.elevations,
        slope_deg=slope_deg,
        curvature=curvature,
        cells=local_cells,
        cell_size_m=dem.cell_size_m,
        dem_grid=dem,
        centroid_row=row,
        centroid_col=col,
    )

    # Classify geometry type
    face_variance = float(compute_face_direction_variance(local_cells, aspect_deg))
    geometry_type, volumetric_reason = classify_geometry_type(structure, face_variance)

    return DetectedSubject(
        subject_id=subject_id,
        cells=local_cells,  # Use local neighborhood cells
        centroid_row=float(row),
        centroid_col=float(col),
        centroid_lat=float(anchor.lat),
        centroid_lon=float(anchor.lon),
        mean_elevation=mean_elev,
        mean_slope=mean_slope,
        mean_aspect=mean_aspect,
        face_direction=face_dir,
        normal=(mean_Nx, mean_Ny, mean_Nz),
        area_m2=area_m2,
        confidence=float(parent_polygon.confidence * (0.8 + 0.2 * anchor.structure_score)),
        score_breakdown=parent_polygon.score_breakdown,
        distance_from_center_m=float(parent_polygon.distance_from_center_m),
        classification=parent_polygon.classification,
        subject_type=parent_polygon.subject_type,
        quality_tier=parent_polygon.quality_tier,
        structure=structure,
        structure_class=structure.structure_class,
        is_dramatic=bool(structure.structure_score >= 0.4),
        geometry_type=geometry_type,
        face_direction_variance=face_variance,
        volumetric_reason=volumetric_reason,
        parent_polygon_id=parent_polygon.subject_id,
    )


# =============================================================================
# Orientation Purity and Zone Splitting
# =============================================================================
# Large zones (>0.2 km²) with mixed orientation (5-70% pass for event) should
# be split by orientation before the main orientation filter runs.
# NOTE: This only applies to PLANAR subjects. Volumetric subjects bypass this.

ORIENTATION_MIXED_MIN_AREA_M2 = 200000.0  # 0.2 km²
ORIENTATION_MIXED_MIN_PASS = 0.05  # 5% cells must pass
ORIENTATION_MIXED_MAX_PASS = 0.70  # 70% max - above this, zone is coherent
MAX_ASPECT_OFFSET_FOR_PASS = 60.0  # Cells pass if Δ(face, sun) <= 60°


def compute_orientation_pass_fraction(
    cells: list[tuple[int, int]],
    aspect_deg: np.ndarray,
    sun_azimuth_deg: float,
) -> tuple[float, int, int]:
    """
    Compute fraction of cells that pass orientation for given sun azimuth.

    A cell passes if Δ(face_direction, sun_azimuth) <= 60°.

    Returns:
        (pass_fraction, pass_count, total_count)
    """
    if not cells:
        return 0.0, 0, 0

    pass_count = 0
    for row, col in cells:
        aspect = aspect_deg[row, col]
        face_dir = (aspect + 180) % 360

        diff = abs(face_dir - sun_azimuth_deg) % 360
        aspect_offset = min(diff, 360 - diff)

        if aspect_offset <= MAX_ASPECT_OFFSET_FOR_PASS:
            pass_count += 1

    total = len(cells)
    return pass_count / total if total > 0 else 0.0, pass_count, total


def is_orientation_mixed(
    area_m2: float,
    pass_fraction: float,
) -> bool:
    """
    Check if a zone is orientation-mixed and should be split.

    Returns True if:
    - Zone area > 0.2 km²
    - Pass fraction is between 5% and 70% (heterogeneous)
    """
    if area_m2 < ORIENTATION_MIXED_MIN_AREA_M2:
        return False

    return ORIENTATION_MIXED_MIN_PASS <= pass_fraction <= ORIENTATION_MIXED_MAX_PASS


def split_zone_by_orientation(
    cells: list[tuple[int, int]],
    aspect_deg: np.ndarray,
    sun_azimuth_deg: float,
    dem: DEMGrid,
) -> tuple[list[list[tuple[int, int]]], list[list[tuple[int, int]]]]:
    """
    Split a zone into orientation-passing and orientation-failing cell groups.

    Then further subdivide each group spatially to ensure contiguous sub-zones.

    Returns:
        (passing_subzones, failing_subzones) - each is a list of cell lists
    """
    passing_cells = []
    failing_cells = []

    for row, col in cells:
        aspect = aspect_deg[row, col]
        face_dir = (aspect + 180) % 360

        diff = abs(face_dir - sun_azimuth_deg) % 360
        aspect_offset = min(diff, 360 - diff)

        if aspect_offset <= MAX_ASPECT_OFFSET_FOR_PASS:
            passing_cells.append((row, col))
        else:
            failing_cells.append((row, col))

    def extract_contiguous_groups(cell_list: list[tuple[int, int]]) -> list[list[tuple[int, int]]]:
        """Extract spatially contiguous groups from a cell list using flood fill."""
        if not cell_list:
            return []

        # Convert to set for fast lookup
        cell_set = set(cell_list)
        visited = set()
        groups = []

        def flood_fill(start: tuple[int, int]) -> list[tuple[int, int]]:
            """Flood fill to find all connected cells."""
            group = []
            stack = [start]

            while stack:
                cell = stack.pop()
                if cell in visited or cell not in cell_set:
                    continue

                visited.add(cell)
                group.append(cell)

                # Check 8-connected neighbors
                r, c = cell
                for dr in [-1, 0, 1]:
                    for dc in [-1, 0, 1]:
                        if dr == 0 and dc == 0:
                            continue
                        neighbor = (r + dr, c + dc)
                        if neighbor in cell_set and neighbor not in visited:
                            stack.append(neighbor)

            return group

        # Find all connected components
        for cell in cell_list:
            if cell not in visited:
                group = flood_fill(cell)
                if len(group) >= 3:  # Minimum viable sub-zone
                    groups.append(group)

        return groups

    passing_subzones = extract_contiguous_groups(passing_cells)
    failing_subzones = extract_contiguous_groups(failing_cells)

    return passing_subzones, failing_subzones


# =============================================================================
# Anchor Clustering
# =============================================================================
# After orientation splitting produces many sub-zones, cluster them by anchor
# points (max structure score location) to reduce noise while preserving coverage.

ANCHOR_CLUSTER_RADIUS_M = 100.0  # Cluster anchors within 100m
MAX_ANCHORS_PER_CLUSTER = 3      # Keep top 3 anchors per cluster


def _haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance in meters between two lat/lon points."""
    R = 6371000  # Earth radius in meters
    phi1, phi2 = np.radians(lat1), np.radians(lat2)
    dphi = np.radians(lat2 - lat1)
    dlambda = np.radians(lon2 - lon1)
    a = np.sin(dphi/2)**2 + np.cos(phi1) * np.cos(phi2) * np.sin(dlambda/2)**2
    return 2 * R * np.arctan2(np.sqrt(a), np.sqrt(1-a))


def cluster_subzones_by_anchor(
    subzones: list,  # list of DetectedSubject
    cluster_radius_m: float = ANCHOR_CLUSTER_RADIUS_M,
    max_per_cluster: int = MAX_ANCHORS_PER_CLUSTER,
) -> list:
    """
    Cluster sub-zones by their anchor points and keep top candidates per cluster.

    Anchor point = max_structure_location if available, else centroid.

    This reduces many orientation-split sub-zones to a manageable number
    while preserving geographic coverage.

    Args:
        subzones: List of DetectedSubject from orientation splitting
        cluster_radius_m: Cluster anchors within this distance (default 100m)
        max_per_cluster: Keep top N anchors per cluster (default 3)

    Returns:
        Filtered list of DetectedSubject (reduced count)
    """
    import logging

    if not subzones or len(subzones) <= max_per_cluster:
        return subzones

    # Extract anchor points for each sub-zone
    anchors = []
    for sz in subzones:
        # Use max_structure_location if available, else centroid
        if sz.structure and sz.structure.max_structure_location:
            lat, lon = sz.structure.max_structure_location
        else:
            lat, lon = sz.centroid_lat, sz.centroid_lon

        # Score for ranking (structure_score * confidence)
        score = sz.confidence
        if sz.structure:
            score *= (1 + sz.structure.structure_score)  # Boost by structure

        anchors.append({
            'subzone': sz,
            'lat': lat,
            'lon': lon,
            'score': score,
        })

    # Sort by score descending
    anchors.sort(key=lambda x: -x['score'])

    # Greedy clustering: assign each anchor to nearest cluster or create new
    clusters = []  # List of lists of anchors

    for anchor in anchors:
        # Find nearest cluster centroid
        best_cluster = None
        best_dist = float('inf')

        for cluster in clusters:
            # Compute cluster centroid
            c_lat = np.mean([a['lat'] for a in cluster])
            c_lon = np.mean([a['lon'] for a in cluster])
            dist = _haversine_distance(anchor['lat'], anchor['lon'], c_lat, c_lon)

            if dist < best_dist:
                best_dist = dist
                best_cluster = cluster

        # Assign to cluster if within radius, else create new
        if best_cluster is not None and best_dist < cluster_radius_m:
            best_cluster.append(anchor)
        else:
            clusters.append([anchor])

    # Keep top N from each cluster
    kept = []
    for cluster in clusters:
        # Sort cluster by score and keep top N
        cluster.sort(key=lambda x: -x['score'])
        for anchor in cluster[:max_per_cluster]:
            kept.append(anchor['subzone'])

    logging.info(
        f"Anchor clustering: {len(subzones)} sub-zones -> {len(clusters)} clusters -> "
        f"{len(kept)} anchors (radius={cluster_radius_m}m, max={max_per_cluster}/cluster)"
    )

    return kept


# =============================================================================
# Distance Sanity Rules for Standing Locations
# =============================================================================
# Standing positions need sensible distances based on subject scale.
# Distance rings scale with subject width to ensure proper framing.

# Absolute distance bounds (meters)
MIN_DISTANCE_ABSOLUTE_M = 80.0   # Never stand closer than 80m
MAX_DISTANCE_ABSOLUTE_M = 4000.0 # Never stand farther than 4km

# Width-based distance multipliers
MIN_DISTANCE_WIDTH_MULT = 0.8    # min_dist = 0.8 × subject_width
MAX_DISTANCE_WIDTH_MULT = 6.0    # max_dist = 6.0 × subject_width


def get_distance_constraints(
    slope_deg: float,
    area_m2: float,
    effective_width_m: float = None,
) -> tuple[float, float]:
    """
    Get min/max distance constraints for a standing location.

    Distance rings scale with subject width:
    - min_distance = max(80m, 0.8 × width)
    - max_distance = min(4000m, 6.0 × width)

    This ensures the subject fits in frame at all candidate distances.

    Args:
        slope_deg: Subject slope in degrees (legacy, kept for compatibility)
        area_m2: Subject area in square meters
        effective_width_m: Subject width in meters (sqrt(area) if not provided)

    Returns:
        (min_distance_m, max_distance_m)
    """
    import math

    # Compute effective width if not provided
    if effective_width_m is None or effective_width_m <= 0:
        effective_width_m = math.sqrt(area_m2)

    # Distance constraints scale with subject width
    min_dist = max(MIN_DISTANCE_ABSOLUTE_M, MIN_DISTANCE_WIDTH_MULT * effective_width_m)
    max_dist = min(MAX_DISTANCE_ABSOLUTE_M, MAX_DISTANCE_WIDTH_MULT * effective_width_m)

    # Ensure min < max (in case of very small subjects)
    if min_dist >= max_dist:
        max_dist = min_dist + 100.0  # At least 100m range

    return min_dist, max_dist


def is_distance_valid(
    distance_m: float,
    slope_deg: float,
    area_m2: float,
    effective_width_m: float = None,
) -> bool:
    """
    Check if a standing location distance is valid.

    Args:
        distance_m: Distance from subject in meters
        slope_deg: Subject slope in degrees
        area_m2: Subject area in square meters
        effective_width_m: Subject width in meters

    Returns:
        True if distance is within valid range
    """
    min_dist, max_dist = get_distance_constraints(slope_deg, area_m2, effective_width_m)
    return min_dist <= distance_m <= max_dist
