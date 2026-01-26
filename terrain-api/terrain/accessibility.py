"""
Accessibility checking for standing locations.

Checks proximity to OSM roads/trails to ensure standing points are accessible.
Also validates elevation gain constraints from access point to standing location.
"""

import logging
import math
from dataclasses import dataclass
from typing import Optional, List, Tuple, TYPE_CHECKING
import numpy as np

if TYPE_CHECKING:
    from .dem import DEMGrid

# Configurable thresholds
DEFAULT_MAX_DISTANCE_M = 300.0  # Max distance from road/trail for "near-road" status
OFF_TRAIL_CONFIDENCE_PENALTY = 0.4  # Confidence multiplier for off-trail locations

# =============================================================================
# Approach Profiles
# =============================================================================
# Each profile defines hard limits for adjusted distance and elevation gain
# "Adjusted" means raw value * landcover multiplier

from enum import Enum
from dataclasses import dataclass as profile_dataclass


class ApproachProfile(Enum):
    CASUAL = "casual"
    MODERATE = "moderate"
    SPICY = "spicy"


@profile_dataclass
class ProfileLimits:
    """Hard limits for an approach profile (applied to adjusted values)."""
    max_distance_m: float  # Max adjusted walking distance
    max_uphill_m: float    # Max adjusted uphill gain
    max_downhill_m: float  # Max adjusted downhill loss
    description: str       # Human-readable description


# Profile definitions
APPROACH_PROFILES = {
    ApproachProfile.CASUAL: ProfileLimits(
        max_distance_m=800.0,    # ~10 min easy walk
        max_uphill_m=50.0,       # Minimal climbing
        max_downhill_m=80.0,     # Gentle descent
        description="Easy walk, minimal elevation change",
    ),
    ApproachProfile.MODERATE: ProfileLimits(
        max_distance_m=2000.0,   # ~25-30 min walk
        max_uphill_m=150.0,      # Moderate climb
        max_downhill_m=200.0,    # Moderate descent
        description="Moderate hike, some elevation change",
    ),
    ApproachProfile.SPICY: ProfileLimits(
        max_distance_m=4000.0,   # ~1 hour hike
        max_uphill_m=350.0,      # Significant climb
        max_downhill_m=450.0,    # Significant descent
        description="Challenging hike, significant elevation",
    ),
}

# Default profile
DEFAULT_PROFILE = ApproachProfile.MODERATE

# =============================================================================
# Landcover Multipliers
# =============================================================================
# Multipliers applied to distance/gain based on terrain difficulty
# Lower = easier travel, Higher = harder travel

class LandcoverType(Enum):
    DESERT = "desert"           # Open desert, sand, rock
    SHRUB = "shrub"             # Scrubland, grassland
    FOREST = "forest"           # Dense vegetation
    WET = "wet"                 # Marsh, wetland, water crossings
    UNKNOWN = "unknown"         # Default


LANDCOVER_MULTIPLIERS = {
    LandcoverType.DESERT: 0.8,   # Easy travel on open ground
    LandcoverType.SHRUB: 1.0,    # Baseline difficulty
    LandcoverType.FOREST: 1.4,   # Bushwhacking through vegetation
    LandcoverType.WET: 1.8,      # Difficult wet terrain
    LandcoverType.UNKNOWN: 1.0,  # Default to baseline
}

# OSM landuse/natural tags mapped to landcover types
OSM_LANDCOVER_MAPPING = {
    # Desert/open
    'sand': LandcoverType.DESERT,
    'bare_rock': LandcoverType.DESERT,
    'scree': LandcoverType.DESERT,
    'desert': LandcoverType.DESERT,
    'beach': LandcoverType.DESERT,
    # Shrub/grassland
    'scrub': LandcoverType.SHRUB,
    'grassland': LandcoverType.SHRUB,
    'heath': LandcoverType.SHRUB,
    'meadow': LandcoverType.SHRUB,
    'fell': LandcoverType.SHRUB,
    # Forest
    'forest': LandcoverType.FOREST,
    'wood': LandcoverType.FOREST,
    'tree_row': LandcoverType.FOREST,
    # Wet
    'wetland': LandcoverType.WET,
    'marsh': LandcoverType.WET,
    'swamp': LandcoverType.WET,
    'mud': LandcoverType.WET,
    'water': LandcoverType.WET,
}


