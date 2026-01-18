"""
DEM (Digital Elevation Model) fetching and grid management.

Uses Open-Meteo API for elevation data on a regular grid.
"""

import numpy as np
import httpx
from dataclasses import dataclass
from math import radians, cos


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


def meters_per_degree_lat() -> float:
    """Approximate meters per degree of latitude."""
    return 111_320.0


def meters_per_degree_lon(lat: float) -> float:
    """Approximate meters per degree of longitude at given latitude."""
    return 111_320.0 * cos(radians(lat))


async def fetch_dem_grid(
    center_lat: float,
    center_lon: float,
    radius_km: float,
    resolution_m: float = 30.0,
) -> DEMGrid:
    """
    Fetch elevation data for a grid around a center point.

    Args:
        center_lat: Center latitude
        center_lon: Center longitude
        radius_km: Radius of area to fetch in km
        resolution_m: Target resolution in meters (default 30m)

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

    # Calculate grid size based on resolution
    lat_span_m = radius_km * 2 * 1000
    lon_span_m = radius_km * 2 * 1000 * cos(radians(center_lat))

    num_rows = max(10, min(100, int(lat_span_m / resolution_m)))
    num_cols = max(10, min(100, int(lon_span_m / resolution_m)))

    # Generate grid points
    lats = np.linspace(north, south, num_rows)
    lons = np.linspace(west, east, num_cols)

    # Create all coordinate pairs
    points = []
    for lat in lats:
        for lon in lons:
            points.append((lat, lon))

    # Fetch elevations from Open-Meteo (batch API)
    # Open-Meteo accepts up to 1000 points per request
    elevations = await _fetch_elevations_batch(points)

    # Reshape to grid
    elev_grid = np.array(elevations).reshape(num_rows, num_cols)

    # Calculate cell size
    cell_size_m = lat_span_m / num_rows

    return DEMGrid(
        elevations=elev_grid,
        lats=lats,
        lons=lons,
        cell_size_m=cell_size_m,
        bounds={"north": north, "south": south, "east": east, "west": west},
    )


async def _fetch_elevations_batch(
    points: list[tuple[float, float]],
    batch_size: int = 100,
) -> list[float]:
    """
    Fetch elevations for a list of points using Open-Meteo API.

    Args:
        points: List of (lat, lon) tuples
        batch_size: Number of points per API request

    Returns:
        List of elevations in meters
    """
    elevations = []

    async with httpx.AsyncClient(timeout=30.0) as client:
        for i in range(0, len(points), batch_size):
            batch = points[i : i + batch_size]

            lats_str = ",".join(f"{p[0]:.6f}" for p in batch)
            lons_str = ",".join(f"{p[1]:.6f}" for p in batch)

            url = f"https://api.open-meteo.com/v1/elevation?latitude={lats_str}&longitude={lons_str}"

            response = await client.get(url)
            response.raise_for_status()

            data = response.json()
            batch_elevations = data.get("elevation", [])

            # Handle single point response (returns scalar instead of list)
            if isinstance(batch_elevations, (int, float)):
                batch_elevations = [batch_elevations]

            elevations.extend(batch_elevations)

    return elevations


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
