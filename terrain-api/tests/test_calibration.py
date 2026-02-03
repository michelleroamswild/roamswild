"""
Unit tests for calibration harness.

Tests:
1. Rating endpoint persists rows
2. Export returns rows
3. Tune returns weights with correct keys and sane ranges
"""

import os
import json
import tempfile
from pathlib import Path
from datetime import datetime

from terrain.calibration import (
    CalibrationStore,
    CalibrationRating,
    FeatureVector,
    WeightProfile,
    extract_feature_vector,
    tune_weights,
    tune_weights_logistic,
    tune_weights_coordinate_descent,
    encode_anchor_light_type,
    compute_dags_score,
    compute_final_score,
)


class TestFeatureVector:
    """Test feature vector operations."""

    def test_extract_feature_vector_basic(self):
        """Feature extraction should work with minimal data."""
        distant_glow = {
            "depth_norm": 0.5,
            "open_norm": 0.8,
            "rim_norm": 0.3,
            "sun_low_norm": 0.7,
            "sun_clear_norm": 0.6,
            "dir_norm": 0.4,
            "distant_glow_final_score": 0.65,
        }

        features = extract_feature_vector(distant_glow)

        assert features.depth_norm == 0.5
        assert features.open_norm == 0.8
        assert features.rim_norm == 0.3
        assert features.sun_low_norm == 0.7
        assert features.sun_clear_norm == 0.6
        assert features.dir_norm == 0.4
        assert features.distant_glow_final_score == 0.65

    def test_extract_feature_vector_with_vas(self):
        """Feature extraction should include VAS components."""
        distant_glow = {
            "depth_norm": 0.5,
            "open_norm": 0.8,
            "rim_norm": 0.3,
            "sun_low_norm": 0.7,
            "sun_clear_norm": 0.6,
            "dir_norm": 0.4,
            "visual_anchor": {
                "anchor_score": 0.75,
                "curvature_salience": 0.6,
                "slope_break_salience": 0.8,
                "relief_salience": 0.5,
                "anchor_distance_m": 5000.0,
            },
            "distant_glow_final_score": 0.65,
        }

        features = extract_feature_vector(distant_glow)

        assert features.anchor_score == 0.75
        assert features.curvature_salience == 0.6
        assert features.slope_break_salience == 0.8
        assert features.relief_salience == 0.5
        assert features.anchor_distance_m == 5000.0

    def test_extract_feature_vector_with_laa(self):
        """Feature extraction should include LAA components."""
        distant_glow = {
            "depth_norm": 0.5,
            "anchor_light": {
                "anchor_sun_incidence": 0.45,
                "anchor_shadowed": True,
                "anchor_light_score": 0.3,
                "anchor_light_type": "SIDE_LIT",
            },
            "distant_glow_final_score": 0.65,
        }

        features = extract_feature_vector(distant_glow)

        assert features.anchor_sun_incidence == 0.45
        assert features.anchor_shadowed == 1
        assert features.anchor_light_score == 0.3
        assert features.anchor_light_type == 2  # SIDE_LIT encoded

    def test_extract_feature_vector_with_glow_window(self):
        """Feature extraction should include glow window components."""
        distant_glow = {
            "depth_norm": 0.5,
            "glow_window": {
                "peak_score": 0.82,
                "duration_minutes": 40,
                "sun_clears_ridge_minutes": 15,
                "peak_anchor_light_score": 0.71,
            },
            "distant_glow_final_score": 0.65,
        }

        features = extract_feature_vector(distant_glow)

        assert features.peak_score == 0.82
        assert features.duration_minutes == 40
        assert features.sun_clears_ridge_minutes == 15
        assert features.peak_anchor_light_score == 0.71

    def test_encode_anchor_light_type(self):
        """Anchor light type encoding should work correctly."""
        assert encode_anchor_light_type("NONE") == 0
        assert encode_anchor_light_type("FRONT_LIT") == 1
        assert encode_anchor_light_type("SIDE_LIT") == 2
        assert encode_anchor_light_type("BACK_LIT") == 3
        assert encode_anchor_light_type("RIM_LIT") == 4
        assert encode_anchor_light_type("UNKNOWN") == 0  # Default


