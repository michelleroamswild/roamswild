"""
Main terrain analysis pipeline.

Orchestrates all modules to produce a complete analysis result.

IMPORTANT: This pipeline uses AUTHORITATIVE DEM sources (Copernicus GLO-30,
USGS 3DEP) for all geometry calculations and photo-moment scoring.
AWS Terrain Tiles are available for visualization only.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional
from .types import (
    AnalyzeRequest, TerrainAnalysisResult, AnalysisMeta,
    Subject, SubjectProperties, SubjectValidation, SubjectExplain,
    StandingLocation, ShootingTiming, StructureMetrics, StructureDebug,
)
from .structure import get_structure_explanation
from .explain import (
    explain_lighting_zone_type,
    explain_aspect_offset,
    explain_incidence,
    explain_glow_score,
    explain_sun_altitude,
    explain_timing,
    explain_duration,
    explain_direction,
    explain_slope,
    explain_area,
)
from .dem import fetch_dem_grid, create_synthetic_dem, DEMGrid
from .dem_authoritative import (
    fetch_authoritative_dem,
    AuthoritativeDEMSource,
    DEMSourceInfo,
    recommend_source,
    COPERNICUS_INFO,
    USGS_3DEP_INFO,
)
from .sun import generate_sun_track
from .analysis import (
    compute_slope_aspect, compute_surface_normals,
    validate_normal_vector, validate_aspect_normal_match,
)
from .subjects import (
    detect_subjects,
    get_subject_polygon,
    DetectedSubject,
    detect_lighting_zones,
    compute_effective_width,
    should_subdivide_zone,
    subdivide_zone_cells,
    get_distance_constraints,
    is_distance_valid,
    filter_by_orientation,
    MAX_ZONE_WIDTH_M,
)
from .illumination import analyze_subject_illumination
from .shadows import check_shadow_at_peak
from .standing import find_standing_location, _summarize_rejections, log_rejection_histogram


# =============================================================================
# Spatial De-duplication and Diversity
# =============================================================================

# De-duplication thresholds
SUBJECT_PROXIMITY_M = 200.0      # Subjects within 200m are duplicates
STAND_PROXIMITY_M = 300.0        # Standing points within 300m...
BEARING_PROXIMITY_DEG = 15.0     # ...AND bearing within 15° are duplicates


def _haversine_distance_simple(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance in meters between two lat/lon points."""
    import math
    R = 6371000  # Earth radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda/2)**2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1-a))


def _angle_diff(a: float, b: float) -> float:
    """Minimum angular difference between two bearings."""
    diff = abs(a - b) % 360
    return min(diff, 360 - diff)


def _classify_result(subject, standing) -> str:
    """
    Classify a standing location result for diversity selection.

    Returns: "rim", "macro-glow", "micro-glow", or "other"
    """
    classification = getattr(standing.properties, 'classification', None)
    structure_class = subject.properties.structure_class

    if classification == "rim":
        return "rim"
    elif classification == "glow":
        if structure_class == "macro-dramatic":
            return "macro-glow"
        elif structure_class == "micro-dramatic":
            return "micro-glow"
    return "other"


def deduplicate_standing_locations(
    subjects: list,
    standing_locations: list,
    subject_proximity_m: float = SUBJECT_PROXIMITY_M,
    stand_proximity_m: float = STAND_PROXIMITY_M,
    bearing_proximity_deg: float = BEARING_PROXIMITY_DEG,
) -> tuple[list, list]:
    """
    Remove duplicate standing locations based on spatial proximity.

    A result is a duplicate if:
    - Its subject is within subject_proximity_m of a higher-scoring subject, OR
    - Its standing point is within stand_proximity_m AND bearing within bearing_proximity_deg
      of a higher-scoring standing location

    Results are assumed to be pre-sorted by score (best first).

    Returns:
        (deduplicated_subjects, deduplicated_standing_locations)
    """
    import logging

    if not standing_locations:
        return subjects, standing_locations

    # Build lookup from subject_id to subject
    subject_map = {s.subject_id: s for s in subjects}

    # Sort by score (higher is better) - use LOS clearance as proxy for quality
    scored = []
    for sl in standing_locations:
        subj = subject_map.get(sl.subject_id)
        if subj:
            score = subj.properties.confidence
            scored.append((score, sl, subj))

    scored.sort(key=lambda x: -x[0])  # Best first

    kept_standings = []
    kept_subject_ids = set()

    for score, sl, subj in scored:
        # Check if this subject is too close to an already-kept subject
        subj_lat = subj.centroid["lat"]
        subj_lon = subj.centroid["lon"]

        is_subject_duplicate = False
        for kept_sl in kept_standings:
            kept_subj = subject_map.get(kept_sl.subject_id)
            if kept_subj:
                dist = _haversine_distance_simple(
                    subj_lat, subj_lon,
                    kept_subj.centroid["lat"], kept_subj.centroid["lon"]
                )
                if dist < subject_proximity_m:
                    is_subject_duplicate = True
                    logging.info(
                        f"De-dup: Subject {sl.subject_id} too close to subject {kept_sl.subject_id} "
                        f"({dist:.0f}m < {subject_proximity_m:.0f}m)"
                    )
                    break

        if is_subject_duplicate:
            continue

        # Check if this standing point is too close to an already-kept standing point
        # with similar bearing
        stand_lat = sl.location["lat"]
        stand_lon = sl.location["lon"]
        stand_bearing = sl.properties.camera_bearing_deg

        is_stand_duplicate = False
        for kept_sl in kept_standings:
            dist = _haversine_distance_simple(
                stand_lat, stand_lon,
                kept_sl.location["lat"], kept_sl.location["lon"]
            )
            bearing_diff = _angle_diff(stand_bearing, kept_sl.properties.camera_bearing_deg)

            if dist < stand_proximity_m and bearing_diff < bearing_proximity_deg:
                is_stand_duplicate = True
                logging.info(
                    f"De-dup: Standing {sl.subject_id} too close to standing {kept_sl.subject_id} "
                    f"({dist:.0f}m, Δbearing={bearing_diff:.0f}°)"
                )
                break

        if is_stand_duplicate:
            continue

        # Keep this result
        kept_standings.append(sl)
        kept_subject_ids.add(sl.subject_id)

    # Filter subjects to only those with kept standings
    kept_subjects = [s for s in subjects if s.subject_id in kept_subject_ids]

    if len(kept_standings) < len(standing_locations):
        logging.info(
            f"De-duplication: {len(standing_locations)} -> {len(kept_standings)} standing locations"
        )

    return kept_subjects, kept_standings


