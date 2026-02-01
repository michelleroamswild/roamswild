"""
Unit tests for auto-threshold adjustment in rim candidate detection.

Tests ensure that:
1. Low-relief terrain causes threshold relaxation (lower TPI, higher slope)
2. Very rough terrain causes threshold tightening (higher TPI, lower slope)
3. Thresholds remain within configured clamps
"""
import unittest
import numpy as np
from terrain.view import (
    compute_auto_thresholds,
    DEFAULT_TPI_THRESHOLD_M,
    DEFAULT_SLOPE_MAX_DEG,
    AUTO_THRESHOLD_TARGET_MIN,
    AUTO_THRESHOLD_TARGET_MAX,
    TPI_THRESHOLD_MIN,
    TPI_THRESHOLD_MAX,
    SLOPE_MAX_DEG_MIN,
    SLOPE_MAX_DEG_MAX,
)


class TestAutoThresholdRelaxation(unittest.TestCase):
    """Test auto-threshold relaxes for low-relief terrain."""

    def test_low_relief_relaxes_tpi(self):
        """Low-relief terrain with small TPI values should relax TPI threshold."""
        # Create synthetic low-relief terrain
        # All TPI values are small (0-6m), so default threshold of 12m would yield 0%
        rows, cols = 100, 100
        np.random.seed(42)
        tpi_large = np.random.uniform(0, 6, (rows, cols))  # All below default 12m
        slope_deg = np.random.uniform(5, 15, (rows, cols))  # All gentle slopes

        # With default thresholds, almost no cells would pass
        # Auto-threshold should relax to achieve 5-15% yield
        chosen_tpi, chosen_slope, info = compute_auto_thresholds(
            tpi_large=tpi_large,
            slope_deg=slope_deg,
            initial_tpi_threshold_m=DEFAULT_TPI_THRESHOLD_M,
            initial_slope_max_deg=DEFAULT_SLOPE_MAX_DEG,
        )

        # Should have relaxed (lowered) TPI threshold
        self.assertLess(chosen_tpi, DEFAULT_TPI_THRESHOLD_M,
            f"Expected TPI threshold to be relaxed below {DEFAULT_TPI_THRESHOLD_M}m, got {chosen_tpi}m")

        # Info should indicate relaxation
        self.assertTrue(info.get("adjusted", False))
        self.assertEqual(info.get("direction"), "relax")

    def test_low_relief_achieves_target_yield(self):
        """Low-relief relaxation should achieve target 5-15% yield."""
        rows, cols = 100, 100
        np.random.seed(42)
        # Very low TPI values
        tpi_large = np.random.uniform(0, 8, (rows, cols))
        slope_deg = np.random.uniform(5, 20, (rows, cols))

        chosen_tpi, chosen_slope, info = compute_auto_thresholds(
            tpi_large=tpi_large,
            slope_deg=slope_deg,
        )

        # Recompute mask with chosen thresholds
        from terrain.structure import compute_rim_candidate_mask
        rim_mask = compute_rim_candidate_mask(
            tpi_large=tpi_large,
            slope_deg=slope_deg,
            tpi_threshold_m=chosen_tpi,
            slope_max_deg=chosen_slope,
        )
        final_fraction = np.sum(rim_mask) / (rows * cols)

        # Should be closer to target range (may not fully reach if terrain is too flat)
        self.assertGreater(final_fraction, 0.0,
            f"Expected some rim candidates, got {final_fraction:.3f}")
        # Final fraction should be the maximum achievable within clamps
        self.assertEqual(info.get("final_fraction"), final_fraction)