def get_approach_difficulty(
    adjusted_distance_m: float,
    adjusted_uphill_m: float,
    adjusted_downhill_m: float,
) -> str:
    """
    Classify approach difficulty based on adjusted values.

    Returns: 'easy', 'moderate', or 'hard'
    """
    # Check against profile thresholds
    casual = APPROACH_PROFILES[ApproachProfile.CASUAL]
    moderate = APPROACH_PROFILES[ApproachProfile.MODERATE]

    # Easy: fits within casual limits
    if (adjusted_distance_m <= casual.max_distance_m and
        adjusted_uphill_m <= casual.max_uphill_m and
        adjusted_downhill_m <= casual.max_downhill_m):
        return 'easy'

    # Moderate: fits within moderate limits
    if (adjusted_distance_m <= moderate.max_distance_m and
        adjusted_uphill_m <= moderate.max_uphill_m and
        adjusted_downhill_m <= moderate.max_downhill_m):
        return 'moderate'

    # Hard: exceeds moderate but within spicy
    return 'hard'

# OSM highway types considered accessible for photography
ACCESSIBLE_HIGHWAY_TYPES = {
    # Roads
    'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
    'unclassified', 'residential', 'service', 'track',
    # Paths and trails
    'path', 'footway', 'cycleway', 'bridleway', 'steps',
    # Off-road
    'track', 'byway', 'unsurfaced',
}


@dataclass
class RoadSegment:
    """A road/trail segment from OSM."""
    way_id: int
    highway_type: str
    name: Optional[str]
    coords: List[Tuple[float, float]]  # [(lat, lon), ...]
    surface: Optional[str] = None
    access: Optional[str] = None


@dataclass
class AccessibilityResult:
    """Result of accessibility check for a location."""
    is_accessible: bool  # Passes all accessibility constraints
    distance_to_road_m: float  # Distance to nearest road/trail
    nearest_road_type: Optional[str]  # Type of nearest road (e.g., 'track', 'path')
    nearest_road_name: Optional[str]  # Name of nearest road if available
    nearest_point: Optional[Tuple[float, float]]  # Closest point on road (lat, lon)
    accessibility_status: str  # 'on-road', 'near-road', 'off-trail', 'too-far', 'too-steep'
    # Elevation gain from access point to standing location
    access_point_elevation_m: Optional[float] = None
    standing_elevation_m: Optional[float] = None
    uphill_gain_m: Optional[float] = None  # Positive = climb from access to standing
    downhill_gain_m: Optional[float] = None  # Positive = descent from access to standing
    # Landcover and adjusted values
    landcover_type: str = "unknown"  # desert, shrub, forest, wet, unknown
    landcover_multiplier: float = 1.0
    adjusted_distance_m: Optional[float] = None  # distance * multiplier
    adjusted_uphill_m: Optional[float] = None    # uphill * multiplier
    adjusted_downhill_m: Optional[float] = None  # downhill * multiplier
    # Approach difficulty
    approach_difficulty: str = "unknown"  # easy, moderate, hard, unknown
    approach_profile: str = "moderate"    # Profile used for evaluation
    # Rejection reason if not accessible
    rejection_reason: Optional[str] = None


class OSMRoadCache:
    """Cache for OSM road data within analysis areas."""

    def __init__(self):
        self._cache: dict[str, List[RoadSegment]] = {}

    def _cache_key(self, bounds: dict) -> str:
        """Generate cache key from bounds."""
        return f"{bounds['south']:.4f},{bounds['west']:.4f},{bounds['north']:.4f},{bounds['east']:.4f}"

    def get(self, bounds: dict) -> Optional[List[RoadSegment]]:
        """Get cached roads for bounds."""
        key = self._cache_key(bounds)
        return self._cache.get(key)

    def set(self, bounds: dict, roads: List[RoadSegment]):
        """Cache roads for bounds."""
        key = self._cache_key(bounds)
        self._cache[key] = roads


# Global cache instance
_road_cache = OSMRoadCache()


@dataclass
class LandcoverPolygon:
    """A landcover area from OSM."""
    landcover_type: LandcoverType
    osm_tag: str  # Original OSM tag value
    bounds: Tuple[float, float, float, float]  # (min_lat, min_lon, max_lat, max_lon)
    coords: List[Tuple[float, float]]  # Polygon coordinates