def enforce_diversity(
    subjects: list,
    standing_locations: list,
    max_results: int = 10,
) -> tuple[list, list]:
    """
    Enforce diversity in results: ensure at least 1 rim, 1 macro-glow, 1 micro-glow
    when available, then fill remaining slots by score.

    Args:
        subjects: List of Subject objects
        standing_locations: List of StandingLocation objects
        max_results: Maximum number of results to return

    Returns:
        (diverse_subjects, diverse_standing_locations)
    """
    import logging

    if not standing_locations:
        return subjects, standing_locations

    # Build lookup
    subject_map = {s.subject_id: s for s in subjects}

    # Classify each result
    classified = []
    for sl in standing_locations:
        subj = subject_map.get(sl.subject_id)
        if subj:
            category = _classify_result(subj, sl)
            score = subj.properties.confidence
            classified.append((category, score, sl, subj))

    # Sort by score within each category
    classified.sort(key=lambda x: -x[1])

    # Group by category
    by_category = {"rim": [], "macro-glow": [], "micro-glow": [], "other": []}
    for cat, score, sl, subj in classified:
        by_category[cat].append((score, sl, subj))

    # Select diverse results
    selected = []
    selected_ids = set()

    # First, ensure diversity: take best of each category if available
    diversity_order = ["rim", "macro-glow", "micro-glow"]
    for cat in diversity_order:
        if by_category[cat] and len(selected) < max_results:
            score, sl, subj = by_category[cat][0]
            if sl.subject_id not in selected_ids:
                selected.append((score, sl, subj, cat))
                selected_ids.add(sl.subject_id)
                logging.info(f"Diversity: Selected {cat} (subject {sl.subject_id})")

    # Fill remaining slots by score
    all_remaining = []
    for cat, items in by_category.items():
        for score, sl, subj in items:
            if sl.subject_id not in selected_ids:
                all_remaining.append((score, sl, subj, cat))

    all_remaining.sort(key=lambda x: -x[0])  # Best first

    for score, sl, subj, cat in all_remaining:
        if len(selected) >= max_results:
            break
        selected.append((score, sl, subj, cat))
        selected_ids.add(sl.subject_id)

    # Extract results
    diverse_standings = [sl for _, sl, _, _ in selected]
    diverse_subjects = [subj for _, _, subj, _ in selected]

    # Log diversity summary
    cats_selected = [cat for _, _, _, cat in selected]
    logging.info(
        f"Diversity selection: {len(diverse_standings)} results "
        f"({cats_selected.count('rim')} rim, {cats_selected.count('macro-glow')} macro-glow, "
        f"{cats_selected.count('micro-glow')} micro-glow, {cats_selected.count('other')} other)"
    )

    return diverse_subjects, diverse_standings


