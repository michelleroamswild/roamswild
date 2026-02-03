"""
Calibration harness for distant glow scoring weights.

Provides:
- Storage for user ratings (hit/meh/miss) with feature vectors
- Export of labeled data for analysis
- Simple weight tuning via logistic regression or coordinate descent
- Config profiles for weight management
"""
from __future__ import annotations

import json
import os
import math
from datetime import datetime
from dataclasses import dataclass, asdict, field
from typing import List, Dict, Optional, Literal, Tuple
from pathlib import Path

# Default storage location
DEFAULT_CALIBRATION_DIR = Path(__file__).parent.parent / "calibration_data"
DEFAULT_RATINGS_FILE = "ratings.jsonl"
DEFAULT_WEIGHTS_FILE = "weights.json"


@dataclass
class FeatureVector:
    """
    Feature vector for a rated viewpoint.

    Contains all numeric fields used in distant glow scoring.
    """
    # DAGS components (0-1 normalized)
    depth_norm: float = 0.0
    open_norm: float = 0.0
    rim_norm: float = 0.0
    sun_low_norm: float = 0.0
    sun_clear_norm: float = 0.0
    dir_norm: float = 0.0

    # VAS (Visual Anchor Score) components
    anchor_score: float = 0.0
    curvature_salience: float = 0.0
    slope_break_salience: float = 0.0
    relief_salience: float = 0.0
    anchor_distance_m: float = 0.0

    # LAA (Light-at-Anchor) components
    anchor_sun_incidence: float = 0.0
    anchor_shadowed: int = 0  # 0 or 1
    anchor_light_score: float = 0.0
    anchor_light_type: int = 0  # Encoded: 0=NONE, 1=FRONT_LIT, 2=SIDE_LIT, 3=BACK_LIT, 4=RIM_LIT

    # Glow window metrics
    peak_score: float = 0.0
    duration_minutes: int = 0
    sun_clears_ridge_minutes: int = -1  # -1 if not applicable
    peak_anchor_light_score: float = 0.0

    # Final ranking score
    distant_glow_final_score: float = 0.0


@dataclass
class CalibrationRating:
    """
    A single calibration rating with metadata and features.
    """
    # Timestamp
    timestamp: str

    # Request metadata
    region_lat: float
    region_lon: float
    date: str
    event_type: str  # "sunrise" or "sunset"

    # Viewpoint identification
    viewpoint_id: str
    viewpoint_lat: float
    viewpoint_lon: float

    # User rating
    rating: Literal["hit", "meh", "miss"]

    # Feature vector
    features: FeatureVector


@dataclass
class WeightProfile:
    """
    Weight profile for distant glow scoring.

    Default values match the current hardcoded constants.
    """
    name: str = "default"

    # DAGS weights (should sum to 1.0)
    dags_weight_depth: float = 0.25
    dags_weight_open: float = 0.20
    dags_weight_rim: float = 0.15
    dags_weight_sun_low: float = 0.15
    dags_weight_sun_clear: float = 0.10
    dags_weight_dir: float = 0.15

    # VAS combination weights
    vas_dags_base_mult: float = 0.70
    vas_dags_anchor_mult: float = 0.30

    # LAA combination weights
    laa_final_base_mult: float = 0.75
    laa_final_light_mult: float = 0.25

    # Metadata
    created_at: str = ""
    tuned_from_n_samples: int = 0

    def __post_init__(self):
        if not self.created_at:
            self.created_at = datetime.utcnow().isoformat() + "Z"


# Anchor light type encoding
ANCHOR_LIGHT_TYPE_MAP = {
    "NONE": 0,
    "FRONT_LIT": 1,
    "SIDE_LIT": 2,
    "BACK_LIT": 3,
    "RIM_LIT": 4,
}


def encode_anchor_light_type(light_type: str) -> int:
    """Encode anchor light type string to integer."""
    return ANCHOR_LIGHT_TYPE_MAP.get(light_type, 0)


