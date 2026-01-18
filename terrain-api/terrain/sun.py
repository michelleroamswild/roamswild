"""
Sun position calculations for sunrise/sunset photography.

Computes sun azimuth and altitude over time, plus sun unit vectors.
"""

import math
from datetime import datetime, timedelta
from dataclasses import dataclass
from .types import SunPosition


def compute_sun_position(
    lat: float,
    lon: float,
    dt: datetime,
) -> tuple[float, float]:
    """
    Compute sun azimuth and altitude for a given location and time.

    Uses simplified astronomical calculations (accurate to ~1 degree).

    Args:
        lat: Latitude in degrees
        lon: Longitude in degrees
        dt: UTC datetime

    Returns:
        (azimuth_deg, altitude_deg) where azimuth is clockwise from north
    """
    # Day of year
    doy = dt.timetuple().tm_yday

    # Solar declination (simplified)
    declination = 23.45 * math.sin(math.radians(360 / 365 * (doy - 81)))
    decl_rad = math.radians(declination)

    # Hour angle
    # Solar noon occurs when the sun is at the meridian
    # Time offset from solar noon in hours
    solar_noon_offset = 12.0  # Approximate

    # Equation of time correction (simplified)
    b = 2 * math.pi * (doy - 81) / 365
    eot = 9.87 * math.sin(2 * b) - 7.53 * math.cos(b) - 1.5 * math.sin(b)  # minutes

    # Solar time
    utc_hours = dt.hour + dt.minute / 60 + dt.second / 3600
    solar_time = utc_hours + lon / 15 + eot / 60

    # Hour angle (15 degrees per hour, negative before noon)
    hour_angle = (solar_time - 12) * 15
    ha_rad = math.radians(hour_angle)

    lat_rad = math.radians(lat)

    # Solar altitude
    sin_alt = (
        math.sin(lat_rad) * math.sin(decl_rad) +
        math.cos(lat_rad) * math.cos(decl_rad) * math.cos(ha_rad)
    )
    altitude = math.degrees(math.asin(max(-1, min(1, sin_alt))))

    # Solar azimuth
    cos_az = (
        (math.sin(decl_rad) - math.sin(lat_rad) * sin_alt) /
        (math.cos(lat_rad) * math.cos(math.radians(altitude)) + 1e-10)
    )
    cos_az = max(-1, min(1, cos_az))

    azimuth = math.degrees(math.acos(cos_az))
    if hour_angle > 0:
        azimuth = 360 - azimuth

    return azimuth, altitude


def compute_sun_vector(azimuth_deg: float, altitude_deg: float) -> tuple[float, float, float]:
    """
    Convert sun azimuth and altitude to a unit vector.

    Convention:
    - X: East (+) / West (-)
    - Y: North (+) / South (-)
    - Z: Up (+) / Down (-)

    Args:
        azimuth_deg: Clockwise from north (0=N, 90=E, 180=S, 270=W)
        altitude_deg: Angle above horizon

    Returns:
        (Sx, Sy, Sz) unit vector pointing toward sun
    """
    az_rad = math.radians(azimuth_deg)
    alt_rad = math.radians(altitude_deg)

    # Horizontal component
    cos_alt = math.cos(alt_rad)

    # X = East component (sin of azimuth)
    sx = cos_alt * math.sin(az_rad)

    # Y = North component (cos of azimuth)
    sy = cos_alt * math.cos(az_rad)

    # Z = Up component
    sz = math.sin(alt_rad)

    return (sx, sy, sz)


def find_sunrise_sunset(
    lat: float,
    lon: float,
    date: datetime,
    event: str,  # "sunrise" or "sunset"
) -> datetime:
    """
    Find approximate sunrise or sunset time for a location and date.

    Args:
        lat: Latitude
        lon: Longitude
        date: Date to check
        event: "sunrise" or "sunset"

    Returns:
        UTC datetime of the event
    """
    # Start from midnight UTC on the given date
    start = datetime(date.year, date.month, date.day, 0, 0, 0)

    # Binary search for sun crossing horizon
    if event == "sunrise":
        # Search morning hours (0-12 UTC adjusted for longitude)
        search_start = 4
        search_end = 12
    else:
        # Search afternoon hours (12-24 UTC adjusted for longitude)
        search_start = 12
        search_end = 22

    # Adjust for longitude (rough timezone offset)
    tz_offset = lon / 15  # hours from UTC
    search_start = max(0, search_start - tz_offset)
    search_end = min(24, search_end - tz_offset)

    # Binary search for altitude = 0
    for _ in range(20):  # Converge within ~1 minute
        mid = (search_start + search_end) / 2
        dt = start + timedelta(hours=mid)
        _, altitude = compute_sun_position(lat, lon, dt)

        if event == "sunrise":
            if altitude < 0:
                search_start = mid
            else:
                search_end = mid
        else:
            if altitude > 0:
                search_start = mid
            else:
                search_end = mid

    return start + timedelta(hours=(search_start + search_end) / 2)


def generate_sun_track(
    lat: float,
    lon: float,
    date: datetime,
    event: str,
    duration_minutes: int = 60,
    interval_minutes: int = 5,
) -> list[SunPosition]:
    """
    Generate a series of sun positions around sunrise/sunset.

    Args:
        lat: Latitude
        lon: Longitude
        date: Date of event
        event: "sunrise" or "sunset"
        duration_minutes: How long to track (before and after event)
        interval_minutes: Time between samples

    Returns:
        List of SunPosition objects
    """
    # Find the event time
    event_time = find_sunrise_sunset(lat, lon, date, event)

    # Generate positions from before to after the event
    positions = []
    start_offset = -duration_minutes // 2
    end_offset = duration_minutes // 2

    for minutes in range(start_offset, end_offset + 1, interval_minutes):
        dt = event_time + timedelta(minutes=minutes)
        azimuth, altitude = compute_sun_position(lat, lon, dt)
        vector = compute_sun_vector(azimuth, altitude)

        positions.append(SunPosition(
            time_iso=dt.isoformat() + "Z",
            minutes_from_start=float(minutes - start_offset),
            azimuth_deg=azimuth,
            altitude_deg=altitude,
            vector=vector,
        ))

    return positions
