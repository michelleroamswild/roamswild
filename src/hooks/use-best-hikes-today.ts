/**
 * Best Hikes Today Hook
 *
 * Fetches nearby hikes, weather data, and sun info, then
 * scores them using the scoring engine to find the best hikes for today.
 */

import { useState, useCallback } from "react";
import { scoreHikesToday, ScoredHike, Hike, WeatherNow, SunInfo } from "@/scoring";

export interface BestHikesResult {
  scoredHikes: ScoredHike[];
  loading: boolean;
  error: string | null;
  userLocation: { lat: number; lng: number } | null;
}

// Fetch weather from NOAA for a location
async function fetchWeatherForLocation(lat: number, lng: number): Promise<WeatherNow | null> {
  try {
    // Step 1: Get forecast URL
    const pointsResponse = await fetch(
      `https://api.weather.gov/points/${lat.toFixed(4)},${lng.toFixed(4)}`,
      {
        headers: {
          "User-Agent": "TrailBound (contact@trailbound.app)",
          Accept: "application/geo+json",
        },
      }
    );

    if (!pointsResponse.ok) return null;

    const pointsData = await pointsResponse.json();
    const forecastUrl = pointsData.properties?.forecast;
    const forecastHourlyUrl = pointsData.properties?.forecastHourly;

    if (!forecastUrl) return null;

    // Step 2: Get forecast
    const forecastResponse = await fetch(forecastUrl, {
      headers: {
        "User-Agent": "TrailBound (contact@trailbound.app)",
        Accept: "application/geo+json",
      },
    });

    if (!forecastResponse.ok) return null;

    const forecastData = await forecastResponse.json();
    const periods = forecastData.properties?.periods;

    if (!periods || periods.length === 0) return null;

    const current = periods[0];

    // Parse wind speed from string like "5 to 10 mph"
    const windMatch = current.windSpeed?.match(/(\d+)/);
    const windMph = windMatch ? parseInt(windMatch[1], 10) : 5;

    // Estimate precipitation probability from forecast text
    const forecastLower = (current.shortForecast || "").toLowerCase();
    let precipProb = 0;
    if (forecastLower.includes("rain") || forecastLower.includes("shower")) {
      precipProb = forecastLower.includes("slight") ? 0.3 : forecastLower.includes("likely") ? 0.7 : 0.5;
    } else if (forecastLower.includes("thunderstorm")) {
      precipProb = 0.6;
    } else if (forecastLower.includes("snow")) {
      precipProb = 0.5;
    }

    // Estimate cloud cover from forecast
    let cloudCover = 0.3;
    if (forecastLower.includes("sunny") || forecastLower.includes("clear")) {
      cloudCover = 0.1;
    } else if (forecastLower.includes("partly")) {
      cloudCover = 0.4;
    } else if (forecastLower.includes("mostly cloudy")) {
      cloudCover = 0.7;
    } else if (forecastLower.includes("cloudy") || forecastLower.includes("overcast")) {
      cloudCover = 0.9;
    }

    // Extract alerts if any
    const alerts: string[] = [];
    if (forecastLower.includes("advisory")) alerts.push("Weather advisory");
    if (forecastLower.includes("warning")) alerts.push("Weather warning");
    if (forecastLower.includes("watch")) alerts.push("Weather watch");

    return {
      temp_f: current.temperature,
      wind_mph: windMph,
      precip_prob: precipProb,
      cloud_cover: cloudCover,
      visibility_miles: 10,
      alerts: alerts.length > 0 ? alerts : undefined,
    };
  } catch (error) {
    console.error("Weather fetch error:", error);
    return null;
  }
}

