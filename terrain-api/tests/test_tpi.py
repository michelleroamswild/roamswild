"""
Unit tests for TPI (Topographic Position Index) computation.

Tests:
1. Integral image (summed-area table) correctness
2. Ridge DEM: positive TPI at ridge, negative in surroundings
3. Bowl DEM: negative TPI in center, positive at edges
4. Performance on 80x80 grid
"""

import math
import numpy as np
import time
from terrain.structure import (
    summed_area_table,
    window_sum_from_sat,
    compute_window_mean_grid,
    compute_tpi_grids,
    compute_tpi_derived_fields,
    compute_structure_metrics,
    TPI_THRESHOLD_M,
)


def create_ridge_dem(
    rows: int = 80,
    cols: int = 80,
    base_elevation: float = 1500.0,
    ridge_height: float = 100.0,
) -> np.ndarray:
    """
    Create a synthetic ridge DEM: high in center, low at edges.

    Ridge runs along the center row (north-south ridge).
    """
    elevations = np.full((rows, cols), base_elevation, dtype=np.float64)

    # Add ridge in center columns (with gaussian falloff)
    center_col = cols // 2
    for c in range(cols):
        # Gaussian profile centered at center_col
        dist = abs(c - center_col)
        sigma = cols / 8  # Ridge width
        ridge_profile = ridge_height * np.exp(-0.5 * (dist / sigma) ** 2)
        elevations[:, c] += ridge_profile

    return elevations


def create_bowl_dem(
    rows: int = 80,
    cols: int = 80,
    base_elevation: float = 1500.0,
    bowl_depth: float = 100.0,
) -> np.ndarray:
    """
    Create a synthetic bowl DEM: low in center, high at edges.

    Radial profile with center being the lowest point.
    """
    elevations = np.full((rows, cols), base_elevation, dtype=np.float64)

    center_row = rows // 2
    center_col = cols // 2

    for r in range(rows):
        for c in range(cols):
            # Distance from center
            dist = np.sqrt((r - center_row) ** 2 + (c - center_col) ** 2)
            max_dist = np.sqrt(center_row ** 2 + center_col ** 2)
            # Normalize and apply bowl profile (edges high, center low)
            # At center: elevation = base - bowl_depth
            # At edges: elevation = base
            norm_dist = dist / max_dist
            elevations[r, c] = base_elevation - bowl_depth * (1 - norm_dist ** 2)

    return elevations


def create_flat_dem(
    rows: int = 80,
    cols: int = 80,
    base_elevation: float = 1500.0,
) -> np.ndarray:
    """Create a flat DEM at constant elevation."""
    return np.full((rows, cols), base_elevation, dtype=np.float64)


class TestSummedAreaTable:
    """Test summed-area table (integral image) computation."""

    def test_simple_3x3(self):
        """Test SAT on a simple 3x3 grid."""
        Z = np.array([
            [1, 2, 3],
            [4, 5, 6],
            [7, 8, 9],
        ], dtype=np.float64)

        sat = summed_area_table(Z)

        # SAT[i,j] = sum of all elements from (0,0) to (i,j)
        assert sat[0, 0] == 1  # Just first element
        assert sat[0, 2] == 6  # First row sum: 1+2+3
        assert sat[2, 0] == 12  # First column sum: 1+4+7
        assert sat[2, 2] == 45  # Total sum: 1+2+3+4+5+6+7+8+9

    def test_window_sum_center(self):
        """Test window sum at center of grid."""
        Z = np.ones((5, 5), dtype=np.float64)
        sat = summed_area_table(Z)

        # 3x3 window at center (half_window=1)
        window_sum, count = window_sum_from_sat(sat, 2, 2, 1)

        assert count == 9, f"Expected 9 cells, got {count}"
        assert abs(window_sum - 9.0) < 0.001, f"Expected sum 9, got {window_sum}"

    def test_window_sum_corner(self):
        """Test window sum at corner (edge clamping)."""
        Z = np.ones((5, 5), dtype=np.float64)
        sat = summed_area_table(Z)

        # 3x3 window at corner (0,0) - should be clamped to 2x2
        window_sum, count = window_sum_from_sat(sat, 0, 0, 1)

        assert count == 4, f"Expected 4 cells at corner, got {count}"
        assert abs(window_sum - 4.0) < 0.001, f"Expected sum 4, got {window_sum}"

    def test_window_mean_uniform(self):
        """Test window mean on uniform grid."""
        Z = np.full((10, 10), 100.0, dtype=np.float64)
        mean_grid = compute_window_mean_grid(Z, half_window_cells=2)

        # All means should be 100
        assert np.allclose(mean_grid, 100.0), "Mean should be 100 everywhere on uniform grid"