class OSMLandcoverCache:
    """Cache for OSM landcover data within analysis areas."""

    def __init__(self):
        self._cache: dict[str, List[LandcoverPolygon]] = {}

    def _cache_key(self, bounds: dict) -> str:
        return f"lc_{bounds['south']:.4f},{bounds['west']:.4f},{bounds['north']:.4f},{bounds['east']:.4f}"

    def get(self, bounds: dict) -> Optional[List[LandcoverPolygon]]:
        key = self._cache_key(bounds)
        return self._cache.get(key)

    def set(self, bounds: dict, polygons: List[LandcoverPolygon]):
        key = self._cache_key(bounds)
        self._cache[key] = polygons


_landcover_cache = OSMLandcoverCache()


async def fetch_osm_landcover(
    bounds: dict,
    buffer_m: float = 500.0,
) -> List[LandcoverPolygon]:
    """
    Fetch landcover data from OSM Overpass API.

    Returns list of LandcoverPolygon objects for natural/landuse areas.
    """
    import aiohttp

    # Check cache first
    cached = _landcover_cache.get(bounds)
    if cached is not None:
        logging.debug(f"Using cached landcover ({len(cached)} polygons)")
        return cached

    # Add buffer to bounds
    lat_buffer = buffer_m / 111000
    lon_buffer = buffer_m / (111000 * math.cos(math.radians((bounds['north'] + bounds['south']) / 2)))

    south = bounds['south'] - lat_buffer
    north = bounds['north'] + lat_buffer
    west = bounds['west'] - lon_buffer
    east = bounds['east'] + lon_buffer

    # Query for natural and landuse areas
    natural_types = '|'.join(['sand', 'bare_rock', 'scree', 'scrub', 'grassland', 'heath',
                              'fell', 'wood', 'wetland', 'marsh', 'water', 'mud', 'beach'])
    landuse_types = '|'.join(['forest', 'meadow'])

    query = f"""
    [out:json][timeout:30];
    (
      way["natural"~"^({natural_types})$"]({south},{west},{north},{east});
      way["landuse"~"^({landuse_types})$"]({south},{west},{north},{east});
      relation["natural"~"^({natural_types})$"]({south},{west},{north},{east});
      relation["landuse"~"^({landuse_types})$"]({south},{west},{north},{east});
    );
    out body geom;
    """

    overpass_url = "https://overpass-api.de/api/interpreter"

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                overpass_url,
                data={"data": query},
                timeout=aiohttp.ClientTimeout(total=30)
            ) as response:
                if response.status != 200:
                    logging.warning(f"Overpass landcover API returned status {response.status}")
                    return []

                data = await response.json()
    except Exception as e:
        logging.warning(f"Failed to fetch OSM landcover: {e}")
        return []

    # Parse response
    polygons = []
    for element in data.get('elements', []):
        if element.get('type') not in ('way', 'relation'):
            continue

        tags = element.get('tags', {})
        osm_tag = tags.get('natural') or tags.get('landuse')

        if not osm_tag or osm_tag not in OSM_LANDCOVER_MAPPING:
            continue

        landcover_type = OSM_LANDCOVER_MAPPING[osm_tag]

        # Extract geometry
        geometry = element.get('geometry', [])
        if len(geometry) < 3:
            continue

        coords = [(node['lat'], node['lon']) for node in geometry]
        lats = [c[0] for c in coords]
        lons = [c[1] for c in coords]

        polygon = LandcoverPolygon(
            landcover_type=landcover_type,
            osm_tag=osm_tag,
            bounds=(min(lats), min(lons), max(lats), max(lons)),
            coords=coords,
        )
        polygons.append(polygon)

    logging.info(f"Fetched {len(polygons)} landcover polygons from OSM")

    _landcover_cache.set(bounds, polygons)
    return polygons


def _point_in_polygon(lat: float, lon: float, coords: List[Tuple[float, float]]) -> bool:
    """Check if a point is inside a polygon using ray casting."""
    n = len(coords)
    inside = False

    j = n - 1
    for i in range(n):
        yi, xi = coords[i]
        yj, xj = coords[j]

        if ((yi > lat) != (yj > lat)) and (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi):
            inside = not inside
        j = i

    return inside


def get_landcover_at_point(
    lat: float,
    lon: float,
    landcover_polygons: List[LandcoverPolygon],
) -> Tuple[LandcoverType, float]:
    """
    Determine landcover type at a point.

    Returns tuple of (LandcoverType, multiplier).
    """
    for polygon in landcover_polygons:
        # Quick bounds check
        min_lat, min_lon, max_lat, max_lon = polygon.bounds
        if not (min_lat <= lat <= max_lat and min_lon <= lon <= max_lon):
            continue

        # Detailed point-in-polygon check
        if _point_in_polygon(lat, lon, polygon.coords):
            multiplier = LANDCOVER_MULTIPLIERS[polygon.landcover_type]
            return polygon.landcover_type, multiplier

    # Default to unknown/baseline
    return LandcoverType.UNKNOWN, 1.0


