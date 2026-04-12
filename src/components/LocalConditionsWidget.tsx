import { useState, useEffect } from 'react';
import { Thermometer, Wind, SunHorizon, Snowflake, MapPin, SpinnerGap } from '@phosphor-icons/react';
import { usePhotoWeather } from '@/hooks/use-photo-weather';
import { getSunTimes, formatTime } from '@/utils/sunCalc';
import { getUserLocation, type UserLocation } from '@/utils/getUserLocation';

export function LocalConditionsWidget() {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [gettingLocation, setGettingLocation] = useState(true);

  // Get user's location
  useEffect(() => {
    getUserLocation()
      .then((loc) => {
        setLocation(loc);
        setGettingLocation(false);
      })
      .catch(() => {
        setLocationError('Location unavailable');
        setGettingLocation(false);
      });
  }, []);

  const { forecast, loading } = usePhotoWeather(
    location?.lat ?? 0,
    location?.lng ?? 0,
    0
  );

  // Calculate next sunrise/sunset
  const sunTimes = location ? getSunTimes(location.lat, location.lng) : null;
  const now = new Date();

  let nextSunEvent: { type: 'sunrise' | 'sunset'; time: Date } | null = null;
  if (sunTimes) {
    if (now < sunTimes.sunrise) {
      nextSunEvent = { type: 'sunrise', time: sunTimes.sunrise };
    } else if (now < sunTimes.sunset) {
      nextSunEvent = { type: 'sunset', time: sunTimes.sunset };
    } else {
      // After today's sunset, show tomorrow's sunrise
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowSun = getSunTimes(location!.lat, location!.lng, tomorrow);
      nextSunEvent = { type: 'sunrise', time: tomorrowSun.sunrise };
    }
  }

  // Check for snow conditions
  const hasSnow = forecast?.current?.conditions?.headline?.toLowerCase().includes('snow') ||
    (forecast?.current?.metrics?.temperature ?? 20) < 2;

  // Estimate snowline (rough estimate: freezing level)
  const temperature = forecast?.current?.metrics?.temperature;
  const snowlineEstimate = temperature !== undefined && temperature < 10
    ? Math.max(0, Math.round((temperature + 5) * 150)) // Very rough estimate in meters
    : null;

  // Don't render if we can't get location
  if (locationError || (!gettingLocation && !location)) {
    return null;
  }

  // Loading state
  if (gettingLocation || loading) {
    return (
      <div className="bg-white/95 dark:bg-card/95 backdrop-blur-sm rounded-2xl shadow-xl px-6 py-4 border border-border/50 min-w-[340px] max-w-[380px]">
        <div className="flex items-center gap-2 text-muted-foreground">
          <SpinnerGap className="w-4 h-4 animate-spin" />
          <span className="text-sm">Getting conditions...</span>
        </div>
      </div>
    );
  }

  if (!forecast?.current) {
    return null;
  }

  const { metrics } = forecast.current;
  const tempF = metrics?.temperature !== undefined
    ? Math.round(metrics.temperature * 9/5 + 32)
    : null;
  const windMph = metrics?.windSpeed !== undefined
    ? Math.round(metrics.windSpeed * 2.237)
    : null;

  return (
    <div className="bg-white/95 dark:bg-card/95 backdrop-blur-sm rounded-2xl shadow-xl px-6 py-4 border border-border/50 min-w-[340px] max-w-[380px]">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
        <MapPin className="w-3.5 h-3.5" weight="fill" />
        <span className="font-medium">Right now, near you</span>
      </div>

      <div className="flex items-center gap-6">
        {/* Temperature */}
        {tempF !== null && (
          <div className="flex items-center gap-2">
            <Thermometer className="w-5 h-5 text-amber-600 dark:text-amber-400" weight="fill" />
            <div>
              <p className="text-xs text-muted-foreground">Temp</p>
              <p className="text-lg font-bold text-foreground leading-tight">{tempF}°F</p>
            </div>
          </div>
        )}

        {/* Wind */}
        {windMph !== null && (
          <div className="flex items-center gap-2">
            <Wind className="w-5 h-5 text-sky-600 dark:text-sky-400" weight="fill" />
            <div>
              <p className="text-xs text-muted-foreground">Wind</p>
              <p className="text-lg font-bold text-foreground leading-tight">{windMph} mph</p>
            </div>
          </div>
        )}

        {/* Snowline (if relevant) */}
        {hasSnow && snowlineEstimate !== null && (
          <div className="flex items-center gap-2">
            <Snowflake className="w-5 h-5 text-blue-600 dark:text-blue-400" weight="fill" />
            <div>
              <p className="text-xs text-muted-foreground">Snow level</p>
              <p className="text-lg font-bold text-foreground leading-tight">{Math.round(snowlineEstimate * 3.281).toLocaleString()} ft</p>
            </div>
          </div>
        )}

        {/* Next sunrise/sunset */}
        {nextSunEvent && (
          <div className="flex items-center gap-2">
            <SunHorizon className="w-5 h-5 text-orange-600 dark:text-orange-400" weight="fill" />
            <div>
              <p className="text-xs text-muted-foreground">
                {nextSunEvent.type === 'sunrise' ? 'Sunrise' : 'Sunset'}
              </p>
              <p className="text-lg font-bold text-foreground leading-tight">{formatTime(nextSunEvent.time)}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
