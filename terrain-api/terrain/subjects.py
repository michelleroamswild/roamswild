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

    # Create candidate mask for all terrain features
    # Surface moment vs dramatic feature is determined by LIGHTING, not geometry
    # So we detect all features here and classify by lighting later
    if detect_surface_moments:
        # Broader detection: any terrain that might catch interesting light
        candidates = (
            (slope_deg >= 5.0) &  # Minimal slope (flat areas rarely interesting)
            (prominence >= 0.5) &  # Some vertical relief
            (curvature >= -1.0) &  # Allow varied curvature
            (cell_scores >= 0.1)  # Baseline quality
        )
    else:
        # Traditional dramatic feature detection (steeper requirements)
        candidates = (
            (slope_deg >= min_slope_deg) &
            (prominence >= min_prominence_m) &
            (curvature >= min_curvature) &
            (cell_scores >= 0.2)
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

        # Calculate distance from center and classify by distance
        distance_m = _haversine_distance(
            center_lat, center_lon, centroid_lat, centroid_lon
        )
        classification = _classify_by_distance(distance_m)

        # Preliminary subject type classification (will be refined by lighting)
        subject_type = _classify_subject_type_preliminary(mean_slope)

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

        # Determine quality tier
        # Surface moments are labeled "subtle" (experimental) unless high confidence
        # They should never rank above high-confidence dramatic features
        if subject_type == "surface-moment":
            quality_tier = "subtle"  # Always subtle - experimental feature
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
            },
            distance_from_center_m=float(distance_m),
            classification=classification,
            subject_type=subject_type,
            quality_tier=quality_tier,
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

    # Size score: normalized relative to classification and type
    if subject_type == "surface-moment":
        # Surface moments: 5m² = 0.5, 20m² = 0.8, 100m²+ = 1.0 (micro features)
        size_score = min(1.0, max(0.4, 0.4 + 0.3 * np.log10(max(area_m2, 2)) / 2))
    elif classification == "foreground":
        # 10m² = 0.4, 50m² = 0.7, 200m²+ = 1.0 (small features)
        size_score = min(1.0, max(0.3, 0.3 + 0.35 * np.log10(max(area_m2, 5)) / 2))
    elif classification == "human-scale":
        # 50m² = 0.4, 300m² = 0.6, 1000m²+ = 0.9
        size_score = min(0.9, max(0.3, 0.25 + 0.325 * np.log10(max(area_m2, 20)) / 2.5))
    else:
        # 500m² = 0.4, 2000m² = 0.6, 10000m²+ = 0.8 (monument scale)
        size_score = min(0.8, max(0.2, 0.2 + 0.3 * np.log10(max(area_m2, 100)) / 3))

    # Mean cell quality (how good are the individual cells?)
    cell_quality = np.mean(cell_scores) if cell_scores else 0.5

    # Weighted combination - different weights for surface moments
    if subject_type == "surface-moment":
        # Surface moments: coherence and slope matter most
        # They need uniform facing to catch subtle, consistent light
        total = (
            0.25 * slope_score +       # Gentle slope in sweet spot
            0.15 * prominence_score +  # Less important for micro-features
            0.15 * curvature_score +   # Helps catch light
            0.35 * coherence_score +   # Critical: uniform facing
            0.05 * size_score +        # Small is fine
            0.05 * cell_quality
        )
    else:
        # Dramatic features: slope and coherence matter most
        total = (
            0.30 * slope_score +
            0.20 * prominence_score +
            0.10 * curvature_score +
            0.25 * coherence_score +
            0.05 * size_score +
            0.10 * cell_quality
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
