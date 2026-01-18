"""
DEM (Digital Elevation Model) fetching and grid management.

Uses AWS Terrain Tiles (Terrarium format) for elevation data.
Tiles are freely available PNG images with elevation encoded in RGB.
"""
from __future__ import annotations

import numpy as np
import httpx
from dataclasses import dataclass
from math import radians, cos, floor, log, tan, pi
from io import BytesIO
from typing import List, Tuple

# Try to import PIL for image decoding
try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False


# AWS Terrain Tiles URL (Terrarium format)
TERRAIN_TILES_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"


@dataclass
class DEMGrid:
    """Elevation grid with geographic metadata."""
    elevations: np.ndarray  # 2D array of elevations in meters
    lats: np.ndarray  # 1D array of latitude values (north to south)
    lons: np.ndarray  # 1D array of longitude values (west to east)
    cell_size_m: float  # Approximate cell size in meters
    bounds: dict  # {"north", "south", "east", "west"}

    @property
    def rows(self) -> int:
        return self.elevations.shape[0]

    @property
    def cols(self) -> int:
        return self.elevations.shape[1]

    def lat_lon_to_indices(self, lat: float, lon: float) -> tuple[int, int]:
        """Convert lat/lon to grid indices (row, col)."""
        row = int((self.bounds["north"] - lat) / (self.bounds["north"] - self.bounds["south"]) * (self.rows - 1))
        col = int((lon - self.bounds["west"]) / (self.bounds["east"] - self.bounds["west"]) * (self.cols - 1))
        return max(0, min(row, self.rows - 1)), max(0, min(col, self.cols - 1))

    def indices_to_lat_lon(self, row: int, col: int) -> tuple[float, float]:
        """Convert grid indices to lat/lon."""
        lat = self.lats[row]
        lon = self.lons[col]
        return lat, lon

    def get_elevation(self, lat: float, lon: float) -> float:
        """Get elevation at a lat/lon point (nearest neighbor)."""
        row, col = self.lat_lon_to_indices(lat, lon)
        return float(self.elevations[row, col])

    def get_elevation_bilinear(self, lat: float, lon: float) -> float:
        """Get elevation with bilinear interpolation."""
        # Fractional row/col
        frow = (self.bounds["north"] - lat) / (self.bounds["north"] - self.bounds["south"]) * (self.rows - 1)
        fcol = (lon - self.bounds["west"]) / (self.bounds["east"] - self.bounds["west"]) * (self.cols - 1)

        # Integer indices
        r0 = max(0, min(int(frow), self.rows - 2))
        c0 = max(0, min(int(fcol), self.cols - 2))
        r1, c1 = r0 + 1, c0 + 1

        # Fractional parts
        dr = frow - r0
        dc = fcol - c0

        # Bilinear interpolation
        z00 = self.elevations[r0, c0]
        z01 = self.elevations[r0, c1]
        z10 = self.elevations[r1, c0]
        z11 = self.elevations[r1, c1]

        return float(
            z00 * (1 - dr) * (1 - dc) +
            z01 * (1 - dr) * dc +
            z10 * dr * (1 - dc) +
            z11 * dr * dc
        )


def lat_lon_to_tile(lat: float, lon: float, zoom: int) -> Tuple[int, int]:
    """
    Convert lat/lon to tile coordinates at given zoom level.

    Returns (tile_x, tile_y)
    """
    lat_rad = radians(lat)
    n = 2.0 ** zoom
    tile_x = int((lon + 180.0) / 360.0 * n)
    tile_y = int((1.0 - log(tan(lat_rad) + 1.0 / cos(lat_rad)) / pi) / 2.0 * n)
    return tile_x, tile_y


def tile_to_lat_lon(tile_x: int, tile_y: int, zoom: int) -> Tuple[float, float]:
    """
    Convert tile coordinates to lat/lon (northwest corner of tile).
    """
    n = 2.0 ** zoom
    lon = tile_x / n * 360.0 - 180.0
    lat_rad = np.arctan(np.sinh(pi * (1 - 2 * tile_y / n)))
    lat = np.degrees(lat_rad)
    return float(lat), float(lon)