def extract_feature_vector(distant_glow: Dict) -> FeatureVector:
    """
    Extract feature vector from a DistantGlowScore dict.

    Args:
        distant_glow: Dict representation of DistantGlowScore

    Returns:
        FeatureVector with all relevant fields
    """
    # DAGS components
    depth_norm = distant_glow.get("depth_norm", 0.0)
    open_norm = distant_glow.get("open_norm", 0.0)
    rim_norm = distant_glow.get("rim_norm", 0.0)
    sun_low_norm = distant_glow.get("sun_low_norm", 0.0)
    sun_clear_norm = distant_glow.get("sun_clear_norm", 0.0)
    dir_norm = distant_glow.get("dir_norm", 0.0)

    # VAS components
    visual_anchor = distant_glow.get("visual_anchor") or {}
    anchor_score = visual_anchor.get("anchor_score", 0.0)
    curvature_salience = visual_anchor.get("curvature_salience", 0.0)
    slope_break_salience = visual_anchor.get("slope_break_salience", 0.0)
    relief_salience = visual_anchor.get("relief_salience", 0.0)
    anchor_distance_m = visual_anchor.get("anchor_distance_m", 0.0)

    # LAA components
    anchor_light = distant_glow.get("anchor_light") or {}
    anchor_sun_incidence = anchor_light.get("anchor_sun_incidence", 0.0)
    anchor_shadowed = 1 if anchor_light.get("anchor_shadowed", False) else 0
    anchor_light_score = anchor_light.get("anchor_light_score", 0.0)
    anchor_light_type = encode_anchor_light_type(
        anchor_light.get("anchor_light_type", "NONE")
    )

    # Glow window metrics
    glow_window = distant_glow.get("glow_window") or {}
    peak_score = glow_window.get("peak_score", 0.0)
    duration_minutes = glow_window.get("duration_minutes", 0)
    sun_clears_ridge_minutes = glow_window.get("sun_clears_ridge_minutes")
    if sun_clears_ridge_minutes is None:
        sun_clears_ridge_minutes = -1
    peak_anchor_light_score = glow_window.get("peak_anchor_light_score", 0.0)

    # Final score
    distant_glow_final_score = distant_glow.get("distant_glow_final_score", 0.0)

    return FeatureVector(
        depth_norm=depth_norm,
        open_norm=open_norm,
        rim_norm=rim_norm,
        sun_low_norm=sun_low_norm,
        sun_clear_norm=sun_clear_norm,
        dir_norm=dir_norm,
        anchor_score=anchor_score,
        curvature_salience=curvature_salience,
        slope_break_salience=slope_break_salience,
        relief_salience=relief_salience,
        anchor_distance_m=anchor_distance_m,
        anchor_sun_incidence=anchor_sun_incidence,
        anchor_shadowed=anchor_shadowed,
        anchor_light_score=anchor_light_score,
        anchor_light_type=anchor_light_type,
        peak_score=peak_score,
        duration_minutes=duration_minutes,
        sun_clears_ridge_minutes=sun_clears_ridge_minutes,
        peak_anchor_light_score=peak_anchor_light_score,
        distant_glow_final_score=distant_glow_final_score,
    )


class CalibrationStore:
    """
    Storage for calibration ratings.

    Uses JSONL format for append-only efficiency.
    """

    def __init__(self, storage_dir: Optional[Path] = None):
        self.storage_dir = storage_dir or DEFAULT_CALIBRATION_DIR
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.ratings_file = self.storage_dir / DEFAULT_RATINGS_FILE
        self.weights_file = self.storage_dir / DEFAULT_WEIGHTS_FILE

    def save_rating(self, rating: CalibrationRating) -> None:
        """Append a rating to the JSONL file."""
        with open(self.ratings_file, "a") as f:
            f.write(json.dumps(asdict(rating)) + "\n")

    def load_ratings(self) -> List[CalibrationRating]:
        """Load all ratings from the JSONL file."""
        ratings = []
        if not self.ratings_file.exists():
            return ratings

        with open(self.ratings_file, "r") as f:
            for line in f:
                line = line.strip()
                if line:
                    data = json.loads(line)
                    # Reconstruct FeatureVector
                    features = FeatureVector(**data["features"])
                    data["features"] = features
                    ratings.append(CalibrationRating(**data))

        return ratings

    def export_ratings(self) -> List[Dict]:
        """Export all ratings as list of dicts."""
        ratings = self.load_ratings()
        return [asdict(r) for r in ratings]

    def get_rating_count(self) -> int:
        """Get the number of stored ratings."""
        if not self.ratings_file.exists():
            return 0
        with open(self.ratings_file, "r") as f:
            return sum(1 for line in f if line.strip())

    def save_weights(self, profile: WeightProfile) -> None:
        """Save a weight profile."""
        # Load existing profiles
        profiles = self.load_all_weights()
        profiles[profile.name] = asdict(profile)

        with open(self.weights_file, "w") as f:
            json.dump(profiles, f, indent=2)

    def load_weights(self, name: str = "default") -> Optional[WeightProfile]:
        """Load a weight profile by name."""
        profiles = self.load_all_weights()
        if name not in profiles:
            return None
        return WeightProfile(**profiles[name])

    def load_all_weights(self) -> Dict[str, Dict]:
        """Load all weight profiles."""
        if not self.weights_file.exists():
            return {}
        with open(self.weights_file, "r") as f:
            return json.load(f)


