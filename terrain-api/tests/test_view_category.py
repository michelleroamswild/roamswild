"""
Unit tests for view category classification and sector openness.

Tests the classify_view_category function with synthetic metric combinations
to verify correct categorization into EPIC_OVERLOOK, DRAMATIC_ENCLOSED, or QUICK_SCENIC.

Also tests compute_sector_openness for wrap-around behavior.
"""
import unittest
import numpy as np
from terrain.view import (
    classify_view_category,
    generate_view_explanations,
    compute_sector_openness,
    HorizonProfile,
    CATEGORY_EPIC_OVERLOOK,
    CATEGORY_DRAMATIC_ENCLOSED,
    CATEGORY_QUICK_SCENIC,
    EPIC_DEPTH_MIN_M,
    EPIC_OPEN_SKY_MIN,
    EPIC_SCORE_FALLBACK,
    DRAMATIC_OPEN_SKY_MAX,
    DRAMATIC_COMPLEXITY_MIN,
    SECTOR_HALF_WIDTH_DEG,
)
from terrain.types import HorizonSample


def make_horizon_profile(
    horizon_alts: list,
    az_step_deg: float = 5.0,
    lat: float = 38.5,
    lon: float = -109.5,
) -> HorizonProfile:
    """Create a HorizonProfile from a list of horizon altitudes."""
    n = len(horizon_alts)
    samples = []
    for i, alt in enumerate(horizon_alts):
        az = i * az_step_deg
        samples.append(HorizonSample(
            azimuth_deg=az,
            horizon_alt_deg=alt,
            distance_to_horizon_m=2000.0,  # Default distance
        ))
    return HorizonProfile(
        samples=samples,
        lat=lat,
        lon=lon,
        eye_height_m=1.7,
    )


class TestSectorOpenness(unittest.TestCase):
    """Test compute_sector_openness with various scenarios."""

    def test_sector_openness_all_open(self):
        """All horizon samples open should give 1.0 sector openness."""
        # 72 samples at 5° step (full 360°), all open (horizon < 1°)
        horizon_alts = [0.5] * 72
        profile = make_horizon_profile(horizon_alts)

        sector_open = compute_sector_openness(profile, center_bearing_deg=180.0)
        self.assertAlmostEqual(sector_open, 1.0, places=2)

    def test_sector_openness_all_blocked(self):
        """All horizon samples blocked should give 0.0 sector openness."""
        horizon_alts = [10.0] * 72  # All blocked (horizon > 1°)
        profile = make_horizon_profile(horizon_alts)

        sector_open = compute_sector_openness(profile, center_bearing_deg=180.0)
        self.assertAlmostEqual(sector_open, 0.0, places=2)

    def test_sector_openness_half_open(self):
        """Half the sector open should give ~0.5 sector openness."""
        # Create profile where 0-180° is open, 180-360° is blocked
        horizon_alts = []
        for i in range(72):
            az = i * 5.0
            if az < 180:
                horizon_alts.append(0.5)  # Open
            else:
                horizon_alts.append(10.0)  # Blocked
        profile = make_horizon_profile(horizon_alts)

        # Center at 90° - half of sector should be open
        sector_open = compute_sector_openness(profile, center_bearing_deg=90.0)
        # At 90°, sector is 45-135°, which is all in the open zone (0-180°)
        self.assertGreater(sector_open, 0.8)

    def test_sector_openness_wrap_around_near_0(self):
        """Sector near 0° should wrap correctly to include 315-360° and 0-45°."""
        # Create profile where 315-360° and 0-45° are open, rest blocked
        horizon_alts = []
        for i in range(72):
            az = i * 5.0
            if az <= 45 or az >= 315:
                horizon_alts.append(0.5)  # Open
            else:
                horizon_alts.append(10.0)  # Blocked
        profile = make_horizon_profile(horizon_alts)

        # Center at 0° - sector is 315-45° (wrapping around)
        sector_open = compute_sector_openness(profile, center_bearing_deg=0.0)
        # The entire sector should be open
        self.assertGreater(sector_open, 0.9)

    def test_sector_openness_wrap_around_near_359(self):
        """Sector near 359° should wrap correctly."""
        # Create profile where 314-360° and 0-44° are open
        horizon_alts = []
        for i in range(72):
            az = i * 5.0
            if az <= 44 or az >= 314:
                horizon_alts.append(0.5)  # Open
            else:
                horizon_alts.append(10.0)  # Blocked
        profile = make_horizon_profile(horizon_alts)

        # Center at 359° - sector is 314-404° (wraps to 314-360° and 0-44°)
        sector_open = compute_sector_openness(profile, center_bearing_deg=359.0)
        # The entire sector should be open
        self.assertGreater(sector_open, 0.9)

    def test_sector_openness_enclosed_behind_open_forward(self):
        """Canyon rim scenario: enclosed behind (180-360°) but open forward (0-180°)."""
        # Create profile where 0-180° is open, 180-360° is blocked
        horizon_alts = []
        for i in range(72):
            az = i * 5.0
            if az < 180:
                horizon_alts.append(0.5)  # Open forward
            else:
                horizon_alts.append(15.0)  # Blocked behind (high ridges)
        profile = make_horizon_profile(horizon_alts)

        # Full 360° openness is ~50%
        full_open = sum(1 for alt in horizon_alts if alt < 1.0) / len(horizon_alts)
        self.assertAlmostEqual(full_open, 0.5, places=1)

        # But sector openness centered at 90° (facing forward) should be ~100%
        sector_open = compute_sector_openness(profile, center_bearing_deg=90.0)
        self.assertGreater(sector_open, 0.9)


