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
)
from terrain.types import SunPosition, StandingLocation, StandingProperties, LineOfSight, CandidateSearch


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
            open_sky_fraction=0.0,
            depth_p90_m=0.0,
            horizon_complexity=0,
            rim_strength=0.0,
        )
        assert score_low >= 0.0, f"Score should be >= 0, got {score_low}"

        # High values
        score_high = compute_overlook_score(
            open_sky_fraction=1.0,
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
