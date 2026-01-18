"""
Authoritative DEM sources for terrain analysis.

Uses high-accuracy elevation data from:
- Copernicus GLO-30 (global, 30m resolution)
- USGS 3DEP (US only, 10m/30m resolution)

These sources should be used for all geometry calculations (slope, aspect,
surface normals) and photo-moment scoring. AWS Terrain Tiles should only
be used for visualization/preview purposes.
"""
from __future__ import annotations

import numpy as np
from dataclasses import dataclass
from math import radians, cos, floor, ceil
from typing import Optional, Tuple, Literal
from enum import Enum

from .dem import DEMGrid


class AuthoritativeDEMSource(str, Enum):
    """Supported authoritative DEM sources."""
    COPERNICUS_GLO30 = "copernicus-glo30"
    USGS_3DEP = "usgs-3dep"


@dataclass
class DEMSourceInfo:
    """Information about the DEM source used."""
    source: AuthoritativeDEMSource
    resolution_m: float
    vertical_accuracy_m: float
    horizontal_accuracy_m: float
    citation: str


# Copernicus GLO-30 metadata
COPERNICUS_INFO = DEMSourceInfo(
    source=AuthoritativeDEMSource.COPERNICUS_GLO30,
    resolution_m=30.0,
    vertical_accuracy_m=4.0,  # LE90
    horizontal_accuracy_m=4.0,  # CE90
    citation="Copernicus DEM GLO-30 © DLR e.V. 2021, distributed under CC-BY-4.0",
)

# USGS 3DEP metadata
USGS_3DEP_INFO = DEMSourceInfo(
    source=AuthoritativeDEMSource.USGS_3DEP,
    resolution_m=10.0,  # 1/3 arc-second
    vertical_accuracy_m=1.0,  # varies by source
    horizontal_accuracy_m=1.0,
    citation="USGS 3D Elevation Program (3DEP)",
)


def get_copernicus_tile_url(lat: float, lon: float) -> str:
    """
    Get the S3 URL for a Copernicus GLO-30 tile containing the given point.

    Copernicus tiles are 1x1 degree, named by their SW corner.
    Format: s3://copernicus-dem-30m/Copernicus_DSM_COG_10_N{lat}_00_{E|W}{lon}_00_DEM/
    """
    # Tile is named by SW corner
    tile_lat = floor(lat)
    tile_lon = floor(lon)

    lat_hemi = "N" if tile_lat >= 0 else "S"
    lon_hemi = "E" if tile_lon >= 0 else "W"

    lat_str = f"{abs(tile_lat):02d}"
    lon_str = f"{abs(tile_lon):03d}"

    tile_name = f"Copernicus_DSM_COG_10_{lat_hemi}{lat_str}_00_{lon_hemi}{lon_str}_00_DEM"

    # HTTPS access (no AWS credentials needed)
    return f"https://copernicus-dem-30m.s3.amazonaws.com/{tile_name}/{tile_name}.tif"


def get_usgs_3dep_url(lat: float, lon: float) -> str:
    """
    Get the USGS 3DEP tile URL for a given point.

    Uses the USGS National Map 3DEP 1/3 arc-second dataset.
    """
    # USGS tiles are typically 1x1 degree CONUS
    tile_lat = floor(lat)
    tile_lon = floor(lon)

    # TNM S3 bucket structure
    lat_hemi = "n" if tile_lat >= 0 else "s"
    lon_hemi = "w" if tile_lon < 0 else "e"

    return f"https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/13/TIFF/current/{lat_hemi}{abs(tile_lat):02d}{lon_hemi}{abs(tile_lon):03d}/USGS_13_{lat_hemi}{abs(tile_lat):02d}{lon_hemi}{abs(tile_lon):03d}.tif"