class TestViewCategoryWithSectorOpenness(unittest.TestCase):
    """Test classify_view_category with sector openness."""

    def test_epic_overlook_using_sector_openness(self):
        """EPIC_OVERLOOK should use sector openness for the open sky check."""
        # Low full 360° openness, but high sector openness
        category = classify_view_category(
            depth_p90_m=8000.0,  # > 5000m threshold
            open_sky_fraction=0.30,  # Low full 360° (would fail EPIC)
            horizon_complexity=5,
            overlook_score=0.60,
            open_sky_sector_fraction=0.70,  # High sector (passes EPIC)
        )
        self.assertEqual(category, CATEGORY_EPIC_OVERLOOK)

    def test_epic_overlook_enclosed_behind_open_forward(self):
        """Canyon rim enclosed behind but open forward should be EPIC."""
        # This is the key scenario - a canyon rim that's enclosed behind
        # but has great views forward
        category = classify_view_category(
            depth_p90_m=6000.0,  # Deep sightlines
            open_sky_fraction=0.25,  # Enclosed overall (< 0.40)
            horizon_complexity=10,  # Complex skyline
            overlook_score=0.55,  # Not high enough for fallback
            open_sky_sector_fraction=0.80,  # Wide open forward!
        )
        # Should be EPIC because sector openness is high + depth is good
        self.assertEqual(category, CATEGORY_EPIC_OVERLOOK)

    def test_dramatic_enclosed_uses_full_360_openness(self):
        """DRAMATIC_ENCLOSED should use full 360° openness for 'enclosed' check."""
        # Low full 360° openness, high complexity = DRAMATIC
        # Even if sector is high, full 360° being low qualifies for DRAMATIC
        # But EPIC takes priority if sector + depth qualify
        category = classify_view_category(
            depth_p90_m=2000.0,  # Not deep enough for EPIC
            open_sky_fraction=0.20,  # Very enclosed (full 360°)
            horizon_complexity=12,  # Complex skyline
            overlook_score=0.40,
            open_sky_sector_fraction=0.60,  # Sector is decent but depth fails EPIC
        )
        # EPIC fails (sector high but depth < 5000m), so DRAMATIC wins
        self.assertEqual(category, CATEGORY_DRAMATIC_ENCLOSED)

    def test_fallback_without_sector_openness(self):
        """Without sector openness, should fall back to full 360°."""
        category = classify_view_category(
            depth_p90_m=8000.0,
            open_sky_fraction=0.65,  # High full 360°
            horizon_complexity=5,
            overlook_score=0.60,
            open_sky_sector_fraction=None,  # Not provided
        )
        self.assertEqual(category, CATEGORY_EPIC_OVERLOOK)


class TestViewCategoryClassification(unittest.TestCase):
    """Test classify_view_category with various metric combinations."""

    def test_epic_overlook_by_depth_and_sector_open_sky(self):
        """Deep sightlines + wide-open sector = EPIC_OVERLOOK."""
        category = classify_view_category(
            depth_p90_m=8000.0,
            open_sky_fraction=0.65,
            horizon_complexity=5,
            overlook_score=0.60,
            open_sky_sector_fraction=0.70,
        )
        self.assertEqual(category, CATEGORY_EPIC_OVERLOOK)

    def test_epic_overlook_at_thresholds(self):
        """Exactly at EPIC thresholds = EPIC_OVERLOOK."""
        category = classify_view_category(
            depth_p90_m=EPIC_DEPTH_MIN_M,
            open_sky_fraction=EPIC_OPEN_SKY_MIN,
            horizon_complexity=3,
            overlook_score=0.50,
            open_sky_sector_fraction=EPIC_OPEN_SKY_MIN,
        )
        self.assertEqual(category, CATEGORY_EPIC_OVERLOOK)

    def test_epic_overlook_by_high_score_fallback(self):
        """High overlook_score alone qualifies as EPIC_OVERLOOK."""
        category = classify_view_category(
            depth_p90_m=3000.0,
            open_sky_fraction=0.30,
            horizon_complexity=4,
            overlook_score=0.80,
            open_sky_sector_fraction=0.40,
        )
        self.assertEqual(category, CATEGORY_EPIC_OVERLOOK)

    def test_dramatic_enclosed_by_low_open_and_complexity(self):
        """Enclosed (low open sky) + complex skyline = DRAMATIC_ENCLOSED."""
        category = classify_view_category(
            depth_p90_m=2500.0,
            open_sky_fraction=0.25,
            horizon_complexity=12,
            overlook_score=0.45,
            open_sky_sector_fraction=0.35,  # Also low sector
        )
        self.assertEqual(category, CATEGORY_DRAMATIC_ENCLOSED)

    def test_quick_scenic_default(self):
        """Average metrics = QUICK_SCENIC."""
        category = classify_view_category(
            depth_p90_m=2000.0,
            open_sky_fraction=0.45,
            horizon_complexity=5,
            overlook_score=0.50,
            open_sky_sector_fraction=0.48,
        )
        self.assertEqual(category, CATEGORY_QUICK_SCENIC)


