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
    Subject, SubjectProperties, SubjectValidation,
    StandingLocation,
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
from .subjects import detect_subjects, get_subject_polygon, DetectedSubject
from .illumination import analyze_subject_illumination
from .shadows import check_shadow_at_peak
from .standing import find_standing_location


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

        try:
            dem, source_info = await fetch_authoritative_dem(
                center_lat=request.lat,
                center_lon=request.lon,
                radius_km=request.radius_km,
                source=auth_source,
                target_resolution_m=30.0,
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

    # Step 4: Detect subjects
    detected = detect_subjects(
        dem=dem,
        slope_deg=slope_deg,
        aspect_deg=aspect_deg,
        min_slope_deg=30.0,
        min_prominence_m=15.0,
        min_curvature=0.0,
        min_cells=3,
    )

    # Step 5-7: Analyze each subject
    subjects: list[Subject] = []
    standing_locations: list[StandingLocation] = []

    for idx, det in enumerate(detected[:10]):  # Limit to top 10 subjects
        subject = await _analyze_single_subject(
            dem=dem,
            detected=det,
            sun_track=sun_track,
            slope_grid=slope_deg,
            subject_id=idx + 1,
        )

        if subject is None:
            continue

        subjects.append(subject)

        # Find standing location
        standing, _ = find_standing_location(
            dem=dem,
            subject_lat=det.centroid_lat,
            subject_lon=det.centroid_lon,
            subject_elevation=det.mean_elevation,
            subject_normal=det.normal,
            slope_grid=slope_deg,
        )

        if standing:
            standing.standing_id = len(standing_locations) + 1
            standing.subject_id = subject.subject_id
            standing_locations.append(standing)

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
    )

    return TerrainAnalysisResult(
        meta=meta,
        sun_track=sun_track,
        subjects=subjects,
        standing_locations=standing_locations,
        debug_layers={},
    )


async def _analyze_single_subject(
    dem: DEMGrid,
    detected: DetectedSubject,
    sun_track: list,
    slope_grid,
    subject_id: int,
) -> Subject | None:
    """
    Complete analysis of a single subject.
    """
    # Illumination analysis
    illum = analyze_subject_illumination(
        normal=detected.normal,
        sun_track=sun_track,
    )

    # Skip subjects without good glow windows
    if not illum.glow_in_range:
        return None

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

    properties = SubjectProperties(
        elevation_m=detected.mean_elevation,
        slope_deg=detected.mean_slope,
        aspect_deg=detected.mean_aspect,
        face_direction_deg=detected.face_direction,
        area_m2=detected.area_m2,
        normal=detected.normal,
        confidence=detected.confidence,
        score_breakdown=detected.score_breakdown,
    )

    return Subject(
        subject_id=subject_id,
        centroid={"lat": detected.centroid_lat, "lon": detected.centroid_lon},
        polygon=polygon,
        properties=properties,
        incidence_series=illum.incidence_series,
        glow_window=illum.glow_window,
        shadow_check=shadow,
        validation=validation,
    )


def analyze_terrain_sync(request: AnalyzeRequest) -> TerrainAnalysisResult:
    """
    Synchronous wrapper for analyze_terrain.

    Useful for testing without async context.
    """
    import asyncio
    return asyncio.run(analyze_terrain(request))