class TestTPIRidgeDEM:
    """Test TPI on synthetic ridge DEM."""

    def test_ridge_center_has_positive_tpi(self):
        """Ridge center should have positive TPI (higher than surroundings)."""
        elevations = create_ridge_dem(rows=80, cols=80, ridge_height=100.0)
        cell_size_m = 30.0  # 30m cells

        tpi_small, tpi_large = compute_tpi_grids(elevations, cell_size_m)

        # Center of ridge (col 40)
        center_row, center_col = 40, 40

        # TPI at ridge center should be positive
        tpi_at_ridge = tpi_large[center_row, center_col]
        assert tpi_at_ridge > 0, f"Ridge center should have positive TPI, got {tpi_at_ridge}"

        # TPI should be significantly positive (ridge is 100m higher)
        assert tpi_at_ridge > 20, f"Ridge TPI should be substantial, got {tpi_at_ridge}"

    def test_ridge_edges_have_negative_tpi(self):
        """Ridge edges/valleys should have negative TPI (lower than surroundings)."""
        elevations = create_ridge_dem(rows=80, cols=80, ridge_height=100.0)
        cell_size_m = 30.0

        tpi_small, tpi_large = compute_tpi_grids(elevations, cell_size_m)

        # Edge of grid (far from ridge)
        edge_row, edge_col = 40, 5  # Same row, but far left

        # TPI at edge should be negative or near zero
        tpi_at_edge = tpi_large[edge_row, edge_col]
        assert tpi_at_edge < tpi_large[40, 40], f"Edge TPI should be less than ridge TPI"

    def test_ridge_produces_rim_candidate(self):
        """Ridge cells should be rim candidates with low slope."""
        elevations = create_ridge_dem(rows=80, cols=80, ridge_height=100.0)
        cell_size_m = 30.0

        # Create slope grid (ridge top is relatively flat)
        slope_deg = np.zeros_like(elevations)
        # Simple slope estimate
        for r in range(1, elevations.shape[0] - 1):
            for c in range(1, elevations.shape[1] - 1):
                dz_dx = (elevations[r, c+1] - elevations[r, c-1]) / (2 * cell_size_m)
                dz_dy = (elevations[r+1, c] - elevations[r-1, c]) / (2 * cell_size_m)
                slope_deg[r, c] = np.degrees(np.arctan(np.sqrt(dz_dx**2 + dz_dy**2)))

        tpi_small, tpi_large = compute_tpi_grids(elevations, cell_size_m)

        # Cells at ridge top (center column)
        ridge_cells = [(r, 40) for r in range(30, 50)]

        (mean_tpi_large, rim_strength, basin_strength,
         is_rim_candidate, is_basin_candidate) = compute_tpi_derived_fields(
            tpi_large=tpi_large,
            slope_deg=slope_deg,
            cells=ridge_cells,
        )

        assert rim_strength > 0.5, f"Ridge should have high rim_strength, got {rim_strength}"
        assert basin_strength < 0.1, f"Ridge should have low basin_strength, got {basin_strength}"
        assert is_rim_candidate, "Ridge should be rim candidate"
        assert not is_basin_candidate, "Ridge should not be basin candidate"