async def fetch_osm_roads(
    bounds: dict,
    buffer_m: float = 500.0,
) -> List[RoadSegment]:
    """
    Fetch roads and trails from OSM Overpass API.

    Args:
        bounds: Dict with 'north', 'south', 'east', 'west' keys
        buffer_m: Buffer to add around bounds in meters

    Returns:
        List of RoadSegment objects
    """
    import aiohttp

    # Check cache first
    cached = _road_cache.get(bounds)
    if cached is not None:
        logging.debug(f"Using cached OSM roads ({len(cached)} segments)")
        return cached

    # Add buffer to bounds (approximate degrees from meters)
    lat_buffer = buffer_m / 111000  # ~111km per degree latitude
    lon_buffer = buffer_m / (111000 * math.cos(math.radians((bounds['north'] + bounds['south']) / 2)))

    south = bounds['south'] - lat_buffer
    north = bounds['north'] + lat_buffer
    west = bounds['west'] - lon_buffer
    east = bounds['east'] + lon_buffer

    # Build Overpass query for roads and trails
    highway_filter = '|'.join(ACCESSIBLE_HIGHWAY_TYPES)
    query = f"""
    [out:json][timeout:30];
    (
      way["highway"~"^({highway_filter})$"]({south},{west},{north},{east});
    );
    out body geom;
    """

    overpass_url = "https://overpass-api.de/api/interpreter"

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                overpass_url,
                data={"data": query},
                timeout=aiohttp.ClientTimeout(total=30)
            ) as response:
                if response.status != 200:
                    logging.warning(f"Overpass API returned status {response.status}")
                    return []

                data = await response.json()
    except Exception as e:
        logging.warning(f"Failed to fetch OSM roads: {e}")
        return []

    # Parse response into RoadSegments
    roads = []
    for element in data.get('elements', []):
        if element.get('type') != 'way':
            continue

        tags = element.get('tags', {})
        highway_type = tags.get('highway')

        if highway_type not in ACCESSIBLE_HIGHWAY_TYPES:
            continue

        # Extract geometry
        geometry = element.get('geometry', [])
        if len(geometry) < 2:
            continue

        coords = [(node['lat'], node['lon']) for node in geometry]

        road = RoadSegment(
            way_id=element['id'],
            highway_type=highway_type,
            name=tags.get('name'),
            coords=coords,
            surface=tags.get('surface'),
            access=tags.get('access'),
        )
        roads.append(road)

    logging.info(f"Fetched {len(roads)} road/trail segments from OSM")

    # Cache the result
    _road_cache.set(bounds, roads)

    return roads


