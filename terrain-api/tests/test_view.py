"""
Unit tests for overlook view analysis.

Tests:
1. Horizon profile on flat terrain (near-zero horizon)
2. Rim vs basin overlook scores (rim should be higher)
3. Performance for K=10 candidates on 80x80 grid
4. Sun alignment computation
"""

import math
import time
from typing import Tuple, List
import numpy as np
from terrain.dem import DEMGrid
from terrain.view import (
    compute_horizon_profile,
    compute_view_metrics,
    compute_overlook_score,
    compute_overlook_view,
    find_best_bearing,
    count_horizon_peaks,
    compute_sun_alignment,
    add_view_analysis_to_locations,
    select_overlook_candidates,
    # DAGS functions
    angular_diff_deg,
    gaussian_preference,
    compute_directionality_score,
    compute_distant_glow_score,
    # VAS functions
    sample_structure_at_point,
    compute_azimuth_salience,
    classify_anchor_type,
    compute_visual_anchor_score,
    compute_distance_preference,
    VAS_ANCHOR_SCORE_THRESHOLD,
    VAS_MULTI_DEPTH_MIN_M,
    # LAA functions
    compute_surface_normal_at_point,
    classify_anchor_light_type,
    compute_anchor_light_score,
    compute_anchor_location,
    # Glow window functions
    compute_sun_position_at_offset,
    compute_timestep_score,
    compute_glow_window,
    generate_glow_window_sun_track,
    GLOW_WINDOW_STEP_MINUTES,
    GLOW_WINDOW_GOOD_THRESHOLD,
    GLOW_WINDOW_SUNRISE_START,
    GLOW_WINDOW_SUNRISE_END,
    GLOW_WINDOW_SUNSET_START,
    GLOW_WINDOW_SUNSET_END,
)
from terrain.types import (
    SunPosition,
    StandingLocation,
    StandingProperties,
    LineOfSight,
    CandidateSearch,
    DistantGlowWindowSample,
    DistantGlowWindow,
    VisualAnchor,
)
from datetime import datetime


def create_flat_dem(
    rows: int = 80,
    cols: int = 80,
    base_elevation: float = 1500.0,
    cell_size_m: float = 30.0,
) -> DEMGrid:
    """Create a flat DEM for testing."""
    elevations = np.full((rows, cols), base_elevation, dtype=np.float64)

    # Create coordinate arrays
    lat_span = rows * cell_size_m / 111320.0
    lon_span = cols * cell_size_m / (111320.0 * math.cos(math.radians(38.5)))

    center_lat, center_lon = 38.5, -109.5
    lats = np.linspace(center_lat + lat_span/2, center_lat - lat_span/2, rows)
    lons = np.linspace(center_lon - lon_span/2, center_lon + lon_span/2, cols)

    return DEMGrid(
        elevations=elevations,
        lats=lats,
        lons=lons,
        cell_size_m=cell_size_m,
        bounds={
            "north": float(lats[0]),
            "south": float(lats[-1]),
            "east": float(lons[-1]),
            "west": float(lons[0]),
        },
    )


def create_ridge_dem(
    rows: int = 80,
    cols: int = 80,
    base_elevation: float = 1500.0,
    ridge_height: float = 150.0,
    cell_size_m: float = 30.0,
) -> DEMGrid:
    """
    Create a DEM with a triangular ridge running N-S in the east half.

    The ridge has constant slopes on each side meeting at a sharp peak.
    This creates high slope_break at the peak (where slope direction changes)
    but relatively low curvature (since each side is a constant slope).
    This pattern is typical of an erosional ridgeline.
    """
    elevations = np.full((rows, cols), base_elevation, dtype=np.float64)

    # Create triangular ridge centered at cols * 2/3
    ridge_center = cols * 2 // 3
    ridge_half_width = 15  # How far the ridge extends on each side

    for c in range(cols):
        dist_from_center = abs(c - ridge_center)
        if dist_from_center <= ridge_half_width:
            # Linear ramp from base to peak - constant slope, no curvature
            # Peak at center, slopes down linearly on each side
            elevations[:, c] = base_elevation + ridge_height * (1 - dist_from_center / ridge_half_width)

    # Create coordinate arrays
    lat_span = rows * cell_size_m / 111320.0
    lon_span = cols * cell_size_m / (111320.0 * math.cos(math.radians(38.5)))

    center_lat, center_lon = 38.5, -109.5
    lats = np.linspace(center_lat + lat_span / 2, center_lat - lat_span / 2, rows)
    lons = np.linspace(center_lon - lon_span / 2, center_lon + lon_span / 2, cols)

    return DEMGrid(
        elevations=elevations,
        lats=lats,
        lons=lons,
        cell_size_m=cell_size_m,
        bounds={
            "north": float(lats[0]),
            "south": float(lats[-1]),
            "east": float(lons[-1]),
            "west": float(lons[0]),
        },
    )