class TestCalibrationStore:
    """Test calibration storage."""

    def test_save_and_load_rating(self):
        """Rating should persist and load correctly."""
        with tempfile.TemporaryDirectory() as tmpdir:
            store = CalibrationStore(Path(tmpdir))

            features = FeatureVector(
                depth_norm=0.5,
                open_norm=0.8,
                anchor_score=0.6,
                distant_glow_final_score=0.65,
            )

            rating = CalibrationRating(
                timestamp=datetime.utcnow().isoformat() + "Z",
                region_lat=38.5,
                region_lon=-109.5,
                date="2024-06-21",
                event_type="sunrise",
                viewpoint_id="test-1",
                viewpoint_lat=38.51,
                viewpoint_lon=-109.48,
                rating="hit",
                features=features,
            )

            store.save_rating(rating)

            # Load and verify
            loaded = store.load_ratings()
            assert len(loaded) == 1
            assert loaded[0].rating == "hit"
            assert loaded[0].viewpoint_id == "test-1"
            assert loaded[0].features.depth_norm == 0.5
            assert loaded[0].features.anchor_score == 0.6

    def test_export_ratings(self):
        """Export should return all ratings as dicts."""
        with tempfile.TemporaryDirectory() as tmpdir:
            store = CalibrationStore(Path(tmpdir))

            for i, rating_label in enumerate(["hit", "meh", "miss"]):
                features = FeatureVector(depth_norm=0.3 * (i + 1))
                rating = CalibrationRating(
                    timestamp=datetime.utcnow().isoformat() + "Z",
                    region_lat=38.5,
                    region_lon=-109.5,
                    date="2024-06-21",
                    event_type="sunrise",
                    viewpoint_id=f"test-{i}",
                    viewpoint_lat=38.5 + 0.01 * i,
                    viewpoint_lon=-109.5,
                    rating=rating_label,
                    features=features,
                )
                store.save_rating(rating)

            exported = store.export_ratings()
            assert len(exported) == 3
            assert exported[0]["rating"] == "hit"
            assert exported[1]["rating"] == "meh"
            assert exported[2]["rating"] == "miss"
            assert "features" in exported[0]
            assert exported[0]["features"]["depth_norm"] == 0.3

    def test_rating_count(self):
        """Rating count should be accurate."""
        with tempfile.TemporaryDirectory() as tmpdir:
            store = CalibrationStore(Path(tmpdir))

            assert store.get_rating_count() == 0

            for i in range(5):
                features = FeatureVector()
                rating = CalibrationRating(
                    timestamp=datetime.utcnow().isoformat() + "Z",
                    region_lat=38.5,
                    region_lon=-109.5,
                    date="2024-06-21",
                    event_type="sunrise",
                    viewpoint_id=f"test-{i}",
                    viewpoint_lat=38.5,
                    viewpoint_lon=-109.5,
                    rating="hit",
                    features=features,
                )
                store.save_rating(rating)

            assert store.get_rating_count() == 5

    def test_save_and_load_weights(self):
        """Weight profiles should persist correctly."""
        with tempfile.TemporaryDirectory() as tmpdir:
            store = CalibrationStore(Path(tmpdir))

            profile = WeightProfile(
                name="test-profile",
                dags_weight_depth=0.30,
                dags_weight_open=0.18,
                vas_dags_anchor_mult=0.35,
            )

            store.save_weights(profile)

            loaded = store.load_weights("test-profile")
            assert loaded is not None
            assert loaded.name == "test-profile"
            assert loaded.dags_weight_depth == 0.30
            assert loaded.dags_weight_open == 0.18
            assert loaded.vas_dags_anchor_mult == 0.35

    def test_load_nonexistent_weights(self):
        """Loading nonexistent weights should return None."""
        with tempfile.TemporaryDirectory() as tmpdir:
            store = CalibrationStore(Path(tmpdir))
            assert store.load_weights("nonexistent") is None