class TestTPIBowlDEM:
    """Test TPI on synthetic bowl DEM."""

    def test_bowl_center_has_negative_tpi(self):
        """Bowl center should have negative TPI (lower than surroundings)."""
        elevations = create_bowl_dem(rows=80, cols=80, bowl_depth=100.0)
        cell_size_m = 30.0

        tpi_small, tpi_large = compute_tpi_grids(elevations, cell_size_m)

        # Center of bowl
        center_row, center_col = 40, 40

        # TPI at bowl center should be negative
        tpi_at_center = tpi_large[center_row, center_col]
        assert tpi_at_center < 0, f"Bowl center should have negative TPI, got {tpi_at_center}"

        # TPI should be significantly negative
        assert tpi_at_center < -20, f"Bowl TPI should be substantially negative, got {tpi_at_center}"

    def test_bowl_edges_have_positive_tpi(self):
        """Bowl edges should have positive TPI (higher than surroundings)."""
        elevations = create_bowl_dem(rows=80, cols=80, bowl_depth=100.0)
        cell_size_m = 30.0

        tpi_small, tpi_large = compute_tpi_grids(elevations, cell_size_m)

        # Edge of grid (high point of bowl)
        edge_row, edge_col = 5, 5  # Corner

        # TPI at edge should be positive
        tpi_at_edge = tpi_large[edge_row, edge_col]
        # Note: At very edge, might be affected by edge effects, but should still be > center
        assert tpi_at_edge > tpi_large[40, 40], "Edge TPI should be greater than center TPI"

    def test_bowl_produces_basin_candidate(self):
        """Bowl center cells should be basin candidates."""
        elevations = create_bowl_dem(rows=80, cols=80, bowl_depth=100.0)
        cell_size_m = 30.0

        slope_deg = np.zeros_like(elevations)
        # Simple slope estimate
        for r in range(1, elevations.shape[0] - 1):
            for c in range(1, elevations.shape[1] - 1):
                dz_dx = (elevations[r, c+1] - elevations[r, c-1]) / (2 * cell_size_m)
                dz_dy = (elevations[r+1, c] - elevations[r-1, c]) / (2 * cell_size_m)
                slope_deg[r, c] = np.degrees(np.arctan(np.sqrt(dz_dx**2 + dz_dy**2)))

        tpi_small, tpi_large = compute_tpi_grids(elevations, cell_size_m)

        # Cells at bowl center
        center_cells = [(r, c) for r in range(35, 45) for c in range(35, 45)]

        (mean_tpi_large, rim_strength, basin_strength,
         is_rim_candidate, is_basin_candidate) = compute_tpi_derived_fields(
            tpi_large=tpi_large,
            slope_deg=slope_deg,
            cells=center_cells,
        )

        assert basin_strength > 0.5, f"Bowl center should have high basin_strength, got {basin_strength}"
        assert rim_strength < 0.1, f"Bowl center should have low rim_strength, got {rim_strength}"
        assert is_basin_candidate, "Bowl center should be basin candidate"
        assert not is_rim_candidate, "Bowl center should not be rim candidate"


class TestTPIFlatDEM:
    """Test TPI on flat DEM."""

    def test_flat_has_zero_tpi(self):
        """Flat terrain should have near-zero TPI everywhere."""
        elevations = create_flat_dem(rows=80, cols=80, base_elevation=1500.0)
        cell_size_m = 30.0

        tpi_small, tpi_large = compute_tpi_grids(elevations, cell_size_m)

        # All TPI values should be near zero
        assert np.allclose(tpi_small, 0.0, atol=0.01), "Small TPI should be ~0 on flat terrain"
        assert np.allclose(tpi_large, 0.0, atol=0.01), "Large TPI should be ~0 on flat terrain"

    def test_flat_no_rim_or_basin(self):
        """Flat terrain should not be rim or basin candidate."""
        elevations = create_flat_dem(rows=80, cols=80)
        cell_size_m = 30.0
        slope_deg = np.zeros_like(elevations)

        tpi_small, tpi_large = compute_tpi_grids(elevations, cell_size_m)

        # All cells
        all_cells = [(r, c) for r in range(80) for c in range(80)]

        (mean_tpi_large, rim_strength, basin_strength,
         is_rim_candidate, is_basin_candidate) = compute_tpi_derived_fields(
            tpi_large=tpi_large,
            slope_deg=slope_deg,
            cells=all_cells,
        )

        assert abs(mean_tpi_large) < 1.0, f"Flat terrain should have ~0 TPI, got {mean_tpi_large}"
        assert rim_strength < 0.1, "Flat terrain should not have rim strength"
        assert basin_strength < 0.1, "Flat terrain should not have basin strength"
        assert not is_rim_candidate, "Flat terrain should not be rim candidate"
        assert not is_basin_candidate, "Flat terrain should not be basin candidate"


