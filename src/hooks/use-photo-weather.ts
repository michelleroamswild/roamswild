import { useState, useEffect, useCallback } from 'react';
import {
  PhotoWeatherData,
  PhotoWeatherForecast,
  DailyPhotoSummary,
  TomorrowioResponse,
  TomorrowioValues,
} from '@/types/weather';
import {
  analyzePhotoConditions,
  extractMetrics,
  getForecastConfidence,
  createTimeSpecificForecast,
} from '@/utils/weatherScoring';
import { getSunTimes } from '@/utils/sunCalc';
import { supabase } from '@/integrations/supabase/client';

// Cache to avoid hitting rate limits
const weatherCache = new Map<string, { data: PhotoWeatherForecast; timestamp: number }>();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

function getCacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

/**
 * Process Tomorrow.io API response into PhotoWeatherData
 */
function processWeatherData(
  values: TomorrowioValues,
  lat: number,
  lng: number,
  elevationMeters: number,
  timestamp: Date,
  hoursAhead: number = 0,
  hourlyValues?: TomorrowioValues[],
  hourlyTimestamps?: Date[]
): PhotoWeatherData {
  const now = new Date();
  const sunTimes = getSunTimes(lat, lng, timestamp);

  // Get next upcoming sunrise/sunset (use tomorrow if today's has passed)
  let nextSunrise = sunTimes.sunrise;
  let nextSunriseMorningGolden = sunTimes.goldenHourMorning;
  let nextSunriseBlueHour = sunTimes.blueHourMorning;

  if (sunTimes.sunrise < now) {
    const tomorrow = new Date(timestamp);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowSunTimes = getSunTimes(lat, lng, tomorrow);
    nextSunrise = tomorrowSunTimes.sunrise;
    nextSunriseMorningGolden = tomorrowSunTimes.goldenHourMorning;
    nextSunriseBlueHour = tomorrowSunTimes.blueHourMorning;
  }

  let nextSunset = sunTimes.sunset;
  let nextSunsetEveningGolden = sunTimes.goldenHourEvening;
  let nextSunsetBlueHour = sunTimes.blueHourEvening;

  if (sunTimes.sunset < now) {
    const tomorrow = new Date(timestamp);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowSunTimes = getSunTimes(lat, lng, tomorrow);
    nextSunset = tomorrowSunTimes.sunset;
    nextSunsetEveningGolden = tomorrowSunTimes.goldenHourEvening;
    nextSunsetBlueHour = tomorrowSunTimes.blueHourEvening;
  }

  const goldenHour = {
    morning: nextSunriseMorningGolden,
    evening: nextSunsetEveningGolden,
  };

  const conditions = analyzePhotoConditions(
    values,
    elevationMeters,
    goldenHour,
    hoursAhead,
    hourlyValues,
    hourlyTimestamps,
    { sunrise: nextSunrise, sunset: nextSunset }
  );

  const metrics = extractMetrics(values);

  return {
    lat,
    lng,
    elevation: elevationMeters,
    timestamp,
    sunrise: nextSunrise,
    sunset: nextSunset,
    goldenHourMorning: nextSunriseMorningGolden,
    goldenHourEvening: nextSunsetEveningGolden,
    metrics,
    conditions,
  };
}

/**
 * Create daily summary from hourly data
 */