def decode_terrarium_elevation(r: int, g: int, b: int) -> float:
    """
    Decode elevation from Terrarium RGB format.

    Formula: elevation = (R * 256 + G + B / 256) - 32768
    """
    return (r * 256.0 + g + b / 256.0) - 32768.0


async def fetch_terrain_tile(
    tile_x: int,
    tile_y: int,
    zoom: int,
    client: httpx.AsyncClient,
) -> np.ndarray:
    """
    Fetch a single terrain tile and decode to elevation array.

    Returns 256x256 array of elevations in meters.
    """
    url = TERRAIN_TILES_URL.format(z=zoom, x=tile_x, y=tile_y)

    response = await client.get(url)
    response.raise_for_status()

    if not HAS_PIL:
        raise ImportError("PIL/Pillow is required for terrain tiles. Install with: pip install Pillow")

    # Decode PNG image
    img = Image.open(BytesIO(response.content))
    img_array = np.array(img)

    # Decode RGB to elevation
    r = img_array[:, :, 0].astype(np.float64)
    g = img_array[:, :, 1].astype(np.float64)
    b = img_array[:, :, 2].astype(np.float64)

    elevation = (r * 256.0 + g + b / 256.0) - 32768.0

    return elevation


async def fetch_dem_grid(
    center_lat: float,
    center_lon: float,
    radius_km: float,
    resolution_m: float = 30.0,
) -> DEMGrid:
    """
    Fetch elevation data for a grid around a center point using AWS Terrain Tiles.

    Args:
        center_lat: Center latitude
        center_lon: Center longitude
        radius_km: Radius of area to fetch in km
        resolution_m: Target resolution in meters (determines zoom level)

    Returns:
        DEMGrid with elevation data
    """
    # Calculate bounds
    lat_deg_per_km = 1 / 111.32
    lon_deg_per_km = 1 / (111.32 * cos(radians(center_lat)))

    north = center_lat + radius_km * lat_deg_per_km
    south = center_lat - radius_km * lat_deg_per_km
    east = center_lon + radius_km * lon_deg_per_km
    west = center_lon - radius_km * lon_deg_per_km

    # Choose zoom level based on resolution
    # At zoom z, each tile covers ~40075km / 2^z in width at equator
    # Each tile is 256 pixels, so pixel size = 40075000 / (256 * 2^z) meters
    # For 30m resolution, we want zoom ~12-13
    # For 100m resolution, zoom ~10
    if resolution_m <= 30:
        zoom = 13
    elif resolution_m <= 60:
        zoom = 12
    elif resolution_m <= 120:
        zoom = 11
    else:
        zoom = 10

    # Get tile coordinates for corners
    tile_x_min, tile_y_min = lat_lon_to_tile(north, west, zoom)
    tile_x_max, tile_y_max = lat_lon_to_tile(south, east, zoom)

    # Ensure we have at least one tile
    tile_x_max = max(tile_x_max, tile_x_min)
    tile_y_max = max(tile_y_max, tile_y_min)

    # Fetch all needed tiles
    tiles = {}
    async with httpx.AsyncClient(timeout=30.0) as client:
        for tx in range(tile_x_min, tile_x_max + 1):
            for ty in range(tile_y_min, tile_y_max + 1):
                try:
                    tile_elev = await fetch_terrain_tile(tx, ty, zoom, client)
                    tiles[(tx, ty)] = tile_elev
                except Exception as e:
                    print(f"Warning: Failed to fetch tile {tx},{ty}: {e}")
                    # Use zeros for failed tiles
                    tiles[(tx, ty)] = np.zeros((256, 256))

    # Stitch tiles together
    num_tiles_x = tile_x_max - tile_x_min + 1
    num_tiles_y = tile_y_max - tile_y_min + 1

    full_array = np.zeros((num_tiles_y * 256, num_tiles_x * 256))

    for tx in range(tile_x_min, tile_x_max + 1):
        for ty in range(tile_y_min, tile_y_max + 1):
            local_x = tx - tile_x_min
            local_y = ty - tile_y_min
            full_array[local_y * 256:(local_y + 1) * 256,
                      local_x * 256:(local_x + 1) * 256] = tiles[(tx, ty)]

    # Calculate the geographic bounds of the full tile array
    tile_nw_lat, tile_nw_lon = tile_to_lat_lon(tile_x_min, tile_y_min, zoom)
    tile_se_lat, tile_se_lon = tile_to_lat_lon(tile_x_max + 1, tile_y_max + 1, zoom)

    # Create coordinate arrays for full tile extent
    full_lats = np.linspace(tile_nw_lat, tile_se_lat, full_array.shape[0])
    full_lons = np.linspace(tile_nw_lon, tile_se_lon, full_array.shape[1])

    # Extract just the region we need (within our requested bounds)
    # Find indices for our bounds
    lat_indices = np.where((full_lats <= north) & (full_lats >= south))[0]
    lon_indices = np.where((full_lons >= west) & (full_lons <= east))[0]

    if len(lat_indices) == 0 or len(lon_indices) == 0:
        # Fallback: use full array
        lat_indices = np.arange(full_array.shape[0])
        lon_indices = np.arange(full_array.shape[1])

    # Subsample to reasonable size (max ~100x100 for performance)
    target_size = 80
    lat_step = max(1, len(lat_indices) // target_size)
    lon_step = max(1, len(lon_indices) // target_size)

    lat_indices = lat_indices[::lat_step]
    lon_indices = lon_indices[::lon_step]

    # Extract subarray
    elev_grid = full_array[np.ix_(lat_indices, lon_indices)]
    lats = full_lats[lat_indices]
    lons = full_lons[lon_indices]

    # Calculate cell size
    if len(lats) > 1:
        lat_span_m = abs(lats[0] - lats[-1]) * 111320
        cell_size_m = lat_span_m / len(lats)
    else:
        cell_size_m = resolution_m

    return DEMGrid(
        elevations=elev_grid,
        lats=lats,
        lons=lons,
        cell_size_m=cell_size_m,
        bounds={"north": float(lats[0]), "south": float(lats[-1]),
                "east": float(lons[-1]), "west": float(lons[0])},
    )


def create_synthetic_dem(
    center_lat: float,
    center_lon: float,
    radius_km: float,
    base_elevation: float = 1000.0,
    feature_height: float = 500.0,
    resolution_m: float = 30.0,
) -> DEMGrid:
    """
    Create a synthetic DEM for testing.

    Generates a terrain with a prominent cliff-like feature.
    """
    lat_deg_per_km = 1 / 111.32
    lon_deg_per_km = 1 / (111.32 * cos(radians(center_lat)))

    north = center_lat + radius_km * lat_deg_per_km
    south = center_lat - radius_km * lat_deg_per_km
    east = center_lon + radius_km * lon_deg_per_km
    west = center_lon - radius_km * lon_deg_per_km

    lat_span_m = radius_km * 2 * 1000
    num_rows = max(20, min(100, int(lat_span_m / resolution_m)))
    num_cols = num_rows

    lats = np.linspace(north, south, num_rows)
    lons = np.linspace(west, east, num_cols)

    # Create base terrain with some variation
    x = np.linspace(-1, 1, num_cols)
    y = np.linspace(-1, 1, num_rows)
    X, Y = np.meshgrid(x, y)

    # Base elevation with gentle slope
    elev_grid = base_elevation + 50 * X + 30 * Y

    # Add a cliff feature in one quadrant (steep west-facing slope)
    cliff_mask = (X > 0.2) & (X < 0.5) & (Y > -0.3) & (Y < 0.3)
    elev_grid = np.where(cliff_mask, elev_grid + feature_height, elev_grid)

    # Add some noise for realism
    elev_grid += np.random.randn(num_rows, num_cols) * 5

    cell_size_m = lat_span_m / num_rows

    return DEMGrid(
        elevations=elev_grid,
        lats=lats,
        lons=lons,
        cell_size_m=cell_size_m,
        bounds={"north": north, "south": south, "east": east, "west": west},
    )
