"""
Unit tests for access proximity bias in rim-overlook candidate selection.

Tests ensure that:
1. Distance computation from candidate to road/trail is correct
2. NEAR_ROADS bias changes candidate ordering (closer points rank higher)
3. Access type classification (road vs trail) works correctly
4. Access bonus calculation is correct
"""
import unittest
from dataclasses import dataclass
from typing import List, Tuple, Optional


# Create a minimal RoadSegment for testing (matches accessibility.py structure)
@dataclass
class MockRoadSegment:
    """Mock road segment for testing."""
    way_id: int
    highway_type: str
    name: Optional[str]
    coords: List[Tuple[float, float]]  # [(lat, lon), ...]
    surface: Optional[str] = None
    access: Optional[str] = None


# Create a minimal RimCandidate for testing
@dataclass
class MockRimCandidate:
    """Mock rim candidate for testing."""
    lat: float
    lon: float
    elevation_m: float
    slope_deg: float
    tpi_large_m: float
    rim_strength: float


class TestAccessProximityDistance(unittest.TestCase):
    """Test distance computation from candidate to road/trail."""

    def test_distance_to_simple_road(self):
        """Test distance from a point to a simple road segment."""
        from terrain.view import compute_access_proximity

        # Create a simple horizontal road along latitude 38.5
        # from lon -109.6 to -109.4 (about 17km at this latitude)
        road = MockRoadSegment(
            way_id=1,
            highway_type="track",
            name="Test Road",
            coords=[(38.5, -109.6), (38.5, -109.4)],
        )

        # Point directly on the road
        dist, access_type, highway_type = compute_access_proximity(
            lat=38.5,
            lon=-109.5,
            roads=[road],
            access_bias="NEAR_ROADS",
        )
        self.assertLess(dist, 10)  # Should be nearly 0
        self.assertEqual(access_type, "road")
        self.assertEqual(highway_type, "track")

        # Point 100m north of the road (approx 0.0009 degrees latitude)
        dist, access_type, highway_type = compute_access_proximity(
            lat=38.5009,
            lon=-109.5,
            roads=[road],
            access_bias="NEAR_ROADS",
        )
        self.assertAlmostEqual(dist, 100, delta=20)  # ~100m with some tolerance
        self.assertEqual(access_type, "road")

    def test_distance_to_trail(self):
        """Test distance computation for trail types."""
        from terrain.view import compute_access_proximity

        # Create a footway (trail)
        trail = MockRoadSegment(
            way_id=2,
            highway_type="footway",
            name="Test Trail",
            coords=[(38.5, -109.6), (38.5, -109.4)],
        )

        # Point near the trail
        dist, access_type, highway_type = compute_access_proximity(
            lat=38.5005,
            lon=-109.5,
            roads=[trail],
            access_bias="NEAR_TRAILS",
        )
        self.assertLess(dist, 100)
        self.assertEqual(access_type, "trail")
        self.assertEqual(highway_type, "footway")

    def test_access_bias_filtering(self):
        """Test that access bias correctly filters road vs trail types."""
        from terrain.view import compute_access_proximity

        # Create both a road and a trail, with trail closer
        road = MockRoadSegment(
            way_id=1,
            highway_type="track",
            name="Far Road",
            coords=[(38.51, -109.6), (38.51, -109.4)],  # ~1km north
        )
        trail = MockRoadSegment(
            way_id=2,
            highway_type="path",
            name="Close Trail",
            coords=[(38.501, -109.6), (38.501, -109.4)],  # ~100m north
        )

        # With NEAR_ROADS bias, should find the road (ignoring closer trail)
        dist, access_type, highway_type = compute_access_proximity(
            lat=38.5,
            lon=-109.5,
            roads=[road, trail],
            access_bias="NEAR_ROADS",
        )
        self.assertEqual(access_type, "road")
        self.assertEqual(highway_type, "track")
        self.assertGreater(dist, 1000)  # Road is ~1km away

        # With NEAR_TRAILS bias, should find the trail
        dist, access_type, highway_type = compute_access_proximity(
            lat=38.5,
            lon=-109.5,
            roads=[road, trail],
            access_bias="NEAR_TRAILS",
        )
        self.assertEqual(access_type, "trail")
        self.assertEqual(highway_type, "path")
        self.assertLess(dist, 200)  # Trail is ~100m away

        # With NEAR_ROADS_OR_TRAILS, should find the closest (trail)
        dist, access_type, highway_type = compute_access_proximity(
            lat=38.5,
            lon=-109.5,
            roads=[road, trail],
            access_bias="NEAR_ROADS_OR_TRAILS",
        )
        self.assertEqual(access_type, "trail")
        self.assertLess(dist, 200)

    def test_no_matching_access(self):
        """Test when no roads/trails match the filter."""
        from terrain.view import compute_access_proximity

        # Only a trail available
        trail = MockRoadSegment(
            way_id=2,
            highway_type="path",
            name="Only Trail",
            coords=[(38.501, -109.6), (38.501, -109.4)],
        )

        # With NEAR_ROADS bias, should find nothing
        dist, access_type, highway_type = compute_access_proximity(
            lat=38.5,
            lon=-109.5,
            roads=[trail],
            access_bias="NEAR_ROADS",
        )
        self.assertEqual(dist, float('inf'))
        self.assertEqual(access_type, "none")
        self.assertIsNone(highway_type)