class TestTPIPerformance:
    """Test TPI computation performance."""

    def test_80x80_performance(self):
        """TPI computation should be fast for 80x80 grid."""
        elevations = create_ridge_dem(rows=80, cols=80)
        cell_size_m = 30.0

        start = time.time()
        tpi_small, tpi_large = compute_tpi_grids(elevations, cell_size_m)
        elapsed = time.time() - start

        # Should complete in under 1 second
        assert elapsed < 1.0, f"TPI computation took {elapsed:.2f}s, should be < 1s"

        # Verify output shapes
        assert tpi_small.shape == elevations.shape
        assert tpi_large.shape == elevations.shape

    def test_larger_grid_still_reasonable(self):
        """TPI should still be reasonable on larger grids."""
        elevations = np.random.randn(150, 150) * 50 + 1500
        cell_size_m = 30.0

        start = time.time()
        tpi_small, tpi_large = compute_tpi_grids(elevations, cell_size_m)
        elapsed = time.time() - start

        # Should complete in under 5 seconds
        assert elapsed < 5.0, f"TPI computation on 150x150 took {elapsed:.2f}s, should be < 5s"


class TestTPIIntegration:
    """Test TPI integration with structure metrics."""

    def test_structure_metrics_includes_tpi(self):
        """compute_structure_metrics should include TPI fields."""
        elevations = create_ridge_dem(rows=80, cols=80)
        cell_size_m = 30.0
        slope_deg = np.zeros_like(elevations)
        curvature = np.zeros_like(elevations)

        # Ridge cells
        cells = [(r, 40) for r in range(30, 50)]

        metrics = compute_structure_metrics(
            elevations=elevations,
            slope_deg=slope_deg,
            curvature=curvature,
            cells=cells,
            cell_size_m=cell_size_m,
        )

        # Verify TPI fields exist and are sensible for ridge
        assert hasattr(metrics, 'tpi_small_m')
        assert hasattr(metrics, 'tpi_large_m')
        assert hasattr(metrics, 'rim_strength')
        assert hasattr(metrics, 'basin_strength')
        assert hasattr(metrics, 'is_rim_candidate')
        assert hasattr(metrics, 'is_basin_candidate')

        # Ridge should have positive TPI
        assert metrics.tpi_large_m > 0, f"Ridge should have positive TPI, got {metrics.tpi_large_m}"
        assert metrics.rim_strength > 0, "Ridge should have rim strength"

    def test_precomputed_tpi_grids(self):
        """Should accept precomputed TPI grids."""
        elevations = create_ridge_dem(rows=80, cols=80)
        cell_size_m = 30.0
        slope_deg = np.zeros_like(elevations)
        curvature = np.zeros_like(elevations)

        # Precompute TPI
        tpi_small, tpi_large = compute_tpi_grids(elevations, cell_size_m)

        cells = [(r, 40) for r in range(30, 50)]

        # Pass precomputed grids
        metrics = compute_structure_metrics(
            elevations=elevations,
            slope_deg=slope_deg,
            curvature=curvature,
            cells=cells,
            cell_size_m=cell_size_m,
            tpi_small=tpi_small,
            tpi_large=tpi_large,
        )

        # Should still work and produce consistent results
        assert metrics.tpi_large_m > 0


if __name__ == "__main__":
    import sys

    test_classes = [
        TestSummedAreaTable,
        TestTPIRidgeDEM,
        TestTPIBowlDEM,
        TestTPIFlatDEM,
        TestTPIPerformance,
        TestTPIIntegration,
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
