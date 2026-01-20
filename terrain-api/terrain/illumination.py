"""
Sun-surface illumination calculations.

Computes incidence angles, glow scores, and optimal lighting windows.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from .types import SunPosition, IncidencePoint, GlowWindow


# =============================================================================
# Event-Based Directional Preference (Facing Bucket Boosts)
# =============================================================================
# At sunset, west/northwest terrain is strongly favored.
# At sunrise, east/southeast terrain is strongly favored.
#
# Sunset facing boosts:    Sunrise facing boosts:
#   W-NW: +1.0               E-SE: +1.0
#   SW:   +0.8               NE:   +0.8
#   S:    +0.4               N:    +0.4
#   SE/E: ~0 (rim only)      SW/W: ~0 (rim only)


def _get_cardinal_direction(face_deg: float) -> str:
    """Convert face direction to cardinal/intercardinal direction."""
    # Normalize to 0-360
    face_deg = face_deg % 360

    # 16-point compass rose (22.5° per segment)
    directions = [
        (0, "N"), (22.5, "NNE"), (45, "NE"), (67.5, "ENE"),
        (90, "E"), (112.5, "ESE"), (135, "SE"), (157.5, "SSE"),
        (180, "S"), (202.5, "SSW"), (225, "SW"), (247.5, "WSW"),
        (270, "W"), (292.5, "WNW"), (315, "NW"), (337.5, "NNW"),
    ]

    for i, (deg, name) in enumerate(directions):
        next_deg = directions[(i + 1) % len(directions)][0]
        if next_deg == 0:
            next_deg = 360
        if deg <= face_deg < next_deg:
            return name

    return "N"  # Fallback


def compute_directional_preference(
    face_direction_deg: float,
    event: str,
) -> float:
    """
    Compute directional preference boost based on event type.

    Sunset boosts (terrain should face toward setting sun in west):
        W, WNW, NW, WSW: 1.0 (optimal)
        SW, NNW:         0.8 (good)
        S, N:            0.4 (marginal)
        SSW, SSE:        0.2 (poor)
        SE, E, NE:       0.05 (rim-light only)

    Sunrise is the mirror image (E/SE/NE favored).

    Args:
        face_direction_deg: Direction the surface faces (0-360)
        event: "sunrise" or "sunset"

    Returns:
        Preference boost 0-1, where 1 = optimal direction for event
    """
    direction = _get_cardinal_direction(face_direction_deg)

    # Sunset: favor west-facing terrain
    sunset_boosts = {
        "W": 1.0, "WNW": 1.0, "NW": 1.0, "WSW": 1.0,
        "SW": 0.8, "NNW": 0.8,
        "S": 0.4, "N": 0.4,
        "SSW": 0.2, "SSE": 0.2,
        "SE": 0.05, "ESE": 0.05, "E": 0.05, "ENE": 0.05, "NE": 0.05, "NNE": 0.05,
    }

    # Sunrise: favor east-facing terrain (mirror of sunset)
    sunrise_boosts = {
        "E": 1.0, "ENE": 1.0, "NE": 1.0, "ESE": 1.0,
        "SE": 0.8, "NNE": 0.8,
        "N": 0.4, "S": 0.4,
        "SSE": 0.2, "SSW": 0.2,
        "SW": 0.05, "WSW": 0.05, "W": 0.05, "WNW": 0.05, "NW": 0.05, "NNW": 0.05,
    }

    if event == "sunset":
        return sunset_boosts.get(direction, 0.1)
    else:
        return sunrise_boosts.get(direction, 0.1)


def get_ideal_face_direction(event: str) -> float:
    """Get the primary ideal face direction for an event."""
    return 270.0 if event == "sunset" else 90.0


def is_favorable_direction(face_direction_deg: float, event: str) -> bool:
    """Check if face direction is favorable for the event (boost >= 0.4)."""
    return compute_directional_preference(face_direction_deg, event) >= 0.4


# =============================================================================
# Slope-Dependent Alignment Rules
# =============================================================================
# Gentle slopes need tighter alignment to produce visible glow.
# Steeper slopes can catch light from wider angles.

def get_max_glow_alignment_for_slope(slope_deg: float) -> float:
    """
    Get maximum alignment offset for glow based on slope.

    Gentle slopes need tighter alignment to catch meaningful light.
    Steep slopes can produce glow from wider angles.

    Args:
        slope_deg: Surface slope in degrees

    Returns:
        Maximum alignment offset in degrees (one side)
    """
    if slope_deg < 10:
        return 30.0   # ±30° for very gentle slopes
    elif slope_deg < 15:
        return 45.0   # ±45° for moderate slopes
    else:
        return 60.0   # ±60° for steep slopes


def is_glow_alignment_valid_for_slope(
    aspect_offset_deg: float,
    slope_deg: float,
) -> bool:
    """
    Check if a surface's alignment is valid for glow based on its slope.

    Args:
        aspect_offset_deg: Angular offset from sun direction (0 = facing sun)
        slope_deg: Surface slope in degrees

    Returns:
        True if alignment is valid for this slope
    """
    max_alignment = get_max_glow_alignment_for_slope(slope_deg)
    return abs(aspect_offset_deg) <= max_alignment


def compute_incidence(
    normal: tuple[float, float, float],
    sun_vector: tuple[float, float, float],
) -> float:
    """
    Compute incidence angle (dot product of surface normal and sun vector).

    Args:
        normal: (Nx, Ny, Nz) surface normal unit vector
        sun_vector: (Sx, Sy, Sz) sun direction unit vector

    Returns:
        Incidence value in range [-1, 1]
        - ~1: Front-lit (sun directly facing surface) - flat lighting
        - ~0.2: Side/grazing light - OPTIMAL for photography
        - ~0: Grazing light
        - <0: Backlit (sun behind surface)
    """
    Nx, Ny, Nz = normal
    Sx, Sy, Sz = sun_vector

    return Nx * Sx + Ny * Sy + Nz * Sz


def compute_glow_score(
    incidence: float,
    target_incidence: float = 0.2,
    sigma: float = 0.15,
) -> float:
    """
    Compute glow score from incidence angle.

    Optimal glow occurs at grazing angles (~0.2 incidence) where
    light rakes across the surface creating texture and drama.

    Args:
        incidence: Dot product of normal and sun vector
        target_incidence: Optimal incidence for glow (default 0.2)
        sigma: Spread of the glow function

    Returns:
        Glow score in range [0, 1] where 1 = optimal
    """
    if incidence < 0:
        return 0.0  # Backlit, no glow

    # Gaussian centered at target incidence
    diff = incidence - target_incidence
    score = math.exp(-(diff ** 2) / (2 * sigma ** 2))

    return score


def compute_incidence_series(
    normal: tuple[float, float, float],
    sun_track: list[SunPosition],
) -> list[IncidencePoint]:
    """
    Compute incidence and glow score over time for a surface.

    Args:
        normal: Surface normal unit vector
        sun_track: List of sun positions over time

    Returns:
        List of IncidencePoint with incidence and glow_score at each time
    """
    series = []

    for sun_pos in sun_track:
        incidence = compute_incidence(normal, sun_pos.vector)
        glow = compute_glow_score(incidence)

        series.append(IncidencePoint(
            minutes=sun_pos.minutes_from_start,
            incidence=incidence,
            glow_score=glow,
        ))

    return series


def detect_glow_window(
    incidence_series: list[IncidencePoint],
    min_glow_score: float = 0.5,
    min_incidence: float = 0.05,
    max_incidence: float = 0.40,
) -> GlowWindow | None:
    """
    Detect the window of optimal lighting.

    Args:
        incidence_series: Time series of incidence/glow
        min_glow_score: Minimum glow score to consider "good"
        min_incidence: Minimum incidence for valid glow
        max_incidence: Maximum incidence for valid glow

    Returns:
        GlowWindow if found, None otherwise
    """
    # Find points within the glow range
    glow_points = [
        p for p in incidence_series
        if p.glow_score >= min_glow_score
        and min_incidence <= p.incidence <= max_incidence
    ]

    if not glow_points:
        return None

    # Find contiguous window
    start_minutes = min(p.minutes for p in glow_points)
    end_minutes = max(p.minutes for p in glow_points)

    # Find peak
    peak_point = max(glow_points, key=lambda p: p.glow_score)

    return GlowWindow(
        start_minutes=start_minutes,
        end_minutes=end_minutes,
        peak_minutes=peak_point.minutes,
        duration_minutes=end_minutes - start_minutes,
        peak_incidence=peak_point.incidence,
        peak_glow_score=peak_point.glow_score,
    )


def compute_aspect_alignment_factor(aspect_offset_deg: float) -> float:
    """
    Compute alignment factor based on aspect offset from sun direction.

    The factor scales the effective glow contribution:
    - 0-30° offset: Full contribution (factor = 1.0)
    - 30-50° offset: Gradual reduction (factor = 1.0 to 0.6)
    - 50-60° offset: Moderate reduction (factor = 0.6 to 0.3)
    - >60° offset: Low contribution (factor < 0.3)

    Widened from ±45° to ±60° to capture realistic lighting scenarios.
    At sunset, W/NW/SW terrain all receives favorable light depending on season.

    Args:
        aspect_offset_deg: Absolute angular difference between surface aspect
                          and sun azimuth (0-180)

    Returns:
        Alignment factor in range [0, 1]
    """
    offset = abs(aspect_offset_deg)

    if offset <= 30:
        # Excellent alignment: full contribution
        return 1.0
    elif offset <= 50:
        # Good alignment: gradual reduction from 1.0 to 0.6
        return 1.0 - 0.4 * (offset - 30) / 20
    elif offset <= 60:
        # Acceptable alignment: reduction from 0.6 to 0.3
        return 0.6 - 0.3 * (offset - 50) / 10
    else:
        # Outside glow range - but may qualify for rim light
        # Gradual decay for edge cases
        return max(0.05, 0.3 * math.exp(-(offset - 60) / 20))


def is_glow_in_range(
    glow_window: GlowWindow | None,
    alignment_factor: float = 1.0,
) -> bool:
    """
    Check if a glow window qualifies as photographically valuable.

    More permissive thresholds to capture realistic lighting scenarios.
    Large continuous slopes with moderate glow should qualify.

    Args:
        glow_window: The detected glow window
        alignment_factor: Aspect alignment factor from compute_aspect_alignment_factor

    Returns:
        True if glow qualifies as photographically valuable
    """
    if glow_window is None:
        return False

    duration = glow_window.duration_minutes
    peak_score = glow_window.peak_glow_score

    # Compute effective score scaled by alignment
    effective_score = peak_score * alignment_factor

    # More permissive thresholds - favor large continuous lighting
    # Any duration with decent effective score qualifies
    if effective_score >= 0.3:
        return True

    # Long duration with lower score still qualifies
    if duration >= 20.0 and effective_score >= 0.2:
        return True

    # Very long duration (extended golden hour) with basic lighting
    if duration >= 45.0 and effective_score >= 0.15:
        return True

    return False


def classify_lighting_zone_type(
    aspect_offset_deg: float,
    glow_window: GlowWindow | None,
    rim_light_score: float,
    slope_deg: float = 45.0,
) -> str:
    """
    Classify terrain into lighting zone type based on sun relationship and slope.

    Three first-class zone types:
    - "glow-zone": Faces toward sun (within slope-dependent range), receives warm light
    - "rim-zone": Perpendicular to sun (60-120° offset), receives backlit/edge light
    - "shadow-zone": Faces away from sun (>120° offset), in shadow or weak light

    IMPORTANT: Glow zone alignment threshold varies with slope:
    - Slope < 10°: Must be within ±30° of sun
    - Slope 10-15°: Must be within ±45° of sun
    - Slope > 15°: Can be within ±60° of sun

    Args:
        aspect_offset_deg: Angular difference between face direction and sun azimuth
        glow_window: Detected glow window (or None)
        rim_light_score: Score for rim/edge lighting potential
        slope_deg: Surface slope in degrees (affects alignment threshold)

    Returns:
        Zone type: "glow-zone", "rim-zone", or "shadow-zone"
    """
    offset = abs(aspect_offset_deg)

    # Get slope-dependent max alignment for glow
    max_glow_alignment = get_max_glow_alignment_for_slope(slope_deg)

    # Glow zone: facing toward sun (within slope-dependent range)
    # Gentle slopes need tighter alignment to catch meaningful light
    if offset <= max_glow_alignment:
        return "glow-zone"

    # Rim zone: perpendicular to sun (60-120° offset)
    # These surfaces receive backlit/edge lighting - dramatic silhouettes
    if 60 < offset <= 120 and rim_light_score >= 0.3:
        return "rim-zone"

    # Also classify as rim-zone if strong rim light potential
    if rim_light_score >= 0.5:
        return "rim-zone"

    # Shadow zone: facing away from sun
    return "shadow-zone"


def compute_rim_light_score(
    incidence: float,
    sun_altitude_deg: float,
) -> float:
    """
    Compute rim/edge light score for backlit or edge-lit scenarios.

    Rim light occurs when sun is behind or beside the feature,
    creating a glowing edge/outline effect.

    Args:
        incidence: Dot product of normal and sun (negative = backlit)
        sun_altitude_deg: Sun elevation above horizon

    Returns:
        Rim light score 0-1, where 1 = strong rim light potential
    """
    # Rim light is best when:
    # 1. Surface is mostly backlit (incidence -0.3 to 0.1)
    # 2. Sun is low (10-30 degrees altitude)

    # Backlit score: strongest at incidence ~ -0.1
    if incidence < -0.5 or incidence > 0.2:
        backlit_score = 0.0
    elif incidence < 0:
        # Backlit: best around -0.1
        backlit_score = 1.0 - abs(incidence + 0.1) * 2
    else:
        # Slightly front-lit: diminishes quickly
        backlit_score = max(0, 1.0 - incidence * 5)

    # Low sun score: best at 15-25 degrees
    if sun_altitude_deg < 5 or sun_altitude_deg > 40:
        sun_score = 0.0
    elif sun_altitude_deg <= 25:
        sun_score = min(1.0, (sun_altitude_deg - 5) / 15)
    else:
        sun_score = max(0, 1.0 - (sun_altitude_deg - 25) / 15)

    return backlit_score * sun_score


def compute_side_light_score(
    incidence: float,
    sun_altitude_deg: float,
    aspect_offset_deg: float,
) -> float:
    """
    Compute side-light score for surfaces perpendicular to sun.

    Side light creates texture, contrast, and dimension when the sun
    is roughly perpendicular (60-120°) to the surface face. This is
    different from rim light (backlit) - side light is still front-lit
    but with raking angles that reveal surface texture.

    Args:
        incidence: Dot product of normal and sun
        sun_altitude_deg: Sun elevation above horizon
        aspect_offset_deg: Angular offset between face and sun (60-120 is ideal)

    Returns:
        Side light score 0-1, where 1 = strong side light potential
    """
    # Side light is best when:
    # 1. Surface is moderately lit (incidence 0.1 to 0.5)
    # 2. Sun is low to moderate (5-30 degrees altitude)
    # 3. Aspect offset is in the "side" range (60-120°)

    # Incidence score: best around 0.2-0.3 (grazing to moderate angle)
    if incidence < 0 or incidence > 0.6:
        incidence_score = 0.0
    elif incidence <= 0.3:
        # Grazing to moderate: good texture
        incidence_score = min(1.0, 0.5 + incidence)
    else:
        # Getting too front-lit: reduce score
        incidence_score = max(0.2, 1.0 - (incidence - 0.3) * 2)

    # Low sun score: best at 10-25 degrees for texture
    if sun_altitude_deg < 3 or sun_altitude_deg > 35:
        sun_score = 0.3  # Still usable but not optimal
    elif sun_altitude_deg <= 25:
        sun_score = min(1.0, 0.4 + (sun_altitude_deg - 3) / 22 * 0.6)
    else:
        sun_score = max(0.3, 1.0 - (sun_altitude_deg - 25) / 10)

    # Aspect offset score: best at 75-105° (true perpendicular)
    offset = abs(aspect_offset_deg)
    if offset < 60 or offset > 120:
        offset_score = 0.0
    elif 75 <= offset <= 105:
        offset_score = 1.0  # Perfect perpendicular range
    elif offset < 75:
        offset_score = 0.5 + (offset - 60) / 30  # 60-75°
    else:
        offset_score = 0.5 + (120 - offset) / 30  # 105-120°

    return incidence_score * sun_score * offset_score


def detect_edge_lighting(
    incidence_series: list[IncidencePoint],
    sun_track: list[SunPosition],
    aspect_offset_deg: float = 90.0,
) -> dict:
    """
    Detect rim light, side light, crest glow, and cap glow opportunities.

    Returns dict with:
        - has_rim_light: bool
        - rim_light_peak_minutes: float or None
        - rim_light_score: float
        - has_side_light: bool
        - side_light_score: float
        - side_light_peak_minutes: float or None
        - lighting_type: "rim" | "side" | "crest" | "cap" | "standard" | None
    """
    best_rim_score = 0.0
    best_rim_minutes = None
    best_side_score = 0.0
    best_side_minutes = None

    for point, sun_pos in zip(incidence_series, sun_track):
        rim_score = compute_rim_light_score(
            point.incidence,
            sun_pos.altitude_deg,
        )
        if rim_score > best_rim_score:
            best_rim_score = rim_score
            best_rim_minutes = point.minutes

        side_score = compute_side_light_score(
            point.incidence,
            sun_pos.altitude_deg,
            aspect_offset_deg,
        )
        if side_score > best_side_score:
            best_side_score = side_score
            best_side_minutes = point.minutes

    # Classify the lighting type - prefer rim if both are strong
    if best_rim_score >= 0.6:
        lighting_type = "rim"  # Strong rim/edge lighting
    elif best_side_score >= 0.4:
        lighting_type = "side"  # Good side/texture lighting
    elif best_rim_score >= 0.3:
        lighting_type = "crest"  # Crest/cap glow potential
    elif best_side_score >= 0.25:
        lighting_type = "side"  # Moderate side lighting
    else:
        lighting_type = "standard"  # Normal front lighting

    return {
        "has_rim_light": best_rim_score >= 0.4,
        "rim_light_peak_minutes": best_rim_minutes if best_rim_score >= 0.4 else None,
        "rim_light_score": best_rim_score,
        "has_side_light": best_side_score >= 0.25,
        "side_light_score": best_side_score,
        "side_light_peak_minutes": best_side_minutes if best_side_score >= 0.25 else None,
        "lighting_type": lighting_type,
    }


def detect_grazing_light(
    incidence_series: list[IncidencePoint],
    sun_track: list[SunPosition],
    max_sun_altitude_deg: float = 8.0,
    max_incidence_deg: float = 12.0,
) -> tuple[bool, float, float | None]:
    """
    Detect grazing light conditions for surface moment classification.

    Grazing light occurs when:
    - Sun altitude is low (< 8°) - sun near horizon
    - Incidence angle is low (< 12°) - light raking across surface

    Args:
        incidence_series: Incidence values over time
        sun_track: Sun positions over time
        max_sun_altitude_deg: Maximum sun altitude for grazing (default 8°)
        max_incidence_deg: Maximum incidence angle (converted from dot product)

    Returns:
        Tuple of (has_grazing_light, grazing_score, peak_minutes)
        - has_grazing_light: True if conditions met
        - grazing_score: Quality score 0-1
        - peak_minutes: Best time for grazing light (or None)
    """
    # Convert incidence threshold: incidence of 0.2 = ~12° from parallel
    # cos(12°) ≈ 0.978, so incidence < 0.2 means angle < ~12° from parallel
    max_incidence = math.cos(math.radians(90 - max_incidence_deg))

    best_grazing_score = 0.0
    best_minutes = None

    for point, sun_pos in zip(incidence_series, sun_track):
        # Check sun altitude
        if sun_pos.altitude_deg > max_sun_altitude_deg:
            continue

        # Check incidence - we want LOW incidence (grazing)
        # incidence near 0 = light parallel to surface
        if point.incidence > max_incidence or point.incidence < 0:
            continue

        # Compute grazing score
        # Best when sun altitude is very low (2-5°) and incidence is very low
        altitude_score = max(0, 1.0 - abs(sun_pos.altitude_deg - 3.5) / 5.0)
        incidence_score = max(0, 1.0 - point.incidence / max_incidence)

        grazing_score = altitude_score * 0.6 + incidence_score * 0.4

        if grazing_score > best_grazing_score:
            best_grazing_score = grazing_score
            best_minutes = point.minutes

    has_grazing = best_grazing_score >= 0.4

    return has_grazing, best_grazing_score, best_minutes


def classify_subject_type_by_lighting(
    mean_slope_deg: float,
    incidence_series: list[IncidencePoint],
    sun_track: list[SunPosition],
) -> tuple[str, bool]:
    """
    Classify subject type based on lighting conditions.

    Surface moments are NOT defined by slope or size. They are defined by
    how grazing light transforms subtle terrain into texture, contrast, or rhythm.

    Any terrain - steep or gentle - can become a surface moment when
    grazing light reveals its character.

    Dramatic features are subjects best captured with direct/angled light
    that emphasizes form and mass.

    Args:
        mean_slope_deg: Average slope (for reference, not classification)
        incidence_series: Incidence values over time
        sun_track: Sun positions over time

    Returns:
        Tuple of (subject_type, has_grazing_light)
        - subject_type: "dramatic-feature" or "surface-moment"
        - has_grazing_light: True if grazing conditions detected
    """
    # Check for grazing light conditions
    # Grazing light transforms terrain into texture, contrast, rhythm
    has_grazing, grazing_score, _ = detect_grazing_light(
        incidence_series, sun_track
    )

    # Surface moment: grazing light creates the visual interest
    # This can happen on any slope - the light is what matters
    if has_grazing and grazing_score >= 0.4:
        return "surface-moment", True

    # Dramatic feature: best captured with direct/angled light
    # emphasizing form, mass, and shadow
    return "dramatic-feature", has_grazing


@dataclass
class IlluminationAnalysis:
    """Complete illumination analysis for a subject."""
    incidence_series: list[IncidencePoint]
    glow_window: GlowWindow | None
    peak_sun_position: SunPosition | None
    glow_in_range: bool
    # Edge lighting detection
    edge_lighting: dict | None = None  # rim_light_score, lighting_type, etc.
    # Lighting zone classification (first-class types)
    lighting_zone_type: str = "glow-zone"  # "glow-zone", "rim-zone", or "shadow-zone"
    # Subject type classification based on lighting
    subject_type: str = "dramatic-feature"  # "dramatic-feature" or "surface-moment"
    has_grazing_light: bool = False  # True if grazing conditions detected
    # Aspect offset from sun (for debugging/display)
    aspect_offset_deg: float = 0.0
    # Directional preference based on event (sunset favors W, sunrise favors E)
    directional_preference: float = 1.0  # 0-1 boost based on facing direction
    cardinal_direction: str = "W"  # e.g., "W", "NW", "SW"


def _angular_difference(angle1: float, angle2: float) -> float:
    """
    Compute the smallest angular difference between two angles in degrees.

    Returns value in range [0, 180].
    """
    diff = abs(angle1 - angle2) % 360
    return min(diff, 360 - diff)


def analyze_subject_illumination(
    normal: tuple[float, float, float],
    sun_track: list[SunPosition],
    mean_slope_deg: float = 45.0,
    face_direction_deg: float = None,
    max_aspect_deviation: float = 60.0,
    event: str = "sunset",
) -> IlluminationAnalysis:
    """
    Complete illumination analysis for a subject surface.

    Classifies terrain into lighting zones based on sun relationship:
    - Glow zones: Face toward sun (±60°), receive warm direct/angled light
    - Rim zones: Perpendicular to sun (60-120°), receive backlit/edge light
    - Shadow zones: Face away from sun, in shadow

    IMPORTANT: Applies directional preference based on event:
    - Sunset: W/NW/WSW terrain gets boost of 1.0, SW 0.8, S 0.4, E/SE ~0
    - Sunrise: E/NE/ESE terrain gets boost of 1.0, SE 0.8, N 0.4, W/SW ~0

    Zones with low directional preference (<0.4) are filtered unless they
    qualify for rim-light.

    Args:
        normal: Surface normal unit vector
        sun_track: List of sun positions
        mean_slope_deg: Average slope of the subject (for type classification)
        face_direction_deg: Direction the surface faces (aspect + 180)
        max_aspect_deviation: Maximum deviation for glow zone (default 60°)
        event: "sunrise" or "sunset" (affects directional preference)

    Returns:
        IlluminationAnalysis with series, windows, zone type, and lighting info
    """
    series = compute_incidence_series(normal, sun_track)
    window = detect_glow_window(series)

    # Find sun position at peak (or midpoint if no glow window)
    peak_sun = None
    aspect_offset = 0.0
    alignment_factor = 1.0

    # For zone classification, use sun position at glow peak or track midpoint
    reference_sun = None
    if window:
        for sun_pos in sun_track:
            if abs(sun_pos.minutes_from_start - window.peak_minutes) < 1.0:
                peak_sun = sun_pos
                reference_sun = sun_pos
                break

    # If no glow window, use track midpoint for zone classification
    if reference_sun is None and sun_track:
        mid_idx = len(sun_track) // 2
        reference_sun = sun_track[mid_idx]

    # Compute aspect offset from sun direction
    if face_direction_deg is not None and reference_sun is not None:
        aspect_offset = _angular_difference(face_direction_deg, reference_sun.azimuth_deg)
        alignment_factor = compute_aspect_alignment_factor(aspect_offset)

    # Compute directional preference based on event
    # Sunset favors W/NW/WSW, sunrise favors E/NE/ESE
    directional_pref = 1.0
    cardinal_dir = "W"
    if face_direction_deg is not None:
        directional_pref = compute_directional_preference(face_direction_deg, event)
        cardinal_dir = _get_cardinal_direction(face_direction_deg)

    # Detect edge lighting opportunities (rim light and side light)
    edge_lighting = detect_edge_lighting(series, sun_track, aspect_offset)
    rim_light_score = edge_lighting.get("rim_light_score", 0.0)
    side_light_score = edge_lighting.get("side_light_score", 0.0)

    # ==========================================================================
    # STEP 0: HARD REJECT surfaces facing away from sun
    # ==========================================================================
    # Surfaces with aspect_offset > 120° face AWAY from the sun and cannot
    # produce meaningful glow or rim lighting. They must be rejected BEFORE
    # any classification or scoring logic.
    #
    # This catches the bug where gentle east-facing slopes at sunset could
    # have positive incidence (due to vertical Nz*Sz component) but should
    # never qualify as lit terrain.
    MAX_VALID_ASPECT_OFFSET = 120.0  # Hard limit - no exceptions

    if abs(aspect_offset) > MAX_VALID_ASPECT_OFFSET:
        # Surface faces away from sun - reject immediately
        import logging
        logging.debug(
            f"REJECTED: aspect_offset={aspect_offset:.1f}° > {MAX_VALID_ASPECT_OFFSET}° "
            f"(face_dir={face_direction_deg:.0f}°, cardinal={cardinal_dir}, "
            f"dir_pref={directional_pref:.2f}, event={event})"
        )
        return IlluminationAnalysis(
            incidence_series=series,
            glow_window=window,
            peak_sun_position=peak_sun,
            glow_in_range=False,
            edge_lighting=edge_lighting,
            lighting_zone_type="rejected-facing-away",
            subject_type="dramatic-feature",
            has_grazing_light=False,
            aspect_offset_deg=aspect_offset,
            directional_preference=directional_pref,
            cardinal_direction=cardinal_dir,
        )

    # ==========================================================================
    # STEP 1: CLASSIFY as glow-zone or rim-zone
    # ==========================================================================
    # Every zone must be classified BEFORE scoring.
    # If it can't be classified as glow or rim, it's discarded.

    lighting_zone_type = None
    has_good_lighting = False
    rejection_reason = None

    # Check for GLOW-ZONE classification:
    # - Favorable direction for event (directional_pref >= 0.4)
    # - Slope-appropriate alignment to sun
    # - Has a glow window
    max_glow_alignment = get_max_glow_alignment_for_slope(mean_slope_deg)
    is_glow_aligned = abs(aspect_offset) <= max_glow_alignment
    is_favorable_dir = directional_pref >= 0.4

    if is_favorable_dir and is_glow_aligned and window is not None:
        lighting_zone_type = "glow-zone"
    else:
        # Track why glow-zone failed for debug
        if not is_favorable_dir:
            rejection_reason = f"unfavorable_direction(pref={directional_pref:.2f})"
        elif not is_glow_aligned:
            rejection_reason = f"misaligned(offset={aspect_offset:.0f}°>max={max_glow_alignment:.0f}°)"
        elif window is None:
            rejection_reason = "no_glow_window"

    # Check for RIM-ZONE classification (includes side-light):
    # - MUST be within angle range (60-120° offset) - no exceptions
    # - AND have rim light potential (score >= 0.3) OR side light potential (score >= 0.25)
    #
    # Side-light is perpendicular lighting that creates texture and dimension.
    # It's front-lit but at raking angles - valuable for photography.
    is_rim_angle = 60 < abs(aspect_offset) <= 120
    has_rim_potential = rim_light_score >= 0.3
    has_side_potential = side_light_score >= 0.25

    if lighting_zone_type is None and is_rim_angle and (has_rim_potential or has_side_potential):
        lighting_zone_type = "rim-zone"  # Includes both rim and side lighting
    elif lighting_zone_type is None and (has_rim_potential or has_side_potential) and not is_rim_angle:
        # Has edge light score but wrong angle - reject with debug info
        rejection_reason = f"edge_angle_invalid(offset={aspect_offset:.0f}°, need 60-120°)"

    # ==========================================================================
    # STEP 2: DISCARD if not classified
    # ==========================================================================
    # If zone doesn't qualify as glow or rim, mark as invalid
    if lighting_zone_type is None:
        import logging
        logging.debug(
            f"REJECTED: {rejection_reason or 'unclassified'} "
            f"(face_dir={face_direction_deg:.0f}°, cardinal={cardinal_dir}, "
            f"offset={aspect_offset:.0f}°, dir_pref={directional_pref:.2f}, "
            f"rim_score={rim_light_score:.2f}, side_score={side_light_score:.2f}, event={event})"
        )
        # Can't be classified - will be discarded
        return IlluminationAnalysis(
            incidence_series=series,
            glow_window=window,
            peak_sun_position=peak_sun,
            glow_in_range=False,  # Not valid
            edge_lighting=edge_lighting,
            lighting_zone_type="unclassified",
            subject_type="dramatic-feature",
            has_grazing_light=False,
            aspect_offset_deg=aspect_offset,
            directional_preference=directional_pref,
            cardinal_direction=cardinal_dir,
        )

    # ==========================================================================
    # STEP 3: SCORE the classified zone
    # ==========================================================================
    if lighting_zone_type == "glow-zone":
        has_good_lighting = is_glow_in_range(window, alignment_factor)
    else:  # rim-zone (includes side-light)
        # Accept either rim light OR side light as valid
        has_good_lighting = rim_light_score >= 0.3 or side_light_score >= 0.25

    # Secondary classification: dramatic-feature vs surface-moment
    subject_type, has_grazing = classify_subject_type_by_lighting(
        mean_slope_deg, series, sun_track
    )

    # Surface moments with grazing light also qualify in glow zones
    if has_grazing and lighting_zone_type == "glow-zone":
        has_good_lighting = True

    return IlluminationAnalysis(
        incidence_series=series,
        glow_window=window,
        peak_sun_position=peak_sun,
        glow_in_range=has_good_lighting,
        edge_lighting=edge_lighting,
        lighting_zone_type=lighting_zone_type,
        subject_type=subject_type,
        has_grazing_light=has_grazing,
        aspect_offset_deg=aspect_offset,
        directional_preference=directional_pref,
        cardinal_direction=cardinal_dir,
    )
