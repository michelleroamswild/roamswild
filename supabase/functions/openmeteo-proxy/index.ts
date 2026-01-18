import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const OPEN_METEO_ELEVATION_URL = "https://api.open-meteo.com/v1/elevation";
const OPEN_METEO_AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality";

// Generate a 3x3 grid of points around a center location for better cloud detection
// Uses ~5km spacing to catch scattered clouds that might miss the exact point
function generateSampleGrid(lat: number, lng: number, spacingKm: number = 5): Array<{lat: number, lng: number}> {
  // Approximate degrees per km (varies by latitude)
  const kmPerDegreeLat = 111.32;
  const kmPerDegreeLng = 111.32 * Math.cos(lat * Math.PI / 180);

  const latOffset = spacingKm / kmPerDegreeLat;
  const lngOffset = spacingKm / kmPerDegreeLng;

  const points: Array<{lat: number, lng: number}> = [];

  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      points.push({
        lat: lat + (i * latOffset),
        lng: lng + (j * lngOffset),
      });
    }
  }

  return points;
}

// Take the maximum value across multiple locations for each time index
function maxAcrossLocations(arrays: number[][]): number[] {
  if (arrays.length === 0) return [];
  const length = arrays[0].length;
  const result: number[] = [];

  for (let i = 0; i < length; i++) {
    let max = 0;
    for (const arr of arrays) {
      if (arr[i] !== undefined && arr[i] > max) {
        max = arr[i];
      }
    }
    result.push(max);
  }

  return result;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const lat = url.searchParams.get("lat");
    const lng = url.searchParams.get("lng");
    const elevationOnly = url.searchParams.get("elevation_only") === "true";

    if (!lat || !lng) {
      return new Response(
        JSON.stringify({ error: "lat and lng parameters required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If elevation_only, use the elevation API
    if (elevationOnly) {
      const elevationUrl = new URL(OPEN_METEO_ELEVATION_URL);
      elevationUrl.searchParams.set("latitude", lat);
      elevationUrl.searchParams.set("longitude", lng);

      const response = await fetch(elevationUrl.toString(), {
        headers: { "Accept": "application/json" },
      });

      const data = await response.json();

      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const centerLat = parseFloat(lat);
    const centerLng = parseFloat(lng);

    // Generate 3x3 grid for multi-point cloud sampling (5km spacing)
    const samplePoints = generateSampleGrid(centerLat, centerLng, 5);
    const lats = samplePoints.map(p => p.lat.toFixed(4)).join(",");
    const lngs = samplePoints.map(p => p.lng.toFixed(4)).join(",");

    // Build Open-Meteo URL for multi-point cloud sampling
    const cloudSampleUrl = new URL(OPEN_METEO_FORECAST_URL);
    cloudSampleUrl.searchParams.set("latitude", lats);
    cloudSampleUrl.searchParams.set("longitude", lngs);
    cloudSampleUrl.searchParams.set("timezone", "auto");
    cloudSampleUrl.searchParams.set("forecast_days", "7");
    // Only fetch cloud data for multi-point (reduces data transfer)
    cloudSampleUrl.searchParams.set("hourly", [
      "cloud_cover",
      "cloud_cover_low",
      "cloud_cover_mid",
      "cloud_cover_high",
    ].join(","));

    // Build main weather URL for center point (all other data)
    const meteoUrl = new URL(OPEN_METEO_FORECAST_URL);
    meteoUrl.searchParams.set("latitude", lat);
    meteoUrl.searchParams.set("longitude", lng);
    meteoUrl.searchParams.set("timezone", "auto");
    meteoUrl.searchParams.set("forecast_days", "7");

    // Hourly variables (excluding cloud cover - we get that from multi-point)
    meteoUrl.searchParams.set("hourly", [
      "temperature_2m",
      "relative_humidity_2m",
      "dew_point_2m",
      "precipitation_probability",
      "precipitation",
      "weather_code",
      "cloud_cover",
      "cloud_cover_low",
      "cloud_cover_mid",
      "cloud_cover_high",
      "visibility",
      "wind_speed_10m",
      "wind_direction_10m",
      "wind_gusts_10m",
    ].join(","));

    // Daily variables for multi-day forecasts
    meteoUrl.searchParams.set("daily", [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "sunrise",
      "sunset",
      "precipitation_probability_max",
      "wind_speed_10m_max",
    ].join(","));

    // Current conditions
    meteoUrl.searchParams.set("current", [
      "temperature_2m",
      "relative_humidity_2m",
      "weather_code",
      "cloud_cover",
      "wind_speed_10m",
      "wind_direction_10m",
      "wind_gusts_10m",
    ].join(","));

    // Build Air Quality URL for aerosol/dust data
    const airQualityUrl = new URL(OPEN_METEO_AIR_QUALITY_URL);
    airQualityUrl.searchParams.set("latitude", lat);
    airQualityUrl.searchParams.set("longitude", lng);
    airQualityUrl.searchParams.set("timezone", "auto");
    airQualityUrl.searchParams.set("forecast_days", "7");
    airQualityUrl.searchParams.set("hourly", [
      "pm2_5",
      "pm10",
      "aerosol_optical_depth",
      "dust",
      "uv_index",
      "uv_index_clear_sky",
    ].join(","));

    // Fetch all data in parallel
    const [weatherResponse, cloudSampleResponse, airQualityResponse] = await Promise.all([
      fetch(meteoUrl.toString(), {
        headers: { "Accept": "application/json" },
      }),
      fetch(cloudSampleUrl.toString(), {
        headers: { "Accept": "application/json" },
      }),
      fetch(airQualityUrl.toString(), {
        headers: { "Accept": "application/json" },
      }),
    ]);

    const weatherData = await weatherResponse.json();
    const cloudSampleData = await cloudSampleResponse.json();
    const airQualityData = await airQualityResponse.json();

    // Process multi-point cloud data - take maximum across all sample points
    // Open-Meteo returns array of results when given multiple coordinates
    if (Array.isArray(cloudSampleData) && cloudSampleData.length > 0 && weatherData.hourly) {
      const cloudCoverArrays = cloudSampleData.map((d: any) => d.hourly?.cloud_cover || []);
      const cloudLowArrays = cloudSampleData.map((d: any) => d.hourly?.cloud_cover_low || []);
      const cloudMidArrays = cloudSampleData.map((d: any) => d.hourly?.cloud_cover_mid || []);
      const cloudHighArrays = cloudSampleData.map((d: any) => d.hourly?.cloud_cover_high || []);

      // Replace with max values across all sample points
      weatherData.hourly.cloud_cover = maxAcrossLocations(cloudCoverArrays);
      weatherData.hourly.cloud_cover_low = maxAcrossLocations(cloudLowArrays);
      weatherData.hourly.cloud_cover_mid = maxAcrossLocations(cloudMidArrays);
      weatherData.hourly.cloud_cover_high = maxAcrossLocations(cloudHighArrays);

      // Add metadata about sampling
      weatherData._cloudSampling = {
        enabled: true,
        points: samplePoints.length,
        spacingKm: 5,
      };
    }

    // Merge air quality hourly data into weather data
    if (airQualityData.hourly && weatherData.hourly) {
      weatherData.hourly.pm2_5 = airQualityData.hourly.pm2_5;
      weatherData.hourly.pm10 = airQualityData.hourly.pm10;
      weatherData.hourly.aerosol_optical_depth = airQualityData.hourly.aerosol_optical_depth;
      weatherData.hourly.dust = airQualityData.hourly.dust;
      weatherData.hourly.uv_index = airQualityData.hourly.uv_index;
      weatherData.hourly.uv_index_clear_sky = airQualityData.hourly.uv_index_clear_sky;
    }

    return new Response(JSON.stringify(weatherData), {
      status: weatherResponse.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