function createDailySummary(
  date: Date,
  hourlyData: PhotoWeatherData[]
): DailyPhotoSummary {
  // Find data points near sunrise and sunset
  const sunriseData = hourlyData.find((d) => {
    const hour = new Date(d.timestamp).getHours();
    return hour >= 5 && hour <= 8;
  });

  const sunsetData = hourlyData.find((d) => {
    const hour = new Date(d.timestamp).getHours();
    return hour >= 17 && hour <= 20;
  });

  // Use the conditions from the most relevant time
  const relevantData = sunsetData || sunriseData || hourlyData[0];
  const conditions = relevantData?.conditions;

  // Determine best time based on conditions
  let bestTime: 'sunrise' | 'sunset' | 'either' = 'either';
  if (conditions?.timing.recommendation === 'sunrise') {
    bestTime = 'sunrise';
  } else if (conditions?.timing.recommendation === 'sunset' ||
             conditions?.timing.recommendation === 'stay-after') {
    bestTime = 'sunset';
  }

  // Generate summary based on overall assessment
  let summary = '';
  if (conditions) {
    const timeLabel = bestTime === 'either' ? 'Both sunrise and sunset' :
                      bestTime === 'sunrise' ? 'Sunrise' : 'Sunset';

    switch (conditions.overall) {
      case 'excellent':
        summary = `${timeLabel} look excellent — ${conditions.sky[0]?.label || 'good conditions'}`;
        break;
      case 'good':
        summary = `${timeLabel} conditions good — ${conditions.headline.split('—')[0].trim()}`;
        break;
      case 'fair':
        summary = `Fair conditions — worth scouting`;
        break;
      case 'challenging':
        summary = `Challenging conditions — ${conditions.precipitation[0]?.label || 'weather concerns'}`;
        break;
    }
  } else {
    summary = 'Conditions uncertain';
  }

  return {
    date,
    conditions: conditions!,
    bestTime,
    summary,
  };
}

/**
 * Create daily summary from daily API data (for days without hourly data)
 */
function createDailySummaryFromDailyData(
  date: Date,
  values: TomorrowioValues,
  lat: number,
  lng: number,
  elevationMeters: number
): DailyPhotoSummary {
  const sunTimes = getSunTimes(lat, lng, date);

  const goldenHour = {
    morning: sunTimes.goldenHourMorning,
    evening: sunTimes.goldenHourEvening,
  };

  // Create conditions using the daily values
  const conditions = analyzePhotoConditions(
    values,
    elevationMeters,
    goldenHour,
    48, // Low confidence for multi-day forecasts
    undefined,
    undefined,
    { sunrise: sunTimes.sunrise, sunset: sunTimes.sunset }
  );

  // Create simple sunrise/sunset forecasts from daily data
  const sunriseTemp = values.temperature ?? 15;
  const sunsetTemp = values.temperature ?? 15;

  // Estimate sunrise/sunset quality from daily cloud cover
  const cloudCover = values.cloudCover ?? 0;
  const precipProb = values.precipitationProbability ?? 0;

  let sunQuality: 'excellent' | 'good' | 'fair' | 'challenging' = 'fair';
  if (precipProb > 60) {
    sunQuality = 'challenging';
  } else if (cloudCover >= 20 && cloudCover <= 60 && precipProb < 30) {
    sunQuality = cloudCover >= 30 && cloudCover <= 50 ? 'excellent' : 'good';
  } else if (cloudCover < 20 && precipProb < 20) {
    sunQuality = 'good';
  } else if (cloudCover > 80) {
    sunQuality = 'challenging';
  }

  // Add simple sunrise/sunset forecasts
  conditions.sunriseForecast = {
    time: sunTimes.sunrise,
    temperature: sunriseTemp - 5, // Typically cooler at sunrise
    conditions: [],
    overall: sunQuality,
    goldenHourStart: sunTimes.goldenHourMorning.start,
    goldenHourEnd: sunTimes.goldenHourMorning.end,
    blueHourStart: sunTimes.blueHourMorning.start,
    blueHourEnd: sunTimes.blueHourMorning.end,
  };

  conditions.sunsetForecast = {
    time: sunTimes.sunset,
    temperature: sunsetTemp,
    conditions: [],
    overall: sunQuality,
    goldenHourStart: sunTimes.goldenHourEvening.start,
    goldenHourEnd: sunTimes.goldenHourEvening.end,
    blueHourStart: sunTimes.blueHourEvening.start,
    blueHourEnd: sunTimes.blueHourEvening.end,
  };

  // Determine best time
  let bestTime: 'sunrise' | 'sunset' | 'either' = 'either';
  if (conditions.timing.recommendation === 'sunrise') {
    bestTime = 'sunrise';
  } else if (conditions.timing.recommendation === 'sunset' ||
             conditions.timing.recommendation === 'stay-after') {
    bestTime = 'sunset';
  }

  // Generate summary
  let summary = '';
  switch (conditions.overall) {
    case 'excellent':
      summary = `Excellent conditions expected`;
      break;
    case 'good':
      summary = `Good photo conditions`;
      break;
    case 'fair':
      summary = `Fair conditions — worth checking`;
      break;
    case 'challenging':
      summary = `Challenging conditions expected`;
      break;
  }

  return {
    date,
    conditions,
    bestTime,
    summary,
  };
}

