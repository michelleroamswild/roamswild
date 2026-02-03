"""
Tests for cell-based rim overlook candidate detection.

Tests the parallel path for overlook discovery:
1. Per-cell rim mask computation
2. Non-maximum suppression for candidate extraction
3. Spatial deduplication of results
"""
import numpy as np
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from terrain.structure import (
    compute_rim_candidate_mask,
    compute_rim_strength_grid,
    extract_rim_candidates_nms,
    RimCandidate,
)
from terrain.view import (
    rim_candidates_to_standing_locations,
    deduplicate_overlooks_spatially,
    generate_rim_overlook_standings,
)


class MockDEMGrid:
    """Mock DEM grid for testing."""

    def __init__(self, rows=50, cols=50, cell_size_m=30.0):
        self.rows = rows
        self.cols = cols
        self.cell_size_m = cell_size_m
        self.elevations = np.zeros((rows, cols))
        self.bounds = {
            "north": 38.0 + rows * cell_size_m / 111320,
            "south": 38.0,
            "east": -109.0 + cols * cell_size_m / (111320 * np.cos(np.radians(38.0))),
            "west": -109.0,
        }
        self._has_local_coords = False

    @property
    def has_local_coords(self):
        return self._has_local_coords

    def init_local_coords(self):
        self._has_local_coords = True
        self._center_lat = (self.bounds["north"] + self.bounds["south"]) / 2
        self._center_lon = (self.bounds["east"] + self.bounds["west"]) / 2

    def indices_to_lat_lon(self, row, col):
        lat = self.bounds["north"] - row * self.cell_size_m / 111320
        lon = self.bounds["west"] + col * self.cell_size_m / (111320 * np.cos(np.radians(38.0)))
        return lat, lon

    def latlon_to_xy(self, lat, lon):
        if not self._has_local_coords:
            self.init_local_coords()
        x = (lon - self._center_lon) * 111320 * np.cos(np.radians(lat))
        y = (lat - self._center_lat) * 111320
        return x, y

    def xy_to_latlon(self, x, y):
        if not self._has_local_coords:
            self.init_local_coords()
        lat = self._center_lat + y / 111320
        lon = self._center_lon + x / (111320 * np.cos(np.radians(lat)))
        return lat, lon

    def sample_dem_z_xy(self, x, y):
        # Convert x, y back to indices and sample
        lat, lon = self.xy_to_latlon(x, y)
        row = int((self.bounds["north"] - lat) / (self.cell_size_m / 111320))
        col = int((lon - self.bounds["west"]) / (self.cell_size_m / (111320 * np.cos(np.radians(38.0)))))
        if 0 <= row < self.rows and 0 <= col < self.cols:
            return self.elevations[row, col]
        return float('nan')

    @property
    def grid_diagonal_m(self):
        return np.sqrt(2) * max(self.rows, self.cols) * self.cell_size_m


# =============================================================================
# Test Per-Cell Rim Mask
# =============================================================================

def test_rim_mask_basic():
    """Test basic rim mask computation."""
    # Create TPI grid with some high values
    tpi_large = np.zeros((50, 50))
    tpi_large[10:15, 10:15] = 20.0  # High TPI region (rim)
    tpi_large[30:35, 30:35] = -20.0  # Low TPI region (basin)

    # Flat slope everywhere
    slope_deg = np.ones((50, 50)) * 10.0

    # Compute mask
    mask = compute_rim_candidate_mask(tpi_large, slope_deg, tpi_threshold_m=12.0, slope_max_deg=25.0)

    # High TPI region should be True
    assert np.all(mask[10:15, 10:15]), "High TPI region should pass mask"
    # Low TPI region should be False
    assert not np.any(mask[30:35, 30:35]), "Low TPI region should not pass mask"
    # Other areas should be False
    assert not np.any(mask[0:5, 0:5]), "Low TPI areas should not pass mask"


def test_rim_mask_slope_filter():
    """Test that steep slopes are excluded from rim mask."""
    tpi_large = np.ones((50, 50)) * 20.0  # All high TPI
    slope_deg = np.ones((50, 50)) * 10.0  # Moderate slope

    # Make one region too steep
    slope_deg[20:25, 20:25] = 30.0

    mask = compute_rim_candidate_mask(tpi_large, slope_deg, tpi_threshold_m=12.0, slope_max_deg=25.0)

    # Steep region should be False
    assert not np.any(mask[20:25, 20:25]), "Steep slopes should be excluded"
    # Other areas should be True (high TPI, reasonable slope)
    assert np.all(mask[0:10, 0:10]), "Moderate slopes should pass"


