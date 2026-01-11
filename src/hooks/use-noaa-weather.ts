import { useState, useEffect } from 'react';
import { Sun, Cloud, CloudRain, Snowflake, Wind } from '@phosphor-icons/react';

export interface WeatherForecast {
  temperature: number;
  temperatureUnit: string;
  shortForecast: string;
  detailedForecast?: string;
  isDaytime?: boolean;
}

// Cache for weather data to avoid repeated API calls
const weatherCache = new Map<string, WeatherForecast>();

// Get weather icon based on forecast
export function getWeatherIcon(forecast: string) {
  const lower = forecast.toLowerCase();
  if (lower.includes('snow')) return Snowflake;
  if (lower.includes('rain') || lower.includes('shower')) return CloudRain;
  if (lower.includes('cloud') || lower.includes('overcast')) return Cloud;
  if (lower.includes('wind')) return Wind;
  return Sun;
}

// Fetch weather from NOAA API
async function fetchWeather(lat: number, lng: number): Promise<WeatherForecast | null> {
  const cacheKey = `${lat.toFixed(2)},${lng.toFixed(2)}`;

  // Check cache first
  if (weatherCache.has(cacheKey)) {
    return weatherCache.get(cacheKey)!;
  }

  try {
    // Step 1: Get the forecast URL for this location
    const pointsResponse = await fetch(
      `https://api.weather.gov/points/${lat.toFixed(4)},${lng.toFixed(4)}`,
      {
        headers: {
          'User-Agent': 'TripPlanner (contact@example.com)',
          'Accept': 'application/geo+json',
        },
      }
    );

    if (!pointsResponse.ok) {
      return null;
    }

    const pointsData = await pointsResponse.json();
    const forecastUrl = pointsData.properties?.forecast;

    if (!forecastUrl) {
      return null;
    }

    // Step 2: Get the actual forecast
    const forecastResponse = await fetch(forecastUrl, {
      headers: {
        'User-Agent': 'TripPlanner (contact@example.com)',
        'Accept': 'application/geo+json',
      },
    });

    if (!forecastResponse.ok) {
      return null;
    }

    const forecastData = await forecastResponse.json();
    const periods = forecastData.properties?.periods;

    if (!periods || periods.length === 0) {
      return null;
    }

    // Get the first period (current/today)
    const current = periods[0];
    const weather: WeatherForecast = {
      temperature: current.temperature,
      temperatureUnit: current.temperatureUnit,
      shortForecast: current.shortForecast,
      detailedForecast: current.detailedForecast,
      isDaytime: current.isDaytime,
    };

    // Cache the result
    weatherCache.set(cacheKey, weather);
    return weather;
  } catch (error) {
    console.error('Weather fetch error:', error);
    return null;
  }
}

export function useNoaaWeather(lat: number | null, lng: number | null) {
  const [weather, setWeather] = useState<WeatherForecast | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (lat === null || lng === null) {
      setWeather(null);
      return;
    }

    setLoading(true);
    setError(null);

    fetchWeather(lat, lng)
      .then((w) => {
        setWeather(w);
        if (!w) {
          setError('Weather data unavailable for this location');
        }
      })
      .catch((err) => {
        setError('Failed to fetch weather');
        console.error(err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [lat, lng]);

  return { weather, loading, error };
}