async def fetch_authoritative_dem(
    center_lat: float,
    center_lon: float,
    radius_km: float,
    source: AuthoritativeDEMSource = AuthoritativeDEMSource.COPERNICUS_GLO30,
    target_resolution_m: float = 30.0,
) -> Tuple[DEMGrid, DEMSourceInfo]:
    """
    Fetch elevation data from an authoritative DEM source.

    Args:
        center_lat: Center latitude
        center_lon: Center longitude
        radius_km: Radius of area in km
        source: Which authoritative source to use
        target_resolution_m: Target output resolution

    Returns:
        Tuple of (DEMGrid, DEMSourceInfo)
    """
    try:
        import rasterio
        from rasterio.windows import Window
        HAS_RASTERIO = True
    except ImportError:
        HAS_RASTERIO = False

    if not HAS_RASTERIO:
        # Fallback: use OpenTopography API
        return await _fetch_via_opentopography(
            center_lat, center_lon, radius_km, source, target_resolution_m
        )

    # Calculate bounds
    lat_deg_per_km = 1 / 111.32
    lon_deg_per_km = 1 / (111.32 * cos(radians(center_lat)))

    north = center_lat + radius_km * lat_deg_per_km
    south = center_lat - radius_km * lat_deg_per_km
    east = center_lon + radius_km * lon_deg_per_km
    west = center_lon - radius_km * lon_deg_per_km

    # Get tile URL
    if source == AuthoritativeDEMSource.COPERNICUS_GLO30:
        url = get_copernicus_tile_url(center_lat, center_lon)
        source_info = COPERNICUS_INFO
    else:
        url = get_usgs_3dep_url(center_lat, center_lon)
        source_info = USGS_3DEP_INFO

    # Read from COG using windowed read
    with rasterio.open(url) as src:
        # Convert bounds to pixel coordinates
        # rasterio.index() takes (x, y) = (lon, lat) and returns (row, col)
        row_nw, col_nw = src.index(west, north)
        row_se, col_se = src.index(east, south)

        # Ensure proper ordering (row indices increase going south in most rasters)
        row_start = min(row_nw, row_se)
        row_stop = max(row_nw, row_se)
        col_start = min(col_nw, col_se)
        col_stop = max(col_nw, col_se)

        # Clamp to valid range
        row_start = max(0, row_start)
        row_stop = min(src.height, row_stop + 1)
        col_start = max(0, col_start)
        col_stop = min(src.width, col_stop + 1)

        # Ensure we have at least 10x10 cells
        if row_stop - row_start < 10:
            row_stop = row_start + 10
        if col_stop - col_start < 10:
            col_stop = col_start + 10

        window = Window.from_slices(
            (row_start, row_stop),
            (col_start, col_stop)
        )

        # Read windowed data
        elevations = src.read(1, window=window)

        # Get actual geographic bounds using the window transform
        win_transform = src.window_transform(window)

        # Calculate coordinate arrays
        # For typical north-up rasters: transform.e is negative (y decreases going down)
        rows, cols = elevations.shape

        # transform.c is x origin (west edge), transform.a is x pixel size
        # transform.f is y origin (north edge), transform.e is y pixel size (negative for north-up)
        lons = np.array([win_transform.c + (j + 0.5) * win_transform.a for j in range(cols)])
        lats = np.array([win_transform.f + (i + 0.5) * win_transform.e for i in range(rows)])

    # Subsample if needed
    if target_resolution_m > source_info.resolution_m:
        step = int(target_resolution_m / source_info.resolution_m)
        elevations = elevations[::step, ::step]
        lats = lats[::step]
        lons = lons[::step]

    # Handle nodata values
    elevations = np.where(elevations < -1000, np.nan, elevations)

    cell_size_m = abs(lats[1] - lats[0]) * 111320 if len(lats) > 1 else target_resolution_m

    dem = DEMGrid(
        elevations=elevations,
        lats=lats,
        lons=lons,
        cell_size_m=cell_size_m,
        bounds={"north": float(lats[0]), "south": float(lats[-1]),
                "east": float(lons[-1]), "west": float(lons[0])},
    )

    return dem, source_info