def test_rim_mask_threshold_tuning():
    """Test different TPI thresholds."""
    tpi_large = np.linspace(0, 30, 50).reshape(1, -1).repeat(50, axis=0)  # Gradient 0-30m
    slope_deg = np.ones((50, 50)) * 10.0

    # Strict threshold
    mask_strict = compute_rim_candidate_mask(tpi_large, slope_deg, tpi_threshold_m=20.0)
    # Permissive threshold
    mask_permissive = compute_rim_candidate_mask(tpi_large, slope_deg, tpi_threshold_m=10.0)

    strict_count = np.sum(mask_strict)
    permissive_count = np.sum(mask_permissive)

    assert permissive_count > strict_count, "Permissive threshold should pass more cells"


# =============================================================================
# Test Rim Strength Grid
# =============================================================================

def test_rim_strength_grid():
    """Test rim strength computation from TPI."""
    tpi_large = np.array([
        [-20, 0, 20],
        [0, 50, 0],
        [10, 0, -10],
    ], dtype=float)

    strength = compute_rim_strength_grid(tpi_large, normalization_m=50.0)

    # Negative TPI should have 0 strength
    assert strength[0, 0] == 0.0, "Negative TPI should have 0 strength"
    assert strength[2, 2] == 0.0, "Negative TPI should have 0 strength"

    # Zero TPI should have 0 strength
    assert strength[0, 1] == 0.0, "Zero TPI should have 0 strength"

    # Positive TPI should have proportional strength
    assert strength[0, 2] == 20.0 / 50.0, "20m TPI should give 0.4 strength"
    assert strength[1, 1] == 1.0, "50m TPI should give 1.0 strength (clamped)"
    assert strength[2, 0] == 10.0 / 50.0, "10m TPI should give 0.2 strength"


# =============================================================================
# Test Non-Maximum Suppression
# =============================================================================

def test_nms_single_peak():
    """Test NMS with a single clear peak."""
    dem = MockDEMGrid(50, 50)
    dem.elevations = np.ones((50, 50)) * 1000

    tpi_large = np.zeros((50, 50))
    tpi_large[25, 25] = 30.0  # Single peak

    rim_mask = tpi_large > 12.0
    rim_strength = compute_rim_strength_grid(tpi_large)
    slope_deg = np.ones((50, 50)) * 10.0

    candidates = extract_rim_candidates_nms(
        rim_mask=rim_mask,
        rim_strength=rim_strength,
        tpi_large=tpi_large,
        slope_deg=slope_deg,
        elevations=dem.elevations,
        dem_grid=dem,
        neighborhood_size=5,
    )

    assert len(candidates) == 1, "Should find exactly one candidate"
    assert candidates[0].row == 25, "Candidate should be at peak row"
    assert candidates[0].col == 25, "Candidate should be at peak col"


def test_nms_multiple_peaks():
    """Test NMS with multiple distinct peaks."""
    dem = MockDEMGrid(50, 50)
    dem.elevations = np.ones((50, 50)) * 1000

    tpi_large = np.zeros((50, 50))
    # Three peaks well-separated
    tpi_large[10, 10] = 25.0
    tpi_large[30, 30] = 30.0  # Strongest
    tpi_large[10, 40] = 20.0

    rim_mask = tpi_large > 12.0
    rim_strength = compute_rim_strength_grid(tpi_large)
    slope_deg = np.ones((50, 50)) * 10.0

    candidates = extract_rim_candidates_nms(
        rim_mask=rim_mask,
        rim_strength=rim_strength,
        tpi_large=tpi_large,
        slope_deg=slope_deg,
        elevations=dem.elevations,
        dem_grid=dem,
        neighborhood_size=5,
    )

    assert len(candidates) == 3, "Should find three candidates"
    # Candidates should be sorted by strength
    assert candidates[0].tpi_large_m == 30.0, "First candidate should be strongest"


def test_nms_suppression():
    """Test that NMS suppresses nearby weaker peaks."""
    dem = MockDEMGrid(50, 50)
    dem.elevations = np.ones((50, 50)) * 1000

    tpi_large = np.zeros((50, 50))
    # Two peaks very close together
    tpi_large[25, 25] = 30.0  # Stronger
    tpi_large[26, 26] = 25.0  # Weaker, within neighborhood

    rim_mask = tpi_large > 12.0
    rim_strength = compute_rim_strength_grid(tpi_large)
    slope_deg = np.ones((50, 50)) * 10.0

    candidates = extract_rim_candidates_nms(
        rim_mask=rim_mask,
        rim_strength=rim_strength,
        tpi_large=tpi_large,
        slope_deg=slope_deg,
        elevations=dem.elevations,
        dem_grid=dem,
        neighborhood_size=5,
    )

    # Only the stronger peak should survive
    assert len(candidates) == 1, "Nearby weaker peak should be suppressed"
    assert candidates[0].tpi_large_m == 30.0, "Stronger peak should survive"


