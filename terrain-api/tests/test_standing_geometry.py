"""
Unit tests for standing location geometry validation.

Tests the truth table for glow/rim classification without needing a DEM.
"""


def angle_diff(a: float, b: float) -> float:
    """Compute minimum angular difference between two bearings (0-360)."""
    diff = abs(a - b) % 360
    return min(diff, 360 - diff)


from typing import Optional, Tuple, Dict


def classify_standing_geometry(
    sun_azimuth: float,
    face_direction: float,
    camera_bearing: float,
) -> Tuple[Optional[str], Dict]:
    """
    Classify a standing position as glow, rim, or invalid.

    Truth table:
    - GLOW: Δ(A_face, A_sun) <= 60° AND Δ(A_cam, A_sun) >= 90° AND Δ(A_cam, A_face) >= 120°
    - RIM: Δ(A_face, A_sun) in [60°, 120°] AND Δ(A_cam, A_sun) <= 45°
    - Invalid: Neither glow nor rim

    Returns:
        (classification, deltas) where classification is "glow", "rim", or None
    """
    delta_face_sun = angle_diff(face_direction, sun_azimuth)
    delta_cam_sun = angle_diff(camera_bearing, sun_azimuth)
    delta_cam_face = angle_diff(camera_bearing, face_direction)

    deltas = {
        "delta_face_sun": delta_face_sun,
        "delta_cam_sun": delta_cam_sun,
        "delta_cam_face": delta_cam_face,
    }

    # Check GLOW conditions:
    # - Face must be toward sun (delta <= 60°)
    # - Camera must point AWAY from sun (delta >= 90°)
    # - Camera must face the lit side of subject (delta_cam_face >= 120°)
    is_glow = (
        delta_face_sun <= 60 and
        delta_cam_sun >= 90 and
        delta_cam_face >= 120
    )

    if is_glow:
        return "glow", deltas

    # Check RIM conditions:
    # - Face at oblique angle to sun (60° <= delta <= 120°) for rim lighting
    # - Camera shooting toward sun (delta <= 45°) to see the bright edge
    is_rim = (
        60 <= delta_face_sun <= 120 and
        delta_cam_sun <= 45
    )

    if is_rim:
        return "rim", deltas

    return None, deltas


class TestStandingGeometry:
    """Test standing location geometry classification."""

    def test_glow_valid(self):
        """
        Test: A_sun=245, A_face=265, A_cam=85

        Geometry:
        - Face points WSW (265°), sun is WSW (245°) → face toward sun
        - Camera points E (85°), away from sun → not shooting into sun
        - Camera is ~180° from face → seeing the lit front
        """
        result, deltas = classify_standing_geometry(
            sun_azimuth=245,
            face_direction=265,
            camera_bearing=85,
        )

        # Verify deltas
        assert deltas["delta_face_sun"] == 20, f"Expected 20°, got {deltas['delta_face_sun']}°"
        assert deltas["delta_cam_sun"] == 160, f"Expected 160°, got {deltas['delta_cam_sun']}°"
        assert deltas["delta_cam_face"] == 180, f"Expected 180°, got {deltas['delta_cam_face']}°"

        # Should classify as glow
        assert result == "glow", f"Expected 'glow', got '{result}' with deltas {deltas}"

    def test_rim_valid(self):
        """
        Test: A_sun=245, A_face=160, A_cam=245

        Geometry:
        - Face points SSE (160°), sun is WSW (245°) → face at 85° to sun (rim light)
        - Camera pointing WSW (245°), same as sun → shooting toward sun
        - Camera sees the bright rim edge
        """
        result, deltas = classify_standing_geometry(
            sun_azimuth=245,
            face_direction=160,
            camera_bearing=245,
        )

        # Verify deltas
        assert deltas["delta_face_sun"] == 85, f"Expected 85°, got {deltas['delta_face_sun']}°"
        assert deltas["delta_cam_sun"] == 0, f"Expected 0°, got {deltas['delta_cam_sun']}°"

        # Should classify as rim
        assert result == "rim", f"Expected 'rim', got '{result}' with deltas {deltas}"

    def test_invalid_fails(self):
        """
        Test: A_sun=245, A_face=105, A_cam=285

        Geometry:
        - Face points ESE (105°), sun is WSW (245°) → face 140° from sun (backlit!)
        - Camera pointing WNW (285°), 40° from sun
        - This is invalid because the face is not receiving glow or rim light
        """
        result, deltas = classify_standing_geometry(
            sun_azimuth=245,
            face_direction=105,
            camera_bearing=285,
        )

        # Verify deltas
        assert deltas["delta_face_sun"] == 140, f"Expected 140°, got {deltas['delta_face_sun']}°"
        assert deltas["delta_cam_sun"] == 40, f"Expected 40°, got {deltas['delta_cam_sun']}°"

        # Should be invalid (neither glow nor rim)
        # Face is backlit (140° from sun), doesn't qualify for rim (needs 60-120°)
        assert result is None, f"Expected None (invalid), got '{result}' with deltas {deltas}"

    def test_glow_camera_too_close_to_sun(self):
        """Camera pointing toward sun fails glow check."""
        result, deltas = classify_standing_geometry(
            sun_azimuth=245,
            face_direction=265,  # Face toward sun
            camera_bearing=260,  # Camera also toward sun
        )

        assert deltas["delta_cam_sun"] == 15, "Camera should be 15° from sun"
        assert result is None, "Should fail - camera too close to sun for glow"

    def test_glow_face_away_from_sun(self):
        """Face pointing away from sun fails glow check."""
        result, deltas = classify_standing_geometry(
            sun_azimuth=245,
            face_direction=45,   # Face pointing NE, away from WSW sun
            camera_bearing=225,  # Camera pointing SW
        )

        assert deltas["delta_face_sun"] == 160, "Face should be 160° from sun"
        assert result is None, "Should fail - face pointing away from sun"

    def test_rim_face_outside_range(self):
        """Face not in rim lighting range (60-120°) fails rim check."""
        # Face at 150° from sun - too far for rim
        result, deltas = classify_standing_geometry(
            sun_azimuth=245,
            face_direction=95,   # 150° from sun
            camera_bearing=245,  # Camera toward sun
        )

        assert deltas["delta_face_sun"] == 150, "Face should be 150° from sun"
        assert result is None, "Should fail - face outside rim range"


if __name__ == "__main__":
    tests = TestStandingGeometry()
    tests.test_glow_valid()
    tests.test_rim_valid()
    tests.test_invalid_fails()
    tests.test_glow_camera_too_close_to_sun()
    tests.test_glow_face_away_from_sun()
    tests.test_rim_face_outside_range()
    print("All tests passed!")
