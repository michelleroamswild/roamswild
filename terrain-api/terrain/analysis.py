"""
Core terrain analysis: slope, aspect, surface normals.

These are pure functions that operate on the DEM grid.
"""

import numpy as np
import math
from .dem import DEMGrid


def compute_slope_aspect(dem: DEMGrid) -> tuple[np.ndarray, np.ndarray]:
    """
    Compute slope and aspect for each cell in the DEM.

    Uses 3x3 neighborhood gradient calculation (Horn's method).

    Args:
        dem: DEMGrid with elevation data

    Returns:
        (slope_deg, aspect_deg) arrays
        - slope_deg: 0 = flat, 90 = vertical cliff
        - aspect_deg: Downslope direction (0=N, 90=E, 180=S, 270=W)
    """
    elev = dem.elevations
    cell_size = dem.cell_size_m

    # Pad edges with nearest values
    padded = np.pad(elev, 1, mode="edge")

    # Extract 3x3 neighborhoods
    # z1 z2 z3
    # z4 z5 z6  (z5 is center)
    # z7 z8 z9
    z1 = padded[:-2, :-2]
    z2 = padded[:-2, 1:-1]
    z3 = padded[:-2, 2:]
    z4 = padded[1:-1, :-2]
    z6 = padded[1:-1, 2:]
    z7 = padded[2:, :-2]
    z8 = padded[2:, 1:-1]
    z9 = padded[2:, 2:]

    # Gradient in x (east-west) direction
    # Positive = elevation increases to the east
    dz_dx = ((z3 + 2 * z6 + z9) - (z1 + 2 * z4 + z7)) / (8 * cell_size)

    # Gradient in y (north-south) direction
    # Positive = elevation increases to the north
    dz_dy = ((z1 + 2 * z2 + z3) - (z7 + 2 * z8 + z9)) / (8 * cell_size)

    # Slope magnitude
    slope_rad = np.arctan(np.sqrt(dz_dx**2 + dz_dy**2))
    slope_deg = np.degrees(slope_rad)

    # Aspect (downslope direction)
    # atan2(-dy, -dx) gives direction of steepest descent
    aspect_rad = np.arctan2(-dz_dy, -dz_dx)
    aspect_deg = np.degrees(aspect_rad)

    # Convert to compass bearing (0 = North, clockwise)
    # atan2 gives angle from +X axis (East), counterclockwise
    # We want angle from +Y axis (North), clockwise
    aspect_deg = (90 - aspect_deg) % 360

    return slope_deg, aspect_deg


def compute_face_direction(aspect_deg: np.ndarray) -> np.ndarray:
    """
    Compute face direction from aspect.

    Face direction is where the surface FACES (opposite of downslope).
    A west-facing cliff has aspect pointing east (downslope) but faces west.

    Args:
        aspect_deg: Aspect array (downslope direction)

    Returns:
        face_direction_deg: Where the surface faces
    """
    return (aspect_deg + 180) % 360


def compute_surface_normals(
    slope_deg: np.ndarray,
    aspect_deg: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Compute surface normal unit vectors from slope and aspect.

    Convention:
    - X: East (+)
    - Y: North (+)
    - Z: Up (+)

    Args:
        slope_deg: Slope angle from horizontal
        aspect_deg: Downslope direction (compass bearing)

    Returns:
        (Nx, Ny, Nz) arrays of normal components
    """
    slope_rad = np.radians(slope_deg)
    aspect_rad = np.radians(aspect_deg)

    # Face direction is opposite of aspect
    face_rad = aspect_rad + np.pi

    # Horizontal component of normal
    horiz = np.sin(slope_rad)

    # Normal components
    # Nx points in the face direction's east component
    Nx = horiz * np.sin(face_rad)

    # Ny points in the face direction's north component
    Ny = horiz * np.cos(face_rad)

    # Nz is the vertical component (cos of slope from vertical)
    Nz = np.cos(slope_rad)

    return Nx, Ny, Nz


def compute_curvature(dem: DEMGrid) -> np.ndarray:
    """
    Compute terrain curvature (convexity/concavity).

    Positive = convex (ridge, peak)
    Negative = concave (valley, depression)
    Zero = planar

    Args:
        dem: DEMGrid

    Returns:
        curvature_score array
    """
    elev = dem.elevations
    cell_size = dem.cell_size_m

    # Use Laplacian as curvature measure
    padded = np.pad(elev, 1, mode="edge")

    center = padded[1:-1, 1:-1]
    north = padded[:-2, 1:-1]
    south = padded[2:, 1:-1]
    east = padded[1:-1, 2:]
    west = padded[1:-1, :-2]

    # Laplacian = sum of second derivatives
    laplacian = (north + south + east + west - 4 * center) / (cell_size**2)

    # Normalize to a reasonable range
    # Negative laplacian = convex (higher than neighbors)
    curvature = -laplacian * cell_size  # Scale by cell size for interpretability

    return curvature


def compute_local_prominence(dem: DEMGrid, radius_cells: int = 5) -> np.ndarray:
    """
    Compute how much higher each cell is than its surroundings.

    Args:
        dem: DEMGrid
        radius_cells: Radius to check for local minimum

    Returns:
        prominence array (meters above local minimum)
    """
    from scipy.ndimage import minimum_filter

    elev = dem.elevations

    # Find local minimum in neighborhood
    size = 2 * radius_cells + 1
    local_min = minimum_filter(elev, size=size, mode="nearest")

    return elev - local_min


def validate_normal_vector(Nx: float, Ny: float, Nz: float) -> float:
    """
    Validate that a normal vector has unit length.

    Returns:
        The magnitude (should be 1.0)
    """
    return math.sqrt(Nx**2 + Ny**2 + Nz**2)


def validate_aspect_normal_match(
    aspect_deg: float,
    Nx: float,
    Ny: float,
) -> float:
    """
    Check that the normal's horizontal component matches the face direction.

    Args:
        aspect_deg: Downslope direction
        Nx, Ny: Normal x and y components

    Returns:
        Angle difference in degrees (should be near 0)
    """
    face_deg = (aspect_deg + 180) % 360

    # Direction from normal horizontal components
    if abs(Nx) < 1e-10 and abs(Ny) < 1e-10:
        return 0.0  # Flat surface, no horizontal component

    normal_dir = math.degrees(math.atan2(Nx, Ny)) % 360

    # Angle difference
    diff = abs(face_deg - normal_dir)
    if diff > 180:
        diff = 360 - diff

    return diff