// Calculate sun times for a location
function calculateSunInfo(lat: number, lng: number, date: Date): SunInfo {
  // Simplified sun calculation (approximation)
  // In production, use a proper library like suncalc

  const dayOfYear = Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000
  );

  // Approximate sunrise/sunset based on latitude and day of year
  const latRad = (lat * Math.PI) / 180;
  const declination = 23.45 * Math.sin(((360 / 365) * (dayOfYear - 81) * Math.PI) / 180);
  const decRad = (declination * Math.PI) / 180;

  // Hour angle at sunrise/sunset
  const cosHourAngle = Math.max(-1, Math.min(1,
    -Math.tan(latRad) * Math.tan(decRad)
  ));
  const hourAngle = Math.acos(cosHourAngle) * (180 / Math.PI);

  // Solar noon (approximate, ignoring longitude offset for simplicity)
  const solarNoon = 12; // hours

  const sunriseHour = solarNoon - hourAngle / 15;
  const sunsetHour = solarNoon + hourAngle / 15;

  // Create ISO strings
  const sunriseDate = new Date(date);
  sunriseDate.setHours(Math.floor(sunriseHour), Math.round((sunriseHour % 1) * 60), 0, 0);

  const sunsetDate = new Date(date);
  sunsetDate.setHours(Math.floor(sunsetHour), Math.round((sunsetHour % 1) * 60), 0, 0);

  // Current sun position (simplified)
  const currentHour = date.getHours() + date.getMinutes() / 60;
  const hoursSinceNoon = currentHour - solarNoon;
  const solarAzimuth = 180 + hoursSinceNoon * 15; // Rough approximation
  const solarElevation = Math.max(0, 90 - Math.abs(hoursSinceNoon) * 15);

  return {
    sunrise: sunriseDate.toISOString(),
    sunset: sunsetDate.toISOString(),
    solar_azimuth_deg: solarAzimuth,
    solar_elevation_deg: solarElevation,
  };
}

// Fetch hikes from Google Places
async function fetchNearbyHikes(lat: number, lng: number): Promise<Hike[]> {
  if (!window.google?.maps?.places) {
    throw new Error("Google Maps not loaded");
  }

  return new Promise((resolve, reject) => {
    const service = new google.maps.places.PlacesService(
      document.createElement("div")
    );

    const request: google.maps.places.PlaceSearchRequest = {
      location: new google.maps.LatLng(lat, lng),
      radius: 48280, // ~30 miles
      keyword: "hiking trail",
      type: "tourist_attraction",
    };

    service.nearbySearch(request, (results, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && results) {
        const hikes: Hike[] = results
          .filter((place) => place.geometry?.location)
          .slice(0, 15) // Get more for better selection
          .map((place, index) => {
            // Calculate distance from user
            const hikeLat = place.geometry!.location!.lat();
            const hikeLng = place.geometry!.location!.lng();
            const distance = haversineDistance(lat, lng, hikeLat, hikeLng);

            // Enrich with estimated data (in production, get from trails API)
            // Use ratings and distance as proxies for difficulty
            const rating = place.rating || 4;
            const reviewCount = place.user_ratings_total || 100;

            // Estimate distance and elevation based on name patterns and ratings
            const nameLower = (place.name || "").toLowerCase();
            let estimatedMiles = 4 + Math.random() * 4;
            let estimatedGain = 800 + Math.random() * 1200;

            // Adjust estimates based on name patterns
            if (nameLower.includes("peak") || nameLower.includes("summit") || nameLower.includes("mountain")) {
              estimatedMiles += 2;
              estimatedGain += 1000;
            } else if (nameLower.includes("loop")) {
              estimatedMiles = 3 + Math.random() * 3;
            } else if (nameLower.includes("falls") || nameLower.includes("waterfall")) {
              estimatedMiles = 2 + Math.random() * 3;
              estimatedGain = 400 + Math.random() * 600;
            }

            // Estimate aspect from name
            let aspect: Hike["aspect"] = "unknown";
            if (nameLower.includes("west") || nameLower.includes("sunset")) aspect = "W";
            else if (nameLower.includes("east") || nameLower.includes("sunrise")) aspect = "E";
            else if (nameLower.includes("north")) aspect = "N";
            else if (nameLower.includes("south")) aspect = "S";

            // Popularity from review count
            const popularity = Math.min(1, reviewCount / 1000);

            return {
              id: place.place_id || `hike-${index}`,
              name: place.name || "Unknown Trail",
              location: { lat: hikeLat, lng: hikeLng },
              distance_miles: Math.round(estimatedMiles * 10) / 10,
              elevation_gain_ft: Math.round(estimatedGain),
              access_road_type: "paved" as const,
              trailhead_parking_confidence: reviewCount > 500 ? "high" : reviewCount > 100 ? "medium" : "low",
              popularity,
              viewpoint_score: rating >= 4.5 ? 0.9 : rating >= 4 ? 0.7 : 0.5,
              aspect,
              seasonal_closure_risk: "low" as const,
            };
          });

        resolve(hikes);
      } else if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
        resolve([]);
      } else {
        reject(new Error(`Places API error: ${status}`));
      }
    });
  });
}