class TestViewExplanationsWithSectorOpenness(unittest.TestCase):
    """Test that explanations use sector openness correctly."""

    def test_explanation_uses_sector_percentage(self):
        """Explanations should use sector openness percentage."""
        explanations = generate_view_explanations(
            overlook_score=0.60,
            open_sky_fraction=0.30,  # 30% full
            depth_p90_m=6000.0,
            horizon_complexity=5,
            rim_strength=0.5,
            sun_alignment=None,
            view_category=CATEGORY_EPIC_OVERLOOK,
            open_sky_sector_fraction=0.75,  # 75% sector
        )
        # Should mention the higher sector percentage, not the low full 360%
        self.assertIn("75", explanations.short + explanations.long)

    def test_explanation_enclosed_behind_open_forward(self):
        """Enclosed behind, open forward scenario should be called out."""
        explanations = generate_view_explanations(
            overlook_score=0.55,
            open_sky_fraction=0.20,  # Only 20% full (enclosed)
            depth_p90_m=6000.0,
            horizon_complexity=8,
            rim_strength=0.4,
            sun_alignment=None,
            view_category=CATEGORY_EPIC_OVERLOOK,
            open_sky_sector_fraction=0.80,  # 80% sector (open forward)
        )
        long_lower = explanations.long.lower()
        # Should mention "enclosed behind" or similar
        self.assertTrue(
            "enclosed behind" in long_lower or "wide open toward" in long_lower,
            f"Expected 'enclosed behind' or 'wide open toward' in: {explanations.long}"
        )

    def test_explanation_short_under_80_chars(self):
        """Short explanation should be <= 80 characters."""
        for category in [CATEGORY_EPIC_OVERLOOK, CATEGORY_DRAMATIC_ENCLOSED, CATEGORY_QUICK_SCENIC]:
            explanations = generate_view_explanations(
                overlook_score=0.60,
                open_sky_fraction=0.50,
                depth_p90_m=5000.0,
                horizon_complexity=10,
                rim_strength=0.4,
                sun_alignment=None,
                view_category=category,
                open_sky_sector_fraction=0.65,
            )
            self.assertLessEqual(
                len(explanations.short), 80,
                f"Short explanation for {category} exceeds 80 chars: {explanations.short}"
            )


class TestBackwardCompatibility(unittest.TestCase):
    """Ensure new fields are additive and don't break existing API."""

    def test_overlook_view_has_sector_fraction(self):
        """OverlookView should have open_sky_sector_fraction field."""
        from terrain.types import OverlookView
        import dataclasses

        fields = {f.name for f in dataclasses.fields(OverlookView)}
        self.assertIn("open_sky_sector_fraction", fields)

    def test_overlook_view_has_view_category(self):
        """OverlookView should have view_category field."""
        from terrain.types import OverlookView
        import dataclasses

        fields = {f.name for f in dataclasses.fields(OverlookView)}
        self.assertIn("view_category", fields)

    def test_overlook_view_default_sector_fraction(self):
        """OverlookView should default sector fraction to 0.0."""
        from terrain.types import OverlookView

        view = OverlookView(
            open_sky_fraction=0.5,
            depth_p50_m=1000.0,
            depth_p90_m=2000.0,
            horizon_complexity=5,
            overlook_score=0.5,
            best_bearing_deg=180.0,
        )
        self.assertEqual(view.open_sky_sector_fraction, 0.0)

    def test_existing_fields_unchanged(self):
        """Existing OverlookView fields should still exist."""
        from terrain.types import OverlookView
        import dataclasses

        fields = {f.name for f in dataclasses.fields(OverlookView)}

        expected = {
            "open_sky_fraction",
            "depth_p50_m",
            "depth_p90_m",
            "horizon_complexity",
            "overlook_score",
            "best_bearing_deg",
            "fov_deg",
            "view_cone",
            "explanations",
            "sun_alignment",
            "horizon_profile",
        }
        for field in expected:
            self.assertIn(field, fields, f"Expected field {field} missing from OverlookView")


if __name__ == "__main__":
    unittest.main()
