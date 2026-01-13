import { useState, useEffect } from 'react';
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
} from '@/utils/weatherScoring';
import { getSunTimes } from '@/utils/sunCalc';

const TOMORROW_API_KEY = import.meta.env.VITE_TOMORROW_IO_API_KEY || '';
const TOMORROW_API_BASE = 'https://api.tomorrow.io/v4/weather/forecast';

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
  hourlyValues?: TomorrowioValues[]
): PhotoWeatherData {
  const sunTimes = getSunTimes(lat, lng, timestamp);

  const goldenHour = {
    morning: sunTimes.goldenHourMorning,
    evening: sunTimes.goldenHourEvening,
  };

  const conditions = analyzePhotoConditions(
    values,
    elevationMeters,
    goldenHour,
    hoursAhead,
    hourlyValues
  );

  const metrics = extractMetrics(values);

  return {
    lat,
    lng,
    elevation: elevationMeters,
    timestamp,
    sunrise: sunTimes.sunrise,
    sunset: sunTimes.sunset,
    goldenHourMorning: sunTimes.goldenHourMorning,
    goldenHourEvening: sunTimes.goldenHourEvening,
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

  useEffect(() => {
    // Validate inputs
    if (!lat || !lng) return;
    if (lat === 0 && lng === 0) return;

    if (!TOMORROW_API_KEY) {
      setError('Tomorrow.io API key not configured');
      return;
    }

    // Check cache
    const cacheKey = getCacheKey(lat, lng);
    const cached = weatherCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      setForecast(cached.data);
      return;
    }

    const fetchWeather = async () => {
      setLoading(true);
      setError(null);

      try {
        const url = new URL(TOMORROW_API_BASE);
        url.searchParams.set('location', `${lat},${lng}`);
        url.searchParams.set('timesteps', '1h,1d');
        url.searchParams.set('apikey', TOMORROW_API_KEY);
        url.searchParams.set('units', 'metric');

        const response = await fetch(url.toString());

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data: TomorrowioResponse = await response.json();

        if (!data.timelines?.hourly?.length) {
          throw new Error('Invalid API response');
        }

        const hourlyData = data.timelines.hourly;
        const dailyData = data.timelines.daily;

        // Get all hourly values for trend analysis
        const hourlyValues = hourlyData.slice(0, 12).map(d => d.values);

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
          hourlyValues
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
              hourlyValues
            );
          });

        // Create daily summaries
        const daily: DailyPhotoSummary[] = [];
        if (dailyData?.length) {
          for (let i = 0; i < Math.min(5, dailyData.length); i++) {
            const dayDate = new Date(dailyData[i].time);
            const dayHourly = hourly.filter((h) => {
              const hDate = new Date(h.timestamp);
              return hDate.toDateString() === dayDate.toDateString();
            });

            if (dayHourly.length > 0) {
              daily.push(createDailySummary(dayDate, dayHourly));
            }
          }
        }

        const result: PhotoWeatherForecast = {
          current,
          hourly,
          daily,
        };

        // Cache the result
        weatherCache.set(cacheKey, { data: result, timestamp: Date.now() });

        setForecast(result);
      } catch (err) {
        console.error('Photo weather fetch error:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch weather');
      } finally {
        setLoading(false);
      }
    };

    fetchWeather();
  }, [lat, lng, elevationMeters]);

  return { forecast, loading, error };
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
    if (!locations.length || !TOMORROW_API_KEY) return;

    const fetchAll = async () => {
      setLoading(true);
      setError(null);

      const results = new Map<string, PhotoWeatherForecast>();

      for (const loc of locations) {
        const cacheKey = getCacheKey(loc.lat, loc.lng);

        // Check cache first
        const cached = weatherCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
          results.set(cacheKey, cached.data);
          continue;
        }

        try {
          const url = new URL(TOMORROW_API_BASE);
          url.searchParams.set('location', `${loc.lat},${loc.lng}`);
          url.searchParams.set('timesteps', '1h');
          url.searchParams.set('apikey', TOMORROW_API_KEY);
          url.searchParams.set('units', 'metric');

          const response = await fetch(url.toString());
          const data: TomorrowioResponse = await response.json();

          if (data.timelines?.hourly?.length) {
            const hourlyValues = data.timelines.hourly.slice(0, 12).map(d => d.values);
            const currentValues = data.timelines.hourly[0].values;
            const current = processWeatherData(
              currentValues,
              loc.lat,
              loc.lng,
              loc.elevation ?? 0,
              new Date(),
              0,
              hourlyValues
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