// Haversine distance calculation
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function useBestHikesToday() {
  const [scoredHikes, setScoredHikes] = useState<ScoredHike[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  const fetchBestHikes = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Step 1: Get user's location
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 300000, // Cache for 5 minutes
        });
      });

      const userLat = position.coords.latitude;
      const userLng = position.coords.longitude;
      setUserLocation({ lat: userLat, lng: userLng });

      // Step 2: Fetch nearby hikes
      const hikes = await fetchNearbyHikes(userLat, userLng);

      if (hikes.length === 0) {
        setError("No hiking trails found nearby");
        setLoading(false);
        return;
      }

      // Step 3: Fetch weather for user's location (use as proxy for all nearby hikes)
      const userWeather = await fetchWeatherForLocation(userLat, userLng);

      if (!userWeather) {
        // Use default weather if fetch fails
        console.warn("Weather fetch failed, using defaults");
      }

      const defaultWeather: WeatherNow = userWeather || {
        temp_f: 70,
        wind_mph: 8,
        precip_prob: 0.1,
        cloud_cover: 0.3,
      };

      // Step 4: Build weather and sun data for each hike
      const now = new Date();
      const weatherByHikeId: Record<string, WeatherNow> = {};
      const sunByHikeId: Record<string, SunInfo> = {};

      for (const hike of hikes) {
        // Use user's weather as proxy (nearby hikes have similar weather)
        // Add slight variation based on assumed elevation difference
        const elevationDelta = (hike.elevation_gain_ft / 1000) * -3.5;
        weatherByHikeId[hike.id] = {
          ...defaultWeather,
          temp_f: Math.round(defaultWeather.temp_f + elevationDelta),
        };

        // Calculate sun info for hike location
        sunByHikeId[hike.id] = calculateSunInfo(hike.location.lat, hike.location.lng, now);
      }

      // Step 5: Score all hikes
      const scored = scoreHikesToday(hikes, {
        user: { lat: userLat, lng: userLng },
        nowIso: now.toISOString(),
        weatherByHikeId,
        sunByHikeId,
        userPreference: {
          effort: "moderate",
          crowd_tolerance: "neutral",
          vehicle: "awd",
        },
      });

      setScoredHikes(scored);
    } catch (err) {
      if (err instanceof GeolocationPositionError) {
        switch (err.code) {
          case err.PERMISSION_DENIED:
            setError("Location access denied. Please enable location services.");
            break;
          case err.POSITION_UNAVAILABLE:
            setError("Unable to determine your location.");
            break;
          case err.TIMEOUT:
            setError("Location request timed out.");
            break;
        }
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to find hikes");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const clearResults = useCallback(() => {
    setScoredHikes([]);
    setError(null);
  }, []);

  return {
    scoredHikes,
    loading,
    error,
    userLocation,
    fetchBestHikes,
    clearResults,
  };
}
