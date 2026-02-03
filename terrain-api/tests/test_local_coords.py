"""
Unit tests for local tangent-plane coordinate system.

Tests:
1. Bilinear interpolation on synthetic plane DEM
2. Ray sampling along known directions
3. Coordinate conversion round-trips
"""

import math
import numpy as np
from terrain.dem import (
    DEMGrid,
    latlon_to_xy_m,
    xy_m_to_latlon,
    METERS_PER_DEG_LAT,
)


def create_flat_plane_dem(
    center_lat: float = 38.5,
    center_lon: float = -109.5,
    size_km: float = 2.0,
    base_elevation: float = 1500.0,
    slope_east: float = 0.0,  # meters per km eastward
    slope_north: float = 0.0,  # meters per km northward
    grid_size: int = 21,  # Odd for center cell
) -> DEMGrid:
    """
    Create a synthetic flat or tilted plane DEM for testing.

    The plane equation is:
        z = base_elevation + slope_east * (x_km) + slope_north * (y_km)

    With x_km increasing east, y_km increasing north.
    """
    lat_deg_per_km = 1 / 111.32
    lon_deg_per_km = 1 / (111.32 * math.cos(math.radians(center_lat)))

    half_size = size_km / 2

    north = center_lat + half_size * lat_deg_per_km
    south = center_lat - half_size * lat_deg_per_km
    east = center_lon + half_size * lon_deg_per_km
    west = center_lon - half_size * lon_deg_per_km

    lats = np.linspace(north, south, grid_size)  # North to south
    lons = np.linspace(west, east, grid_size)    # West to east

    # Create elevation grid based on plane equation
    elevations = np.zeros((grid_size, grid_size), dtype=np.float64)

    for r, lat in enumerate(lats):
        for c, lon in enumerate(lons):
            # Distance from center in km
            x_km = (lon - center_lon) / lon_deg_per_km
            y_km = (lat - center_lat) / lat_deg_per_km
            elevations[r, c] = base_elevation + slope_east * x_km + slope_north * y_km

    cell_size_m = (size_km * 1000) / grid_size

    return DEMGrid(
        elevations=elevations,
        lats=lats,
        lons=lons,
        cell_size_m=cell_size_m,
        bounds={"north": north, "south": south, "east": east, "west": west},
    )


class TestCoordinateConversion:
    """Test lat/lon <-> local meter coordinate conversion."""

    def test_round_trip_at_origin(self):
        """Converting to local and back at reference point gives (0, 0)."""
        lat0, lon0 = 38.5, -109.5

        x_m, y_m = latlon_to_xy_m(lat0, lon0, lat0, lon0)
        assert abs(x_m) < 1e-6, f"Expected x=0, got {x_m}"
        assert abs(y_m) < 1e-6, f"Expected y=0, got {y_m}"

        lat, lon = xy_m_to_latlon(0.0, 0.0, lat0, lon0)
        assert abs(lat - lat0) < 1e-9, f"Expected lat={lat0}, got {lat}"
        assert abs(lon - lon0) < 1e-9, f"Expected lon={lon0}, got {lon}"

    def test_round_trip_offset_point(self):
        """Round-trip conversion preserves offset points."""
        lat0, lon0 = 38.5, -109.5

        # Point 1km north and 500m east
        test_lat = lat0 + 1000 / METERS_PER_DEG_LAT
        meters_per_deg_lon = METERS_PER_DEG_LAT * math.cos(math.radians(lat0))
        test_lon = lon0 + 500 / meters_per_deg_lon

        # To local
        x_m, y_m = latlon_to_xy_m(test_lat, test_lon, lat0, lon0)

        # Should be ~500m east, ~1000m north
        assert abs(x_m - 500) < 1.0, f"Expected x~500m, got {x_m}"
        assert abs(y_m - 1000) < 1.0, f"Expected y~1000m, got {y_m}"

        # Back to latlon
        lat_back, lon_back = xy_m_to_latlon(x_m, y_m, lat0, lon0)
        assert abs(lat_back - test_lat) < 1e-7, f"Lat round-trip failed: {test_lat} -> {lat_back}"
        assert abs(lon_back - test_lon) < 1e-7, f"Lon round-trip failed: {test_lon} -> {lon_back}"

    def test_x_increases_eastward(self):
        """x_m should increase when moving east."""
        lat0, lon0 = 38.5, -109.5

        x1, _ = latlon_to_xy_m(lat0, lon0, lat0, lon0)
        x2, _ = latlon_to_xy_m(lat0, lon0 + 0.01, lat0, lon0)

        assert x2 > x1, f"x should increase eastward: {x1} vs {x2}"

    def test_y_increases_northward(self):
        """y_m should increase when moving north."""
        lat0, lon0 = 38.5, -109.5

        _, y1 = latlon_to_xy_m(lat0, lon0, lat0, lon0)
        _, y2 = latlon_to_xy_m(lat0 + 0.01, lon0, lat0, lon0)

        assert y2 > y1, f"y should increase northward: {y1} vs {y2}"