class TestAccessBonus(unittest.TestCase):
    """Test access bonus calculation."""

    def test_full_bonus_within_max_distance(self):
        """Location within max distance should get full bonus."""
        from terrain.view import compute_access_bonus, ACCESS_BONUS_MAX

        bonus = compute_access_bonus(distance_m=500, access_max_distance_m=800)
        self.assertEqual(bonus, ACCESS_BONUS_MAX)

        bonus = compute_access_bonus(distance_m=800, access_max_distance_m=800)
        self.assertEqual(bonus, ACCESS_BONUS_MAX)

    def test_zero_bonus_beyond_decay(self):
        """Location beyond 2x max distance should get zero bonus."""
        from terrain.view import compute_access_bonus

        bonus = compute_access_bonus(distance_m=1600, access_max_distance_m=800)
        self.assertEqual(bonus, 0.0)

        bonus = compute_access_bonus(distance_m=2000, access_max_distance_m=800)
        self.assertEqual(bonus, 0.0)

    def test_linear_decay(self):
        """Bonus should decay linearly between max and 2*max distance."""
        from terrain.view import compute_access_bonus, ACCESS_BONUS_MAX

        # Halfway through decay zone should be half bonus
        bonus = compute_access_bonus(distance_m=1200, access_max_distance_m=800)
        expected = ACCESS_BONUS_MAX * 0.5
        self.assertAlmostEqual(bonus, expected, delta=0.01)