def test_nms_candidate_count():
    """Test NMS with canyon rim scenario (linear feature)."""
    dem = MockDEMGrid(80, 80)
    dem.elevations = np.ones((80, 80)) * 1000

    tpi_large = np.zeros((80, 80))
    # Create a linear rim (like a canyon edge)
    for i in range(80):
        tpi_large[i, 40] = 20.0 + np.random.uniform(-2, 2)

    rim_mask = tpi_large > 12.0
    rim_strength = compute_rim_strength_grid(tpi_large)
    slope_deg = np.ones((80, 80)) * 10.0

    candidates = extract_rim_candidates_nms(
        rim_mask=rim_mask,
        rim_strength=rim_strength,
        tpi_large=tpi_large,
        slope_deg=slope_deg,
        elevations=dem.elevations,
        dem_grid=dem,
        neighborhood_size=5,
    )

    # With neighborhood=5, we should get roughly 80/5 = 16 candidates along the rim
    assert 10 <= len(candidates) <= 25, f"Expected 10-25 candidates along rim, got {len(candidates)}"


# =============================================================================
# Test Standing Location Conversion
# =============================================================================

def test_rim_to_standing_conversion():
    """Test conversion of rim candidates to standing locations."""
    candidates = [
        RimCandidate(row=10, col=10, lat=38.1, lon=-109.1, elevation_m=1500,
                     slope_deg=10.0, tpi_large_m=25.0, rim_strength=0.5),
        RimCandidate(row=20, col=20, lat=38.2, lon=-109.2, elevation_m=1600,
                     slope_deg=12.0, tpi_large_m=30.0, rim_strength=0.6),
    ]

    standings = rim_candidates_to_standing_locations(candidates, start_id=1000)

    assert len(standings) == 2, "Should create 2 standing locations"
    assert standings[0].standing_id == 1000, "First ID should be 1000"
    assert standings[1].standing_id == 1001, "Second ID should be 1001"
    assert standings[0].source == "rim_overlook", "Source should be rim_overlook"
    assert standings[0].subject_id is None, "Subject ID should be None"
    assert standings[0].location["lat"] == 38.1, "Lat should match candidate"
    assert standings[0].properties.rim_strength == 0.5, "Rim strength should be stored"


# =============================================================================
# Test Spatial Deduplication
# =============================================================================

def test_spatial_deduplication():
    """Test spatial deduplication of overlook standings."""
    from terrain.types import StandingLocation, StandingProperties, LineOfSight, CandidateSearch, OverlookView

    # Create standings with known positions
    def make_standing(lat, lon, score, sid):
        s = StandingLocation(
            standing_id=sid,
            subject_id=None,
            location={"lat": lat, "lon": lon},
            properties=StandingProperties(
                elevation_m=1500, slope_deg=10, distance_to_subject_m=0,
                camera_bearing_deg=0, elevation_diff_m=0,
            ),
            line_of_sight=LineOfSight(clear=True, eye_height_m=1502, target_height_m=0, samples=[]),
            candidate_search=CandidateSearch(candidates_checked=1, rejected=[], selected_at_distance_m=0),
            source="rim_overlook",
        )
        s.view = OverlookView(
            open_sky_fraction=0.5, depth_p50_m=2000, depth_p90_m=5000,
            horizon_complexity=5, overlook_score=score, best_bearing_deg=0,
        )
        return s

    # Create 3 standings: two close together, one far
    standings = [
        make_standing(38.0, -109.0, 0.8, 1),      # Best score
        make_standing(38.001, -109.001, 0.7, 2),  # ~140m away, should be deduped
        make_standing(38.01, -109.01, 0.6, 3),    # ~1.4km away, should be kept
    ]

    result = deduplicate_overlooks_spatially(standings, min_distance_m=500.0, max_results=10)

    assert len(result) == 2, "Should keep 2 (dedup one close pair)"
    assert result[0].standing_id == 1, "Best score should be first"
    assert result[1].standing_id == 3, "Distant one should be second"