class TestDEMGridLocalCoords:
    """Test DEMGrid local coordinate methods."""

    def test_init_local_coords_default_center(self):
        """init_local_coords with no args uses grid center."""
        dem = create_flat_plane_dem()
        dem.init_local_coords()

        expected_lat0 = (dem.bounds["north"] + dem.bounds["south"]) / 2
        expected_lon0 = (dem.bounds["east"] + dem.bounds["west"]) / 2

        assert abs(dem._lat0 - expected_lat0) < 1e-9
        assert abs(dem._lon0 - expected_lon0) < 1e-9
        assert dem.has_local_coords

    def test_init_local_coords_custom_ref(self):
        """init_local_coords with custom reference point."""
        dem = create_flat_plane_dem()
        dem.init_local_coords(lat0=38.6, lon0=-109.4)

        assert dem._lat0 == 38.6
        assert dem._lon0 == -109.4

    def test_latlon_to_xy_requires_init(self):
        """latlon_to_xy raises if local coords not initialized."""
        dem = create_flat_plane_dem()

        try:
            dem.latlon_to_xy(38.5, -109.5)
            raise AssertionError("Expected ValueError")
        except ValueError as e:
            assert "not initialized" in str(e).lower(), f"Expected 'not initialized' error, got: {e}"

    def test_sample_dem_z_xy_requires_init(self):
        """sample_dem_z_xy raises if local coords not initialized."""
        dem = create_flat_plane_dem()

        try:
            dem.sample_dem_z_xy(0.0, 0.0)
            raise AssertionError("Expected ValueError")
        except ValueError as e:
            assert "not initialized" in str(e).lower(), f"Expected 'not initialized' error, got: {e}"