def rating_to_target(rating: str) -> float:
    """Convert rating label to numeric target for regression."""
    if rating == "hit":
        return 1.0
    elif rating == "miss":
        return 0.0
    else:  # meh
        return 0.5


def sigmoid(x: float) -> float:
    """Sigmoid function."""
    if x > 700:  # Prevent overflow
        return 1.0
    elif x < -700:
        return 0.0
    return 1.0 / (1.0 + math.exp(-x))


def compute_dags_score(features: FeatureVector, weights: WeightProfile) -> float:
    """Compute DAGS score from features and weights."""
    return (
        weights.dags_weight_depth * features.depth_norm +
        weights.dags_weight_open * features.open_norm +
        weights.dags_weight_rim * features.rim_norm +
        weights.dags_weight_sun_low * features.sun_low_norm +
        weights.dags_weight_sun_clear * features.sun_clear_norm +
        weights.dags_weight_dir * features.dir_norm
    )


def compute_final_score(features: FeatureVector, weights: WeightProfile) -> float:
    """Compute final distant glow score from features and weights."""
    dags = compute_dags_score(features, weights)
    combined = min(1.0, dags * (
        weights.vas_dags_base_mult +
        weights.vas_dags_anchor_mult * features.anchor_score
    ))
    final = min(1.0, max(0.0, combined * (
        weights.laa_final_base_mult +
        weights.laa_final_light_mult * features.anchor_light_score
    )))
    return final


def tune_weights_logistic(
    ratings: List[CalibrationRating],
    base_profile: Optional[WeightProfile] = None,
    learning_rate: float = 0.1,
    n_iterations: int = 100,
) -> WeightProfile:
    """
    Tune weights using simple gradient descent on logistic loss.

    Uses hit/miss ratings (ignores meh or treats as 0.5).
    Optimizes DAGS weights to minimize binary cross-entropy.

    Args:
        ratings: List of calibration ratings
        base_profile: Starting weights (default if None)
        learning_rate: Step size for gradient descent
        n_iterations: Number of optimization iterations

    Returns:
        Tuned WeightProfile
    """
    if not ratings:
        return base_profile or WeightProfile(name="tuned")

    # Start from base profile
    profile = WeightProfile(
        name="tuned",
        **(asdict(base_profile) if base_profile else {})
    )
    profile.name = "tuned"

    # Filter to hit/miss (optional: include meh as 0.5)
    labeled = [(r.features, rating_to_target(r.rating)) for r in ratings]

    if not labeled:
        return profile

    # Extract DAGS weights as array
    weight_names = [
        "dags_weight_depth", "dags_weight_open", "dags_weight_rim",
        "dags_weight_sun_low", "dags_weight_sun_clear", "dags_weight_dir"
    ]

    weights = [getattr(profile, name) for name in weight_names]

    # Gradient descent
    for _ in range(n_iterations):
        gradients = [0.0] * len(weights)

        for features, target in labeled:
            # Compute predicted score (just DAGS for simplicity)
            feature_vals = [
                features.depth_norm, features.open_norm, features.rim_norm,
                features.sun_low_norm, features.sun_clear_norm, features.dir_norm
            ]

            pred = sum(w * f for w, f in zip(weights, feature_vals))
            pred_sigmoid = sigmoid(pred * 5)  # Scale for sharper sigmoid

            # Binary cross-entropy gradient
            error = pred_sigmoid - target

            for i, f in enumerate(feature_vals):
                gradients[i] += error * f * pred_sigmoid * (1 - pred_sigmoid) * 5

        # Update weights
        for i in range(len(weights)):
            weights[i] -= learning_rate * gradients[i] / len(labeled)
            weights[i] = max(0.01, min(0.5, weights[i]))  # Clamp to sane range

    # Normalize DAGS weights to sum to 1.0
    total = sum(weights)
    if total > 0:
        weights = [w / total for w in weights]

    # Update profile
    for name, value in zip(weight_names, weights):
        setattr(profile, name, round(value, 4))

    profile.tuned_from_n_samples = len(labeled)
    profile.created_at = datetime.utcnow().isoformat() + "Z"

    return profile