def _haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance in meters between two lat/lon points."""
    R = 6371000  # Earth radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2) ** 2 + \
        math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c


def _point_to_segment_distance(
    point_lat: float,
    point_lon: float,
    seg_start: Tuple[float, float],
    seg_end: Tuple[float, float],
) -> Tuple[float, Tuple[float, float]]:
    """
    Calculate minimum distance from a point to a line segment.

    Returns:
        Tuple of (distance_m, closest_point_on_segment)
    """
    # Convert to approximate local coordinates (meters)
    lat_center = (seg_start[0] + seg_end[0]) / 2
    m_per_deg_lat = 111000
    m_per_deg_lon = 111000 * math.cos(math.radians(lat_center))

    # Point
    px = (point_lon - seg_start[1]) * m_per_deg_lon
    py = (point_lat - seg_start[0]) * m_per_deg_lat

    # Segment
    ax, ay = 0, 0
    bx = (seg_end[1] - seg_start[1]) * m_per_deg_lon
    by = (seg_end[0] - seg_start[0]) * m_per_deg_lat

    # Vector from a to b
    abx, aby = bx - ax, by - ay

    # Vector from a to p
    apx, apy = px - ax, py - ay

    # Project p onto ab
    ab_sq = abx * abx + aby * aby
    if ab_sq == 0:
        # Segment is a point
        t = 0
    else:
        t = max(0, min(1, (apx * abx + apy * aby) / ab_sq))

    # Closest point on segment
    closest_x = ax + t * abx
    closest_y = ay + t * aby

    # Distance
    dx = px - closest_x
    dy = py - closest_y
    distance = math.sqrt(dx * dx + dy * dy)

    # Convert closest point back to lat/lon
    closest_lon = seg_start[1] + closest_x / m_per_deg_lon
    closest_lat = seg_start[0] + closest_y / m_per_deg_lat

    return distance, (closest_lat, closest_lon)


def _get_elevation_at_point(
    dem: 'DEMGrid',
    lat: float,
    lon: float,
) -> Optional[float]:
    """Get elevation at a lat/lon point from DEM, or None if out of bounds."""
    try:
        row, col = dem.lat_lon_to_indices(lat, lon)
        if 0 <= row < dem.elevations.shape[0] and 0 <= col < dem.elevations.shape[1]:
            return float(dem.elevations[row, col])
    except Exception:
        pass
    return None


def check_accessibility(
    lat: float,
    lon: float,
    roads: List[RoadSegment],
    dem: Optional['DEMGrid'] = None,
    standing_elevation_m: Optional[float] = None,
    max_distance_m: float = DEFAULT_MAX_DISTANCE_M,
    profile: ApproachProfile = DEFAULT_PROFILE,
    landcover_polygons: Optional[List[LandcoverPolygon]] = None,
) -> AccessibilityResult:
    """
    Check if a location is accessible (near a road/trail with acceptable elevation gain).

    Uses approach profile limits with landcover-adjusted distances and gains.

    Args:
        lat: Latitude of standing location
        lon: Longitude of standing location
        roads: List of road segments to check against
        dem: DEM grid for elevation lookup (optional)
        standing_elevation_m: Known elevation at standing point (optional, uses DEM if not provided)
        max_distance_m: Maximum distance to be considered "near-road" (default 300m)
        profile: Approach profile defining hard limits (CASUAL, MODERATE, SPICY)
        landcover_polygons: Landcover data for terrain difficulty multipliers

    Returns:
        AccessibilityResult with distance, elevation gain, adjusted values, and status
    """
    # Get profile limits
    limits = APPROACH_PROFILES[profile]

    if not roads:
        # No road data available - assume accessible but mark as unknown
        logging.debug("No road data available, assuming accessible")
        return AccessibilityResult(
            is_accessible=True,
            distance_to_road_m=0.0,
            nearest_road_type=None,
            nearest_road_name=None,
            nearest_point=None,
            accessibility_status='unknown',
            approach_profile=profile.value,
        )

    min_distance = float('inf')
    nearest_road: Optional[RoadSegment] = None
    nearest_point: Optional[Tuple[float, float]] = None

    for road in roads:
        coords = road.coords
        for i in range(len(coords) - 1):
            seg_start = coords[i]
            seg_end = coords[i + 1]

            distance, closest = _point_to_segment_distance(
                lat, lon, seg_start, seg_end
            )

            if distance < min_distance:
                min_distance = distance
                nearest_road = road
                nearest_point = closest

    # Get elevations for gain calculation
    access_elev = None
    stand_elev = standing_elevation_m
    uphill_gain = None
    downhill_gain = None

    if dem and nearest_point:
        access_elev = _get_elevation_at_point(dem, nearest_point[0], nearest_point[1])
        if stand_elev is None:
            stand_elev = _get_elevation_at_point(dem, lat, lon)

        if access_elev is not None and stand_elev is not None:
            elev_diff = stand_elev - access_elev
            if elev_diff > 0:
                uphill_gain = elev_diff
                downhill_gain = 0.0
            else:
                uphill_gain = 0.0
                downhill_gain = abs(elev_diff)

    # Get landcover at standing point for terrain difficulty multiplier
    landcover_type = LandcoverType.UNKNOWN
    landcover_multiplier = 1.0
    if landcover_polygons:
        landcover_type, landcover_multiplier = get_landcover_at_point(lat, lon, landcover_polygons)

    # Calculate adjusted values (raw * multiplier)
    adjusted_distance = min_distance * landcover_multiplier
    adjusted_uphill = (uphill_gain or 0.0) * landcover_multiplier
    adjusted_downhill = (downhill_gain or 0.0) * landcover_multiplier

    # Check hard rejection constraints against profile limits
    rejection_reason = None

    # 1. Check adjusted distance from access point
    if adjusted_distance > limits.max_distance_m:
        rejection_reason = f"too far ({adjusted_distance:.0f}m adjusted > {limits.max_distance_m:.0f}m {profile.value} limit)"
        return AccessibilityResult(
            is_accessible=False,
            distance_to_road_m=min_distance,
            nearest_road_type=nearest_road.highway_type if nearest_road else None,
            nearest_road_name=nearest_road.name if nearest_road else None,
            nearest_point=nearest_point,
            accessibility_status='too-far',
            access_point_elevation_m=access_elev,
            standing_elevation_m=stand_elev,
            uphill_gain_m=uphill_gain,
            downhill_gain_m=downhill_gain,
            landcover_type=landcover_type.value,
            landcover_multiplier=landcover_multiplier,
            adjusted_distance_m=adjusted_distance,
            adjusted_uphill_m=adjusted_uphill,
            adjusted_downhill_m=adjusted_downhill,
            approach_difficulty='hard',
            approach_profile=profile.value,
            rejection_reason=rejection_reason,
        )

    # 2. Check adjusted uphill gain
    if adjusted_uphill > limits.max_uphill_m:
        rejection_reason = f"too much uphill ({adjusted_uphill:.0f}m adjusted > {limits.max_uphill_m:.0f}m {profile.value} limit)"
        return AccessibilityResult(
            is_accessible=False,
            distance_to_road_m=min_distance,
            nearest_road_type=nearest_road.highway_type if nearest_road else None,
            nearest_road_name=nearest_road.name if nearest_road else None,
            nearest_point=nearest_point,
            accessibility_status='too-steep',
            access_point_elevation_m=access_elev,
            standing_elevation_m=stand_elev,
            uphill_gain_m=uphill_gain,
            downhill_gain_m=downhill_gain,
            landcover_type=landcover_type.value,
            landcover_multiplier=landcover_multiplier,
            adjusted_distance_m=adjusted_distance,
            adjusted_uphill_m=adjusted_uphill,
            adjusted_downhill_m=adjusted_downhill,
            approach_difficulty='hard',
            approach_profile=profile.value,
            rejection_reason=rejection_reason,
        )

    # 3. Check adjusted downhill gain
    if adjusted_downhill > limits.max_downhill_m:
        rejection_reason = f"too much downhill ({adjusted_downhill:.0f}m adjusted > {limits.max_downhill_m:.0f}m {profile.value} limit)"
        return AccessibilityResult(
            is_accessible=False,
            distance_to_road_m=min_distance,
            nearest_road_type=nearest_road.highway_type if nearest_road else None,
            nearest_road_name=nearest_road.name if nearest_road else None,
            nearest_point=nearest_point,
            accessibility_status='too-steep',
            access_point_elevation_m=access_elev,
            standing_elevation_m=stand_elev,
            uphill_gain_m=uphill_gain,
            downhill_gain_m=downhill_gain,
            landcover_type=landcover_type.value,
            landcover_multiplier=landcover_multiplier,
            adjusted_distance_m=adjusted_distance,
            adjusted_uphill_m=adjusted_uphill,
            adjusted_downhill_m=adjusted_downhill,
            approach_difficulty='hard',
            approach_profile=profile.value,
            rejection_reason=rejection_reason,
        )

    # Determine accessibility status (passed hard constraints)
    if min_distance <= 30:
        status = 'on-road'  # Essentially on the road
    elif min_distance <= max_distance_m:
        status = 'near-road'  # Within soft threshold
    else:
        status = 'off-trail'  # Beyond soft threshold but within hard limit

    # Determine approach difficulty label
    approach_difficulty = get_approach_difficulty(adjusted_distance, adjusted_uphill, adjusted_downhill)

    return AccessibilityResult(
        is_accessible=True,
        distance_to_road_m=min_distance,
        nearest_road_type=nearest_road.highway_type if nearest_road else None,
        nearest_road_name=nearest_road.name if nearest_road else None,
        nearest_point=nearest_point,
        accessibility_status=status,
        access_point_elevation_m=access_elev,
        standing_elevation_m=stand_elev,
        uphill_gain_m=uphill_gain,
        downhill_gain_m=downhill_gain,
        landcover_type=landcover_type.value,
        landcover_multiplier=landcover_multiplier,
        adjusted_distance_m=adjusted_distance,
        adjusted_uphill_m=adjusted_uphill,
        adjusted_downhill_m=adjusted_downhill,
        approach_difficulty=approach_difficulty,
        approach_profile=profile.value,
    )


def apply_accessibility_penalty(
    confidence: float,
    accessibility: AccessibilityResult,
) -> float:
    """
    Apply confidence penalty based on accessibility.

    Off-trail locations get their confidence reduced.
    """
    if accessibility.accessibility_status == 'off-trail':
        return confidence * OFF_TRAIL_CONFIDENCE_PENALTY
    return confidence