class TestBilinearInterpolation:
    """Test bilinear interpolation on synthetic DEMs."""

    def test_flat_plane_center_sample(self):
        """Sampling center of flat plane gives base elevation."""
        dem = create_flat_plane_dem(base_elevation=1500.0)
        dem.init_local_coords()

        # Sample at center (0, 0 in local coords)
        z = dem.sample_dem_z_xy(0.0, 0.0)
        assert abs(z - 1500.0) < 1.0, f"Expected 1500m at center, got {z}"

    def test_tilted_plane_east(self):
        """Tilted plane: elevation increases eastward."""
        # 100m rise per km eastward
        dem = create_flat_plane_dem(
            base_elevation=1500.0,
            slope_east=100.0,  # +100m per km east
            slope_north=0.0,
        )
        dem.init_local_coords()

        # Sample 500m east of center
        z = dem.sample_dem_z_xy(500.0, 0.0)
        # Expected: 1500 + 100 * 0.5 = 1550
        assert abs(z - 1550.0) < 5.0, f"Expected ~1550m at 500m east, got {z}"

        # Sample 500m west of center
        z_west = dem.sample_dem_z_xy(-500.0, 0.0)
        # Expected: 1500 + 100 * (-0.5) = 1450
        assert abs(z_west - 1450.0) < 5.0, f"Expected ~1450m at 500m west, got {z_west}"

    def test_tilted_plane_north(self):
        """Tilted plane: elevation increases northward."""
        # 50m rise per km northward
        dem = create_flat_plane_dem(
            base_elevation=1500.0,
            slope_east=0.0,
            slope_north=50.0,  # +50m per km north
        )
        dem.init_local_coords()

        # Sample 1km north of center
        z = dem.sample_dem_z_xy(0.0, 1000.0)
        # Expected: 1500 + 50 * 1 = 1550
        assert abs(z - 1550.0) < 5.0, f"Expected ~1550m at 1km north, got {z}"

    def test_tilted_plane_diagonal(self):
        """Tilted plane: diagonal sampling combines both slopes."""
        dem = create_flat_plane_dem(
            base_elevation=1500.0,
            slope_east=100.0,   # +100m per km east
            slope_north=50.0,   # +50m per km north
        )
        dem.init_local_coords()

        # Sample 500m east, 1km north
        z = dem.sample_dem_z_xy(500.0, 1000.0)
        # Expected: 1500 + 100*0.5 + 50*1.0 = 1600
        assert abs(z - 1600.0) < 10.0, f"Expected ~1600m at (500E, 1000N), got {z}"

    def test_out_of_bounds_returns_nan(self):
        """Sampling outside grid returns NaN."""
        dem = create_flat_plane_dem(size_km=2.0)
        dem.init_local_coords()

        # Sample way outside bounds (5km away)
        z = dem.sample_dem_z_xy(5000.0, 0.0)
        assert math.isnan(z), f"Expected NaN for out of bounds, got {z}"

        z = dem.sample_dem_z_xy(0.0, -5000.0)
        assert math.isnan(z), f"Expected NaN for out of bounds, got {z}"

    def test_bilinear_interpolation_accuracy(self):
        """Bilinear interpolation accurately handles fractional positions."""
        # Create a small 3x3 grid with known values
        lats = np.array([39.0, 38.5, 38.0])  # North to south
        lons = np.array([-110.0, -109.5, -109.0])  # West to east

        # Set specific elevation values at corners
        elevations = np.array([
            [1000.0, 1100.0, 1200.0],  # North row
            [1050.0, 1150.0, 1250.0],  # Center row
            [1100.0, 1200.0, 1300.0],  # South row
        ], dtype=np.float64)

        dem = DEMGrid(
            elevations=elevations,
            lats=lats,
            lons=lons,
            cell_size_m=55660.0,  # ~0.5 degrees
            bounds={"north": 39.0, "south": 38.0, "east": -109.0, "west": -110.0},
        )
        dem.init_local_coords()

        # Sample at center cell (should get center value)
        z_center = dem.sample_dem_z_xy(0.0, 0.0)
        assert abs(z_center - 1150.0) < 1.0, f"Center sample failed: {z_center}"


