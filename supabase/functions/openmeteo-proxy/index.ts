import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const OPEN_METEO_ELEVATION_URL = "https://api.open-meteo.com/v1/elevation";

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

    // Build Open-Meteo URL with photography-relevant parameters
    const meteoUrl = new URL(OPEN_METEO_FORECAST_URL);
    meteoUrl.searchParams.set("latitude", lat);
    meteoUrl.searchParams.set("longitude", lng);
    meteoUrl.searchParams.set("timezone", "auto");

    // Hourly variables - cloud layers are key for photography
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

    // Forecast length
    meteoUrl.searchParams.set("forecast_days", "7");

    // Make request to Open-Meteo
    const response = await fetch(meteoUrl.toString(), {
      headers: {
        "Accept": "application/json",
      },
    });

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