def test_spatial_deduplication_max_results():
    """Test that max_results is respected."""
    from terrain.types import StandingLocation, StandingProperties, LineOfSight, CandidateSearch, OverlookView

    # Create many well-spaced standings
    standings = []
    for i in range(10):
        s = StandingLocation(
            standing_id=i,
            subject_id=None,
            location={"lat": 38.0 + i * 0.01, "lon": -109.0},  # 1km apart
            properties=StandingProperties(
                elevation_m=1500, slope_deg=10, distance_to_subject_m=0,
                camera_bearing_deg=0, elevation_diff_m=0,
            ),
            line_of_sight=LineOfSight(clear=True, eye_height_m=1502, target_height_m=0, samples=[]),
            candidate_search=CandidateSearch(candidates_checked=1, rejected=[], selected_at_distance_m=0),
            source="rim_overlook",
        )
        s.view = OverlookView(
            open_sky_fraction=0.5, depth_p50_m=2000, depth_p90_m=5000,
            horizon_complexity=5, overlook_score=0.9 - i * 0.05, best_bearing_deg=0,
        )
        standings.append(s)

    result = deduplicate_overlooks_spatially(standings, min_distance_m=500.0, max_results=5)

    assert len(result) == 5, "Should respect max_results=5"


# =============================================================================
# Integration Test
# =============================================================================

def test_full_rim_overlook_pipeline():
    """Test the complete rim overlook detection pipeline."""
    dem = MockDEMGrid(80, 80, cell_size_m=30.0)

    # Create a canyon rim scenario
    # Basin on left (low elevation), rim in middle, plateau on right
    elevations = np.zeros((80, 80))
    for r in range(80):
        for c in range(80):
            if c < 30:
                elevations[r, c] = 1000  # Basin
            elif c < 40:
                elevations[r, c] = 1000 + (c - 30) * 50  # Slope up
            else:
                elevations[r, c] = 1500  # Plateau

    dem.elevations = elevations
    dem.init_local_coords()

    # Compute TPI (cells around c=35-40 should be high)
    from terrain.structure import compute_tpi_grids
    tpi_small, tpi_large = compute_tpi_grids(elevations, dem.cell_size_m)

    # Compute slope
    slope_deg = np.zeros_like(elevations)
    slope_deg[:, 30:40] = 20.0  # Steep at rim

    # Run pipeline
    rim_standings = generate_rim_overlook_standings(
        dem=dem,
        tpi_large=tpi_large,
        slope_deg=slope_deg,
        elevations=elevations,
        sun_position=None,
        tpi_threshold_m=12.0,
        slope_max_deg=25.0,
        top_k_for_view=20,
        max_results=10,
        dedup_distance_m=300.0,
    )

    # Should find several overlook points along the rim
    assert len(rim_standings) > 0, "Should find at least one overlook"

    # All should have view analysis
    for s in rim_standings:
        assert s.view is not None, "All standings should have view analysis"
        assert s.source == "rim_overlook", "Source should be rim_overlook"

    # They should be spatially distinct
    if len(rim_standings) >= 2:
        from terrain.view import deduplicate_overlooks_spatially
        # Re-dedup with stricter distance - should be same count if already deduped
        rededuped = deduplicate_overlooks_spatially(rim_standings, min_distance_m=300.0)
        assert len(rededuped) == len(rim_standings), "Results should already be spatially distinct"

    print(f"✓ Found {len(rim_standings)} rim overlooks")
    for s in rim_standings:
        print(f"  - {s.location['lat']:.4f}, {s.location['lon']:.4f} "
              f"score={s.view.overlook_score:.2f}")


# =============================================================================
# Run all tests
# =============================================================================

if __name__ == "__main__":
    tests = [
        test_rim_mask_basic,
        test_rim_mask_slope_filter,
        test_rim_mask_threshold_tuning,
        test_rim_strength_grid,
        test_nms_single_peak,
        test_nms_multiple_peaks,
        test_nms_suppression,
        test_nms_candidate_count,
        test_rim_to_standing_conversion,
        test_spatial_deduplication,
        test_spatial_deduplication_max_results,
        test_full_rim_overlook_pipeline,
    ]

    passed = 0
    failed = 0

    for test in tests:
        try:
            test()
            print(f"✓ {test.__name__}")
            passed += 1
        except AssertionError as e:
            print(f"✗ {test.__name__}: {e}")
            failed += 1
        except Exception as e:
            print(f"✗ {test.__name__}: {type(e).__name__}: {e}")
            failed += 1

    print(f"\n{passed}/{passed + failed} tests passed")
    if failed > 0:
        sys.exit(1)