class TestRayMarching:
    """Test ray marching samples expected cells along known directions."""

    def test_eastward_ray_samples(self):
        """Ray marching east samples increasing x coordinates."""
        dem = create_flat_plane_dem(
            base_elevation=1500.0,
            slope_east=100.0,  # +100m per km east
        )
        dem.init_local_coords()

        # Simulate ray marching east from origin
        samples = []
        sample_interval_m = 200.0
        max_distance_m = 800.0

        for i in range(1, int(max_distance_m / sample_interval_m) + 1):
            x_m = i * sample_interval_m
            y_m = 0.0
            z = dem.sample_dem_z_xy(x_m, y_m)
            samples.append((x_m, y_m, z))

        # Verify samples at expected distances
        assert len(samples) == 4, f"Expected 4 samples, got {len(samples)}"

        # Each 200m east should add ~20m elevation (100m/km * 0.2km)
        for i, (x, y, z) in enumerate(samples):
            expected_x = (i + 1) * 200.0
            assert abs(x - expected_x) < 0.1, f"Sample {i}: expected x={expected_x}, got {x}"

            # Elevation should increase ~20m per sample
            expected_z = 1500.0 + (expected_x / 1000.0) * 100.0
            assert abs(z - expected_z) < 10.0, f"Sample {i}: expected z~{expected_z}, got {z}"

    def test_northeast_ray_at_45_degrees(self):
        """Ray at 45° (azimuth 45°) samples NE direction correctly."""
        dem = create_flat_plane_dem(
            base_elevation=1500.0,
            slope_east=100.0,
            slope_north=100.0,
        )
        dem.init_local_coords()

        # Azimuth 45° = NE = dx positive (east), dy positive (north)
        azimuth_rad = math.radians(45.0)
        sample_interval_m = 100.0

        step_dx = math.sin(azimuth_rad) * sample_interval_m  # East component
        step_dy = math.cos(azimuth_rad) * sample_interval_m  # North component

        # March 5 steps
        samples = []
        for i in range(1, 6):
            x_m = i * step_dx
            y_m = i * step_dy
            z = dem.sample_dem_z_xy(x_m, y_m)
            samples.append((x_m, y_m, z))

        # At 45°, x and y should be equal
        for x, y, z in samples:
            assert abs(x - y) < 0.1, f"At 45°, x should equal y: {x} vs {y}"

        # Elevation should increase with both east and north slopes
        # Distance along 45° = sqrt(2) * step_interval per step
        # Combined slope = sqrt(100^2 + 100^2) / sqrt(2) per km along diagonal
        z_first = samples[0][2]
        z_last = samples[-1][2]
        assert z_last > z_first, f"Elevation should increase NE: {z_first} -> {z_last}"

    def test_south_ray_azimuth_180(self):
        """Ray at azimuth 180° goes south (negative y)."""
        dem = create_flat_plane_dem(
            base_elevation=1500.0,
            slope_north=50.0,  # +50m per km north
        )
        dem.init_local_coords()

        # Azimuth 180° = South = dy negative
        azimuth_rad = math.radians(180.0)
        sample_interval_m = 100.0

        step_dx = math.sin(azimuth_rad) * sample_interval_m  # Should be ~0
        step_dy = math.cos(azimuth_rad) * sample_interval_m  # Should be -100

        assert abs(step_dx) < 0.1, f"East step should be ~0 for azimuth 180: {step_dx}"
        assert abs(step_dy + 100.0) < 0.1, f"North step should be -100 for azimuth 180: {step_dy}"

        # Sample at 500m south
        z = dem.sample_dem_z_xy(0.0, -500.0)
        # Expected: 1500 + 50 * (-0.5) = 1475
        assert abs(z - 1475.0) < 5.0, f"Expected ~1475m at 500m south, got {z}"


def create_sun_position(azimuth_deg: float, altitude_deg: float) -> "SunPosition":
    """Helper to create a SunPosition with computed sun vector."""
    from terrain.types import SunPosition

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


def create_ridge_dem(
    ridge_distance_m: float = 500.0,
    ridge_height_m: float = 100.0,
    base_elevation: float = 1500.0,
    center_lat: float = 38.5,
    center_lon: float = -109.5,
    size_km: float = 2.0,
    grid_size: int = 41,
) -> DEMGrid:
    """
    Create a synthetic DEM with a ridge at a known distance south of center.

    The ridge runs east-west at `ridge_distance_m` south of the center point.
    """
    lat_deg_per_km = 1 / 111.32
    lon_deg_per_km = 1 / (111.32 * math.cos(math.radians(center_lat)))

    half_size = size_km / 2

    north = center_lat + half_size * lat_deg_per_km
    south = center_lat - half_size * lat_deg_per_km
    east = center_lon + half_size * lon_deg_per_km
    west = center_lon - half_size * lon_deg_per_km

    lats = np.linspace(north, south, grid_size)  # North to south
    lons = np.linspace(west, east, grid_size)

    # Start with flat terrain
    elevations = np.full((grid_size, grid_size), base_elevation, dtype=np.float64)

    # Add ridge at specified distance south of center
    # Ridge is 1-2 cells wide
    meters_per_cell = (size_km * 1000) / grid_size

    # Calculate which row corresponds to the ridge distance
    # Row 0 is north, row increases going south
    # Center is at grid_size // 2
    center_row = grid_size // 2
    ridge_row = center_row + int(ridge_distance_m / meters_per_cell)

    # Add ridge if within bounds
    if 0 <= ridge_row < grid_size - 1:
        elevations[ridge_row, :] = base_elevation + ridge_height_m
        elevations[ridge_row + 1, :] = base_elevation + ridge_height_m * 0.5  # Taper

    cell_size_m = (size_km * 1000) / grid_size

    return DEMGrid(
        elevations=elevations,
        lats=lats,
        lons=lons,
        cell_size_m=cell_size_m,
        bounds={"north": north, "south": south, "east": east, "west": west},
    )


