"""
Photographer-friendly explanations for technical values.

Translates technical measurements into language photographers understand.
All translation functions live here to ensure consistent terminology.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


# =============================================================================
# Aspect Offset (how surface faces relative to sun)
# =============================================================================

def explain_aspect_offset(offset_deg: float) -> str:
    """
    Translate aspect offset into photographer language.

    Args:
        offset_deg: Angular difference between surface face and sun direction (0-180)

    Returns:
        Human-readable description of the lighting angle
    """
    offset = abs(offset_deg)

    if offset <= 15:
        return "Facing directly into the light"
    elif offset <= 30:
        return "Facing almost directly into the sun"
    elif offset <= 45:
        return "Angled for warm side-light"
    elif offset <= 60:
        return "Angled for dramatic side-light"
    elif offset <= 75:
        return "Angled for strong rim-light"
    elif offset <= 90:
        return "Perfect for rim-light"
    elif offset <= 120:
        return "Backlit with edge glow"
    else:
        return "Facing away from light (in shadow)"


def explain_aspect_offset_short(offset_deg: float) -> str:
    """Short version for compact displays."""
    offset = abs(offset_deg)

    if offset <= 20:
        return "direct light"
    elif offset <= 45:
        return "side-light"
    elif offset <= 75:
        return "rim-light"
    elif offset <= 110:
        return "backlit"
    else:
        return "shadowed"


# =============================================================================
# Incidence Angle (how light strikes the surface)
# =============================================================================

def explain_incidence(incidence: float) -> str:
    """
    Translate incidence value into photographer language.

    Args:
        incidence: Dot product of surface normal and sun vector (-1 to 1)
                  ~0 = grazing light, ~1 = direct overhead, <0 = backlit

    Returns:
        Human-readable description of light quality
    """
    if incidence < 0:
        return "Backlit (silhouette potential)"
    elif incidence <= 0.1:
        return "Extreme grazing light (maximum texture)"
    elif incidence <= 0.2:
        return "Strong grazing light (dramatic texture)"
    elif incidence <= 0.35:
        return "Good raking light (visible texture)"
    elif incidence <= 0.5:
        return "Moderate angled light"
    elif incidence <= 0.7:
        return "Direct angled light"
    else:
        return "Flat front light (low contrast)"


def explain_incidence_short(incidence: float) -> str:
    """Short version for compact displays."""
    if incidence < 0:
        return "backlit"
    elif incidence <= 0.15:
        return "strong grazing"
    elif incidence <= 0.3:
        return "raking light"
    elif incidence <= 0.5:
        return "angled light"
    else:
        return "flat light"


# =============================================================================
# Sun Altitude (how high the sun is)
# =============================================================================

def explain_sun_altitude(altitude_deg: float) -> str:
    """
    Translate sun altitude into photographer language.

    Args:
        altitude_deg: Sun elevation above horizon in degrees

    Returns:
        Human-readable description of sun position and light quality
    """
    if altitude_deg < 0:
        return "Below horizon (blue hour/twilight)"
    elif altitude_deg <= 2:
        return "Just above horizon (intense color)"
    elif altitude_deg <= 6:
        return "Very low sun (dramatic golden light)"
    elif altitude_deg <= 12:
        return "Low sun (warm golden hour)"
    elif altitude_deg <= 20:
        return "Moderately low (good directional light)"
    elif altitude_deg <= 35:
        return "Mid-height sun (harder shadows)"
    else:
        return "High sun (harsh, flat light)"


def explain_sun_altitude_short(altitude_deg: float) -> str:
    """Short version for compact displays."""
    if altitude_deg < 0:
        return "blue hour"
    elif altitude_deg <= 6:
        return "golden hour"
    elif altitude_deg <= 15:
        return "low sun"
    elif altitude_deg <= 30:
        return "mid sun"
    else:
        return "high sun"


# =============================================================================
# Glow Score (quality of the lighting moment)
# =============================================================================

def explain_glow_score(score: float) -> str:
    """
    Translate glow score into photographer language.

    Args:
        score: Glow quality score (0-1, where 1 = optimal grazing angle)

    Returns:
        Human-readable assessment of lighting quality
    """
    if score >= 0.9:
        return "Exceptional light quality"
    elif score >= 0.75:
        return "Excellent light quality"
    elif score >= 0.6:
        return "Very good light quality"
    elif score >= 0.45:
        return "Good light quality"
    elif score >= 0.3:
        return "Moderate light quality"
    else:
        return "Basic lighting conditions"


def explain_glow_score_short(score: float) -> str:
    """Short version for compact displays."""
    if score >= 0.85:
        return "exceptional"
    elif score >= 0.65:
        return "excellent"
    elif score >= 0.45:
        return "good"
    elif score >= 0.25:
        return "moderate"
    else:
        return "basic"


# =============================================================================
# Texture Score (quality of side-lighting for texture)
# =============================================================================

def explain_texture_score(score: float) -> str:
    """
    Translate texture score into photographer language.

    Args:
        score: Texture quality score (0-1, where 1 = optimal grazing angle)

    Returns:
        Human-readable assessment of texture lighting quality
    """
    if score >= 0.9:
        return "Exceptional texture lighting"
    elif score >= 0.75:
        return "Excellent texture definition"
    elif score >= 0.6:
        return "Very good texture and shadows"
    elif score >= 0.45:
        return "Good side-light texture"
    elif score >= 0.3:
        return "Moderate texture definition"
    else:
        return "Basic side lighting"


def explain_texture_score_short(score: float) -> str:
    """Short version for compact displays."""
    if score >= 0.85:
        return "exceptional texture"
    elif score >= 0.65:
        return "excellent texture"
    elif score >= 0.45:
        return "good texture"
    elif score >= 0.25:
        return "moderate texture"
    else:
        return "basic texture"


# =============================================================================
# Rim Light Score (backlit edge lighting potential)
# =============================================================================

def explain_rim_light_score(score: float) -> str:
    """
    Translate rim light score into photographer language.

    Args:
        score: Rim light potential (0-1)

    Returns:
        Human-readable description of rim/edge lighting potential
    """
    if score >= 0.7:
        return "Strong rim light (glowing edges)"
    elif score >= 0.5:
        return "Good rim light potential"
    elif score >= 0.3:
        return "Moderate edge lighting"
    else:
        return "Minimal rim light"


# =============================================================================
# Afterglow / Twilight (sun below horizon)
# =============================================================================

def explain_afterglow(sun_altitude_deg: float) -> str:
    """
    Translate afterglow conditions into photographer language.

    Afterglow occurs when the sun is below the horizon but the sky
    still provides indirect light. Good for silhouettes and sky color.

    Args:
        sun_altitude_deg: Sun elevation (negative = below horizon)

    Returns:
        Human-readable description of twilight conditions
    """
    if sun_altitude_deg >= 0:
        return "Direct sunlight (not afterglow)"
    elif sun_altitude_deg >= -4:
        return "Early twilight - warm afterglow, silhouette potential"
    elif sun_altitude_deg >= -6:
        return "Civil twilight - pink/purple sky, strong silhouettes"
    elif sun_altitude_deg >= -12:
        return "Nautical twilight - deep blue hour"
    else:
        return "Astronomical twilight - near darkness"


def explain_afterglow_short(sun_altitude_deg: float) -> str:
    """Short version for compact displays."""
    if sun_altitude_deg >= 0:
        return "direct light"
    elif sun_altitude_deg >= -6:
        return "afterglow"
    elif sun_altitude_deg >= -12:
        return "blue hour"
    else:
        return "twilight"


def explain_lighting_type(lighting_type: str, sun_altitude_deg: float = None) -> str:
    """
    Translate lighting_type into photographer-friendly description.

    Args:
        lighting_type: "standard", "rim", "crest", "afterglow", etc.
        sun_altitude_deg: Optional sun altitude for context

    Returns:
        Human-readable description of lighting conditions
    """
    if lighting_type == "afterglow":
        if sun_altitude_deg is not None:
            return explain_afterglow(sun_altitude_deg)
        return "Afterglow - sun below horizon, silhouette/sky colors"
    elif lighting_type == "rim":
        return "Rim light - backlit edges glow dramatically"
    elif lighting_type == "crest":
        return "Crest light - ridgeline catches golden light"
    elif lighting_type == "side":
        return "Side light - strong texture and dimension"
    else:
        return "Direct warm light - classic golden hour"


def explain_lighting_type_short(lighting_type: str) -> str:
    """Short version for compact displays."""
    short = {
        "afterglow": "afterglow",
        "rim": "rim light",
        "crest": "crest glow",
        "side": "side light",
        "standard": "warm light",
    }
    return short.get(lighting_type, "direct")


# =============================================================================
# Lighting Zone Type
# =============================================================================

def explain_lighting_zone_type(zone_type: str) -> str:
    """
    Translate lighting zone type into photographer language.

    Args:
        zone_type: "glow-zone", "rim-zone", or "shadow-zone"

    Returns:
        Human-readable description of what to expect
    """
    descriptions = {
        "glow-zone": "Warm light zone - faces the sun for golden glow",
        "rim-zone": "Rim light zone - backlit for dramatic edge lighting",
        "shadow-zone": "Shadow zone - away from direct light",
    }
    return descriptions.get(zone_type, "Unknown lighting zone")


def explain_lighting_zone_type_short(zone_type: str) -> str:
    """Short version for compact displays."""
    short = {
        "glow-zone": "warm glow",
        "rim-zone": "rim light",
        "shadow-zone": "shadow",
    }
    return short.get(zone_type, "unknown")


# =============================================================================
# Time Windows
# =============================================================================

def explain_timing(minutes_from_event: float, event: str = "sunrise") -> str:
    """
    Translate timing into photographer language.

    Args:
        minutes_from_event: Minutes after sunrise/sunset
        event: "sunrise" or "sunset"

    Returns:
        Human-readable timing description
    """
    mins = abs(minutes_from_event)

    if event == "sunrise":
        if mins <= 5:
            return "Right at sunrise"
        elif mins <= 15:
            return "Just after sunrise"
        elif mins <= 30:
            return "Early golden hour"
        elif mins <= 60:
            return "Golden hour"
        else:
            return "Late morning light"
    else:  # sunset
        if mins <= 5:
            return "Right at sunset"
        elif mins <= 15:
            return "Just before sunset"
        elif mins <= 30:
            return "Late golden hour"
        elif mins <= 60:
            return "Golden hour"
        else:
            return "Afternoon light"


def explain_duration(duration_minutes: float) -> str:
    """
    Translate glow window duration into photographer language.

    Args:
        duration_minutes: Length of optimal lighting window

    Returns:
        Human-readable duration assessment
    """
    if duration_minutes >= 60:
        return "Extended window (over an hour)"
    elif duration_minutes >= 40:
        return "Long window (plenty of time)"
    elif duration_minutes >= 25:
        return "Good window (comfortable shooting time)"
    elif duration_minutes >= 15:
        return "Moderate window (work efficiently)"
    elif duration_minutes >= 8:
        return "Short window (be ready)"
    else:
        return "Brief moment (be in position)"


# =============================================================================
# Area / Zone Size
# =============================================================================

def explain_area(area_m2: float) -> str:
    """
    Translate zone area into photographer language.

    Args:
        area_m2: Area in square meters

    Returns:
        Human-readable size description with composition implications
    """
    area_km2 = area_m2 / 1_000_000

    if area_km2 >= 10:
        return "Vast lighting zone (many composition options)"
    elif area_km2 >= 1:
        return "Large zone (explore for best angle)"
    elif area_km2 >= 0.1:
        return "Medium zone (several vantage points)"
    elif area_km2 >= 0.01:
        return "Compact zone (focused subject)"
    else:
        return "Small feature (specific composition)"


def explain_area_short(area_m2: float) -> str:
    """Short version for compact displays."""
    area_km2 = area_m2 / 1_000_000

    if area_km2 >= 10:
        return "vast"
    elif area_km2 >= 1:
        return "large"
    elif area_km2 >= 0.1:
        return "medium"
    elif area_km2 >= 0.01:
        return "compact"
    else:
        return "small"


# =============================================================================
# Slope
# =============================================================================

def explain_slope(slope_deg: float) -> str:
    """
    Translate slope into photographer language.

    Args:
        slope_deg: Surface slope in degrees

    Returns:
        Human-readable terrain description
    """
    if slope_deg >= 45:
        return "Steep face (dramatic cliff or wall)"
    elif slope_deg >= 30:
        return "Steep slope (bold terrain)"
    elif slope_deg >= 20:
        return "Moderate slope (textured hillside)"
    elif slope_deg >= 12:
        return "Gentle slope (subtle undulations)"
    else:
        return "Nearly flat (surface texture focus)"


# =============================================================================
# Compass Direction
# =============================================================================

def explain_direction(degrees: float) -> str:
    """
    Convert degrees to cardinal direction with context.

    Args:
        degrees: Direction in degrees (0 = North)

    Returns:
        Cardinal direction (e.g., "Northwest", "East-Southeast")
    """
    # Normalize to 0-360
    deg = degrees % 360

    directions = [
        (0, "North"),
        (22.5, "North-Northeast"),
        (45, "Northeast"),
        (67.5, "East-Northeast"),
        (90, "East"),
        (112.5, "East-Southeast"),
        (135, "Southeast"),
        (157.5, "South-Southeast"),
        (180, "South"),
        (202.5, "South-Southwest"),
        (225, "Southwest"),
        (247.5, "West-Southwest"),
        (270, "West"),
        (292.5, "West-Northwest"),
        (315, "Northwest"),
        (337.5, "North-Northwest"),
        (360, "North"),
    ]

    for threshold, name in directions:
        if deg <= threshold + 11.25:
            return name
    return "North"


def explain_direction_short(degrees: float) -> str:
    """Short cardinal direction (N, NE, E, etc.)."""
    deg = degrees % 360

    if deg <= 22.5 or deg > 337.5:
        return "N"
    elif deg <= 67.5:
        return "NE"
    elif deg <= 112.5:
        return "E"
    elif deg <= 157.5:
        return "SE"
    elif deg <= 202.5:
        return "S"
    elif deg <= 247.5:
        return "SW"
    elif deg <= 292.5:
        return "W"
    else:
        return "NW"


# =============================================================================
# Complete Subject Explanation
# =============================================================================

@dataclass
class SubjectExplanation:
    """Complete photographer-friendly explanation for a subject/zone."""
    # Lighting
    zone_type: str
    zone_type_short: str
    aspect_offset: str
    aspect_offset_short: str
    light_quality: str
    light_quality_short: str

    # Sun position at peak
    sun_altitude: str
    sun_altitude_short: str

    # Timing
    best_time: str
    window_duration: str

    # Terrain
    face_direction: str
    face_direction_short: str
    slope: str
    area: str
    area_short: str

    # Overall summary
    summary: str


def explain_subject(
    lighting_zone_type: str,
    aspect_offset_deg: float,
    incidence: float,
    sun_altitude_deg: float,
    glow_score: float,
    face_direction_deg: float,
    slope_deg: float,
    area_m2: float,
    best_time_minutes: float = 30.0,
    window_duration_minutes: float = 30.0,
    event: str = "sunset",
) -> SubjectExplanation:
    """
    Generate complete photographer-friendly explanation for a subject.

    Args:
        lighting_zone_type: "glow-zone", "rim-zone", or "shadow-zone"
        aspect_offset_deg: Angular offset from sun direction
        incidence: Light incidence value
        sun_altitude_deg: Sun altitude at peak
        glow_score: Quality score
        face_direction_deg: Direction surface faces
        slope_deg: Surface slope
        area_m2: Zone area
        best_time_minutes: Best shooting time (minutes from event)
        window_duration_minutes: Shooting window duration
        event: "sunrise" or "sunset"

    Returns:
        SubjectExplanation with all translated values
    """
    # Build summary sentence
    zone_desc = explain_lighting_zone_type_short(lighting_zone_type)
    light_desc = explain_aspect_offset_short(aspect_offset_deg)
    area_desc = explain_area_short(area_m2)
    direction = explain_direction_short(face_direction_deg)

    summary = f"{area_desc.capitalize()} {direction}-facing zone with {light_desc}"
    if lighting_zone_type == "rim-zone":
        summary += " - great for silhouettes and edge glow"
    elif glow_score >= 0.7:
        summary += " - excellent conditions for warm, dramatic light"

    return SubjectExplanation(
        zone_type=explain_lighting_zone_type(lighting_zone_type),
        zone_type_short=zone_desc,
        aspect_offset=explain_aspect_offset(aspect_offset_deg),
        aspect_offset_short=light_desc,
        light_quality=explain_glow_score(glow_score) if glow_score else explain_incidence(incidence),
        light_quality_short=explain_glow_score_short(glow_score) if glow_score else explain_incidence_short(incidence),
        sun_altitude=explain_sun_altitude(sun_altitude_deg),
        sun_altitude_short=explain_sun_altitude_short(sun_altitude_deg),
        best_time=explain_timing(best_time_minutes, event),
        window_duration=explain_duration(window_duration_minutes),
        face_direction=f"Faces {explain_direction(face_direction_deg)}",
        face_direction_short=direction,
        slope=explain_slope(slope_deg),
        area=explain_area(area_m2),
        area_short=area_desc,
        summary=summary,
    )