async def analyze_terrain(
    request: AnalyzeRequest,
    use_synthetic: bool = False,
) -> TerrainAnalysisResult:
    """
    Run the complete terrain analysis pipeline.

    Args:
        request: Analysis request with location, date, event
        use_synthetic: If True, use synthetic DEM for testing

    Returns:
        TerrainAnalysisResult with subjects, standing locations, and metadata

    Note:
        By default, uses authoritative DEM sources (Copernicus GLO-30 or
        USGS 3DEP) for all geometry calculations. AWS Terrain Tiles can
        be requested for visualization-only purposes but should NOT be
        used for photo-moment scoring.
    """
    request_id = str(uuid.uuid4())[:8]
    computed_at = datetime.utcnow().isoformat() + "Z"

    # Step 1: Fetch DEM from appropriate source
    source_info: Optional[DEMSourceInfo] = None

    if use_synthetic:
        dem = create_synthetic_dem(
            center_lat=request.lat,
            center_lon=request.lon,
            radius_km=request.radius_km,
            base_elevation=2000.0,
            feature_height=500.0,
            resolution_m=50.0,
        )
        dem_source = "synthetic"

    elif request.dem_source == "aws-terrain-tiles":
        # AWS Terrain Tiles - for visualization ONLY
        # WARNING: Do not use for photo-moment scoring
        dem = await fetch_dem_grid(
            center_lat=request.lat,
            center_lon=request.lon,
            radius_km=request.radius_km,
            resolution_m=30.0,
        )
        dem_source = "aws-terrain-tiles (visualization only)"

    else:
        # Use authoritative DEM source for analysis
        if request.dem_source == "auto":
            auth_source = recommend_source(request.lat, request.lon)
        elif request.dem_source == "usgs-3dep":
            auth_source = AuthoritativeDEMSource.USGS_3DEP
        else:
            auth_source = AuthoritativeDEMSource.COPERNICUS_GLO30

        # Use native resolution for each source:
        # - USGS 3DEP: 10m (1/3 arc-second) - better for micro-features
        # - Copernicus: 30m (1 arc-second) - global coverage
        target_res = 10.0 if auth_source == AuthoritativeDEMSource.USGS_3DEP else 30.0

        try:
            dem, source_info = await fetch_authoritative_dem(
                center_lat=request.lat,
                center_lon=request.lon,
                radius_km=request.radius_km,
                source=auth_source,
                target_resolution_m=target_res,
            )
            dem_source = source_info.source.value
        except Exception as e:
            # Fallback to Copernicus if USGS fails (e.g., outside CONUS)
            if auth_source == AuthoritativeDEMSource.USGS_3DEP:
                dem, source_info = await fetch_authoritative_dem(
                    center_lat=request.lat,
                    center_lon=request.lon,
                    radius_km=request.radius_km,
                    source=AuthoritativeDEMSource.COPERNICUS_GLO30,
                    target_resolution_m=30.0,
                )
                dem_source = source_info.source.value
            else:
                raise

    # Step 2: Compute terrain derivatives
    slope_deg, aspect_deg = compute_slope_aspect(dem)
    Nx, Ny, Nz = compute_surface_normals(slope_deg, aspect_deg)

    # Compute curvature for structure analysis
    from .analysis import compute_curvature
    curvature = compute_curvature(dem)

    # Step 3: Generate sun track
    date = datetime.fromisoformat(request.date.replace("Z", ""))
    sun_track = generate_sun_track(
        lat=request.lat,
        lon=request.lon,
        date=date,
        event=request.event,
        duration_minutes=90,
        interval_minutes=5,
    )

    # Step 4: Detect subjects with scale classification
    detected = detect_subjects(
        dem=dem,
        slope_deg=slope_deg,
        aspect_deg=aspect_deg,
        center_lat=request.lat,
        center_lon=request.lon,
        min_slope_deg=15.0,        # Soft minimum
        min_prominence_m=3.0,       # Soft minimum
        min_curvature=-0.5,         # Allow slightly concave
        min_cells=1,                # Allow small features
        min_confidence=0.35,        # Standard threshold
        foreground_confidence=0.25, # Lower for close features
    )

    # DEBUG: Log top 10 structure peaks before any filtering
    import logging
    if detected:
        # Sort by structure_score descending
        sorted_by_structure = sorted(
            [d for d in detected if d.structure],
            key=lambda d: d.structure.structure_score,
            reverse=True
        )[:10]

        logging.warning("=" * 70)
        logging.warning("TOP 10 STRUCTURE PEAKS (before lighting/orientation filters):")
        logging.warning("=" * 70)

        # Store for tracking through filters
        top_structure_ids = {d.subject_id for d in sorted_by_structure}

        for rank, det in enumerate(sorted_by_structure, 1):
            s = det.structure
            logging.warning(
                f"  #{rank}: subject_id={det.subject_id} "
                f"lat={det.centroid_lat:.6f}, lon={det.centroid_lon:.6f}"
            )
            logging.warning(
                f"       structure_score={s.structure_score:.3f}, "
                f"class={s.structure_class}, "
                f"micro_relief={s.micro_relief_m:.1f}m"
            )
            logging.warning(
                f"       max_curvature={s.max_curvature:.4f}, "
                f"max_slope_break={s.max_slope_break:.1f}°, "
                f"slope={det.mean_slope:.1f}°, "
                f"face_dir={det.face_direction:.0f}°"
            )
        logging.warning("=" * 70)
    else:
        top_structure_ids = set()

    # Step 4a: Pre-filter by orientation BEFORE subdivision
    # This prevents processing (and subdividing) zones that face away from the sun.
    # Uses representative sun position from track midpoint.
    mid_sun = sun_track[len(sun_track) // 2] if sun_track else None
    sun_az = mid_sun.azimuth_deg if mid_sun else (270.0 if request.event == "sunset" else 90.0)
    sun_alt = mid_sun.altitude_deg if mid_sun else 5.0  # Low default for sunrise/sunset

    detected, orientation_rejections = filter_by_orientation(
        subjects=detected,
        event=request.event,
        sun_azimuth_deg=sun_az,
    )

    if orientation_rejections:
        logging.info(
            f"Pre-filter rejected {len(orientation_rejections)} subjects by orientation: "
            f"{[r['cardinal'] for r in orientation_rejections]}"
        )

    # DEBUG: Log which top structure peaks were rejected by orientation
    if top_structure_ids:
        orientation_rejected_ids = {r['subject_id'] for r in orientation_rejections}
        remaining_ids = {d.subject_id for d in detected}
        for sid in top_structure_ids:
            if sid in orientation_rejected_ids:
                rej = next((r for r in orientation_rejections if r['subject_id'] == sid), {})
                logging.warning(
                    f"  TOP PEAK subject_id={sid}: REJECTED by orientation "
                    f"(face_dir={rej.get('face_direction', '?')}°, "
                    f"cardinal={rej.get('cardinal', '?')}, "
                    f"aspect_offset={rej.get('aspect_offset', '?')}°)"
                )

    # Step 4b: Subdivide large zones
    # Zones with effective_width > MAX_ZONE_WIDTH_M (~1000m) are broken
    # into smaller, human-navigable sub-zones
    final_detected = []
    for det in detected:
        effective_width = compute_effective_width(det.area_m2)
        if should_subdivide_zone(det.area_m2, MAX_ZONE_WIDTH_M):
            # Zone is too large - subdivide into smaller zones
            subzone_cells = subdivide_zone_cells(det.cells, dem, MAX_ZONE_WIDTH_M)

            # Create new DetectedSubject for each sub-zone
            for sub_idx, sub_cells in enumerate(subzone_cells):
                if len(sub_cells) < 3:  # Skip tiny fragments
                    continue

                # Compute sub-zone properties
                sub_det = _create_subzone_subject(
                    dem, det, sub_cells, slope_deg, aspect_deg, Nx, Ny, Nz,
                    curvature, sub_id=f"{det.subject_id}_{sub_idx + 1}"
                )
                if sub_det:
                    final_detected.append(sub_det)
        else:
            # Zone is appropriately sized
            final_detected.append(det)

    # Log subdivision stats
    if len(final_detected) != len(detected):
        import logging
        logging.info(
            f"Zone subdivision: {len(detected)} zones -> {len(final_detected)} sub-zones"
        )

    detected = final_detected

    # DEBUG: Track which top structure peaks survived subdivision
    if top_structure_ids:
        surviving_original_ids = set()
        for det in final_detected:
            # Check if this is an original or subdivided zone
            sid = det.subject_id
            if isinstance(sid, int):
                surviving_original_ids.add(sid)
            elif isinstance(sid, str) and '_' in sid:
                # Subdivided zone like "5_1" - extract original ID
                original_id = int(sid.split('_')[0])
                surviving_original_ids.add(original_id)

        for sid in top_structure_ids:
            if sid not in surviving_original_ids:
                logging.warning(f"  TOP PEAK subject_id={sid}: lost during subdivision")

    # Step 5-7: Analyze each subject
    subjects: list[Subject] = []
    standing_locations: list[StandingLocation] = []
    analysis_outcomes = {}  # Track outcomes for top peaks

    # Sort detected subjects by structure score descending to ensure top peaks are processed
    detected_sorted = sorted(
        detected,
        key=lambda d: d.structure.structure_score if d.structure else 0,
        reverse=True
    )

    for idx, det in enumerate(detected_sorted[:10]):  # Limit to top 10 by structure score
        # Check if this is from a top structure peak
        original_id = det.subject_id if isinstance(det.subject_id, int) else int(str(det.subject_id).split('_')[0])
        is_top_peak = original_id in top_structure_ids

        subject, shooting_timing = await _analyze_single_subject(
            dem=dem,
            detected=det,
            sun_track=sun_track,
            slope_grid=slope_deg,
            subject_id=idx + 1,
            event=request.event,
        )

        if subject is None:
            if is_top_peak:
                analysis_outcomes[original_id] = "REJECTED by illumination/structure gate"
            continue

        subjects.append(subject)

        # Calculate distance constraints based on subject width
        # Distance rings scale with width: min=max(80m, 0.8×width), max=min(4000m, 6×width)
        min_dist, max_dist = get_distance_constraints(
            slope_deg=det.mean_slope,
            area_m2=det.area_m2,
            effective_width_m=subject.properties.effective_width_m,
        )

        # Find standing location using constrained candidate search with truth table
        # Use subject.centroid which may be snapped to max_structure_location
        # Validation now happens inside find_standing_location with hard constraints
        standing, candidate_search = find_standing_location(
            dem=dem,
            subject_lat=subject.centroid["lat"],  # May be snapped to max structure
            subject_lon=subject.centroid["lon"],  # May be snapped to max structure
            subject_elevation=det.mean_elevation,
            subject_normal=det.normal,
            slope_grid=slope_deg,
            min_distance_m=min_dist,
            max_distance_m=min(max_dist, 1500.0),
            sun_azimuth_deg=sun_az,
            sun_altitude_deg=sun_alt,  # For low sun, glow constraint is loosened
            face_direction_deg=subject.properties.face_direction_deg,
            effective_width_m=subject.properties.effective_width_m,
            structure_class=det.structure_class if det.structure_class else "unknown",
        )

        # Store candidate search info on subject for debugging
        # Include sample of rejected candidates for map visualization
        sample_rejected = []
        for r in candidate_search.rejected[:50]:  # Limit to 50 for response size
            sample_rejected.append({
                "lat": r.lat,
                "lon": r.lon,
                "distance_m": r.distance_m,
                "reason": r.reason,
                "slope_deg": getattr(r, 'slope_deg', None),
            })
        subject.candidate_search = {
            "candidates_checked": candidate_search.candidates_checked,
            "selected_at_distance_m": candidate_search.selected_at_distance_m,
            "rejection_summary": _summarize_rejections(candidate_search.rejected),
            "sample_rejected": sample_rejected,  # For map visualization
        }

        # If no valid standing location found, subject is rejected for this event
        if not standing:
            logging.info(
                f"Subject {subject.subject_id} rejected: no valid standing location found"
            )
            # Log detailed rejection histogram for ALL standing failures
            log_rejection_histogram(
                rejected=candidate_search.rejected,
                total_checked=candidate_search.candidates_checked,
                subject_info=f" (subject_id={subject.subject_id}, lat={subject.centroid['lat']:.6f}, lon={subject.centroid['lon']:.6f})",
            )
            if is_top_peak:
                analysis_outcomes[original_id] = "REJECTED (no valid standing location)"
            continue

        # Standing location passed all truth table constraints
        standing.standing_id = len(standing_locations) + 1
        standing.subject_id = subject.subject_id
        standing.shooting_timing = shooting_timing  # Add timing info
        # Generate navigation link (Google Maps)
        lat = standing.location["lat"]
        lon = standing.location["lon"]
        standing.nav_link = f"https://www.google.com/maps?q={lat},{lon}"

        # Add distance constraint info to properties for transparency
        standing.properties.min_valid_distance_m = min_dist
        standing.properties.max_valid_distance_m = max_dist

        standing_locations.append(standing)

        if is_top_peak:
            analysis_outcomes[original_id] = f"SUCCESS - standing location at {standing.properties.distance_to_subject_m:.0f}m"

    # DEBUG: Final summary of top 10 structure peak outcomes
    if top_structure_ids:
        logging.warning("=" * 70)
        logging.warning("TOP 10 STRUCTURE PEAKS - FINAL OUTCOMES:")
        logging.warning("=" * 70)

        # First list orientation rejections
        orientation_rejected_ids = {r['subject_id'] for r in orientation_rejections}
        for sid in top_structure_ids:
            if sid in orientation_rejected_ids:
                rej = next((r for r in orientation_rejections if r['subject_id'] == sid), {})
                logging.warning(
                    f"  subject_id={sid}: REJECTED (orientation) - "
                    f"face_dir={rej.get('face_direction', '?')}°, "
                    f"cardinal={rej.get('cardinal', '?')}"
                )
            elif sid in analysis_outcomes:
                logging.warning(f"  subject_id={sid}: {analysis_outcomes[sid]}")
            else:
                # Check if it was lost during subdivision
                surviving_original_ids = set()
                for det in final_detected:
                    det_sid = det.subject_id
                    if isinstance(det_sid, int):
                        surviving_original_ids.add(det_sid)
                    elif isinstance(det_sid, str) and '_' in det_sid:
                        surviving_original_ids.add(int(det_sid.split('_')[0]))

                if sid not in surviving_original_ids:
                    logging.warning(f"  subject_id={sid}: REJECTED (lost in subdivision)")
                else:
                    logging.warning(f"  subject_id={sid}: REJECTED (no standing location found)")

        logging.warning("=" * 70)

    # Sort subjects by quality tier (primary before subtle), then by confidence
    # This ensures dramatic features always rank above surface moments
    tier_order = {"primary": 0, "subtle": 1}
    subjects.sort(key=lambda s: (
        tier_order.get(s.properties.quality_tier, 1),
        -s.properties.confidence
    ))

    # Step 8: Apply spatial de-duplication and diversity selection
    # Remove duplicates where subjects are within 200m or stands within 300m + bearing within 15°
    if standing_locations:
        import logging
        logging.info(f"Before de-duplication: {len(standing_locations)} standing locations")
        subjects, standing_locations = deduplicate_standing_locations(
            subjects, standing_locations
        )

        # Enforce diversity: ensure at least 1 rim, 1 macro-glow, 1 micro-glow when available
        subjects, standing_locations = enforce_diversity(
            subjects, standing_locations, max_results=10
        )
        logging.info(f"After diversity selection: {len(standing_locations)} standing locations")

    # Step 9: Detect lighting zones (scale-aware)
    # Identifies terrain zones with consistent favorable lighting
    # Guides photographers to areas where micro-features likely exist
    lighting_zones = detect_lighting_zones(
        subjects=subjects,
        dem_resolution_m=dem.cell_size_m,
        min_members=3,
    )

    # Compute structure debug info
    structure_computed_cells = sum(len(det.cells) for det in final_detected if det.structure is not None)
    structure_attached_to_subjects = sum(1 for s in subjects if s.properties.structure is not None)

    structure_debug = StructureDebug(
        enabled=True,  # Structure scoring is always enabled now
        computed_cells=structure_computed_cells,
        attached_to_subjects=structure_attached_to_subjects,
    )

    # Build result
    meta = AnalysisMeta(
        request_id=request_id,
        computed_at=computed_at,
        dem_source=dem_source,
        dem_bounds=dem.bounds,
        cell_size_m=dem.cell_size_m,
        center_lat=request.lat,
        center_lon=request.lon,
        dem_resolution_m=source_info.resolution_m if source_info else None,
        dem_vertical_accuracy_m=source_info.vertical_accuracy_m if source_info else None,
        dem_citation=source_info.citation if source_info else None,
        structure_debug=structure_debug,
    )

    return TerrainAnalysisResult(
        meta=meta,
        sun_track=sun_track,
        subjects=subjects,
        standing_locations=standing_locations,
        lighting_zones=lighting_zones,
        debug_layers={},
    )


async def _analyze_single_subject(
    dem: DEMGrid,
    detected: DetectedSubject,
    sun_track: list,
    slope_grid,
    subject_id: int,
    event: str = "sunset",
) -> tuple[Subject | None, ShootingTiming | None]:
    """
    Complete analysis of a single subject.

    Args:
        event: "sunrise" or "sunset" (for timing explanations)

    Returns:
        Tuple of (Subject, ShootingTiming) or (None, None) if subject doesn't qualify
    """
    # Illumination analysis (includes lighting-based subject type classification)
    # Pass event to apply directional preference (sunset favors W, sunrise favors E)
    illum = analyze_subject_illumination(
        normal=detected.normal,
        sun_track=sun_track,
        mean_slope_deg=detected.mean_slope,
        face_direction_deg=detected.face_direction,
        event=event,
    )

    # Skip subjects without good glow windows - log reason for debug
    if not illum.glow_in_range:
        import logging
        logging.debug(
            f"Subject {subject_id} REJECTED by illumination analysis: "
            f"zone_type={illum.lighting_zone_type}, "
            f"cardinal={illum.cardinal_direction}, "
            f"offset={illum.aspect_offset_deg:.0f}°, "
            f"dir_pref={illum.directional_preference:.2f}, "
            f"has_glow_window={illum.glow_window is not None}"
        )
        return None, None

    # Log subjects that pass for debugging
    import logging
    logging.debug(
        f"Subject {subject_id} PASSED: "
        f"zone_type={illum.lighting_zone_type}, "
        f"cardinal={illum.cardinal_direction}, "
        f"offset={illum.aspect_offset_deg:.0f}°, "
        f"dir_pref={illum.directional_preference:.2f}"
    )

    # Shadow check at peak
    peak_minutes = illum.glow_window.peak_minutes if illum.glow_window else 30.0
    shadow = check_shadow_at_peak(
        dem=dem,
        point_lat=detected.centroid_lat,
        point_lon=detected.centroid_lon,
        point_elevation=detected.mean_elevation,
        sun_track=sun_track,
        peak_minutes=peak_minutes,
    )

    # Validation
    normal_length = validate_normal_vector(*detected.normal)
    aspect_match = validate_aspect_normal_match(
        detected.mean_aspect,
        detected.normal[0],
        detected.normal[1],
    )

    validation = SubjectValidation(
        normal_unit_length=normal_length,
        aspect_normal_match_deg=aspect_match,
        glow_in_range=illum.glow_in_range,
        sun_visible_at_peak=shadow.sun_visible,
    )

    # Get polygon
    polygon = get_subject_polygon(dem, detected.cells)

    # Use lighting zone type as PRIMARY classification
    # Glow zones and rim zones are both first-class opportunities
    lighting_zone_type = illum.lighting_zone_type
    final_subject_type = illum.subject_type

    # Quality tier based on LIGHTING ZONE TYPE (not just terrain character)
    # - Glow zones with good alignment: primary
    # - Rim zones (dramatic backlighting): primary
    # - Surface moments in glow zones: still primary if good lighting
    # - Shadow zones: subtle (rarely useful)
    if lighting_zone_type == "shadow-zone":
        quality_tier = "subtle"
    elif lighting_zone_type == "rim-zone":
        quality_tier = "primary"  # Rim light is first-class dramatic opportunity
    else:
        # Glow zone - primary unless very small area
        quality_tier = "primary" if detected.area_m2 >= 500 else "subtle"

    # Generate photographer-friendly explanations
    # Get representative values for explanation
    glow_score = illum.glow_window.peak_glow_score if illum.glow_window else 0.0
    best_time_minutes = illum.glow_window.peak_minutes if illum.glow_window else 30.0
    window_duration = illum.glow_window.duration_minutes if illum.glow_window else 30.0
    peak_sun = illum.peak_sun_position
    sun_alt = peak_sun.altitude_deg if peak_sun else 10.0

    # Get representative incidence at peak
    peak_incidence = illum.glow_window.peak_incidence if illum.glow_window else 0.3

    # Build explanation summary
    from .explain import explain_area_short, explain_direction_short, explain_aspect_offset_short
    area_desc = explain_area_short(detected.area_m2)
    direction_short = explain_direction_short(detected.face_direction)
    light_desc = explain_aspect_offset_short(illum.aspect_offset_deg)

    summary = f"{area_desc.capitalize()} {direction_short}-facing zone with {light_desc}"
    if lighting_zone_type == "rim-zone":
        summary += " - great for silhouettes and edge glow"
    elif glow_score >= 0.7:
        summary += " - excellent conditions for warm, dramatic light"

    # Structure explanation
    structure_explain = None
    if detected.structure:
        structure_explain = get_structure_explanation(detected.structure)

    explanation = SubjectExplain(
        zone_type=explain_lighting_zone_type(lighting_zone_type),
        aspect_offset=explain_aspect_offset(illum.aspect_offset_deg),
        light_quality=explain_glow_score(glow_score) if glow_score > 0 else explain_incidence(peak_incidence),
        sun_altitude=explain_sun_altitude(sun_alt),
        best_time=explain_timing(best_time_minutes, event),
        window_duration=explain_duration(window_duration),
        face_direction=f"Faces {explain_direction(detected.face_direction)}",
        slope=explain_slope(detected.mean_slope),
        area=explain_area(detected.area_m2),
        summary=summary,
        structure=structure_explain,
    )

    # Compute effective width for zone sizing
    effective_width = compute_effective_width(detected.area_m2)

    # Convert structure metrics to types.StructureMetrics if available
    structure_metrics = None
    if detected.structure:
        structure_metrics = StructureMetrics(
            micro_relief_m=detected.structure.micro_relief_m,
            macro_relief_m=detected.structure.macro_relief_m,
            mean_curvature=detected.structure.mean_curvature,
            max_curvature=detected.structure.max_curvature,
            curvature_variance=detected.structure.curvature_variance,
            slope_break_score=detected.structure.slope_break_score,
            max_slope_break=detected.structure.max_slope_break,
            elevation_std=detected.structure.elevation_std,
            slope_std=detected.structure.slope_std,
            heterogeneity_score=detected.structure.heterogeneity_score,
            structure_score=detected.structure.structure_score,
            structure_class=detected.structure.structure_class,
            structure_score_at_centroid=detected.structure.structure_score_at_centroid,
            max_structure_score_in_zone=detected.structure.max_structure_score_in_zone,
            max_structure_location=detected.structure.max_structure_location,
            distance_centroid_to_max_m=detected.structure.distance_centroid_to_max_m,
        )
    # SNAP SUBJECT LOCATION TO MAX STRUCTURE SCORE
    # If the best structure is far from the centroid, snap to avoid "shooting at nothing"
    subject_lat = detected.centroid_lat
    subject_lon = detected.centroid_lon
    snapped_to_max = False

    if detected.structure and detected.structure.max_structure_location:
        snap_threshold = 2 * dem.cell_size_m  # Snap if max is > 2 cells away
        dist_to_max = detected.structure.distance_centroid_to_max_m

        if dist_to_max > snap_threshold:
            max_lat, max_lon = detected.structure.max_structure_location
            import logging
            logging.warning(
                f"Subject {subject_id}: SNAPPING subject location from centroid "
                f"({detected.centroid_lat:.6f}, {detected.centroid_lon:.6f}) to max_structure "
                f"({max_lat:.6f}, {max_lon:.6f}) - distance was {dist_to_max:.0f}m > threshold {snap_threshold:.0f}m"
            )
            subject_lat = max_lat
            subject_lon = max_lon
            snapped_to_max = True

    # HARD GATE: Reject micro-dramatic subjects with weak structure
    # This eliminates "shooting at nothing" results where the zone centroid
    # has no actual terrain features worth photographing
    if detected.structure and detected.structure_class == "micro-dramatic":
        has_good_structure_score = detected.structure.structure_score >= 0.65
        has_high_curvature = detected.structure.max_curvature >= 0.8
        has_significant_slope_break = detected.structure.max_slope_break >= 8.0

        if not (has_good_structure_score or has_high_curvature or has_significant_slope_break):
            import logging
            logging.info(
                f"Subject {subject_id}: REJECTED - micro-dramatic with weak structure "
                f"(score={detected.structure.structure_score:.3f}, "
                f"curvature={detected.structure.max_curvature:.3f}, "
                f"slope_break={detected.structure.max_slope_break:.1f}°)"
            )
            return None, None

    properties = SubjectProperties(
        elevation_m=detected.mean_elevation,
        slope_deg=detected.mean_slope,
        aspect_deg=detected.mean_aspect,
        face_direction_deg=detected.face_direction,
        area_m2=detected.area_m2,
        normal=detected.normal,
        confidence=detected.confidence,
        score_breakdown=detected.score_breakdown,
        distance_from_center_m=detected.distance_from_center_m,
        classification=detected.classification,
        lighting_zone_type=lighting_zone_type,
        aspect_offset_deg=illum.aspect_offset_deg,
        subject_type=final_subject_type,
        quality_tier=quality_tier,
        explain=explanation,
        effective_width_m=effective_width,
        directional_preference=illum.directional_preference,
        cardinal_direction=illum.cardinal_direction,
        structure=structure_metrics,
        structure_class=getattr(detected, 'structure_class', 'unknown'),
        is_dramatic=getattr(detected, 'is_dramatic', True),
        snapped_to_max_structure=snapped_to_max,
    )

    # Build shooting timing from glow window OR edge lighting (rim zones)
    shooting_timing = None
    edge_lighting = illum.edge_lighting or {}

    if illum.glow_window:
        lighting_type = edge_lighting.get("lighting_type", "standard")

        # If rim light is better than standard glow, use rim timing
        if edge_lighting.get("has_rim_light") and edge_lighting.get("rim_light_score", 0) > illum.glow_window.peak_glow_score:
            best_minutes = edge_lighting.get("rim_light_peak_minutes", illum.glow_window.peak_minutes)
            lighting_type = "rim"
        else:
            best_minutes = illum.glow_window.peak_minutes

        shooting_timing = ShootingTiming(
            best_time_minutes=best_minutes,
            window_start_minutes=illum.glow_window.start_minutes,
            window_end_minutes=illum.glow_window.end_minutes,
            window_duration_minutes=illum.glow_window.duration_minutes,
            peak_light_quality=illum.glow_window.peak_glow_score,
            lighting_type=lighting_type,
        )
    elif lighting_zone_type == "rim-zone" and edge_lighting.get("rim_light_peak_minutes"):
        # Rim zones without glow window still get timing based on rim light
        rim_peak = edge_lighting.get("rim_light_peak_minutes", 30.0)
        rim_score = edge_lighting.get("rim_light_score", 0.5)
        shooting_timing = ShootingTiming(
            best_time_minutes=rim_peak,
            window_start_minutes=max(0, rim_peak - 20),
            window_end_minutes=rim_peak + 20,
            window_duration_minutes=40.0,
            peak_light_quality=rim_score,
            lighting_type="rim",
        )

    subject = Subject(
        subject_id=subject_id,
        centroid={"lat": subject_lat, "lon": subject_lon},  # May be snapped to max_structure_location
        polygon=polygon,
        properties=properties,
        incidence_series=illum.incidence_series,
        glow_window=illum.glow_window,
        shadow_check=shadow,
        validation=validation,
    )

    return subject, shooting_timing


def analyze_terrain_sync(request: AnalyzeRequest) -> TerrainAnalysisResult:
    """
    Synchronous wrapper for analyze_terrain.

    Useful for testing without async context.
    """
    import asyncio
    return asyncio.run(analyze_terrain(request))


def _create_subzone_subject(
    dem: DEMGrid,
    parent: DetectedSubject,
    cells: list[tuple[int, int]],
    slope_deg,
    aspect_deg,
    Nx, Ny, Nz,
    curvature,
    sub_id: str,
) -> DetectedSubject | None:
    """
    Create a DetectedSubject for a sub-zone of a larger zone.

    Args:
        dem: DEMGrid for coordinate conversion
        parent: Original DetectedSubject being subdivided
        cells: Cell indices for this sub-zone
        slope_deg: Slope grid
        aspect_deg: Aspect grid
        Nx, Ny, Nz: Surface normal grids
        sub_id: Unique identifier for this sub-zone

    Returns:
        DetectedSubject for the sub-zone, or None if invalid
    """
    import numpy as np

    if len(cells) < 3:
        return None

    # Compute sub-zone properties
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
    angles_rad = np.radians(aspects)
    mean_sin = np.mean(np.sin(angles_rad))
    mean_cos = np.mean(np.cos(angles_rad))
    mean_aspect = float(np.degrees(np.arctan2(mean_sin, mean_cos)) % 360)
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

    # Calculate distance from original center
    distance_m = _haversine_distance(
        parent.centroid_lat, parent.centroid_lon,
        centroid_lat, centroid_lon
    )

    # Compute structure metrics for the sub-zone
    from .structure import compute_structure_metrics, is_dramatic_structure
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

    # Update score breakdown with structure metrics
    score_breakdown = parent.score_breakdown.copy()
    score_breakdown.update({
        "micro_relief_m": float(structure_metrics.micro_relief_m),
        "macro_relief_m": float(structure_metrics.macro_relief_m),
        "max_curvature": float(structure_metrics.max_curvature),
        "max_slope_break": float(structure_metrics.max_slope_break),
        "heterogeneity": float(structure_metrics.heterogeneity_score),
        "structure_score": float(structure_metrics.structure_score),
    })

    # Quality tier based on structure
    if not is_dramatic:
        quality_tier = "subtle"
    else:
        quality_tier = parent.quality_tier

    return DetectedSubject(
        subject_id=hash(sub_id) % 10000,  # Generate unique ID
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
        confidence=parent.confidence * 0.9,  # Slightly reduce confidence for sub-zones
        score_breakdown=score_breakdown,
        distance_from_center_m=float(distance_m),
        classification=parent.classification,
        subject_type=parent.subject_type,
        quality_tier=quality_tier,
        structure=structure_metrics,
        structure_class=structure_class,
        is_dramatic=is_dramatic,
    )


def _haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance in meters between two lat/lon points."""
    import numpy as np
    R = 6371000  # Earth radius in meters
    phi1, phi2 = np.radians(lat1), np.radians(lat2)
    dphi = np.radians(lat2 - lat1)
    dlambda = np.radians(lon2 - lon1)
    a = np.sin(dphi/2)**2 + np.cos(phi1) * np.cos(phi2) * np.sin(dlambda/2)**2
    return 2 * R * np.arctan2(np.sqrt(a), np.sqrt(1-a))