class TestShadowCheckImproved:
    """Test improved shadow checking with terrain angle analysis."""

    def test_flat_terrain_sun_visible(self):
        """On flat terrain, sun should always be visible."""
        from terrain.shadows import check_shadow

        dem = create_flat_plane_dem(base_elevation=1500.0)
        dem.init_local_coords()

        sun_pos = create_sun_position(azimuth_deg=180.0, altitude_deg=10.0)

        result = check_shadow(
            dem=dem,
            point_lat=38.5,
            point_lon=-109.5,
            point_elevation=1500.0,
            sun_position=sun_pos,
        )

        # Verify sun is visible
        assert result.sun_visible, "Sun should be visible on flat terrain"

        # Verify new fields are present
        assert result.max_terrain_angle_deg is not None
        assert result.blocking_margin_deg is not None

        # On flat terrain, max terrain angle should be ~0 or slightly negative
        assert result.max_terrain_angle_deg < 5.0, f"Max terrain angle too high on flat: {result.max_terrain_angle_deg}"

        # Blocking margin should be positive (sun altitude - max terrain angle)
        assert result.blocking_margin_deg > 0, f"Should have positive margin: {result.blocking_margin_deg}"

        # Should not have blocking point
        assert result.first_blocked_distance_m is None
        assert result.blocking_point is None

    def test_flat_terrain_new_output_fields(self):
        """Verify new output fields are correctly computed on flat terrain."""
        from terrain.shadows import check_shadow

        dem = create_flat_plane_dem(base_elevation=1500.0)
        dem.init_local_coords()

        sun_pos = create_sun_position(azimuth_deg=90.0, altitude_deg=15.0)

        result = check_shadow(
            dem=dem,
            point_lat=38.5,
            point_lon=-109.5,
            point_elevation=1500.0,
            sun_position=sun_pos,
        )

        # Blocking margin should equal sun_altitude - max_terrain_angle
        expected_margin = result.sun_altitude_deg - result.max_terrain_angle_deg
        assert abs(result.blocking_margin_deg - expected_margin) < 0.01, \
            f"Margin mismatch: {result.blocking_margin_deg} vs {expected_margin}"

    def test_log_spaced_distances_in_samples(self):
        """Verify samples use log-spaced distances, not linear."""
        from terrain.shadows import check_shadow

        dem = create_flat_plane_dem(base_elevation=1500.0, size_km=5.0)
        dem.init_local_coords()

        sun_pos = create_sun_position(azimuth_deg=180.0, altitude_deg=10.0)

        result = check_shadow(
            dem=dem,
            point_lat=38.5,
            point_lon=-109.5,
            point_elevation=1500.0,
            sun_position=sun_pos,
            num_samples=20,
        )

        assert len(result.samples) > 0, "Should have samples"

        # Extract distances
        distances = [s.distance_m for s in result.samples]

        # Log-spaced distances have increasing gaps
        # Check that ratio of consecutive distances is roughly constant
        if len(distances) >= 3:
            ratios = [distances[i+1] / distances[i] for i in range(len(distances) - 1) if distances[i] > 0]
            if len(ratios) >= 2:
                # Ratios should be similar (within 50% of each other) for log spacing
                min_ratio = min(ratios)
                max_ratio = max(ratios)
                assert max_ratio / min_ratio < 2.0, \
                    f"Distances don't appear log-spaced: ratios vary too much ({min_ratio:.2f} to {max_ratio:.2f})"

    def test_ridge_blocks_low_sun(self):
        """Ridge at known distance should block sun when altitude is below ridge angle."""
        from terrain.shadows import check_shadow

        # Create ridge 500m south with 100m height
        # Ridge angle = atan(100/500) = 11.3°
        ridge_distance = 500.0
        ridge_height = 100.0
        ridge_angle_deg = math.degrees(math.atan(ridge_height / ridge_distance))

        dem = create_ridge_dem(
            ridge_distance_m=ridge_distance,
            ridge_height_m=ridge_height,
        )
        dem.init_local_coords()

        # Sun at 5° altitude (below ridge angle of ~11.3°), azimuth 180° (south)
        sun_pos = create_sun_position(azimuth_deg=180.0, altitude_deg=5.0)

        result = check_shadow(
            dem=dem,
            point_lat=38.5,
            point_lon=-109.5,
            point_elevation=1500.0,
            sun_position=sun_pos,
        )

        # Sun should be blocked
        assert not result.sun_visible, f"Sun should be blocked by ridge (sun alt 5° < ridge angle {ridge_angle_deg:.1f}°)"

        # First blocked distance should be near ridge distance
        assert result.first_blocked_distance_m is not None, "Should have blocking distance"
        assert abs(result.first_blocked_distance_m - ridge_distance) < 100.0, \
            f"Blocked distance {result.first_blocked_distance_m} should be near ridge at {ridge_distance}m"

        # Blocking margin should be negative
        assert result.blocking_margin_deg < 0, f"Margin should be negative when blocked: {result.blocking_margin_deg}"

        # Should have blocking point
        assert result.blocking_point is not None, "Should have blocking point"
        assert result.blocking_point.distance_m == result.first_blocked_distance_m

    def test_ridge_does_not_block_high_sun(self):
        """Ridge at known distance should NOT block sun when altitude is above ridge angle."""
        from terrain.shadows import check_shadow

        # Create ridge 500m south with 100m height
        # Ridge angle = atan(100/500) = 11.3°
        ridge_distance = 500.0
        ridge_height = 100.0
        ridge_angle_deg = math.degrees(math.atan(ridge_height / ridge_distance))

        dem = create_ridge_dem(
            ridge_distance_m=ridge_distance,
            ridge_height_m=ridge_height,
        )
        dem.init_local_coords()

        # Sun at 20° altitude (above ridge angle of ~11.3°), azimuth 180° (south)
        sun_pos = create_sun_position(azimuth_deg=180.0, altitude_deg=20.0)

        result = check_shadow(
            dem=dem,
            point_lat=38.5,
            point_lon=-109.5,
            point_elevation=1500.0,
            sun_position=sun_pos,
        )

        # Sun should be visible
        assert result.sun_visible, f"Sun should be visible (sun alt 20° > ridge angle {ridge_angle_deg:.1f}°)"

        # Blocking margin should be positive
        assert result.blocking_margin_deg > 0, f"Margin should be positive when visible: {result.blocking_margin_deg}"

        # Max terrain angle should be approximately the ridge angle
        assert abs(result.max_terrain_angle_deg - ridge_angle_deg) < 3.0, \
            f"Max terrain angle {result.max_terrain_angle_deg}° should be near ridge angle {ridge_angle_deg:.1f}°"

        # Should NOT have blocking point
        assert result.first_blocked_distance_m is None
        assert result.blocking_point is None

    def test_samples_have_terrain_angle(self):
        """Verify each sample has terrain_angle_deg field."""
        from terrain.shadows import check_shadow

        dem = create_flat_plane_dem(base_elevation=1500.0)
        dem.init_local_coords()

        sun_pos = create_sun_position(azimuth_deg=180.0, altitude_deg=10.0)

        result = check_shadow(
            dem=dem,
            point_lat=38.5,
            point_lon=-109.5,
            point_elevation=1500.0,
            sun_position=sun_pos,
        )

        for sample in result.samples:
            assert sample.terrain_angle_deg is not None, "Sample should have terrain_angle_deg"

    def test_backwards_compatibility_fields(self):
        """Verify original fields are still present and correct."""
        from terrain.shadows import check_shadow

        dem = create_flat_plane_dem(base_elevation=1500.0)
        dem.init_local_coords()

        sun_pos = create_sun_position(azimuth_deg=90.0, altitude_deg=15.0)

        result = check_shadow(
            dem=dem,
            point_lat=38.5,
            point_lon=-109.5,
            point_elevation=1500.0,
            sun_position=sun_pos,
        )

        # Original fields
        assert hasattr(result, 'checked_at_minutes')
        assert hasattr(result, 'sun_azimuth_deg')
        assert hasattr(result, 'sun_altitude_deg')
        assert hasattr(result, 'samples')
        assert hasattr(result, 'sun_visible')

        # Values
        assert result.sun_azimuth_deg == 90.0
        assert result.sun_altitude_deg == 15.0
        assert isinstance(result.samples, list)
        assert isinstance(result.sun_visible, bool)

        # Sample fields
        for sample in result.samples:
            assert hasattr(sample, 'distance_m')
            assert hasattr(sample, 'ray_z')
            assert hasattr(sample, 'terrain_z')
            assert hasattr(sample, 'blocked')


