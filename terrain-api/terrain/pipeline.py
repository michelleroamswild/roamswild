"""
Main terrain analysis pipeline.

Orchestrates all modules to produce a complete analysis result.
"""

import uuid
from datetime import datetime
from .types import (
    AnalyzeRequest, TerrainAnalysisResult, AnalysisMeta,
    Subject, SubjectProperties, SubjectValidation,
    StandingLocation,
)
from .dem import fetch_dem_grid, DEMGrid
from .sun import generate_sun_track
from .analysis import (
    compute_slope_aspect, compute_surface_normals,
    validate_normal_vector, validate_aspect_normal_match,
)
from .subjects import detect_subjects, get_subject_polygon, DetectedSubject
from .illumination import analyze_subject_illumination
from .shadows import check_shadow_at_peak
from .standing import find_standing_location


async def analyze_terrain(request: AnalyzeRequest) -> TerrainAnalysisResult:
    """
    Run the complete terrain analysis pipeline.

    Args:
        request: Analysis request with location, date, event

    Returns:
        TerrainAnalysisResult with subjects, standing locations, and metadata
    """
    request_id = str(uuid.uuid4())[:8]
    computed_at = datetime.utcnow().isoformat() + "Z"

    # Step 1: Fetch DEM
    dem = await fetch_dem_grid(
        center_lat=request.lat,
        center_lon=request.lon,
        radius_km=request.radius_km,
        resolution_m=30.0,
    )

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
        dem_source="open-meteo",
        dem_bounds=dem.bounds,
        cell_size_m=dem.cell_size_m,
        center_lat=request.lat,
        center_lon=request.lon,
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