/**
 * Main hook for fetching and processing photo weather data
 */
export function usePhotoWeather(
  lat: number,
  lng: number,
  elevationMeters: number = 0
) {
  const [forecast, setForecast] = useState<PhotoWeatherForecast | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);

  const fetchWeather = useCallback(async (skipCache: boolean = false) => {
    // Validate inputs
    if (!lat || !lng) return;
    if (lat === 0 && lng === 0) return;

    const cacheKey = getCacheKey(lat, lng);

    // Check cache unless skipping
    if (!skipCache) {
      const cached = weatherCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        setForecast(cached.data);
        setFetchedAt(new Date(cached.timestamp));
        return;
      }
    } else {
      // Clear this location's cache when forcing refresh
      weatherCache.delete(cacheKey);
    }

    setLoading(true);
    setError(null);

    try {
      // Use Supabase Edge Function proxy (API key stored securely on server)
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      const params = new URLSearchParams({
        endpoint: '/weather/forecast',
        location: `${lat},${lng}`,
        timesteps: '1h,1d',
        units: 'metric',
      });

      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const response = await fetch(`${supabaseUrl}/functions/v1/weather-proxy?${params}`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token || anonKey}`,
          'apikey': anonKey,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data: TomorrowioResponse = await response.json();

      if (!data.timelines?.hourly?.length) {
        throw new Error('Invalid API response');
      }

      const hourlyData = data.timelines.hourly;
      const dailyData = data.timelines.daily;

      // Get all hourly values and timestamps for trend analysis
      const hourlyValues = hourlyData.slice(0, 24).map(d => d.values);
      const hourlyTimestamps = hourlyData.slice(0, 24).map(d => new Date(d.time));

      // Process current conditions
      const now = new Date();
      const currentValues = hourlyData[0].values;
      const current = processWeatherData(
        currentValues,
        lat,
        lng,
        elevationMeters,
        now,
        0,
        hourlyValues,
        hourlyTimestamps
      );

      // Process hourly data
      const hourly: PhotoWeatherData[] = hourlyData
        .slice(0, 48) // Next 48 hours
        .map((dataPoint, index) => {
          const timestamp = new Date(dataPoint.time);
          return processWeatherData(
            dataPoint.values,
            lat,
            lng,
            elevationMeters,
            timestamp,
            index,
            hourlyValues,
            hourlyTimestamps
          );
        });

      // Create daily summaries
      const daily: DailyPhotoSummary[] = [];
      const todayStr = now.toDateString();

      if (dailyData?.length) {
        for (let i = 0; i < Math.min(5, dailyData.length); i++) {
          const dayDate = new Date(dailyData[i].time);
          const isToday = dayDate.toDateString() === todayStr;

          // For today, use the current conditions to ensure consistency
          // between PhotoWeatherCard and FiveDayPhotoForecast
          if (isToday && current.conditions) {
            const conditions = current.conditions;
            let bestTime: 'sunrise' | 'sunset' | 'either' = 'either';
            if (conditions.timing.recommendation === 'sunrise') {
              bestTime = 'sunrise';
            } else if (conditions.timing.recommendation === 'sunset' ||
                       conditions.timing.recommendation === 'stay-after') {
              bestTime = 'sunset';
            }

            daily.push({
              date: dayDate,
              conditions,
              bestTime,
              summary: conditions.headline,
            });
            continue;
          }

          const dayHourly = hourly.filter((h) => {
            const hDate = new Date(h.timestamp);
            return hDate.toDateString() === dayDate.toDateString();
          });

          if (dayHourly.length > 0) {
            // Use hourly data for detailed forecast
            daily.push(createDailySummary(dayDate, dayHourly));
          } else {
            // Use daily data for days without hourly coverage
            daily.push(createDailySummaryFromDailyData(
              dayDate,
              dailyData[i].values,
              lat,
              lng,
              elevationMeters
            ));
          }
        }
      }

      const result: PhotoWeatherForecast = {
        current,
        hourly,
        daily,
      };

      // Cache the result
      const fetchTime = Date.now();
      weatherCache.set(cacheKey, { data: result, timestamp: fetchTime });

      setForecast(result);
      setFetchedAt(new Date(fetchTime));
    } catch (err) {
      console.error('Photo weather fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch weather');
    } finally {
      setLoading(false);
    }
  }, [lat, lng, elevationMeters]);

  // Initial fetch on mount/change
  useEffect(() => {
    fetchWeather(false);
  }, [fetchWeather]);

  // Refetch function that bypasses cache
  const refetch = useCallback(() => {
    fetchWeather(true);
  }, [fetchWeather]);

  return { forecast, loading, error, fetchedAt, refetch };
}

/**
 * Hook for getting weather at multiple locations (e.g., trip stops)
 */
export function useMultiLocationPhotoWeather(
  locations: Array<{ lat: number; lng: number; elevation?: number }>
) {
  const [forecasts, setForecasts] = useState<Map<string, PhotoWeatherForecast>>(
    new Map()
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!locations.length) return;

    const fetchAll = async () => {
      setLoading(true);
      setError(null);

      const results = new Map<string, PhotoWeatherForecast>();

      // Get session once for all requests
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      for (const loc of locations) {
        const cacheKey = getCacheKey(loc.lat, loc.lng);

        // Check cache first
        const cached = weatherCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
          results.set(cacheKey, cached.data);
          continue;
        }

        try {
          const params = new URLSearchParams({
            endpoint: '/weather/forecast',
            location: `${loc.lat},${loc.lng}`,
            timesteps: '1h',
            units: 'metric',
          });

          const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
          const response = await fetch(`${supabaseUrl}/functions/v1/weather-proxy?${params}`, {
            headers: {
              'Authorization': `Bearer ${session?.access_token || anonKey}`,
              'apikey': anonKey,
              'Content-Type': 'application/json',
            },
          });
          const data: TomorrowioResponse = await response.json();

          if (data.timelines?.hourly?.length) {
            const hourlyValues = data.timelines.hourly.slice(0, 24).map(d => d.values);
            const hourlyTimestamps = data.timelines.hourly.slice(0, 24).map(d => new Date(d.time));
            const currentValues = data.timelines.hourly[0].values;
            const current = processWeatherData(
              currentValues,
              loc.lat,
              loc.lng,
              loc.elevation ?? 0,
              new Date(),
              0,
              hourlyValues,
              hourlyTimestamps
            );

            const forecast: PhotoWeatherForecast = {
              current,
              hourly: [],
              daily: [],
            };

            results.set(cacheKey, forecast);
            weatherCache.set(cacheKey, { data: forecast, timestamp: Date.now() });
          }

          // Rate limit: wait between requests
          await new Promise((r) => setTimeout(r, 350));
        } catch (err) {
          console.error(`Failed to fetch weather for ${loc.lat},${loc.lng}:`, err);
        }
      }

      setForecasts(results);
      setLoading(false);
    };

    fetchAll();
  }, [JSON.stringify(locations)]);

  return { forecasts, loading, error };
}
