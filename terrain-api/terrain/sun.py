"""
Sun position calculations for sunrise/sunset photography.

Computes sun azimuth and altitude over time, plus sun unit vectors.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta
from dataclasses import dataclass
from .types import SunPosition


def compute_sun_position(
    lat: float,
    lon: float,
    dt: datetime,
    reference_date: datetime = None,
) -> tuple[float, float]:
    """
    Compute sun azimuth and altitude for a given location and time.

    Uses simplified astronomical calculations (accurate to ~1 degree).

    Args:
        lat: Latitude in degrees
        lon: Longitude in degrees
        dt: UTC datetime
        reference_date: Optional reference date for consistent day-of-year
                       (use when generating tracks that cross midnight UTC)

    Returns:
        (azimuth_deg, altitude_deg) where azimuth is clockwise from north
    """
    # Use reference date for day-of-year if provided (for consistency across midnight)
    ref = reference_date if reference_date else dt
    doy = ref.timetuple().tm_yday

    # Solar declination (simplified)
    declination = 23.45 * math.sin(math.radians(360 / 365 * (doy - 81)))
    decl_rad = math.radians(declination)

    # Equation of time correction (simplified)
    b = 2 * math.pi * (doy - 81) / 365
    eot = 9.87 * math.sin(2 * b) - 7.53 * math.cos(b) - 1.5 * math.sin(b)  # minutes

    # Calculate hours from reference midnight for consistent time handling
    if reference_date:
        ref_midnight = datetime(reference_date.year, reference_date.month, reference_date.day, 0, 0, 0)
        utc_hours = (dt - ref_midnight).total_seconds() / 3600.0
    else:
        utc_hours = dt.hour + dt.minute / 60 + dt.second / 3600

    # Convert to solar time:
    # - Add longitude correction (15° = 1 hour, east is positive)
    # - Add equation of time
    solar_time = utc_hours + lon / 15.0 + eot / 60.0

    # Hour angle: offset from solar noon (12:00)
    hour_angle = (solar_time - 12.0) * 15.0  # degrees
    ha_rad = math.radians(hour_angle)

    lat_rad = math.radians(lat)

    # Solar altitude
    sin_alt = (
        math.sin(lat_rad) * math.sin(decl_rad) +
        math.cos(lat_rad) * math.cos(decl_rad) * math.cos(ha_rad)
    )
    altitude = math.degrees(math.asin(max(-1, min(1, sin_alt))))

    # Solar azimuth using atan2 for correct quadrant
    cos_alt = math.cos(math.radians(altitude))
    if cos_alt < 1e-10:
        # Sun at zenith, azimuth undefined
        return 0.0, altitude

    # Components for azimuth calculation
    sin_az = -math.cos(decl_rad) * math.sin(ha_rad) / cos_alt
    cos_az = (math.sin(decl_rad) - math.sin(lat_rad) * sin_alt) / (math.cos(lat_rad) * cos_alt)

    # atan2 gives angle in correct quadrant
    azimuth = math.degrees(math.atan2(sin_az, cos_az))

    # Convert to compass bearing (0-360, clockwise from north)
    azimuth = azimuth % 360

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
        date: Date to check (local date)
        event: "sunrise" or "sunset"

    Returns:
        UTC datetime of the event
    """
    # Start from midnight UTC on the given date
    start = datetime(date.year, date.month, date.day, 0, 0, 0)

    # Estimate local solar noon in UTC
    # Solar noon is approximately when sun is at its highest (hour angle = 0)
    # For longitude, solar noon is offset from 12:00 UTC by lon/15 hours
    tz_offset = lon / 15  # hours west of UTC (negative for west longitudes)
    local_noon_utc = 12.0 - tz_offset  # UTC hour when it's solar noon locally

    # Binary search for sun crossing horizon
    if event == "sunrise":
        # Search from well before dawn to noon
        search_start = local_noon_utc - 10  # ~10 hours before noon
        search_end = local_noon_utc
    else:
        # Search from noon to well after dusk
        search_start = local_noon_utc
        search_end = local_noon_utc + 10  # ~10 hours after noon

    # Binary search for altitude = 0
    for _ in range(25):  # Converge within ~30 seconds
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

    # Use the event date as reference for consistent calculations
    # This prevents jumps when crossing midnight UTC
    reference_date = date

    # Generate positions from before to after the event
    positions = []
    start_offset = -duration_minutes // 2
    end_offset = duration_minutes // 2

    for minutes in range(start_offset, end_offset + 1, interval_minutes):
        dt = event_time + timedelta(minutes=minutes)
        azimuth, altitude = compute_sun_position(lat, lon, dt, reference_date)
        vector = compute_sun_vector(azimuth, altitude)

        positions.append(SunPosition(
            time_iso=dt.isoformat() + "Z",
            minutes_from_start=float(minutes - start_offset),
            azimuth_deg=azimuth,
            altitude_deg=altitude,
            vector=vector,
        ))

    return positions
