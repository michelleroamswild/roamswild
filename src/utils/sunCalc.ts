import SunCalc from 'suncalc';
import { TimeRange } from '@/types/weather';

export interface SunTimes {
  sunrise: Date;
  sunset: Date;
  goldenHourMorning: TimeRange;
  goldenHourEvening: TimeRange;
  blueHourMorning: TimeRange;
  blueHourEvening: TimeRange;
  solarNoon: Date;
  // Twilight times
  civilDawn: Date;      // Sun at -6° (before sunrise)
  civilDusk: Date;      // Sun at -6° (after sunset)
  nauticalDawn: Date;   // Sun at -12°
  nauticalDusk: Date;   // Sun at -12°
  astronomicalDawn: Date; // Sun at -18°
  astronomicalDusk: Date; // Sun at -18°
  // Sun position at key times
  sunriseAzimuth: number; // Degrees from north
  sunsetAzimuth: number;  // Degrees from north
}

/**
 * Get sun times for a location on a specific date
 */
export function getSunTimes(lat: number, lng: number, date: Date = new Date()): SunTimes {
  const times = SunCalc.getTimes(date, lat, lng);

  // Golden hour is roughly 1 hour after sunrise and 1 hour before sunset
  const goldenHourMorning: TimeRange = {
    start: times.sunrise,
    end: new Date(times.sunrise.getTime() + 60 * 60 * 1000), // +1 hour
  };

  const goldenHourEvening: TimeRange = {
    start: new Date(times.sunset.getTime() - 60 * 60 * 1000), // -1 hour
    end: times.sunset,
  };

  // Blue hour is the period of twilight before sunrise and after sunset
  // Roughly 20-30 minutes
  const blueHourMorning: TimeRange = {
    start: times.nauticalDawn,
    end: times.dawn,
  };

  const blueHourEvening: TimeRange = {
    start: times.dusk,
    end: times.nauticalDusk,
  };

  // Get sun position at sunrise and sunset for azimuth
  const sunrisePosition = SunCalc.getPosition(times.sunrise, lat, lng);
  const sunsetPosition = SunCalc.getPosition(times.sunset, lat, lng);

  // Convert azimuth from radians to degrees, and from south-based to north-based
  const sunriseAzimuth = (sunrisePosition.azimuth * (180 / Math.PI) + 180) % 360;
  const sunsetAzimuth = (sunsetPosition.azimuth * (180 / Math.PI) + 180) % 360;

  return {
    sunrise: times.sunrise,
    sunset: times.sunset,
    goldenHourMorning,
    goldenHourEvening,
    blueHourMorning,
    blueHourEvening,
    solarNoon: times.solarNoon,
    // Twilight times
    civilDawn: times.dawn,
    civilDusk: times.dusk,
    nauticalDawn: times.nauticalDawn,
    nauticalDusk: times.nauticalDusk,
    astronomicalDawn: times.nightEnd,
    astronomicalDusk: times.night,
    // Azimuth
    sunriseAzimuth,
    sunsetAzimuth,
  };
}

/**
 * Format time for display (e.g., "6:42 AM")
 */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format time range (e.g., "6:42 - 7:42 AM")
 */
export function formatTimeRange(range: TimeRange): string {
  const start = range.start.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  });
  const end = range.end.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${start} - ${end}`;
}

/**
 * Get time until next golden hour
 */
export function getTimeUntilGoldenHour(
  lat: number,
  lng: number,
  now: Date = new Date()
): { type: 'morning' | 'evening'; start: Date; minutesUntil: number } | null {
  const times = getSunTimes(lat, lng, now);

  // Check if we're before morning golden hour
  if (now < times.goldenHourMorning.start) {
    const minutesUntil = Math.round(
      (times.goldenHourMorning.start.getTime() - now.getTime()) / (1000 * 60)
    );
    return { type: 'morning', start: times.goldenHourMorning.start, minutesUntil };
  }

  // Check if we're before evening golden hour
  if (now < times.goldenHourEvening.start) {
    const minutesUntil = Math.round(
      (times.goldenHourEvening.start.getTime() - now.getTime()) / (1000 * 60)
    );
    return { type: 'evening', start: times.goldenHourEvening.start, minutesUntil };
  }

  // After today's golden hours, get tomorrow's morning
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowTimes = getSunTimes(lat, lng, tomorrow);

  const minutesUntil = Math.round(
    (tomorrowTimes.goldenHourMorning.start.getTime() - now.getTime()) / (1000 * 60)
  );

  return { type: 'morning', start: tomorrowTimes.goldenHourMorning.start, minutesUntil };
}

/**
 * Check if currently in golden hour
 */
export function isGoldenHour(lat: number, lng: number, now: Date = new Date()): boolean {
  const times = getSunTimes(lat, lng, now);

  return (
    (now >= times.goldenHourMorning.start && now <= times.goldenHourMorning.end) ||
    (now >= times.goldenHourEvening.start && now <= times.goldenHourEvening.end)
  );
}

/**
 * Check if currently in blue hour
 */
export function isBlueHour(lat: number, lng: number, now: Date = new Date()): boolean {
  const times = getSunTimes(lat, lng, now);

  return (
    (now >= times.blueHourMorning.start && now <= times.blueHourMorning.end) ||
    (now >= times.blueHourEvening.start && now <= times.blueHourEvening.end)
  );
}

/**
 * Convert azimuth degrees to compass direction
 */
export function azimuthToCompass(azimuth: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(azimuth / 22.5) % 16;
  return directions[index];
}

/**
 * Format azimuth for display (e.g., "245° WSW")
 */
export function formatAzimuth(azimuth: number): string {
  return `${Math.round(azimuth)}° ${azimuthToCompass(azimuth)}`;
}

/**
 * Format duration in minutes to human readable
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (mins === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${mins}m`;
}

/**
 * Get the sun position (altitude and azimuth)
 */
export function getSunPosition(
  lat: number,
  lng: number,
  date: Date = new Date()
): { altitude: number; azimuth: number } {
  const position = SunCalc.getPosition(date, lat, lng);

  return {
    altitude: position.altitude * (180 / Math.PI), // Convert to degrees
    azimuth: position.azimuth * (180 / Math.PI) + 180, // Convert to degrees from north
  };
}