class TestAccessBiasRanking(unittest.TestCase):
    """Test that access bias changes candidate ranking."""

    def test_near_roads_bias_reorders_candidates(self):
        """Candidates closer to roads should rank higher with NEAR_ROADS bias."""
        from terrain.view import apply_access_bias_to_candidates, ACCESS_BONUS_MAX

        # Create candidates with varying rim_strength and distance to road
        # Candidate A: slightly higher rim_strength, far from road (no bonus)
        # Candidate B: slightly lower rim_strength, close to road (full bonus)
        #
        # Math: A score = 0.70 * 1.0 = 0.70
        #       B score = 0.60 * (1 + 0.25) = 0.75
        # With bonus, B should win
        cand_a = MockRimCandidate(
            lat=38.52,  # ~2km from road (beyond decay, no bonus)
            lon=-109.5,
            elevation_m=1500,
            slope_deg=15,
            tpi_large_m=20,
            rim_strength=0.70,  # Higher natural strength
        )
        cand_b = MockRimCandidate(
            lat=38.501,  # ~100m from road (full bonus)
            lon=-109.5,
            elevation_m=1500,
            slope_deg=15,
            tpi_large_m=15,
            rim_strength=0.60,  # Lower natural strength, but bonus makes up for it
        )

        road = MockRoadSegment(
            way_id=1,
            highway_type="track",
            name="Test Road",
            coords=[(38.5, -109.6), (38.5, -109.4)],
        )

        # Without bias, A should rank higher (0.70 > 0.60)
        # With bias, B should rank higher: 0.60 * 1.25 = 0.75 > 0.70

        scored = apply_access_bias_to_candidates(
            rim_candidates=[cand_a, cand_b],
            roads=[road],
            access_bias="NEAR_ROADS",
            access_max_distance_m=800,
        )

        # Verify B got a higher rank score than A
        a_score = next(s[1] for s in scored if s[0].lat == cand_a.lat)
        b_score = next(s[1] for s in scored if s[0].lat == cand_b.lat)

        # B should have higher score due to access bonus
        self.assertGreater(b_score, a_score,
            f"Expected B score ({b_score:.3f}) > A score ({a_score:.3f})")

        # Check that B ranks first
        first_cand = scored[0][0]
        self.assertEqual(first_cand.lat, cand_b.lat,
            f"Expected B (lat={cand_b.lat}) to rank first, got lat={first_cand.lat}")

    def test_no_bias_preserves_rim_strength_order(self):
        """With NONE bias, candidates should be ordered by rim_strength."""
        from terrain.view import apply_access_bias_to_candidates

        cand_a = MockRimCandidate(
            lat=38.51,
            lon=-109.5,
            elevation_m=1500,
            slope_deg=15,
            tpi_large_m=20,
            rim_strength=0.8,
        )
        cand_b = MockRimCandidate(
            lat=38.501,
            lon=-109.5,
            elevation_m=1500,
            slope_deg=15,
            tpi_large_m=15,
            rim_strength=0.6,
        )

        road = MockRoadSegment(
            way_id=1,
            highway_type="track",
            name="Test Road",
            coords=[(38.5, -109.6), (38.5, -109.4)],
        )

        scored = apply_access_bias_to_candidates(
            rim_candidates=[cand_a, cand_b],
            roads=[road],
            access_bias="NONE",
            access_max_distance_m=800,
        )

        # A should still rank first (higher rim_strength, no bonus applied)
        first_cand = scored[0][0]
        self.assertEqual(first_cand.lat, cand_a.lat)


class TestAccessTypeClassification(unittest.TestCase):
    """Test highway type to access type classification."""

    def test_road_types(self):
        """Road highway types should classify as 'road'."""
        from terrain.view import classify_access_type

        road_types = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary',
                      'unclassified', 'residential', 'service', 'track']
        for hw_type in road_types:
            self.assertEqual(classify_access_type(hw_type), "road", f"Failed for {hw_type}")

    def test_trail_types(self):
        """Trail highway types should classify as 'trail'."""
        from terrain.view import classify_access_type

        trail_types = ['path', 'footway', 'cycleway', 'bridleway', 'steps', 'byway']
        for hw_type in trail_types:
            self.assertEqual(classify_access_type(hw_type), "trail", f"Failed for {hw_type}")

    def test_none_type(self):
        """None or unknown types should classify as 'none'."""
        from terrain.view import classify_access_type

        self.assertEqual(classify_access_type(None), "none")
        self.assertEqual(classify_access_type("unknown_type"), "none")


class TestAccessExplanationSnippet(unittest.TestCase):
    """Test access explanation snippet generation."""

    def test_very_close_to_road(self):
        """Very close to road should mention 'right at the road'."""
        from terrain.view import generate_access_explanation_snippet

        snippet = generate_access_explanation_snippet(
            distance_m=30,
            access_type="road",
            access_max_distance_m=800,
        )
        self.assertIn("right at the road", snippet.lower())

    def test_nearby_road(self):
        """Nearby road should mention distance."""
        from terrain.view import generate_access_explanation_snippet

        snippet = generate_access_explanation_snippet(
            distance_m=200,
            access_type="road",
            access_max_distance_m=800,
        )
        self.assertIn("200m", snippet)
        self.assertIn("road", snippet.lower())

    def test_trail_access(self):
        """Trail access should mention 'trail'."""
        from terrain.view import generate_access_explanation_snippet

        snippet = generate_access_explanation_snippet(
            distance_m=300,
            access_type="trail",
            access_max_distance_m=800,
        )
        self.assertIn("trail", snippet.lower())

    def test_no_access_returns_none(self):
        """No access should return None."""
        from terrain.view import generate_access_explanation_snippet

        snippet = generate_access_explanation_snippet(
            distance_m=float('inf'),
            access_type="none",
            access_max_distance_m=800,
        )
        self.assertIsNone(snippet)


if __name__ == "__main__":
    unittest.main()