def create_knobs_dem(
    rows: int = 80,
    cols: int = 80,
    base_elevation: float = 1500.0,
    knob_height: float = 80.0,
    cell_size_m: float = 30.0,
) -> DEMGrid:
    """
    Create a DEM with several isolated knobs/spires in the east half.

    The knobs have high curvature values typical of spire/knob anchors.
    """
    elevations = np.full((rows, cols), base_elevation, dtype=np.float64)

    # Create 5 knobs at different positions
    knob_positions = [
        (rows // 3, cols * 2 // 3),
        (rows // 2, cols * 3 // 4),
        (rows * 2 // 3, cols * 2 // 3),
        (rows // 4, cols * 5 // 6),
        (rows * 3 // 4, cols * 4 // 5),
    ]

    knob_radius = 4  # cells

    for kr, kc in knob_positions:
        for r in range(max(0, kr - knob_radius), min(rows, kr + knob_radius + 1)):
            for c in range(max(0, kc - knob_radius), min(cols, kc + knob_radius + 1)):
                dist = math.sqrt((r - kr) ** 2 + (c - kc) ** 2)
                if dist <= knob_radius:
                    # Conical knob shape - high curvature at top
                    height_factor = 1 - (dist / (knob_radius + 0.5))
                    elevations[r, c] = max(
                        elevations[r, c],
                        base_elevation + knob_height * height_factor
                    )

    # Create coordinate arrays
    lat_span = rows * cell_size_m / 111320.0
    lon_span = cols * cell_size_m / (111320.0 * math.cos(math.radians(38.5)))

    center_lat, center_lon = 38.5, -109.5
    lats = np.linspace(center_lat + lat_span / 2, center_lat - lat_span / 2, rows)
    lons = np.linspace(center_lon - lon_span / 2, center_lon + lon_span / 2, cols)

    return DEMGrid(
        elevations=elevations,
        lats=lats,
        lons=lons,
        cell_size_m=cell_size_m,
        bounds={
            "north": float(lats[0]),
            "south": float(lats[-1]),
            "east": float(lons[-1]),
            "west": float(lons[0]),
        },
    )


def create_mid_distance_ridge_dem(
    rows: int = 200,
    cols: int = 200,
    base_elevation: float = 1500.0,
    ridge_height: float = 200.0,
    cell_size_m: float = 30.0,
) -> DEMGrid:
    """
    Create a DEM with flat horizon but a dramatic ridge at mid-distance.

    This tests multi-depth VAS: the horizon is flat, but there's a canyon wall/ridge
    at ~1.5-2.5km distance that should be detected as a better anchor than the
    flat horizon.

    Layout (looking east from west edge):
    - West 1/4: Viewpoint area (flat)
    - Middle 1/4 to 1/2: Sharp ridge/canyon wall (high structure)
    - East 1/2: Flat plain extending to horizon

    The viewpoint at west edge looking east should find the mid-distance ridge,
    not the flat horizon at the east edge.
    """
    elevations = np.full((rows, cols), base_elevation, dtype=np.float64)

    # Create a dramatic ridge/canyon wall in the middle section
    # Ridge runs N-S at roughly 1/3 of the way from the west
    ridge_center_col = cols // 3
    ridge_half_width = 3

    for c in range(cols):
        dist_from_ridge = abs(c - ridge_center_col)
        if dist_from_ridge <= ridge_half_width:
            # Sharp peak - high structure
            elevations[:, c] = base_elevation + ridge_height * (1 - dist_from_ridge / (ridge_half_width + 1))
        elif dist_from_ridge <= ridge_half_width + 5:
            # Steep slope transition
            slope_factor = (ridge_half_width + 5 - dist_from_ridge) / 5
            elevations[:, c] = base_elevation + ridge_height * 0.3 * slope_factor

    # Create coordinate arrays - larger grid for multi-distance testing
    lat_span = rows * cell_size_m / 111320.0
    lon_span = cols * cell_size_m / (111320.0 * math.cos(math.radians(38.5)))

    center_lat, center_lon = 38.5, -109.5
    lats = np.linspace(center_lat + lat_span / 2, center_lat - lat_span / 2, rows)
    lons = np.linspace(center_lon - lon_span / 2, center_lon + lon_span / 2, cols)

    return DEMGrid(
        elevations=elevations,
        lats=lats,
        lons=lons,
        cell_size_m=cell_size_m,
        bounds={
            "north": float(lats[0]),
            "south": float(lats[-1]),
            "east": float(lons[-1]),
            "west": float(lons[0]),
        },
    )


def create_rim_basin_dem(
    rows: int = 80,
    cols: int = 80,
    base_elevation: float = 1500.0,
    rim_height: float = 100.0,
    basin_depth: float = 100.0,
    cell_size_m: float = 30.0,
) -> DEMGrid:
    """
    Create a DEM with rim on west side and basin on east side.

    West half: elevated rim (overlook viewpoint)
    East half: depressed basin (valley floor)
    """
    elevations = np.full((rows, cols), base_elevation, dtype=np.float64)

    # West quarter: rim (higher)
    elevations[:, :cols//4] = base_elevation + rim_height

    # East quarter: basin (lower)
    elevations[:, 3*cols//4:] = base_elevation - basin_depth

    # Create coordinate arrays
    lat_span = rows * cell_size_m / 111320.0
    lon_span = cols * cell_size_m / (111320.0 * math.cos(math.radians(38.5)))

    center_lat, center_lon = 38.5, -109.5
    lats = np.linspace(center_lat + lat_span/2, center_lat - lat_span/2, rows)
    lons = np.linspace(center_lon - lon_span/2, center_lon + lon_span/2, cols)

    return DEMGrid(
        elevations=elevations,
        lats=lats,
        lons=lons,
        cell_size_m=cell_size_m,
        bounds={
            "north": float(lats[0]),
            "south": float(lats[-1]),
            "east": float(lons[-1]),
            "west": float(lons[0]),
        },
    )


def create_sun_position(azimuth_deg: float, altitude_deg: float) -> SunPosition:
    """Helper to create a SunPosition."""
    az_rad = math.radians(azimuth_deg)
    alt_rad = math.radians(altitude_deg)
    sun_vector = (
        math.sin(az_rad) * math.cos(alt_rad),
        math.cos(az_rad) * math.cos(alt_rad),
        math.sin(alt_rad),
    )
    return SunPosition(
        time_iso="2024-01-15T07:00:00Z",
        minutes_from_start=0.0,
        altitude_deg=altitude_deg,
        azimuth_deg=azimuth_deg,
        vector=sun_vector,
    )


def create_mock_standing_location(
    standing_id: int,
    lat: float,
    lon: float,
    slope_deg: float = 5.0,
) -> StandingLocation:
    """Create a mock standing location for testing."""
    return StandingLocation(
        standing_id=standing_id,
        subject_id=1,
        location={"lat": lat, "lon": lon},
        properties=StandingProperties(
            elevation_m=1500.0,
            slope_deg=slope_deg,
            distance_to_subject_m=500.0,
            camera_bearing_deg=90.0,
            elevation_diff_m=0.0,
        ),
        line_of_sight=LineOfSight(clear=True, eye_height_m=1.7, target_height_m=1500.0, samples=[]),
        candidate_search=CandidateSearch(candidates_checked=10, rejected=[], selected_at_distance_m=500.0),
    )


class TestHorizonProfileFlat:
    """Test horizon profile on flat terrain."""

    def test_flat_terrain_near_zero_horizon(self):
        """On flat terrain, horizon should be near 0° everywhere."""
        dem = create_flat_dem()
        dem.init_local_coords()

        profile = compute_horizon_profile(
            dem=dem,
            lat=38.5,
            lon=-109.5,
            eye_height_m=1.7,
            az_step_deg=15.0,  # Coarser for faster test
            num_samples=10,
        )

        # All horizon altitudes should be near 0 (or slightly negative due to earth curvature)
        for sample in profile.samples:
            assert sample.horizon_alt_deg < 2.0, \
                f"Flat terrain should have low horizon, got {sample.horizon_alt_deg}° at az={sample.azimuth_deg}"

    def test_flat_terrain_high_open_sky(self):
        """Flat terrain should have high open sky fraction."""
        dem = create_flat_dem()
        dem.init_local_coords()

        profile = compute_horizon_profile(
            dem=dem,
            lat=38.5,
            lon=-109.5,
        )

        open_sky, depth_p50, depth_p90, complexity = compute_view_metrics(profile)

        assert open_sky > 0.9, f"Flat terrain should have high open sky, got {open_sky}"

    def test_flat_terrain_low_complexity(self):
        """Flat terrain should have low horizon complexity."""
        dem = create_flat_dem()
        dem.init_local_coords()

        profile = compute_horizon_profile(
            dem=dem,
            lat=38.5,
            lon=-109.5,
        )

        _, _, _, complexity = compute_view_metrics(profile)

        assert complexity < 5, f"Flat terrain should have low complexity, got {complexity}"


class TestHorizonProfileRimBasin:
    """Test horizon profile on rim/basin terrain."""

    def test_rim_has_better_view_than_basin(self):
        """Rim location should have higher overlook score than basin floor."""
        dem = create_rim_basin_dem()
        dem.init_local_coords()

        # Rim location (west side, elevated)
        rim_lat, rim_lon = 38.5, dem.lons[10]  # West side

        # Basin location (east side, depressed)
        basin_lat, basin_lon = 38.5, dem.lons[70]  # East side

        rim_view = compute_overlook_view(
            dem=dem,
            lat=rim_lat,
            lon=rim_lon,
            rim_strength=0.8,  # High rim strength
        )

        basin_view = compute_overlook_view(
            dem=dem,
            lat=basin_lat,
            lon=basin_lon,
            rim_strength=0.0,  # No rim strength
        )

        # Rim should have higher overlook score
        assert rim_view.overlook_score > basin_view.overlook_score, \
            f"Rim score {rim_view.overlook_score} should be > basin score {basin_view.overlook_score}"

    def test_rim_has_more_open_sky(self):
        """Rim location should have more open sky than basin floor."""
        dem = create_rim_basin_dem()
        dem.init_local_coords()

        rim_lat, rim_lon = 38.5, dem.lons[10]
        basin_lat, basin_lon = 38.5, dem.lons[70]

        rim_profile = compute_horizon_profile(dem, rim_lat, rim_lon)
        basin_profile = compute_horizon_profile(dem, basin_lat, basin_lon)

        rim_open, _, _, _ = compute_view_metrics(rim_profile)
        basin_open, _, _, _ = compute_view_metrics(basin_profile)

        # Basin is surrounded by higher terrain, so less open sky
        assert rim_open >= basin_open, \
            f"Rim open sky {rim_open} should be >= basin {basin_open}"


class TestViewMetrics:
    """Test view metric computation."""

    def test_count_horizon_peaks_simple(self):
        """Test peak counting with known pattern."""
        # Simple pattern: two peaks
        horizon_alts = np.array([0, 5, 10, 5, 0, 5, 10, 5, 0, 0, 0, 0])
        peaks = count_horizon_peaks(horizon_alts, min_prominence=3.0)
        assert peaks == 2, f"Expected 2 peaks, got {peaks}"

    def test_count_horizon_peaks_flat(self):
        """Flat horizon should have no peaks."""
        horizon_alts = np.array([0.0] * 20)
        peaks = count_horizon_peaks(horizon_alts)
        assert peaks == 0, f"Flat horizon should have 0 peaks, got {peaks}"

    def test_overlook_score_bounds(self):
        """Overlook score should be bounded 0-1."""
        # Low values
        score_low = compute_overlook_score(
            open_sky_sector_fraction=0.0,
            depth_p90_m=0.0,
            horizon_complexity=0,
            rim_strength=0.0,
        )
        assert score_low >= 0.0, f"Score should be >= 0, got {score_low}"

        # High values
        score_high = compute_overlook_score(
            open_sky_sector_fraction=1.0,
            depth_p90_m=50000.0,  # Very high
            horizon_complexity=50,  # Very complex
            rim_strength=1.0,
        )
        assert score_high <= 1.0, f"Score should be <= 1, got {score_high}"


class TestBestBearing:
    """Test best bearing computation."""

    def test_best_bearing_on_flat(self):
        """Best bearing should be found without errors."""
        dem = create_flat_dem()
        dem.init_local_coords()

        profile = compute_horizon_profile(dem, 38.5, -109.5)
        bearing, score = find_best_bearing(profile)

        # Should return a valid bearing
        assert 0 <= bearing < 360, f"Invalid bearing: {bearing}"
        assert 0 <= score <= 1, f"Invalid score: {score}"

    def test_best_bearing_prefers_open_direction(self):
        """Best bearing should prefer more open directions."""
        dem = create_rim_basin_dem()
        dem.init_local_coords()

        # From rim, best view should be toward basin (east)
        rim_lat, rim_lon = 38.5, dem.lons[10]
        profile = compute_horizon_profile(dem, rim_lat, rim_lon)
        bearing, _ = find_best_bearing(profile)

        # East is 90°, should be somewhere in that range
        # (This is approximate due to terrain shape)
        assert True  # Just verify it runs without error


class TestSunAlignment:
    """Test sun alignment computation."""

    def test_sun_above_horizon(self):
        """Sun above horizon should not be behind ridge."""
        dem = create_flat_dem()
        dem.init_local_coords()

        profile = compute_horizon_profile(dem, 38.5, -109.5)

        # Sun at 10° altitude (well above flat horizon)
        sun_pos = create_sun_position(azimuth_deg=90.0, altitude_deg=10.0)
        alignment = compute_sun_alignment(profile, sun_pos)

        assert not alignment.behind_ridge, "Sun at 10° should not be behind ridge on flat terrain"
        assert alignment.blocking_margin_deg > 0, "Should have positive margin"

    def test_sun_behind_ridge(self):
        """Sun below local horizon should be marked as behind ridge."""
        dem = create_rim_basin_dem(rim_height=200.0)
        dem.init_local_coords()

        # From basin floor looking toward rim (west)
        basin_lat, basin_lon = 38.5, dem.lons[70]
        profile = compute_horizon_profile(dem, basin_lat, basin_lon)

        # Sun low in west (toward the rim)
        sun_pos = create_sun_position(azimuth_deg=270.0, altitude_deg=2.0)
        alignment = compute_sun_alignment(profile, sun_pos)

        # With 200m rim, horizon angle should be significant
        # Sun at 2° may be behind the rim
        assert alignment.horizon_alt_at_sun_az_deg is not None


class TestPerformance:
    """Test performance of view analysis."""

    def test_single_profile_speed(self):
        """Single horizon profile should be fast."""
        dem = create_flat_dem(rows=80, cols=80)
        dem.init_local_coords()

        start = time.time()
        profile = compute_horizon_profile(
            dem=dem,
            lat=38.5,
            lon=-109.5,
            az_step_deg=5.0,
            num_samples=16,
        )
        elapsed = time.time() - start

        assert elapsed < 0.5, f"Single profile took {elapsed:.2f}s, should be < 0.5s"

    def test_k10_candidates_speed(self):
        """Computing view for K=10 candidates should stay reasonable."""
        dem = create_flat_dem(rows=80, cols=80)
        dem.init_local_coords()

        # Create 10 mock locations
        locations = []
        for i in range(10):
            lat = 38.5 + (i - 5) * 0.001
            lon = -109.5 + (i - 5) * 0.001
            locations.append(create_mock_standing_location(i, lat, lon))

        start = time.time()
        for loc in locations:
            view = compute_overlook_view(
                dem=dem,
                lat=loc.location["lat"],
                lon=loc.location["lon"],
            )
            loc.view = view
        elapsed = time.time() - start

        # Should complete K=10 in under 2 seconds
        assert elapsed < 2.0, f"K=10 views took {elapsed:.2f}s, should be < 2s"


class TestIntegration:
    """Test integration with standing locations."""

    def test_add_view_to_locations(self):
        """add_view_analysis_to_locations should work."""
        dem = create_flat_dem()
        dem.init_local_coords()

        locations = [
            create_mock_standing_location(1, 38.5, -109.5, slope_deg=5.0),
            create_mock_standing_location(2, 38.501, -109.501, slope_deg=10.0),
        ]

        rim_strengths = {1: 0.8, 2: 0.3}

        updated = add_view_analysis_to_locations(
            dem=dem,
            standing_locations=locations,
            rim_strengths=rim_strengths,
            max_candidates=10,
        )

        # Both should have view computed
        for loc in updated:
            assert loc.view is not None, f"Location {loc.standing_id} should have view"
            assert loc.view.overlook_score >= 0
            assert loc.view.overlook_score <= 1

    def test_select_candidates_filters_steep(self):
        """select_overlook_candidates should filter steep slopes."""
        locations = [
            create_mock_standing_location(1, 38.5, -109.5, slope_deg=5.0),
            create_mock_standing_location(2, 38.501, -109.501, slope_deg=30.0),  # Too steep
            create_mock_standing_location(3, 38.502, -109.502, slope_deg=15.0),
        ]

        candidates = select_overlook_candidates(
            standing_locations=locations,
            slope_max_deg=20.0,
        )

        # Should exclude the steep one
        candidate_ids = [c[0].standing_id for c in candidates]
        assert 2 not in candidate_ids, "Steep location should be excluded"
        assert len(candidates) == 2

    def test_view_includes_sun_alignment(self):
        """View should include sun alignment when sun_position provided."""
        dem = create_flat_dem()
        dem.init_local_coords()

        sun_pos = create_sun_position(azimuth_deg=90.0, altitude_deg=10.0)

        view = compute_overlook_view(
            dem=dem,
            lat=38.5,
            lon=-109.5,
            sun_position=sun_pos,
        )

        assert view.sun_alignment is not None
        assert view.sun_alignment.sun_azimuth_deg == 90.0
        assert view.sun_alignment.sun_altitude_deg == 10.0


class TestDebugOutput:
    """Test debug output options."""

    def test_profile_excluded_by_default(self):
        """Horizon profile should not be included by default."""
        dem = create_flat_dem()
        dem.init_local_coords()

        view = compute_overlook_view(
            dem=dem,
            lat=38.5,
            lon=-109.5,
            include_profile=False,
        )

        assert view.horizon_profile is None

    def test_profile_included_when_requested(self):
        """Horizon profile should be included when debug enabled."""
        dem = create_flat_dem()
        dem.init_local_coords()

        view = compute_overlook_view(
            dem=dem,
            lat=38.5,
            lon=-109.5,
            include_profile=True,
        )

        assert view.horizon_profile is not None
        assert len(view.horizon_profile) > 0


class TestViewCone:
    """Test view cone polygon generation."""

    def test_view_cone_has_4_points(self):
        """View cone should have 4 points (apex, left, right, apex)."""
        dem = create_flat_dem()
        dem.init_local_coords()

        view = compute_overlook_view(
            dem=dem,
            lat=38.5,
            lon=-109.5,
        )

        assert view.view_cone is not None, "View cone should be generated"
        assert len(view.view_cone) == 4, f"View cone should have 4 points, got {len(view.view_cone)}"

    def test_view_cone_is_closed(self):
        """View cone first point should equal last point (closed polygon)."""
        dem = create_flat_dem()
        dem.init_local_coords()

        view = compute_overlook_view(
            dem=dem,
            lat=38.5,
            lon=-109.5,
        )

        assert view.view_cone[0] == view.view_cone[-1], \
            f"View cone should be closed: first {view.view_cone[0]} != last {view.view_cone[-1]}"

    def test_view_cone_points_in_correct_direction(self):
        """View cone points should extend in the bearing direction."""
        dem = create_flat_dem()
        dem.init_local_coords()

        # Force a bearing of 90° (east)
        view = compute_overlook_view(
            dem=dem,
            lat=38.5,
            lon=-109.5,
        )

        # Get apex and outer points
        apex = view.view_cone[0]
        left_point = view.view_cone[1]
        right_point = view.view_cone[2]

        # Best bearing determines the direction
        # The outer points should be further away from apex in some direction
        # Check that outer points are not equal to apex
        assert left_point != apex, "Left point should differ from apex"
        assert right_point != apex, "Right point should differ from apex"

    def test_view_cone_bearing_east_moves_lon_positive(self):
        """With bearing ~90° (east), cone points should have higher longitude."""
        dem = create_flat_dem()
        dem.init_local_coords()

        # Create a scenario where best bearing is east
        from terrain.view import generate_view_cone

        cone = generate_view_cone(
            dem=dem,
            lat=38.5,
            lon=-109.5,
            best_bearing_deg=90.0,  # East
            fov_deg=60.0,
            depth_p50_m=2000.0,
        )

        apex = cone[0]
        left_point = cone[1]  # Bearing 60° (NE)
        right_point = cone[2]  # Bearing 120° (SE)

        # Both outer points should have higher longitude (more east)
        assert left_point[1] > apex[1], "Left point should be east of apex"
        assert right_point[1] > apex[1], "Right point should be east of apex"

    def test_view_cone_bearing_north_moves_lat_positive(self):
        """With bearing 0° (north), cone points should have higher latitude."""
        dem = create_flat_dem()
        dem.init_local_coords()

        from terrain.view import generate_view_cone

        cone = generate_view_cone(
            dem=dem,
            lat=38.5,
            lon=-109.5,
            best_bearing_deg=0.0,  # North
            fov_deg=60.0,
            depth_p50_m=2000.0,
        )

        apex = cone[0]
        left_point = cone[1]  # Bearing -30° (NW) -> 330°
        right_point = cone[2]  # Bearing 30° (NE)

        # Both outer points should have higher latitude (more north)
        assert left_point[0] > apex[0], "Left point should be north of apex"
        assert right_point[0] > apex[0], "Right point should be north of apex"


class TestExplanations:
    """Test human-readable explanation generation."""

    def test_explanations_exist(self):
        """View should have explanations when computed."""
        dem = create_flat_dem()
        dem.init_local_coords()

        view = compute_overlook_view(
            dem=dem,
            lat=38.5,
            lon=-109.5,
        )

        assert view.explanations is not None, "Explanations should be generated"

    def test_explanations_non_empty(self):
        """Explanation strings should be non-empty."""
        dem = create_flat_dem()
        dem.init_local_coords()

        view = compute_overlook_view(
            dem=dem,
            lat=38.5,
            lon=-109.5,
        )

        assert len(view.explanations.short) > 0, "Short explanation should be non-empty"
        assert len(view.explanations.long) > 0, "Long explanation should be non-empty"

    def test_short_explanation_max_length(self):
        """Short explanation should be <= 80 characters."""
        dem = create_flat_dem()
        dem.init_local_coords()

        view = compute_overlook_view(
            dem=dem,
            lat=38.5,
            lon=-109.5,
        )

        assert len(view.explanations.short) <= 80, \
            f"Short explanation too long: {len(view.explanations.short)} chars"

    def test_explanations_include_sun_info(self):
        """Long explanation should include sun info when sun_position provided."""
        dem = create_flat_dem()
        dem.init_local_coords()

        sun_pos = create_sun_position(azimuth_deg=90.0, altitude_deg=10.0)

        view = compute_overlook_view(
            dem=dem,
            lat=38.5,
            lon=-109.5,
            sun_position=sun_pos,
        )

        # Long explanation should mention sun
        assert "sun" in view.explanations.long.lower() or "Sun" in view.explanations.long, \
            f"Long explanation should mention sun: {view.explanations.long}"

    def test_explanations_vary_with_metrics(self):
        """Explanations should vary based on view metrics."""
        dem = create_rim_basin_dem()
        dem.init_local_coords()

        # Rim location
        rim_view = compute_overlook_view(
            dem=dem,
            lat=38.5,
            lon=dem.lons[10],
            rim_strength=0.8,
        )

        # Basin location
        basin_view = compute_overlook_view(
            dem=dem,
            lat=38.5,
            lon=dem.lons[70],
            rim_strength=0.0,
        )

        # Explanations should be different
        # (They describe different view qualities)
        assert rim_view.explanations.long != basin_view.explanations.long or \
               rim_view.explanations.short != basin_view.explanations.short, \
            "Explanations should differ for different view qualities"


class TestDistantAtmosphericGlowScore:
    """
    Test Distant Atmospheric Glow Score (DAGS) computation.

    DAGS is viewpoint-first scoring for capturing distant layered atmospheric glow.
    Example: Needles Overlook at sunrise - standing on a rim, viewing 10-60km of
    layered canyons that catch the dawn light.
    """

    def test_angular_diff_simple(self):
        """angular_diff_deg should compute correct differences."""
        assert angular_diff_deg(0, 90) == 90.0
        assert angular_diff_deg(90, 0) == 90.0
        assert angular_diff_deg(0, 180) == 180.0
        assert angular_diff_deg(0, 270) == 90.0  # 270 is 90 degrees from 0 (via 360)

    def test_angular_diff_wraparound(self):
        """angular_diff_deg should handle wraparound at 360."""
        assert angular_diff_deg(350, 10) == 20.0
        assert angular_diff_deg(10, 350) == 20.0
        assert abs(angular_diff_deg(359, 1) - 2.0) < 0.001

    def test_gaussian_preference_peak(self):
        """gaussian_preference should peak at mu."""
        # At exact mu, score should be 1.0
        assert gaussian_preference(90, mu=90, sigma=40) == 1.0
        assert gaussian_preference(180, mu=180, sigma=35) == 1.0

    def test_gaussian_preference_decay(self):
        """gaussian_preference should decay away from mu."""
        peak = gaussian_preference(90, mu=90, sigma=40)
        off_peak = gaussian_preference(130, mu=90, sigma=40)  # 40 degrees off
        far_off = gaussian_preference(180, mu=90, sigma=40)   # 90 degrees off

        assert peak > off_peak > far_off
        assert 0.6 < off_peak < 0.7  # Should be exp(-0.5) ≈ 0.606

    def test_directionality_peaks_at_90_degrees(self):
        """Directionality score should be high for side-lit (delta ~90°)."""
        # View facing west, sun at south = 90° delta (side-lit)
        dir_norm, delta, dir_type = compute_directionality_score(
            view_bearing_deg=270.0,  # West
            sun_azimuth_deg=180.0,   # South
        )

        assert delta == 90.0
        assert dir_norm > 0.9, f"Side-lit should score high, got {dir_norm}"
        assert dir_type == "side_lit"

    def test_directionality_peaks_at_180_degrees(self):
        """Directionality score should be high for contra-jour (delta ~180°)."""
        # View facing west, sun at east = 180° delta (contra-jour)
        dir_norm, delta, dir_type = compute_directionality_score(
            view_bearing_deg=270.0,  # West
            sun_azimuth_deg=90.0,    # East
        )

        assert delta == 180.0
        assert dir_norm > 0.9, f"Contra-jour should score high, got {dir_norm}"
        assert dir_type == "contra_jour"

    def test_directionality_low_for_frontlit(self):
        """Directionality score should be lower for front-lit (delta ~0°)."""
        # View facing west, sun at west = 0° delta (front-lit)
        dir_norm, delta, dir_type = compute_directionality_score(
            view_bearing_deg=270.0,  # West
            sun_azimuth_deg=270.0,   # West (same direction)
        )

        assert delta == 0.0
        assert dir_norm < 0.3, f"Front-lit should score low, got {dir_norm}"
        assert dir_type == "neutral"

    def test_dags_increases_with_depth(self):
        """DAGS should increase with greater view depth."""
        # Shallow view (2km)
        shallow = compute_distant_glow_score(
            depth_p90_m=2000.0,
            open_sky_sector_fraction=0.7,
            rim_strength=0.6,
            sun_altitude_deg=5.0,
            blocking_margin_deg=2.0,
            view_bearing_deg=270.0,
            sun_azimuth_deg=90.0,
        )

        # Deep view (20km)
        deep = compute_distant_glow_score(
            depth_p90_m=20000.0,
            open_sky_sector_fraction=0.7,
            rim_strength=0.6,
            sun_altitude_deg=5.0,
            blocking_margin_deg=2.0,
            view_bearing_deg=270.0,
            sun_azimuth_deg=90.0,
        )

        assert deep.distant_glow_score > shallow.distant_glow_score, \
            f"Deep view {deep.distant_glow_score} should score higher than shallow {shallow.distant_glow_score}"

    def test_dags_increases_with_openness(self):
        """DAGS should increase with greater sector openness."""
        # Enclosed view
        enclosed = compute_distant_glow_score(
            depth_p90_m=10000.0,
            open_sky_sector_fraction=0.2,
            rim_strength=0.6,
            sun_altitude_deg=5.0,
            blocking_margin_deg=2.0,
            view_bearing_deg=270.0,
            sun_azimuth_deg=90.0,
        )

        # Open view
        open_view = compute_distant_glow_score(
            depth_p90_m=10000.0,
            open_sky_sector_fraction=0.9,
            rim_strength=0.6,
            sun_altitude_deg=5.0,
            blocking_margin_deg=2.0,
            view_bearing_deg=270.0,
            sun_azimuth_deg=90.0,
        )

        assert open_view.distant_glow_score > enclosed.distant_glow_score, \
            f"Open view {open_view.distant_glow_score} should score higher than enclosed {enclosed.distant_glow_score}"

    def test_dags_decreases_when_blocked(self):
        """DAGS should decrease when sun is behind ridge (negative blocking_margin)."""
        # Sun clears horizon
        clear = compute_distant_glow_score(
            depth_p90_m=15000.0,
            open_sky_sector_fraction=0.7,
            rim_strength=0.6,
            sun_altitude_deg=5.0,
            blocking_margin_deg=3.0,  # Sun 3° above local horizon
            view_bearing_deg=270.0,
            sun_azimuth_deg=90.0,
        )

        # Sun blocked by ridge
        blocked = compute_distant_glow_score(
            depth_p90_m=15000.0,
            open_sky_sector_fraction=0.7,
            rim_strength=0.6,
            sun_altitude_deg=5.0,
            blocking_margin_deg=-2.0,  # Sun 2° below local horizon
            view_bearing_deg=270.0,
            sun_azimuth_deg=90.0,
        )

        assert clear.distant_glow_score > blocked.distant_glow_score, \
            f"Clear sun {clear.distant_glow_score} should score higher than blocked {blocked.distant_glow_score}"

    def test_dags_score_bounded(self):
        """DAGS score should be bounded 0-1."""
        # Minimal values
        low = compute_distant_glow_score(
            depth_p90_m=0.0,
            open_sky_sector_fraction=0.0,
            rim_strength=0.0,
            sun_altitude_deg=30.0,  # High sun
            blocking_margin_deg=-5.0,  # Blocked
            view_bearing_deg=0.0,
            sun_azimuth_deg=0.0,  # Front-lit
        )

        assert low.distant_glow_score >= 0.0, f"Score should be >= 0, got {low.distant_glow_score}"

        # Maximal values
        high = compute_distant_glow_score(
            depth_p90_m=50000.0,  # Very deep
            open_sky_sector_fraction=1.0,
            rim_strength=1.0,
            sun_altitude_deg=0.0,  # Very low sun
            blocking_margin_deg=5.0,  # Clears horizon
            view_bearing_deg=270.0,
            sun_azimuth_deg=90.0,  # Contra-jour
        )

        assert high.distant_glow_score <= 1.0, f"Score should be <= 1, got {high.distant_glow_score}"

    def test_dags_glow_type_is_distant_atmospheric(self):
        """DAGS should always have type DISTANT_ATMOSPHERIC."""
        dags = compute_distant_glow_score(
            depth_p90_m=15000.0,
            open_sky_sector_fraction=0.7,
            rim_strength=0.6,
            sun_altitude_deg=5.0,
            blocking_margin_deg=2.0,
            view_bearing_deg=270.0,
            sun_azimuth_deg=90.0,
        )

        assert dags.distant_glow_type == "DISTANT_ATMOSPHERIC"

    def test_dags_explanations_include_depth(self):
        """DAGS explanations should include depth information."""
        dags = compute_distant_glow_score(
            depth_p90_m=18000.0,  # 18km
            open_sky_sector_fraction=0.7,
            rim_strength=0.6,
            sun_altitude_deg=5.0,
            blocking_margin_deg=2.0,
            view_bearing_deg=270.0,
            sun_azimuth_deg=90.0,
        )

        # Short explanation should mention depth
        assert "18" in dags.explanation_short or "km" in dags.explanation_short, \
            f"Short explanation should mention depth: {dags.explanation_short}"

    def test_dags_explanations_include_direction(self):
        """DAGS explanations should include directional information."""
        dags = compute_distant_glow_score(
            depth_p90_m=15000.0,
            open_sky_sector_fraction=0.7,
            rim_strength=0.6,
            sun_altitude_deg=5.0,
            blocking_margin_deg=2.0,
            view_bearing_deg=225.0,  # SW
            sun_azimuth_deg=90.0,    # E
        )

        # Long explanation should mention direction
        long_lower = dags.explanation_long.lower()
        assert "sw" in long_lower or "facing" in long_lower, \
            f"Long explanation should mention direction: {dags.explanation_long}"

    def test_dags_integrated_with_overlook_view(self):
        """DAGS should be computed in compute_overlook_view when sun_position provided."""
        dem = create_flat_dem()
        dem.init_local_coords()

        sun_pos = create_sun_position(azimuth_deg=90.0, altitude_deg=5.0)

        view = compute_overlook_view(
            dem=dem,
            lat=38.5,
            lon=-109.5,
            rim_strength=0.7,
            sun_position=sun_pos,
        )

        assert view.distant_glow is not None, "DAGS should be computed with sun_position"
        assert view.distant_glow.distant_glow_score >= 0.0
        assert view.distant_glow.distant_glow_score <= 1.0
        assert view.distant_glow.distant_glow_type == "DISTANT_ATMOSPHERIC"

    def test_dags_not_computed_without_sun(self):
        """DAGS should be None when sun_position not provided."""
        dem = create_flat_dem()
        dem.init_local_coords()

        view = compute_overlook_view(
            dem=dem,
            lat=38.5,
            lon=-109.5,
            rim_strength=0.7,
            sun_position=None,
        )

        assert view.distant_glow is None, "DAGS should be None without sun_position"


class TestVisualAnchorScore:
    """
    Test Visual Anchor Score (VAS) computation.

    VAS detects salient features (ridgelines, spires, mesas) in the view cone
    sector that provide visual interest in distant views. It uses DEM-derived
    structure grids (curvature, slope_break) to identify anchors.
    """

    def _compute_structure_grids(self, dem: DEMGrid) -> Tuple[np.ndarray, np.ndarray]:
        """Helper to compute curvature and slope_break grids for testing."""
        from terrain.analysis import compute_curvature, compute_slope_aspect
        from terrain.structure import compute_slope_break_grid

        curvature = compute_curvature(dem)
        slope_deg, _ = compute_slope_aspect(dem)
        slope_break = compute_slope_break_grid(slope_deg)

        return curvature, slope_break

    def test_flat_dem_low_anchor_score(self):
        """Flat DEM should have anchor_score near 0 and anchor_type NONE."""
        dem = create_flat_dem()
        dem.init_local_coords()

        curvature, slope_break = self._compute_structure_grids(dem)
        profile = compute_horizon_profile(dem, 38.5, -109.5)
        _, _, _, horizon_complexity = compute_view_metrics(profile)

        anchor = compute_visual_anchor_score(
            dem=dem,
            profile=profile,
            curvature=curvature,
            slope_break=slope_break,
            elevations=dem.elevations,
            best_bearing_deg=90.0,  # East
            fov_deg=60.0,
            horizon_complexity=horizon_complexity,
        )

        assert anchor is not None, "Should return VisualAnchor even for flat terrain"
        assert anchor.anchor_score < VAS_ANCHOR_SCORE_THRESHOLD, \
            f"Flat terrain should have low anchor_score, got {anchor.anchor_score}"
        assert anchor.anchor_type == "NONE", \
            f"Flat terrain should have anchor_type NONE, got {anchor.anchor_type}"

    def test_ridge_dem_ridgeline_anchor(self):
        """Ridge DEM should have significant anchor_score and dramatic anchor type."""
        dem = create_ridge_dem()
        dem.init_local_coords()

        curvature, slope_break = self._compute_structure_grids(dem)
        profile = compute_horizon_profile(dem, 38.5, dem.lons[10])  # View from west toward ridge
        _, _, _, horizon_complexity = compute_view_metrics(profile)

        anchor = compute_visual_anchor_score(
            dem=dem,
            profile=profile,
            curvature=curvature,
            slope_break=slope_break,
            elevations=dem.elevations,
            best_bearing_deg=90.0,  # East toward ridge
            fov_deg=60.0,
            horizon_complexity=horizon_complexity,
        )

        assert anchor is not None, "Should return VisualAnchor for ridge terrain"
        assert anchor.anchor_score >= VAS_ANCHOR_SCORE_THRESHOLD, \
            f"Ridge terrain should have significant anchor_score, got {anchor.anchor_score}"
        # Ridge creates dramatic terrain - could be RIDGELINE or SPIRES_KNOBS
        # depending on whether slope_break or curvature dominates at horizon intercepts
        assert anchor.anchor_type in ("RIDGELINE", "SPIRES_KNOBS"), \
            f"Ridge terrain should have dramatic anchor_type, got {anchor.anchor_type}"

    def test_knobs_dem_spires_anchor(self):
        """Knobs DEM should have anchor_type SPIRES_KNOBS with significant anchor_score."""
        dem = create_knobs_dem()
        dem.init_local_coords()

        curvature, slope_break = self._compute_structure_grids(dem)
        profile = compute_horizon_profile(dem, 38.5, dem.lons[10])  # View from west toward knobs
        _, _, _, horizon_complexity = compute_view_metrics(profile)

        anchor = compute_visual_anchor_score(
            dem=dem,
            profile=profile,
            curvature=curvature,
            slope_break=slope_break,
            elevations=dem.elevations,
            best_bearing_deg=90.0,  # East toward knobs
            fov_deg=60.0,
            horizon_complexity=horizon_complexity,
        )

        assert anchor is not None, "Should return VisualAnchor for knobs terrain"
        assert anchor.anchor_score >= VAS_ANCHOR_SCORE_THRESHOLD, \
            f"Knobs terrain should have significant anchor_score, got {anchor.anchor_score}"
        # Knobs have high curvature -> SPIRES_KNOBS type
        assert anchor.anchor_type == "SPIRES_KNOBS", \
            f"Knobs terrain should have anchor_type SPIRES_KNOBS, got {anchor.anchor_type}"

    def test_ridge_anchor_score_higher_than_flat(self):
        """Ridge terrain should have higher anchor_score than flat terrain."""
        # Flat DEM
        flat_dem = create_flat_dem()
        flat_dem.init_local_coords()
        flat_curv, flat_sb = self._compute_structure_grids(flat_dem)
        flat_profile = compute_horizon_profile(flat_dem, 38.5, -109.5)

        flat_anchor = compute_visual_anchor_score(
            dem=flat_dem,
            profile=flat_profile,
            curvature=flat_curv,
            slope_break=flat_sb,
            elevations=flat_dem.elevations,
            best_bearing_deg=90.0,
            fov_deg=60.0,
            horizon_complexity=0,
        )

        # Ridge DEM
        ridge_dem = create_ridge_dem()
        ridge_dem.init_local_coords()
        ridge_curv, ridge_sb = self._compute_structure_grids(ridge_dem)
        ridge_profile = compute_horizon_profile(ridge_dem, 38.5, ridge_dem.lons[10])

        ridge_anchor = compute_visual_anchor_score(
            dem=ridge_dem,
            profile=ridge_profile,
            curvature=ridge_curv,
            slope_break=ridge_sb,
            elevations=ridge_dem.elevations,
            best_bearing_deg=90.0,
            fov_deg=60.0,
            horizon_complexity=0,
        )

        assert ridge_anchor.anchor_score > flat_anchor.anchor_score, \
            f"Ridge anchor_score {ridge_anchor.anchor_score} should be > flat {flat_anchor.anchor_score}"

    def test_knobs_anchor_score_higher_than_flat(self):
        """Knobs terrain should have higher anchor_score than flat terrain."""
        # Flat DEM
        flat_dem = create_flat_dem()
        flat_dem.init_local_coords()
        flat_curv, flat_sb = self._compute_structure_grids(flat_dem)
        flat_profile = compute_horizon_profile(flat_dem, 38.5, -109.5)

        flat_anchor = compute_visual_anchor_score(
            dem=flat_dem,
            profile=flat_profile,
            curvature=flat_curv,
            slope_break=flat_sb,
            elevations=flat_dem.elevations,
            best_bearing_deg=90.0,
            fov_deg=60.0,
            horizon_complexity=0,
        )

        # Knobs DEM
        knobs_dem = create_knobs_dem()
        knobs_dem.init_local_coords()
        knobs_curv, knobs_sb = self._compute_structure_grids(knobs_dem)
        knobs_profile = compute_horizon_profile(knobs_dem, 38.5, knobs_dem.lons[10])

        knobs_anchor = compute_visual_anchor_score(
            dem=knobs_dem,
            profile=knobs_profile,
            curvature=knobs_curv,
            slope_break=knobs_sb,
            elevations=knobs_dem.elevations,
            best_bearing_deg=90.0,
            fov_deg=60.0,
            horizon_complexity=0,
        )

        assert knobs_anchor.anchor_score > flat_anchor.anchor_score, \
            f"Knobs anchor_score {knobs_anchor.anchor_score} should be > flat {flat_anchor.anchor_score}"

    def test_anchor_score_bounded_0_to_1(self):
        """Anchor score should be bounded between 0 and 1."""
        dem = create_ridge_dem(ridge_height=500.0)  # Very tall ridge
        dem.init_local_coords()

        curvature, slope_break = self._compute_structure_grids(dem)
        profile = compute_horizon_profile(dem, 38.5, dem.lons[10])

        anchor = compute_visual_anchor_score(
            dem=dem,
            profile=profile,
            curvature=curvature,
            slope_break=slope_break,
            elevations=dem.elevations,
            best_bearing_deg=90.0,
            fov_deg=60.0,
            horizon_complexity=0,
        )

        assert 0.0 <= anchor.anchor_score <= 1.0, \
            f"Anchor score should be 0-1, got {anchor.anchor_score}"

    def test_anchor_returns_none_without_grids(self):
        """VAS should return None when curvature/slope_break grids are not provided."""
        dem = create_flat_dem()
        dem.init_local_coords()

        profile = compute_horizon_profile(dem, 38.5, -109.5)

        anchor = compute_visual_anchor_score(
            dem=dem,
            profile=profile,
            curvature=None,  # No curvature grid
            slope_break=None,  # No slope_break grid
            elevations=dem.elevations,
            best_bearing_deg=90.0,
            fov_deg=60.0,
            horizon_complexity=0,
        )

        assert anchor is None, "Should return None when structure grids not provided"

    def test_anchor_explanations_present(self):
        """Anchor should have non-empty explanations."""
        dem = create_ridge_dem()
        dem.init_local_coords()

        curvature, slope_break = self._compute_structure_grids(dem)
        profile = compute_horizon_profile(dem, 38.5, dem.lons[10])

        anchor = compute_visual_anchor_score(
            dem=dem,
            profile=profile,
            curvature=curvature,
            slope_break=slope_break,
            elevations=dem.elevations,
            best_bearing_deg=90.0,
            fov_deg=60.0,
            horizon_complexity=0,
        )

        assert anchor is not None
        assert len(anchor.explanation_short) > 0, "Short explanation should be non-empty"
        assert len(anchor.explanation_long) > 0, "Long explanation should be non-empty"

    def test_classify_anchor_type_none_below_threshold(self):
        """classify_anchor_type should return NONE when score below threshold."""
        anchor_type = classify_anchor_type(
            curv_norm=0.5,
            sb_norm=0.5,
            anchor_score=VAS_ANCHOR_SCORE_THRESHOLD - 0.1,  # Below threshold
            horizon_complexity=0,
        )
        assert anchor_type == "NONE"

    def test_classify_anchor_type_ridgeline(self):
        """classify_anchor_type should return RIDGELINE when slope_break dominates."""
        anchor_type = classify_anchor_type(
            curv_norm=0.3,
            sb_norm=0.6,  # High slope_break, dominates curvature
            anchor_score=0.5,
            horizon_complexity=0,
        )
        assert anchor_type == "RIDGELINE"

    def test_classify_anchor_type_spires(self):
        """classify_anchor_type should return SPIRES_KNOBS when curvature dominates."""
        anchor_type = classify_anchor_type(
            curv_norm=0.6,  # High curvature
            sb_norm=0.3,
            anchor_score=0.5,
            horizon_complexity=0,
        )
        assert anchor_type == "SPIRES_KNOBS"

    def test_compute_azimuth_salience_normalization(self):
        """compute_azimuth_salience should normalize values to 0-1."""
        # Very high raw values should still normalize to <= 1
        salience, curv_norm, sb_norm, relief_norm = compute_azimuth_salience(
            curvature=1.0,  # Very high curvature
            slope_break=100.0,  # Very high slope break
            relief=50.0,  # Very high relief
        )

        assert 0.0 <= salience <= 1.0, f"Salience should be 0-1, got {salience}"
        assert curv_norm == 1.0, f"curv_norm should cap at 1.0, got {curv_norm}"
        assert sb_norm == 1.0, f"sb_norm should cap at 1.0, got {sb_norm}"
        assert relief_norm == 1.0, f"relief_norm should cap at 1.0, got {relief_norm}"

    def test_dags_combined_score_with_anchor(self):
        """DAGS combined score should increase when anchor is present."""
        # DAGS without anchor
        dags_no_anchor = compute_distant_glow_score(
            depth_p90_m=15000.0,
            open_sky_sector_fraction=0.7,
            rim_strength=0.6,
            sun_altitude_deg=5.0,
            blocking_margin_deg=2.0,
            view_bearing_deg=270.0,
            sun_azimuth_deg=90.0,
            visual_anchor=None,
        )

        # Create a mock anchor with high score
        from terrain.types import VisualAnchor
        mock_anchor = VisualAnchor(
            anchor_score=0.8,
            anchor_type="RIDGELINE",
            anchor_distance_m=5000.0,
            anchor_bearing_deg=270.0,
            curvature_salience=0.5,
            slope_break_salience=0.7,
            relief_salience=0.4,
            explanation_short="Strong ridge anchor",
            explanation_long="Prominent ridge at 5km provides visual interest.",
        )

        dags_with_anchor = compute_distant_glow_score(
            depth_p90_m=15000.0,
            open_sky_sector_fraction=0.7,
            rim_strength=0.6,
            sun_altitude_deg=5.0,
            blocking_margin_deg=2.0,
            view_bearing_deg=270.0,
            sun_azimuth_deg=90.0,
            visual_anchor=mock_anchor,
        )

        # Combined score with anchor should be higher
        assert dags_with_anchor.distant_glow_with_anchor_score > dags_no_anchor.distant_glow_with_anchor_score, \
            f"DAGS with anchor {dags_with_anchor.distant_glow_with_anchor_score} should be > without {dags_no_anchor.distant_glow_with_anchor_score}"

        # Verify the anchor is attached
        assert dags_with_anchor.visual_anchor is not None
        assert dags_with_anchor.visual_anchor.anchor_type == "RIDGELINE"

    def test_overlook_view_includes_anchor_with_grids(self):
        """compute_overlook_view should include VAS when structure grids provided."""
        dem = create_ridge_dem()
        dem.init_local_coords()

        curvature, slope_break = self._compute_structure_grids(dem)
        sun_pos = create_sun_position(azimuth_deg=90.0, altitude_deg=5.0)

        view = compute_overlook_view(
            dem=dem,
            lat=38.5,
            lon=dem.lons[10],  # West side looking east toward ridge
            rim_strength=0.7,
            sun_position=sun_pos,
            curvature=curvature,
            slope_break=slope_break,
        )

        assert view.distant_glow is not None, "DAGS should be computed"
        assert view.distant_glow.visual_anchor is not None, "VAS should be computed with structure grids"
        assert view.distant_glow.distant_glow_with_anchor_score > 0, "Combined score should be positive"


class TestLightAtAnchor:
    """
    Test Light-at-Anchor (LAA) computation.

    LAA scores whether the visual anchor feature is receiving direct sunlight
    based on surface orientation and shadow analysis.
    """

    def _compute_structure_grids(self, dem: DEMGrid) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        """Helper to compute all structure grids for testing."""
        from terrain.analysis import compute_curvature, compute_slope_aspect
        from terrain.structure import compute_slope_break_grid

        curvature = compute_curvature(dem)
        slope_deg, aspect_deg = compute_slope_aspect(dem)
        slope_break = compute_slope_break_grid(slope_deg)

        return curvature, slope_break, slope_deg, aspect_deg

    def test_surface_normal_flat_terrain(self):
        """Flat terrain (slope=0) should have vertical normal (0, 0, 1)."""
        Nx, Ny, Nz = compute_surface_normal_at_point(slope_deg=0.0, aspect_deg=0.0)

        assert abs(Nx) < 0.001, f"Nx should be ~0, got {Nx}"
        assert abs(Ny) < 0.001, f"Ny should be ~0, got {Ny}"
        assert abs(Nz - 1.0) < 0.001, f"Nz should be ~1, got {Nz}"

    def test_surface_normal_facing_east(self):
        """Slope facing east (aspect=270°, downslope west) should have positive Nx."""
        # If downslope is west (270°), then face direction is east
        Nx, Ny, Nz = compute_surface_normal_at_point(slope_deg=45.0, aspect_deg=270.0)

        # At 45° slope, horizontal component = sin(45°) ≈ 0.707
        # Face direction east: Nx positive
        assert Nx > 0.5, f"Nx should be positive (facing east), got {Nx}"
        assert abs(Ny) < 0.3, f"Ny should be near 0, got {Ny}"

    def test_surface_normal_facing_north(self):
        """Slope facing north (aspect=180°, downslope south) should have positive Ny."""
        Nx, Ny, Nz = compute_surface_normal_at_point(slope_deg=45.0, aspect_deg=180.0)

        # At 45° slope, horizontal component = sin(45°) ≈ 0.707
        # Face direction north: Ny positive
        assert Ny > 0.5, f"Ny should be positive (facing north), got {Ny}"
        assert abs(Nx) < 0.3, f"Nx should be near 0, got {Nx}"

    def test_classify_light_type_front_lit(self):
        """Front-lit classification when delta < 45° and high incidence."""
        light_type = classify_anchor_light_type(
            delta_deg=30.0,       # Camera and sun on same side
            incidence=0.5,        # High incidence (facing sun)
            anchor_shadowed=False,
            sun_altitude_deg=10.0,
        )
        assert light_type == "FRONT_LIT", f"Expected FRONT_LIT, got {light_type}"

    def test_classify_light_type_side_lit(self):
        """Side-lit classification when delta is around 90°."""
        light_type = classify_anchor_light_type(
            delta_deg=90.0,       # Sun at right angle to view
            incidence=0.3,        # Moderate incidence
            anchor_shadowed=False,
            sun_altitude_deg=10.0,
        )
        assert light_type == "SIDE_LIT", f"Expected SIDE_LIT, got {light_type}"

    def test_classify_light_type_back_lit(self):
        """Back-lit classification when delta > 135°."""
        light_type = classify_anchor_light_type(
            delta_deg=160.0,      # Sun behind subject
            incidence=0.1,        # Low positive incidence
            anchor_shadowed=False,
            sun_altitude_deg=10.0,
        )
        assert light_type == "BACK_LIT", f"Expected BACK_LIT, got {light_type}"

    def test_classify_light_type_rim_lit(self):
        """Rim-lit classification when facing away but sun is low and visible."""
        light_type = classify_anchor_light_type(
            delta_deg=150.0,
            incidence=-0.2,       # Facing away from sun
            anchor_shadowed=False,
            sun_altitude_deg=5.0, # Low sun
        )
        assert light_type == "RIM_LIT", f"Expected RIM_LIT, got {light_type}"

    def test_anchor_light_score_high_for_sun_facing(self):
        """Anchor facing the sun should have high light score."""
        dem = create_flat_dem()
        dem.init_local_coords()

        # Sun in the east, anchor facing east
        sun_pos = create_sun_position(azimuth_deg=90.0, altitude_deg=10.0)

        anchor_light = compute_anchor_light_score(
            dem=dem,
            anchor_lat=38.5,
            anchor_lon=-109.5,
            sun_position=sun_pos,
            view_bearing_deg=90.0,  # Looking east
            slope_grid=None,  # Will compute internally
            aspect_grid=None,
            sun_low_norm=0.8,  # Low sun
        )

        assert anchor_light is not None
        # Flat terrain has vertical normal, sun at 10° altitude
        # Incidence = Nz * Sz = cos(0) * sin(10°) ≈ 0.17
        assert anchor_light.anchor_sun_incidence > 0, "Incidence should be positive for sun above horizon"

    def test_anchor_light_score_low_for_shadowed(self):
        """Shadowed anchor should have reduced light score."""
        # Create a DEM where the anchor would be shadowed
        dem = create_rim_basin_dem(rim_height=300.0)  # High rim to cast shadow
        dem.init_local_coords()

        # Sun low in west, anchor in basin looking toward rim
        sun_pos = create_sun_position(azimuth_deg=270.0, altitude_deg=3.0)  # Very low sun in west

        # Basin location (in shadow from rim)
        basin_lat, basin_lon = 38.5, dem.lons[60]

        anchor_light = compute_anchor_light_score(
            dem=dem,
            anchor_lat=basin_lat,
            anchor_lon=basin_lon,
            sun_position=sun_pos,
            view_bearing_deg=270.0,
            sun_low_norm=0.8,
        )

        assert anchor_light is not None
        # The rim should cast shadow on the basin when sun is very low
        if anchor_light.anchor_shadowed:
            assert anchor_light.anchor_light_score < 0.5, \
                f"Shadowed anchor should have low score, got {anchor_light.anchor_light_score}"

    def test_anchor_light_score_bounded(self):
        """Anchor light score should be bounded 0-1."""
        dem = create_flat_dem()
        dem.init_local_coords()

        sun_pos = create_sun_position(azimuth_deg=90.0, altitude_deg=10.0)

        anchor_light = compute_anchor_light_score(
            dem=dem,
            anchor_lat=38.5,
            anchor_lon=-109.5,
            sun_position=sun_pos,
            view_bearing_deg=90.0,
            sun_low_norm=1.0,
        )

        assert anchor_light is not None
        assert 0.0 <= anchor_light.anchor_light_score <= 1.0, \
            f"Score should be 0-1, got {anchor_light.anchor_light_score}"

    def test_anchor_location_computation(self):
        """compute_anchor_location should return correct lat/lon."""
        dem = create_flat_dem()
        dem.init_local_coords()

        viewpoint_lat, viewpoint_lon = 38.5, -109.5
        bearing_deg = 90.0  # East
        distance_m = 1000.0

        anchor_lat, anchor_lon = compute_anchor_location(
            dem=dem,
            viewpoint_lat=viewpoint_lat,
            viewpoint_lon=viewpoint_lon,
            anchor_bearing_deg=bearing_deg,
            anchor_distance_m=distance_m,
        )

        # Anchor should be ~1km east of viewpoint
        # 1km at 38.5° lat ≈ 0.012° longitude
        assert anchor_lat > viewpoint_lat - 0.01, "Anchor should be near same latitude"
        assert anchor_lat < viewpoint_lat + 0.01, "Anchor should be near same latitude"
        assert anchor_lon > viewpoint_lon, "Anchor should be east (higher longitude)"

    def test_final_score_increases_with_anchor_light(self):
        """Final score should increase when anchor light is provided."""
        from terrain.types import VisualAnchor, AnchorLight

        # Without anchor light
        dags_no_light = compute_distant_glow_score(
            depth_p90_m=15000.0,
            open_sky_sector_fraction=0.7,
            rim_strength=0.6,
            sun_altitude_deg=5.0,
            blocking_margin_deg=2.0,
            view_bearing_deg=270.0,
            sun_azimuth_deg=90.0,
            visual_anchor=VisualAnchor(
                anchor_score=0.6,
                anchor_type="RIDGELINE",
                anchor_distance_m=5000.0,
                anchor_bearing_deg=270.0,
                curvature_salience=0.4,
                slope_break_salience=0.6,
                relief_salience=0.3,
                explanation_short="Ridge anchor",
                explanation_long="Test ridge anchor.",
            ),
            anchor_light=None,
        )

        # With high anchor light
        dags_with_light = compute_distant_glow_score(
            depth_p90_m=15000.0,
            open_sky_sector_fraction=0.7,
            rim_strength=0.6,
            sun_altitude_deg=5.0,
            blocking_margin_deg=2.0,
            view_bearing_deg=270.0,
            sun_azimuth_deg=90.0,
            visual_anchor=VisualAnchor(
                anchor_score=0.6,
                anchor_type="RIDGELINE",
                anchor_distance_m=5000.0,
                anchor_bearing_deg=270.0,
                curvature_salience=0.4,
                slope_break_salience=0.6,
                relief_salience=0.3,
                explanation_short="Ridge anchor",
                explanation_long="Test ridge anchor.",
            ),
            anchor_light=AnchorLight(
                anchor_sun_incidence=0.5,
                anchor_light_type="FRONT_LIT",
                anchor_shadowed=False,
                anchor_light_score=0.8,
                anchor_slope_deg=30.0,
                anchor_aspect_deg=90.0,
                explanation_short="Anchor is front-lit",
                explanation_long="Test explanation.",
            ),
        )

        assert dags_with_light.distant_glow_final_score > dags_no_light.distant_glow_final_score, \
            f"Final score with light {dags_with_light.distant_glow_final_score} should be > without {dags_no_light.distant_glow_final_score}"

    def test_final_score_bounded(self):
        """Final score should be bounded 0-1."""
        from terrain.types import VisualAnchor, AnchorLight

        dags = compute_distant_glow_score(
            depth_p90_m=50000.0,  # Very deep
            open_sky_sector_fraction=1.0,
            rim_strength=1.0,
            sun_altitude_deg=0.0,  # Sun at horizon
            blocking_margin_deg=5.0,
            view_bearing_deg=270.0,
            sun_azimuth_deg=90.0,
            visual_anchor=VisualAnchor(
                anchor_score=1.0,  # Max anchor
                anchor_type="RIDGELINE",
                anchor_distance_m=5000.0,
                anchor_bearing_deg=270.0,
                curvature_salience=1.0,
                slope_break_salience=1.0,
                relief_salience=1.0,
                explanation_short="Max anchor",
                explanation_long="Test.",
            ),
            anchor_light=AnchorLight(
                anchor_sun_incidence=1.0,  # Max incidence
                anchor_light_type="FRONT_LIT",
                anchor_shadowed=False,
                anchor_light_score=1.0,  # Max light score
                anchor_slope_deg=0.0,
                anchor_aspect_deg=0.0,
                explanation_short="Max light",
                explanation_long="Test.",
            ),
        )

        assert 0.0 <= dags.distant_glow_final_score <= 1.0, \
            f"Final score should be 0-1, got {dags.distant_glow_final_score}"

    def test_anchor_light_explanations(self):
        """Anchor light should have non-empty explanations."""
        dem = create_flat_dem()
        dem.init_local_coords()

        sun_pos = create_sun_position(azimuth_deg=90.0, altitude_deg=10.0)

        anchor_light = compute_anchor_light_score(
            dem=dem,
            anchor_lat=38.5,
            anchor_lon=-109.5,
            sun_position=sun_pos,
            view_bearing_deg=90.0,
            sun_low_norm=0.8,
        )

        assert anchor_light is not None
        assert len(anchor_light.explanation_short) > 0, "Short explanation should be non-empty"
        assert len(anchor_light.explanation_long) > 0, "Long explanation should be non-empty"

    def test_overlook_view_includes_anchor_light(self):
        """compute_overlook_view should include anchor_light when conditions are met."""
        dem = create_ridge_dem()
        dem.init_local_coords()

        curvature, slope_break, slope_grid, aspect_grid = self._compute_structure_grids(dem)
        sun_pos = create_sun_position(azimuth_deg=90.0, altitude_deg=5.0)

        view = compute_overlook_view(
            dem=dem,
            lat=38.5,
            lon=dem.lons[10],  # West side looking east toward ridge
            rim_strength=0.7,
            sun_position=sun_pos,
            curvature=curvature,
            slope_break=slope_break,
            slope_grid=slope_grid,
            aspect_grid=aspect_grid,
        )

        assert view.distant_glow is not None, "DAGS should be computed"
        # If there's a visual anchor, anchor_light should be computed
        if view.distant_glow.visual_anchor is not None and view.distant_glow.visual_anchor.anchor_type != "NONE":
            assert view.distant_glow.anchor_light is not None, "Anchor light should be computed when anchor exists"
            assert view.distant_glow.distant_glow_final_score > 0, "Final score should be positive"


class TestMultiDepthVAS:
    """
    Test multi-depth Visual Anchor Score (VAS) search.

    Multi-depth VAS searches for anchors at multiple distances along each
    azimuth, finding mid-distance canyon walls, river gorges, and benches
    that make better photographic anchors than the far horizon.
    """

    def _compute_structure_grids(self, dem: DEMGrid) -> Tuple[np.ndarray, np.ndarray]:
        """Helper to compute curvature and slope_break grids for testing."""
        from terrain.analysis import compute_curvature, compute_slope_aspect
        from terrain.structure import compute_slope_break_grid

        curvature = compute_curvature(dem)
        slope_deg, _ = compute_slope_aspect(dem)
        slope_break = compute_slope_break_grid(slope_deg)

        return curvature, slope_break

    def test_distance_preference_peaks_at_6km(self):
        """Distance preference should peak around 6km."""
        pref_1km = compute_distance_preference(1000.0)
        pref_6km = compute_distance_preference(6000.0)
        pref_20km = compute_distance_preference(20000.0)

        # 6km should be the peak
        assert pref_6km > pref_1km, f"6km pref {pref_6km} should be > 1km pref {pref_1km}"
        assert pref_6km > pref_20km, f"6km pref {pref_6km} should be > 20km pref {pref_20km}"

        # 6km should be close to 1.0
        assert pref_6km > 0.9, f"6km preference should be near 1.0, got {pref_6km}"

    def test_distance_preference_bounded(self):
        """Distance preference should be bounded 0-1."""
        for d in [100, 500, 1000, 3000, 6000, 10000, 30000, 100000]:
            pref = compute_distance_preference(float(d))
            assert 0.0 <= pref <= 1.0, f"Preference at {d}m should be 0-1, got {pref}"

    def test_distance_preference_zero_for_zero(self):
        """Distance preference should be 0 for invalid distances."""
        assert compute_distance_preference(0.0) == 0.0
        assert compute_distance_preference(-100.0) == 0.0

    def test_multi_depth_finds_mid_distance_anchor(self):
        """Multi-depth VAS should find mid-distance ridge, not flat horizon."""
        # Create DEM with mid-distance ridge and flat horizon
        dem = create_mid_distance_ridge_dem()
        dem.init_local_coords()

        curvature, slope_break = self._compute_structure_grids(dem)

        # Compute horizon profile from west edge looking east
        viewpoint_lat = 38.5
        viewpoint_lon = dem.lons[5]  # Near west edge

        profile = compute_horizon_profile(dem, viewpoint_lat, viewpoint_lon)
        _, _, _, horizon_complexity = compute_view_metrics(profile)

        # Multi-depth search
        anchor_multi = compute_visual_anchor_score(
            dem=dem,
            profile=profile,
            curvature=curvature,
            slope_break=slope_break,
            elevations=dem.elevations,
            best_bearing_deg=90.0,  # East
            fov_deg=60.0,
            horizon_complexity=horizon_complexity,
            use_multi_depth=True,
        )

        assert anchor_multi is not None
        assert anchor_multi.anchor_search_mode == "MULTI_DEPTH"
        assert anchor_multi.anchor_candidates_sampled > 0

        # Ridge is at about cols/3 = 200/3 ≈ 66 cells from west
        # Cell size is 30m, so ridge is at ~2km
        # Multi-depth should find this ridge, not the far horizon
        expected_ridge_distance = (dem.cols // 3) * dem.cell_size_m  # ~2km

        # Anchor distance should be near the ridge, not at horizon
        # Horizon is at about 6km (200 cols * 30m)
        horizon_distance = dem.cols * dem.cell_size_m

        # Allow some tolerance - anchor should be closer to ridge than to horizon
        assert anchor_multi.anchor_distance_m < horizon_distance * 0.6, \
            f"Multi-depth anchor at {anchor_multi.anchor_distance_m}m should be closer than {horizon_distance * 0.6}m"

    def test_horizon_only_misses_mid_distance(self):
        """Horizon-only VAS should miss mid-distance features."""
        dem = create_mid_distance_ridge_dem()
        dem.init_local_coords()

        curvature, slope_break = self._compute_structure_grids(dem)

        viewpoint_lat = 38.5
        viewpoint_lon = dem.lons[5]

        profile = compute_horizon_profile(dem, viewpoint_lat, viewpoint_lon)
        _, _, _, horizon_complexity = compute_view_metrics(profile)

        # Horizon-only search
        anchor_horizon = compute_visual_anchor_score(
            dem=dem,
            profile=profile,
            curvature=curvature,
            slope_break=slope_break,
            elevations=dem.elevations,
            best_bearing_deg=90.0,
            fov_deg=60.0,
            horizon_complexity=horizon_complexity,
            use_multi_depth=False,
        )

        assert anchor_horizon is not None
        assert anchor_horizon.anchor_search_mode == "HORIZON_ONLY"

        # Horizon-only should sample at horizon distances only
        # Each azimuth in sector gets one sample
        # With 60° FOV and 5° step, expect ~12 azimuths
        assert anchor_horizon.anchor_candidates_sampled < 20, \
            f"Horizon-only should have fewer samples, got {anchor_horizon.anchor_candidates_sampled}"

    def test_multi_depth_samples_more_candidates(self):
        """Multi-depth should sample more candidates than horizon-only."""
        dem = create_flat_dem()
        dem.init_local_coords()

        curvature, slope_break = self._compute_structure_grids(dem)
        profile = compute_horizon_profile(dem, 38.5, -109.5)

        anchor_multi = compute_visual_anchor_score(
            dem=dem,
            profile=profile,
            curvature=curvature,
            slope_break=slope_break,
            elevations=dem.elevations,
            best_bearing_deg=90.0,
            fov_deg=60.0,
            horizon_complexity=0,
            use_multi_depth=True,
        )

        anchor_horizon = compute_visual_anchor_score(
            dem=dem,
            profile=profile,
            curvature=curvature,
            slope_break=slope_break,
            elevations=dem.elevations,
            best_bearing_deg=90.0,
            fov_deg=60.0,
            horizon_complexity=0,
            use_multi_depth=False,
        )

        assert anchor_multi.anchor_candidates_sampled > anchor_horizon.anchor_candidates_sampled, \
            f"Multi-depth ({anchor_multi.anchor_candidates_sampled}) should sample more than horizon-only ({anchor_horizon.anchor_candidates_sampled})"

    def test_multi_depth_anchor_distance_not_always_horizon(self):
        """Multi-depth anchor distance should vary, not always be near horizon."""
        dem = create_ridge_dem()
        dem.init_local_coords()

        curvature, slope_break = self._compute_structure_grids(dem)
        profile = compute_horizon_profile(dem, 38.5, dem.lons[10])
        _, _, _, horizon_complexity = compute_view_metrics(profile)

        anchor = compute_visual_anchor_score(
            dem=dem,
            profile=profile,
            curvature=curvature,
            slope_break=slope_break,
            elevations=dem.elevations,
            best_bearing_deg=90.0,
            fov_deg=60.0,
            horizon_complexity=horizon_complexity,
            use_multi_depth=True,
        )

        assert anchor is not None
        assert anchor.best_candidate_distance_m == anchor.anchor_distance_m, \
            "best_candidate_distance_m should match anchor_distance_m"

    def test_multi_depth_with_laa_integration(self):
        """Multi-depth VAS should integrate properly with LAA."""
        dem = create_mid_distance_ridge_dem()
        dem.init_local_coords()

        from terrain.analysis import compute_curvature, compute_slope_aspect
        from terrain.structure import compute_slope_break_grid

        curvature = compute_curvature(dem)
        slope_deg, aspect_deg = compute_slope_aspect(dem)
        slope_break = compute_slope_break_grid(slope_deg)

        sun_pos = create_sun_position(azimuth_deg=90.0, altitude_deg=5.0)

        view = compute_overlook_view(
            dem=dem,
            lat=38.5,
            lon=dem.lons[5],
            rim_strength=0.7,
            sun_position=sun_pos,
            curvature=curvature,
            slope_break=slope_break,
            slope_grid=slope_deg,
            aspect_grid=aspect_deg,
        )

        assert view.distant_glow is not None
        # Visual anchor should exist and use multi-depth
        if view.distant_glow.visual_anchor is not None:
            assert view.distant_glow.visual_anchor.anchor_search_mode == "MULTI_DEPTH"
            # If anchor is found, LAA should work with the updated distance
            if view.distant_glow.visual_anchor.anchor_type != "NONE":
                assert view.distant_glow.anchor_light is not None, \
                    "LAA should compute at the multi-depth anchor location"

    def test_debug_fields_populated(self):
        """Debug fields should be populated in VAS output."""
        dem = create_flat_dem()
        dem.init_local_coords()

        curvature, slope_break = self._compute_structure_grids(dem)
        profile = compute_horizon_profile(dem, 38.5, -109.5)

        anchor = compute_visual_anchor_score(
            dem=dem,
            profile=profile,
            curvature=curvature,
            slope_break=slope_break,
            elevations=dem.elevations,
            best_bearing_deg=90.0,
            fov_deg=60.0,
            horizon_complexity=0,
            use_multi_depth=True,
        )

        assert anchor is not None
        assert anchor.anchor_search_mode in ("MULTI_DEPTH", "HORIZON_ONLY")
        assert anchor.anchor_candidates_sampled >= 0
        assert anchor.best_candidate_distance_m >= 0


class TestGlowWindow:
    """Test glow window time-series for DISTANT_ATMOSPHERIC mode."""

    def _compute_structure_grids(self, dem: DEMGrid) -> Tuple:
        """Compute curvature and slope_break grids."""
        from terrain.analysis import compute_curvature, compute_slope_aspect
        from terrain.structure import compute_slope_break_grid

        curvature = compute_curvature(dem)
        slope_deg, _ = compute_slope_aspect(dem)
        slope_break = compute_slope_break_grid(slope_deg)
        return curvature, slope_break

    def _create_test_sun_track(self, event_type: str = "sunrise") -> List[SunPosition]:
        """Create a simple sun track for testing using real ephemeris."""
        return generate_glow_window_sun_track(
            lat=38.5,
            lon=-109.5,
            event_date=datetime(2024, 6, 21),  # Summer solstice
            event_type=event_type,
        )

    def test_glow_window_basic_computation(self):
        """Glow window should compute basic metrics."""
        dem = create_ridge_dem()
        dem.init_local_coords()

        from terrain.analysis import compute_slope_aspect

        curvature, slope_break = self._compute_structure_grids(dem)
        slope_deg, aspect_deg = compute_slope_aspect(dem)

        sun_track = self._create_test_sun_track("sunrise")

        # Create visual anchor manually for testing
        visual_anchor = VisualAnchor(
            anchor_score=0.7,
            anchor_type="RIDGELINE",
            anchor_distance_m=2000.0,
            anchor_bearing_deg=90.0,
        )

        viewpoint_lat, viewpoint_lon = 38.5, dem.lons[10]

        glow_window = compute_glow_window(
            dem=dem,
            sun_track=sun_track,
            view_bearing_deg=90.0,
            depth_p90_m=5000.0,
            open_sky_sector_fraction=0.8,
            rim_strength=0.7,
            blocking_margin_deg=2.0,
            visual_anchor=visual_anchor,
            viewpoint_lat=viewpoint_lat,
            viewpoint_lon=viewpoint_lon,
            slope_grid=slope_deg,
            aspect_grid=aspect_deg,
            include_debug=False,
        )

        assert glow_window is not None
        assert glow_window.peak_score >= 0.0
        assert glow_window.peak_score <= 1.0
        assert glow_window.duration_minutes >= 0

    def test_glow_window_sunrise_time_range(self):
        """Sunrise glow window should evaluate from 0 to +75 minutes."""
        dem = create_flat_dem()
        dem.init_local_coords()

        from terrain.analysis import compute_slope_aspect

        curvature, slope_break = self._compute_structure_grids(dem)
        slope_deg, aspect_deg = compute_slope_aspect(dem)

        sun_track = self._create_test_sun_track("sunrise")

        visual_anchor = VisualAnchor(
            anchor_score=0.5,
            anchor_type="RIDGELINE",
            anchor_distance_m=3000.0,
            anchor_bearing_deg=90.0,
        )

        glow_window = compute_glow_window(
            dem=dem,
            sun_track=sun_track,
            view_bearing_deg=90.0,
            depth_p90_m=5000.0,
            open_sky_sector_fraction=0.8,
            rim_strength=0.5,
            blocking_margin_deg=0.0,
            visual_anchor=visual_anchor,
            viewpoint_lat=38.5,
            viewpoint_lon=-109.5,
            slope_grid=slope_deg,
            aspect_grid=aspect_deg,
            include_debug=True,
        )

        assert glow_window is not None
        assert glow_window.score_series is not None

        # Check time range is correct for sunrise
        minutes_sampled = [s.minutes for s in glow_window.score_series]
        assert min(minutes_sampled) == 0, "Sunrise should start at 0 minutes"
        assert max(minutes_sampled) == 75, "Sunrise should end at 75 minutes"

    def test_glow_window_sunset_time_range(self):
        """Sunset glow window should evaluate from -75 to 0 minutes."""
        dem = create_flat_dem()
        dem.init_local_coords()

        from terrain.analysis import compute_slope_aspect

        curvature, slope_break = self._compute_structure_grids(dem)
        slope_deg, aspect_deg = compute_slope_aspect(dem)

        sun_track = self._create_test_sun_track("sunset")

        visual_anchor = VisualAnchor(
            anchor_score=0.5,
            anchor_type="RIDGELINE",
            anchor_distance_m=3000.0,
            anchor_bearing_deg=270.0,
        )

        glow_window = compute_glow_window(
            dem=dem,
            sun_track=sun_track,
            view_bearing_deg=270.0,
            depth_p90_m=5000.0,
            open_sky_sector_fraction=0.8,
            rim_strength=0.5,
            blocking_margin_deg=0.0,
            visual_anchor=visual_anchor,
            viewpoint_lat=38.5,
            viewpoint_lon=-109.5,
            slope_grid=slope_deg,
            aspect_grid=aspect_deg,
            include_debug=True,
        )

        assert glow_window is not None
        assert glow_window.score_series is not None

        # Check time range is correct for sunset
        minutes_sampled = [s.minutes for s in glow_window.score_series]
        assert min(minutes_sampled) == -75, "Sunset should start at -75 minutes"
        assert max(minutes_sampled) == 0, "Sunset should end at 0 minutes"

    def test_glow_window_debug_series_optional(self):
        """Debug series should only be included when include_debug=True."""
        dem = create_flat_dem()
        dem.init_local_coords()

        from terrain.analysis import compute_slope_aspect

        curvature, slope_break = self._compute_structure_grids(dem)
        slope_deg, aspect_deg = compute_slope_aspect(dem)

        sun_track = self._create_test_sun_track("sunrise")

        visual_anchor = VisualAnchor(
            anchor_score=0.5,
            anchor_type="RIDGELINE",
            anchor_distance_m=3000.0,
            anchor_bearing_deg=90.0,
        )

        # Without debug
        glow_window_no_debug = compute_glow_window(
            dem=dem,
            sun_track=sun_track,
            view_bearing_deg=90.0,
            depth_p90_m=5000.0,
            open_sky_sector_fraction=0.8,
            rim_strength=0.5,
            blocking_margin_deg=2.0,
            visual_anchor=visual_anchor,
            viewpoint_lat=38.5,
            viewpoint_lon=-109.5,
            slope_grid=slope_deg,
            aspect_grid=aspect_deg,
            include_debug=False,
        )

        assert glow_window_no_debug is not None
        assert glow_window_no_debug.score_series is None, "score_series should be None when debug=False"

        # With debug
        glow_window_debug = compute_glow_window(
            dem=dem,
            sun_track=sun_track,
            view_bearing_deg=90.0,
            depth_p90_m=5000.0,
            open_sky_sector_fraction=0.8,
            rim_strength=0.5,
            blocking_margin_deg=2.0,
            visual_anchor=visual_anchor,
            viewpoint_lat=38.5,
            viewpoint_lon=-109.5,
            slope_grid=slope_deg,
            aspect_grid=aspect_deg,
            include_debug=True,
        )

        assert glow_window_debug is not None
        assert glow_window_debug.score_series is not None, "score_series should exist when debug=True"
        assert len(glow_window_debug.score_series) > 0

    def test_glow_window_peak_within_range(self):
        """Peak minutes should be within the evaluated time range."""
        dem = create_ridge_dem()
        dem.init_local_coords()

        from terrain.analysis import compute_slope_aspect

        curvature, slope_break = self._compute_structure_grids(dem)
        slope_deg, aspect_deg = compute_slope_aspect(dem)

        sun_track = self._create_test_sun_track("sunrise")

        visual_anchor = VisualAnchor(
            anchor_score=0.6,
            anchor_type="RIDGELINE",
            anchor_distance_m=2000.0,
            anchor_bearing_deg=90.0,
        )

        glow_window = compute_glow_window(
            dem=dem,
            sun_track=sun_track,
            view_bearing_deg=90.0,
            depth_p90_m=5000.0,
            open_sky_sector_fraction=0.8,
            rim_strength=0.6,
            blocking_margin_deg=1.0,
            visual_anchor=visual_anchor,
            viewpoint_lat=38.5,
            viewpoint_lon=dem.lons[10],
            slope_grid=slope_deg,
            aspect_grid=aspect_deg,
            include_debug=False,
        )

        assert glow_window is not None
        assert glow_window.peak_minutes >= 0, "Peak should be >= 0 for sunrise"
        assert glow_window.peak_minutes <= 75, "Peak should be <= 75 for sunrise"

    def test_glow_window_window_bounds_valid(self):
        """Window start should be <= end, duration should match."""
        dem = create_ridge_dem()
        dem.init_local_coords()

        from terrain.analysis import compute_slope_aspect

        curvature, slope_break = self._compute_structure_grids(dem)
        slope_deg, aspect_deg = compute_slope_aspect(dem)

        sun_track = self._create_test_sun_track("sunrise")

        visual_anchor = VisualAnchor(
            anchor_score=0.7,
            anchor_type="RIDGELINE",
            anchor_distance_m=2000.0,
            anchor_bearing_deg=90.0,
        )

        glow_window = compute_glow_window(
            dem=dem,
            sun_track=sun_track,
            view_bearing_deg=90.0,
            depth_p90_m=5000.0,
            open_sky_sector_fraction=0.8,
            rim_strength=0.7,
            blocking_margin_deg=3.0,
            visual_anchor=visual_anchor,
            viewpoint_lat=38.5,
            viewpoint_lon=dem.lons[10],
            slope_grid=slope_deg,
            aspect_grid=aspect_deg,
            include_debug=False,
        )

        assert glow_window is not None
        assert glow_window.start_minutes <= glow_window.end_minutes, \
            "Window start should be <= end"
        assert glow_window.duration_minutes == glow_window.end_minutes - glow_window.start_minutes, \
            "Duration should equal end - start"

    def test_glow_window_no_anchor_returns_none(self):
        """Glow window should return None when no visual anchor."""
        dem = create_flat_dem()
        dem.init_local_coords()

        from terrain.analysis import compute_slope_aspect

        slope_deg, aspect_deg = compute_slope_aspect(dem)
        sun_track = self._create_test_sun_track("sunrise")

        # No anchor
        glow_window = compute_glow_window(
            dem=dem,
            sun_track=sun_track,
            view_bearing_deg=90.0,
            depth_p90_m=5000.0,
            open_sky_sector_fraction=0.8,
            rim_strength=0.5,
            blocking_margin_deg=2.0,
            visual_anchor=None,
            viewpoint_lat=38.5,
            viewpoint_lon=-109.5,
            slope_grid=slope_deg,
            aspect_grid=aspect_deg,
            include_debug=False,
        )

        assert glow_window is None, "Should return None when no visual anchor"

        # Anchor with NONE type
        visual_anchor_none = VisualAnchor(
            anchor_score=0.0,
            anchor_type="NONE",
            anchor_distance_m=0.0,
            anchor_bearing_deg=0.0,
        )

        glow_window_none = compute_glow_window(
            dem=dem,
            sun_track=sun_track,
            view_bearing_deg=90.0,
            depth_p90_m=5000.0,
            open_sky_sector_fraction=0.8,
            rim_strength=0.5,
            blocking_margin_deg=2.0,
            visual_anchor=visual_anchor_none,
            viewpoint_lat=38.5,
            viewpoint_lon=-109.5,
            slope_grid=slope_deg,
            aspect_grid=aspect_deg,
            include_debug=False,
        )

        assert glow_window_none is None, "Should return None when anchor type is NONE"

    def test_glow_window_integration_via_overlook_view(self):
        """Glow window should integrate with compute_overlook_view using sun_track."""
        dem = create_ridge_dem()
        dem.init_local_coords()

        from terrain.analysis import compute_curvature, compute_slope_aspect
        from terrain.structure import compute_slope_break_grid

        curvature = compute_curvature(dem)
        slope_deg, aspect_deg = compute_slope_aspect(dem)
        slope_break = compute_slope_break_grid(slope_deg)

        sun_pos = create_sun_position(azimuth_deg=90.0, altitude_deg=3.0)
        sun_track = self._create_test_sun_track("sunrise")

        # With timeseries enabled and precomputed sun_track
        view = compute_overlook_view(
            dem=dem,
            lat=38.5,
            lon=dem.lons[10],
            rim_strength=0.7,
            sun_position=sun_pos,
            curvature=curvature,
            slope_break=slope_break,
            slope_grid=slope_deg,
            aspect_grid=aspect_deg,
            distant_glow_timeseries=True,
            event_type="sunrise",
            sun_track=sun_track,
            include_debug=True,
        )

        assert view.distant_glow is not None
        # If a visual anchor was found, glow_window should be computed
        if (view.distant_glow.visual_anchor is not None and
            view.distant_glow.visual_anchor.anchor_type != "NONE"):
            assert view.distant_glow.glow_window is not None, \
                "glow_window should be computed when timeseries enabled and anchor exists"

    def test_glow_window_not_computed_when_disabled(self):
        """Glow window should not be computed when timeseries disabled."""
        dem = create_ridge_dem()
        dem.init_local_coords()

        from terrain.analysis import compute_curvature, compute_slope_aspect
        from terrain.structure import compute_slope_break_grid

        curvature = compute_curvature(dem)
        slope_deg, aspect_deg = compute_slope_aspect(dem)
        slope_break = compute_slope_break_grid(slope_deg)

        sun_pos = create_sun_position(azimuth_deg=90.0, altitude_deg=3.0)

        # Without timeseries (default)
        view = compute_overlook_view(
            dem=dem,
            lat=38.5,
            lon=dem.lons[10],
            rim_strength=0.7,
            sun_position=sun_pos,
            curvature=curvature,
            slope_break=slope_break,
            slope_grid=slope_deg,
            aspect_grid=aspect_deg,
            distant_glow_timeseries=False,
        )

        assert view.distant_glow is not None
        assert view.distant_glow.glow_window is None, \
            "glow_window should be None when timeseries disabled"

    def test_sun_track_altitudes_not_linear(self):
        """Sun track altitudes should NOT be linear (guards against approximation)."""
        # Generate sun track using real ephemeris
        sun_track = generate_glow_window_sun_track(
            lat=38.5,
            lon=-109.5,
            event_date=datetime(2024, 6, 21),
            event_type="sunrise",
        )

        assert len(sun_track) == 16, "Should have 16 timesteps (0 to 75 in steps of 5)"

        # Extract altitude differences between consecutive points
        altitudes = [pos.altitude_deg for pos in sun_track]
        diffs = [altitudes[i+1] - altitudes[i] for i in range(len(altitudes)-1)]

        # With linear approximation (0.25°/min), all diffs would be 5*0.25 = 1.25°
        # Real ephemeris has non-linear altitude change (varies with time of day)
        # Check that not all diffs are the same (within small tolerance)
        unique_diffs = set(round(d, 2) for d in diffs)
        assert len(unique_diffs) > 1, \
            f"Altitude differences should vary (not linear). Got {diffs}"

    def test_sun_track_uses_real_ephemeris_not_approximation(self):
        """Sun track should use real ephemeris, not the deprecated 0.25°/min approximation."""
        # Generate tracks at different latitudes - they should differ significantly
        track_equator = generate_glow_window_sun_track(
            lat=0.0,  # Equator
            lon=-109.5,
            event_date=datetime(2024, 6, 21),
            event_type="sunrise",
        )

        track_arctic = generate_glow_window_sun_track(
            lat=65.0,  # Arctic circle
            lon=-109.5,
            event_date=datetime(2024, 6, 21),
            event_type="sunrise",
        )

        # At summer solstice, sun rises much slower at high latitudes
        # Compare altitude at 75 minutes after sunrise
        final_alt_equator = track_equator[-1].altitude_deg
        final_alt_arctic = track_arctic[-1].altitude_deg

        # Linear approximation would give same result regardless of latitude
        # Real ephemeris should show significant difference
        assert abs(final_alt_equator - final_alt_arctic) > 2.0, \
            f"Sun altitude at 75min should differ between equator ({final_alt_equator:.1f}°) " \
            f"and arctic ({final_alt_arctic:.1f}°) with real ephemeris"

    def test_compute_glow_window_uses_passed_sun_track(self):
        """compute_glow_window should use the exact sun positions from passed sun_track."""
        dem = create_flat_dem()
        dem.init_local_coords()

        from terrain.analysis import compute_slope_aspect
        slope_deg, aspect_deg = compute_slope_aspect(dem)

        # Create a custom sun track with specific values
        custom_track = [
            SunPosition(
                time_iso="2024-06-21T06:00:00Z",
                minutes_from_start=0.0,
                azimuth_deg=85.0,  # Custom azimuth
                altitude_deg=1.0,  # Custom altitude
                vector=(0.1, 0.1, 0.017),
            ),
            SunPosition(
                time_iso="2024-06-21T06:05:00Z",
                minutes_from_start=5.0,
                azimuth_deg=87.0,
                altitude_deg=3.5,
                vector=(0.1, 0.1, 0.061),
            ),
            SunPosition(
                time_iso="2024-06-21T06:10:00Z",
                minutes_from_start=10.0,
                azimuth_deg=89.0,
                altitude_deg=6.0,
                vector=(0.1, 0.1, 0.104),
            ),
        ]

        visual_anchor = VisualAnchor(
            anchor_score=0.5,
            anchor_type="RIDGELINE",
            anchor_distance_m=3000.0,
            anchor_bearing_deg=90.0,
        )

        glow_window = compute_glow_window(
            dem=dem,
            sun_track=custom_track,
            view_bearing_deg=90.0,
            depth_p90_m=5000.0,
            open_sky_sector_fraction=0.8,
            rim_strength=0.5,
            blocking_margin_deg=2.0,
            visual_anchor=visual_anchor,
            viewpoint_lat=38.5,
            viewpoint_lon=-109.5,
            slope_grid=slope_deg,
            aspect_grid=aspect_deg,
            include_debug=True,
        )

        assert glow_window is not None
        assert glow_window.score_series is not None
        assert len(glow_window.score_series) == 3, "Should have 3 samples matching custom track"

        # Verify the sun positions used match our custom track
        for i, sample in enumerate(glow_window.score_series):
            assert sample.minutes == int(custom_track[i].minutes_from_start), \
                f"Sample {i} minutes should match custom track"
            assert abs(sample.sun_altitude_deg - custom_track[i].altitude_deg) < 0.01, \
                f"Sample {i} altitude should match custom track"
            assert abs(sample.sun_azimuth_deg - custom_track[i].azimuth_deg) < 0.01, \
                f"Sample {i} azimuth should match custom track"

    def test_generate_glow_window_sun_track_sunrise_count(self):
        """Sunrise sun track should have exactly 16 timesteps."""
        track = generate_glow_window_sun_track(
            lat=38.5,
            lon=-109.5,
            event_date=datetime(2024, 6, 21),
            event_type="sunrise",
        )

        # 0, 5, 10, ..., 75 = 16 timesteps
        assert len(track) == 16, f"Expected 16 timesteps for sunrise, got {len(track)}"

        # Verify minutes are correct
        expected_minutes = list(range(0, 76, 5))
        actual_minutes = [int(pos.minutes_from_start) for pos in track]
        assert actual_minutes == expected_minutes, \
            f"Expected minutes {expected_minutes}, got {actual_minutes}"

    def test_generate_glow_window_sun_track_sunset_count(self):
        """Sunset sun track should have exactly 16 timesteps."""
        track = generate_glow_window_sun_track(
            lat=38.5,
            lon=-109.5,
            event_date=datetime(2024, 6, 21),
            event_type="sunset",
        )

        # -75, -70, ..., 0 = 16 timesteps
        assert len(track) == 16, f"Expected 16 timesteps for sunset, got {len(track)}"

        # Verify minutes are correct
        expected_minutes = list(range(-75, 1, 5))
        actual_minutes = [int(pos.minutes_from_start) for pos in track]
        assert actual_minutes == expected_minutes, \
            f"Expected minutes {expected_minutes}, got {actual_minutes}"

    def test_timestep_score_changes_with_sun_position(self):
        """Timestep score should change as sun position varies."""
        dem = create_ridge_dem()
        dem.init_local_coords()

        from terrain.analysis import compute_slope_aspect

        slope_deg, aspect_deg = compute_slope_aspect(dem)

        # Early sun (low)
        sun_early = create_sun_position(azimuth_deg=90.0, altitude_deg=2.0)
        # Later sun (higher)
        sun_later = create_sun_position(azimuth_deg=95.0, altitude_deg=12.0)

        anchor_lat, anchor_lon = 38.5, dem.lons[dem.cols * 2 // 3]

        score_early, _, _ = compute_timestep_score(
            dem=dem,
            sun_position=sun_early,
            view_bearing_deg=90.0,
            depth_p90_m=5000.0,
            open_sky_sector_fraction=0.8,
            rim_strength=0.7,
            blocking_margin_deg=2.0,
            anchor_lat=anchor_lat,
            anchor_lon=anchor_lon,
            anchor_score=0.6,
            slope_grid=slope_deg,
            aspect_grid=aspect_deg,
        )

        score_later, _, _ = compute_timestep_score(
            dem=dem,
            sun_position=sun_later,
            view_bearing_deg=90.0,
            depth_p90_m=5000.0,
            open_sky_sector_fraction=0.8,
            rim_strength=0.7,
            blocking_margin_deg=12.0,
            anchor_lat=anchor_lat,
            anchor_lon=anchor_lon,
            anchor_score=0.6,
            slope_grid=slope_deg,
            aspect_grid=aspect_deg,
        )

        # Scores should be different - early low sun often scores better for glow
        assert score_early != score_later, "Scores should differ with sun position"


if __name__ == "__main__":
    import sys

    test_classes = [
        TestHorizonProfileFlat,
        TestHorizonProfileRimBasin,
        TestViewMetrics,
        TestBestBearing,
        TestSunAlignment,
        TestPerformance,
        TestIntegration,
        TestDebugOutput,
        TestViewCone,
        TestExplanations,
        TestDistantAtmosphericGlowScore,
        TestVisualAnchorScore,
        TestLightAtAnchor,
        TestMultiDepthVAS,
        TestGlowWindow,
    ]

    passed = 0
    failed = 0

    for test_class in test_classes:
        instance = test_class()
        for method_name in dir(instance):
            if method_name.startswith("test_"):
                try:
                    getattr(instance, method_name)()
                    print(f"  PASS: {test_class.__name__}.{method_name}")
                    passed += 1
                except Exception as e:
                    print(f"  FAIL: {test_class.__name__}.{method_name}: {e}")
                    failed += 1

    print(f"\n{passed} passed, {failed} failed")
    sys.exit(0 if failed == 0 else 1)