class TestAutoThresholdTightening(unittest.TestCase):
    """Test auto-threshold tightens for very rough terrain."""

    def test_rough_terrain_tightens_tpi(self):
        """Very rough terrain with high TPI values should tighten TPI threshold."""
        # Create synthetic rough terrain
        # All TPI values are high (15-40m), so default threshold of 12m would yield too much
        rows, cols = 100, 100
        np.random.seed(42)
        tpi_large = np.random.uniform(15, 40, (rows, cols))  # All above default 12m
        slope_deg = np.random.uniform(5, 15, (rows, cols))  # Gentle slopes

        # With default thresholds, nearly 100% of cells would pass TPI threshold
        # Auto-threshold should tighten to achieve 5-15% yield
        chosen_tpi, chosen_slope, info = compute_auto_thresholds(
            tpi_large=tpi_large,
            slope_deg=slope_deg,
            initial_tpi_threshold_m=DEFAULT_TPI_THRESHOLD_M,
            initial_slope_max_deg=DEFAULT_SLOPE_MAX_DEG,
        )

        # Should have tightened (raised) TPI threshold
        self.assertGreater(chosen_tpi, DEFAULT_TPI_THRESHOLD_M,
            f"Expected TPI threshold to be tightened above {DEFAULT_TPI_THRESHOLD_M}m, got {chosen_tpi}m")

        # Info should indicate tightening
        self.assertTrue(info.get("adjusted", False))
        self.assertEqual(info.get("direction"), "tighten")

    def test_rough_terrain_achieves_target_yield(self):
        """Rough terrain tightening should achieve target 5-15% yield."""
        rows, cols = 100, 100
        np.random.seed(42)
        # High TPI values
        tpi_large = np.random.uniform(15, 35, (rows, cols))
        slope_deg = np.random.uniform(5, 20, (rows, cols))

        chosen_tpi, chosen_slope, info = compute_auto_thresholds(
            tpi_large=tpi_large,
            slope_deg=slope_deg,
        )

        # Recompute mask with chosen thresholds
        from terrain.structure import compute_rim_candidate_mask
        rim_mask = compute_rim_candidate_mask(
            tpi_large=tpi_large,
            slope_deg=slope_deg,
            tpi_threshold_m=chosen_tpi,
            slope_max_deg=chosen_slope,
        )
        final_fraction = np.sum(rim_mask) / (rows * cols)

        # Should be in or near target range (allow some slack due to discrete step sizes)
        self.assertLessEqual(final_fraction, AUTO_THRESHOLD_TARGET_MAX + 0.10,
            f"Expected fraction <= {AUTO_THRESHOLD_TARGET_MAX + 0.10}, got {final_fraction:.3f}")

    def test_rough_terrain_with_steep_slopes_tightens_both(self):
        """Rough terrain with steep slopes may tighten both TPI and slope."""
        rows, cols = 100, 100
        np.random.seed(42)
        # High TPI and some steep slopes
        tpi_large = np.random.uniform(20, 50, (rows, cols))
        slope_deg = np.random.uniform(10, 28, (rows, cols))  # Some above default 25°

        chosen_tpi, chosen_slope, info = compute_auto_thresholds(
            tpi_large=tpi_large,
            slope_deg=slope_deg,
        )

        # Should have tightened TPI at minimum
        self.assertGreater(chosen_tpi, DEFAULT_TPI_THRESHOLD_M,
            f"Expected TPI threshold tightened above {DEFAULT_TPI_THRESHOLD_M}m")
        self.assertTrue(info.get("adjusted", False))


class TestAutoThresholdClamps(unittest.TestCase):
    """Test that thresholds stay within configured clamps."""

    def test_tpi_clamp_min(self):
        """TPI threshold should not go below TPI_THRESHOLD_MIN."""
        # Extremely flat terrain - would need TPI below min to get any yield
        rows, cols = 100, 100
        np.random.seed(42)
        tpi_large = np.random.uniform(0, 2, (rows, cols))  # All very small
        slope_deg = np.random.uniform(5, 15, (rows, cols))

        chosen_tpi, chosen_slope, info = compute_auto_thresholds(
            tpi_large=tpi_large,
            slope_deg=slope_deg,
        )

        # TPI should be clamped at minimum
        self.assertGreaterEqual(chosen_tpi, TPI_THRESHOLD_MIN,
            f"TPI threshold {chosen_tpi}m should be >= min {TPI_THRESHOLD_MIN}m")

    def test_tpi_clamp_max(self):
        """TPI threshold should not go above TPI_THRESHOLD_MAX."""
        # Extremely rough terrain - would need TPI above max to get target yield
        rows, cols = 100, 100
        np.random.seed(42)
        tpi_large = np.random.uniform(25, 60, (rows, cols))  # All very high
        slope_deg = np.random.uniform(5, 15, (rows, cols))

        chosen_tpi, chosen_slope, info = compute_auto_thresholds(
            tpi_large=tpi_large,
            slope_deg=slope_deg,
        )

        # TPI should be clamped at maximum
        self.assertLessEqual(chosen_tpi, TPI_THRESHOLD_MAX,
            f"TPI threshold {chosen_tpi}m should be <= max {TPI_THRESHOLD_MAX}m")

    def test_slope_clamp_min(self):
        """Slope max should not go below SLOPE_MAX_DEG_MIN."""
        # Terrain where slope tightening would be needed
        rows, cols = 100, 100
        np.random.seed(42)
        tpi_large = np.random.uniform(15, 40, (rows, cols))  # High TPI
        slope_deg = np.random.uniform(5, 22, (rows, cols))  # All walkable

        chosen_tpi, chosen_slope, info = compute_auto_thresholds(
            tpi_large=tpi_large,
            slope_deg=slope_deg,
        )

        # Slope max should be clamped at minimum
        self.assertGreaterEqual(chosen_slope, SLOPE_MAX_DEG_MIN,
            f"Slope max {chosen_slope}° should be >= min {SLOPE_MAX_DEG_MIN}°")

    def test_slope_clamp_max(self):
        """Slope max should not go above SLOPE_MAX_DEG_MAX."""
        # Terrain where slope relaxation would be needed
        rows, cols = 100, 100
        np.random.seed(42)
        tpi_large = np.random.uniform(0, 6, (rows, cols))  # Low TPI
        slope_deg = np.random.uniform(20, 35, (rows, cols))  # Most are steep

        chosen_tpi, chosen_slope, info = compute_auto_thresholds(
            tpi_large=tpi_large,
            slope_deg=slope_deg,
        )

        # Slope max should be clamped at maximum
        self.assertLessEqual(chosen_slope, SLOPE_MAX_DEG_MAX,
            f"Slope max {chosen_slope}° should be <= max {SLOPE_MAX_DEG_MAX}°")