class TestWeightTuning:
    """Test weight tuning methods."""

    def _create_test_ratings(self) -> list:
        """Create test ratings with clear hit/miss patterns."""
        ratings = []

        # Create "hit" ratings with high depth, open, anchor scores
        for i in range(5):
            features = FeatureVector(
                depth_norm=0.8 + 0.04 * i,
                open_norm=0.7 + 0.05 * i,
                rim_norm=0.6,
                sun_low_norm=0.8,
                sun_clear_norm=0.7,
                dir_norm=0.5,
                anchor_score=0.8,
                anchor_light_score=0.7,
                distant_glow_final_score=0.85,
            )
            ratings.append(CalibrationRating(
                timestamp=datetime.utcnow().isoformat() + "Z",
                region_lat=38.5,
                region_lon=-109.5,
                date="2024-06-21",
                event_type="sunrise",
                viewpoint_id=f"hit-{i}",
                viewpoint_lat=38.5,
                viewpoint_lon=-109.5,
                rating="hit",
                features=features,
            ))

        # Create "miss" ratings with low depth, open scores
        for i in range(5):
            features = FeatureVector(
                depth_norm=0.2 + 0.02 * i,
                open_norm=0.3 + 0.03 * i,
                rim_norm=0.2,
                sun_low_norm=0.3,
                sun_clear_norm=0.2,
                dir_norm=0.2,
                anchor_score=0.1,
                anchor_light_score=0.1,
                distant_glow_final_score=0.25,
            )
            ratings.append(CalibrationRating(
                timestamp=datetime.utcnow().isoformat() + "Z",
                region_lat=38.5,
                region_lon=-109.5,
                date="2024-06-21",
                event_type="sunrise",
                viewpoint_id=f"miss-{i}",
                viewpoint_lat=38.5,
                viewpoint_lon=-109.5,
                rating="miss",
                features=features,
            ))

        return ratings

    def test_tune_weights_logistic_returns_valid_profile(self):
        """Logistic tuning should return weights with correct keys."""
        ratings = self._create_test_ratings()
        profile = tune_weights_logistic(ratings)

        # Check all DAGS weights are present and in valid range (0-1)
        # Individual weights can be high if data strongly supports it
        assert 0.0 < profile.dags_weight_depth <= 1.0
        assert 0.0 <= profile.dags_weight_open <= 1.0
        assert 0.0 <= profile.dags_weight_rim <= 1.0
        assert 0.0 <= profile.dags_weight_sun_low <= 1.0
        assert 0.0 <= profile.dags_weight_sun_clear <= 1.0
        assert 0.0 <= profile.dags_weight_dir <= 1.0

        # Weights should sum to ~1.0
        total = (
            profile.dags_weight_depth +
            profile.dags_weight_open +
            profile.dags_weight_rim +
            profile.dags_weight_sun_low +
            profile.dags_weight_sun_clear +
            profile.dags_weight_dir
        )
        assert abs(total - 1.0) < 0.01, f"DAGS weights should sum to 1.0, got {total}"

        # VAS/LAA weights should be preserved
        assert profile.vas_dags_base_mult == 0.70
        assert profile.vas_dags_anchor_mult == 0.30
        assert profile.laa_final_base_mult == 0.75
        assert profile.laa_final_light_mult == 0.25

        # Metadata should be set
        assert profile.tuned_from_n_samples == len(ratings)
        assert profile.created_at != ""

    def test_tune_weights_coordinate_descent_returns_valid_profile(self):
        """Coordinate descent tuning should return valid weights."""
        ratings = self._create_test_ratings()
        profile = tune_weights_coordinate_descent(ratings)

        # Check all weights are in sane ranges
        assert 0.0 < profile.dags_weight_depth <= 0.5
        assert 0.0 < profile.dags_weight_open <= 0.5
        assert 0.0 < profile.dags_weight_rim <= 0.5

        # Weights should sum to ~1.0
        total = (
            profile.dags_weight_depth +
            profile.dags_weight_open +
            profile.dags_weight_rim +
            profile.dags_weight_sun_low +
            profile.dags_weight_sun_clear +
            profile.dags_weight_dir
        )
        assert abs(total - 1.0) < 0.01

    def test_tune_weights_empty_ratings(self):
        """Tuning with empty ratings should return default profile."""
        profile = tune_weights([], method="logistic")
        assert profile.name == "tuned"
        # Should have default values
        assert profile.dags_weight_depth == 0.25

    def test_tune_weights_respects_method(self):
        """Tune should use the specified method."""
        ratings = self._create_test_ratings()

        profile_log = tune_weights(ratings, method="logistic")
        profile_cd = tune_weights(ratings, method="coordinate_descent")

        # Both should produce valid results
        assert profile_log.tuned_from_n_samples > 0
        assert profile_cd.tuned_from_n_samples > 0

    def test_compute_dags_score(self):
        """DAGS score computation should work correctly."""
        features = FeatureVector(
            depth_norm=0.8,
            open_norm=0.6,
            rim_norm=0.5,
            sun_low_norm=0.7,
            sun_clear_norm=0.9,
            dir_norm=0.4,
        )
        profile = WeightProfile()

        score = compute_dags_score(features, profile)

        expected = (
            0.25 * 0.8 +  # depth
            0.20 * 0.6 +  # open
            0.15 * 0.5 +  # rim
            0.15 * 0.7 +  # sun_low
            0.10 * 0.9 +  # sun_clear
            0.15 * 0.4    # dir
        )
        assert abs(score - expected) < 0.001

    def test_compute_final_score(self):
        """Final score computation should include VAS and LAA."""
        features = FeatureVector(
            depth_norm=0.8,
            open_norm=0.6,
            rim_norm=0.5,
            sun_low_norm=0.7,
            sun_clear_norm=0.9,
            dir_norm=0.4,
            anchor_score=0.75,
            anchor_light_score=0.65,
        )
        profile = WeightProfile()

        final = compute_final_score(features, profile)

        # Should be bounded 0-1
        assert 0.0 <= final <= 1.0

        # Should be higher with good anchor scores
        features_no_anchor = FeatureVector(
            depth_norm=0.8,
            open_norm=0.6,
            rim_norm=0.5,
            sun_low_norm=0.7,
            sun_clear_norm=0.9,
            dir_norm=0.4,
            anchor_score=0.0,
            anchor_light_score=0.0,
        )
        final_no_anchor = compute_final_score(features_no_anchor, profile)

        assert final > final_no_anchor


class TestWeightProfile:
    """Test weight profile dataclass."""

    def test_default_profile(self):
        """Default profile should have expected values."""
        profile = WeightProfile()

        assert profile.name == "default"
        assert profile.dags_weight_depth == 0.25
        assert profile.dags_weight_open == 0.20
        assert profile.dags_weight_rim == 0.15
        assert profile.dags_weight_sun_low == 0.15
        assert profile.dags_weight_sun_clear == 0.10
        assert profile.dags_weight_dir == 0.15

        # Weights should sum to 1.0
        total = (
            profile.dags_weight_depth +
            profile.dags_weight_open +
            profile.dags_weight_rim +
            profile.dags_weight_sun_low +
            profile.dags_weight_sun_clear +
            profile.dags_weight_dir
        )
        assert abs(total - 1.0) < 0.001

    def test_profile_timestamp(self):
        """Profile should auto-generate timestamp."""
        profile = WeightProfile()
        assert profile.created_at != ""
        assert "Z" in profile.created_at


if __name__ == "__main__":
    import sys

    test_classes = [
        TestFeatureVector,
        TestCalibrationStore,
        TestWeightTuning,
        TestWeightProfile,
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