def tune_weights_coordinate_descent(
    ratings: List[CalibrationRating],
    base_profile: Optional[WeightProfile] = None,
    n_iterations: int = 20,
) -> WeightProfile:
    """
    Tune weights using coordinate descent to maximize ranking quality.

    Optimizes one weight at a time to minimize pairwise ranking loss
    (hit should rank higher than miss).

    Args:
        ratings: List of calibration ratings
        base_profile: Starting weights (default if None)
        n_iterations: Number of full sweeps through weights

    Returns:
        Tuned WeightProfile
    """
    if not ratings:
        return base_profile or WeightProfile(name="tuned")

    profile = WeightProfile(
        name="tuned",
        **(asdict(base_profile) if base_profile else {})
    )
    profile.name = "tuned"

    # Build pairs: (hit, miss) where hit should rank higher
    hits = [r for r in ratings if r.rating == "hit"]
    misses = [r for r in ratings if r.rating == "miss"]

    pairs = [(h.features, m.features) for h in hits for m in misses]

    if not pairs:
        return profile

    weight_names = [
        "dags_weight_depth", "dags_weight_open", "dags_weight_rim",
        "dags_weight_sun_low", "dags_weight_sun_clear", "dags_weight_dir"
    ]

    def count_correct_pairs(profile: WeightProfile) -> int:
        """Count pairs where hit ranks higher than miss."""
        correct = 0
        for hit_features, miss_features in pairs:
            hit_score = compute_final_score(hit_features, profile)
            miss_score = compute_final_score(miss_features, profile)
            if hit_score > miss_score:
                correct += 1
        return correct

    # Coordinate descent
    step_sizes = [0.05, 0.02, 0.01]

    for _ in range(n_iterations):
        for name in weight_names:
            best_score = count_correct_pairs(profile)
            best_value = getattr(profile, name)

            for step in step_sizes:
                for direction in [-1, 1]:
                    new_value = best_value + direction * step
                    new_value = max(0.05, min(0.4, new_value))  # Clamp

                    setattr(profile, name, new_value)
                    score = count_correct_pairs(profile)

                    if score > best_score:
                        best_score = score
                        best_value = new_value
                    else:
                        setattr(profile, name, best_value)

    # Normalize DAGS weights
    weights = [getattr(profile, name) for name in weight_names]
    total = sum(weights)
    if total > 0:
        for name, w in zip(weight_names, weights):
            setattr(profile, name, round(w / total, 4))

    profile.tuned_from_n_samples = len(ratings)
    profile.created_at = datetime.utcnow().isoformat() + "Z"

    return profile


def tune_weights(
    ratings: List[CalibrationRating],
    method: Literal["logistic", "coordinate_descent"] = "logistic",
    base_profile: Optional[WeightProfile] = None,
) -> WeightProfile:
    """
    Tune weights using the specified method.

    Args:
        ratings: List of calibration ratings
        method: Tuning method ("logistic" or "coordinate_descent")
        base_profile: Starting weights

    Returns:
        Tuned WeightProfile
    """
    if method == "logistic":
        return tune_weights_logistic(ratings, base_profile)
    else:
        return tune_weights_coordinate_descent(ratings, base_profile)