async def _fetch_via_opentopography(
    center_lat: float,
    center_lon: float,
    radius_km: float,
    source: AuthoritativeDEMSource,
    target_resolution_m: float,
) -> Tuple[DEMGrid, DEMSourceInfo]:
    """
    Fallback: fetch DEM via OpenTopography Global DEM API.

    This doesn't require rasterio but has rate limits and requires API key
    for heavy usage.
    """
    import httpx

    lat_deg_per_km = 1 / 111.32
    lon_deg_per_km = 1 / (111.32 * cos(radians(center_lat)))

    north = center_lat + radius_km * lat_deg_per_km
    south = center_lat - radius_km * lat_deg_per_km
    east = center_lon + radius_km * lon_deg_per_km
    west = center_lon - radius_km * lon_deg_per_km

    # Map source to OpenTopography demtype
    if source == AuthoritativeDEMSource.COPERNICUS_GLO30:
        demtype = "COP30"
        source_info = COPERNICUS_INFO
    else:
        demtype = "SRTMGL1"  # Fallback for non-US
        source_info = DEMSourceInfo(
            source=source,
            resolution_m=30.0,
            vertical_accuracy_m=16.0,
            horizontal_accuracy_m=20.0,
            citation="SRTM GL1",
        )

    # OpenTopography API
    url = "https://portal.opentopography.org/API/globaldem"
    params = {
        "demtype": demtype,
        "south": south,
        "north": north,
        "west": west,
        "east": east,
        "outputFormat": "AAIGrid",  # ASCII grid format
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.get(url, params=params)
        response.raise_for_status()

        # Parse ASCII grid
        lines = response.text.strip().split('\n')

        # Read header
        header = {}
        data_start = 0
        for i, line in enumerate(lines):
            if line[0].isdigit() or line[0] == '-':
                data_start = i
                break
            parts = line.split()
            if len(parts) >= 2:
                header[parts[0].lower()] = parts[1]

        ncols = int(header.get('ncols', 100))
        nrows = int(header.get('nrows', 100))
        xllcorner = float(header.get('xllcorner', west))
        yllcorner = float(header.get('yllcorner', south))
        cellsize = float(header.get('cellsize', 0.000277778))  # ~30m in degrees
        nodata = float(header.get('nodata_value', -9999))

        # Parse elevation data
        data_lines = lines[data_start:]
        elevations = []
        for line in data_lines:
            row = [float(x) for x in line.split()]
            elevations.append(row)

        elevations = np.array(elevations)
        elevations = np.where(elevations == nodata, np.nan, elevations)

        # Create coordinate arrays
        lons = np.array([xllcorner + j * cellsize for j in range(ncols)])
        lats = np.array([yllcorner + (nrows - 1 - i) * cellsize for i in range(nrows)])

        cell_size_m = cellsize * 111320

        dem = DEMGrid(
            elevations=elevations,
            lats=lats,
            lons=lons,
            cell_size_m=cell_size_m,
            bounds={"north": float(lats[0]), "south": float(lats[-1]),
                    "east": float(lons[-1]), "west": float(lons[0])},
        )

        return dem, source_info


def is_in_conus(lat: float, lon: float) -> bool:
    """Check if point is in Continental US (where USGS 3DEP is available)."""
    return 24.0 <= lat <= 50.0 and -125.0 <= lon <= -66.0


def recommend_source(lat: float, lon: float) -> AuthoritativeDEMSource:
    """
    Recommend the best authoritative DEM source for a location.

    Currently uses Copernicus GLO-30 globally as it provides reliable
    access via S3 COGs. USGS 3DEP support is planned for future
    enhancement to provide higher accuracy (1m vertical) for US locations.
    """
    # TODO: Add USGS 3DEP support when S3 COG access is verified
    # For now, Copernicus GLO-30 provides authoritative data globally
    # with documented 4m vertical accuracy (LE90)
    return AuthoritativeDEMSource.COPERNICUS_GLO30