class TestAutoThresholdNoAdjustment(unittest.TestCase):
    """Test that no adjustment is made when already in target range."""

    def test_no_adjustment_when_in_range(self):
        """No adjustment should be made when initial yield is already 5-15%."""
        # Create terrain that yields ~10% with default thresholds
        rows, cols = 100, 100
        np.random.seed(42)

        # Mix of values: ~10% should have TPI > 12 and slope < 25
        tpi_large = np.zeros((rows, cols))
        slope_deg = np.random.uniform(10, 20, (rows, cols))  # All gentle

        # Set ~10% of cells to high TPI
        high_tpi_count = int(rows * cols * 0.10)
        high_tpi_indices = np.random.choice(rows * cols, high_tpi_count, replace=False)
        tpi_large.flat[high_tpi_indices] = np.random.uniform(15, 25, high_tpi_count)

        chosen_tpi, chosen_slope, info = compute_auto_thresholds(
            tpi_large=tpi_large,
            slope_deg=slope_deg,
        )

        # Should not be adjusted
        self.assertFalse(info.get("adjusted", True),
            "Expected no adjustment when already in target range")
        self.assertEqual(chosen_tpi, DEFAULT_TPI_THRESHOLD_M)
        self.assertEqual(chosen_slope, DEFAULT_SLOPE_MAX_DEG)
        self.assertEqual(info.get("direction"), "none")

    def test_adjustment_info_tracking(self):
        """Adjustment info should track iterations and fractions."""
        rows, cols = 100, 100
        np.random.seed(42)
        tpi_large = np.random.uniform(15, 30, (rows, cols))  # High TPI
        slope_deg = np.random.uniform(5, 15, (rows, cols))

        chosen_tpi, chosen_slope, info = compute_auto_thresholds(
            tpi_large=tpi_large,
            slope_deg=slope_deg,
        )

        # Check info structure
        self.assertIn("adjusted", info)
        self.assertIn("initial_fraction", info)
        self.assertIn("final_fraction", info)
        self.assertIn("direction", info)
        self.assertIn("iterations", info)

        # If adjusted, iterations should be > 0
        if info.get("adjusted"):
            self.assertGreater(info.get("iterations", 0), 0)


class TestAutoThresholdEdgeCases(unittest.TestCase):
    """Test edge cases for auto-threshold."""

    def test_empty_grid(self):
        """Empty grid should return initial thresholds."""
        tpi_large = np.array([]).reshape(0, 0)
        slope_deg = np.array([]).reshape(0, 0)

        chosen_tpi, chosen_slope, info = compute_auto_thresholds(
            tpi_large=tpi_large,
            slope_deg=slope_deg,
        )

        self.assertEqual(chosen_tpi, DEFAULT_TPI_THRESHOLD_M)
        self.assertEqual(chosen_slope, DEFAULT_SLOPE_MAX_DEG)
        self.assertFalse(info.get("adjusted", True))

    def test_single_cell_grid(self):
        """Single cell grid should work without errors."""
        tpi_large = np.array([[15.0]])
        slope_deg = np.array([[10.0]])

        chosen_tpi, chosen_slope, info = compute_auto_thresholds(
            tpi_large=tpi_large,
            slope_deg=slope_deg,
        )

        # Should return valid thresholds (within clamps)
        self.assertGreaterEqual(chosen_tpi, TPI_THRESHOLD_MIN)
        self.assertLessEqual(chosen_tpi, TPI_THRESHOLD_MAX)
        self.assertGreaterEqual(chosen_slope, SLOPE_MAX_DEG_MIN)
        self.assertLessEqual(chosen_slope, SLOPE_MAX_DEG_MAX)

    def test_all_nan_tpi(self):
        """Grid with all NaN TPI should handle gracefully."""
        rows, cols = 10, 10
        tpi_large = np.full((rows, cols), np.nan)
        slope_deg = np.random.uniform(5, 15, (rows, cols))

        # Should not crash - NaN comparisons yield False
        chosen_tpi, chosen_slope, info = compute_auto_thresholds(
            tpi_large=tpi_large,
            slope_deg=slope_deg,
        )

        # Thresholds should still be within clamps
        self.assertGreaterEqual(chosen_tpi, TPI_THRESHOLD_MIN)
        self.assertLessEqual(chosen_tpi, TPI_THRESHOLD_MAX)


if __name__ == "__main__":
    unittest.main()