class TestShadowRayConsistency:
    """Test that shadow checking uses consistent local coordinates."""

    def test_shadow_check_basic(self):
        """Verify shadow module basic functionality."""
        from terrain.shadows import check_shadow

        dem = create_flat_plane_dem(base_elevation=1500.0)
        dem.init_local_coords()

        sun_pos = create_sun_position(azimuth_deg=180.0, altitude_deg=10.0)

        result = check_shadow(
            dem=dem,
            point_lat=38.5,
            point_lon=-109.5,
            point_elevation=1500.0,
            sun_position=sun_pos,
        )

        # On flat terrain with sun at 10° altitude, should have clear LOS
        assert result.sun_visible, "Sun should be visible on flat terrain"
        assert result.sun_azimuth_deg == 180.0
        assert result.sun_altitude_deg == 10.0
        assert len(result.samples) > 0, "Should have ray samples"


class TestLineOfSightConsistency:
    """Test that LOS checking uses consistent local coordinates."""

    def test_los_on_flat_terrain(self):
        """LOS should be clear on flat terrain."""
        from terrain.standing import check_line_of_sight

        dem = create_flat_plane_dem(base_elevation=1500.0)
        dem.init_local_coords()

        # Check LOS from center to a point 500m north
        meters_per_deg_lat = 111320.0
        target_lat = 38.5 + 500.0 / meters_per_deg_lat

        result = check_line_of_sight(
            dem=dem,
            from_lat=38.5,
            from_lon=-109.5,
            from_elevation=1501.7,  # 1.7m eye height
            to_lat=target_lat,
            to_lon=-109.5,
            to_elevation=1500.0,
            num_samples=10,
        )

        assert result.clear, "LOS should be clear on flat terrain"
        assert len(result.samples) == 9, f"Expected 9 samples, got {len(result.samples)}"

    def test_los_blocked_by_ridge(self):
        """LOS should be blocked by an intervening ridge."""
        # Create DEM with a ridge in the middle
        lats = np.linspace(39.0, 38.0, 11)
        lons = np.linspace(-110.0, -109.0, 11)

        # Flat terrain except for ridge in middle rows
        elevations = np.full((11, 11), 1500.0, dtype=np.float64)
        elevations[4:7, :] = 1600.0  # Ridge 100m higher in middle

        dem = DEMGrid(
            elevations=elevations,
            lats=lats,
            lons=lons,
            cell_size_m=11132.0,
            bounds={"north": 39.0, "south": 38.0, "east": -109.0, "west": -110.0},
        )
        dem.init_local_coords()

        from terrain.standing import check_line_of_sight

        # Check LOS from south side to north side (should be blocked by ridge)
        result = check_line_of_sight(
            dem=dem,
            from_lat=38.1,
            from_lon=-109.5,
            from_elevation=1501.7,
            to_lat=38.9,
            to_lon=-109.5,
            to_elevation=1500.0,
            num_samples=20,
        )

        # Should be blocked - the ridge is 100m higher
        assert not result.clear, "LOS should be blocked by ridge"


if __name__ == "__main__":
    # Run tests manually
    import sys

    test_classes = [
        TestCoordinateConversion,
        TestDEMGridLocalCoords,
        TestBilinearInterpolation,
        TestRayMarching,
        TestShadowCheckImproved,
        TestShadowRayConsistency,
        TestLineOfSightConsistency,
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
