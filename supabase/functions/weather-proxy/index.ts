import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const TOMORROW_IO_API_KEY = Deno.env.get("TOMORROW_IO_API_KEY");
const TOMORROW_BASE_URL = "https://api.tomorrow.io/v4";

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
    const endpoint = url.searchParams.get("endpoint") || "/weather/forecast";

    if (!TOMORROW_IO_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Tomorrow.io API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build the Tomorrow.io URL with query params
    const weatherUrl = new URL(`${TOMORROW_BASE_URL}${endpoint}`);
    url.searchParams.forEach((value, key) => {
      if (key !== "endpoint") {
        weatherUrl.searchParams.set(key, value);
      }
    });
    // Add API key
    weatherUrl.searchParams.set("apikey", TOMORROW_IO_API_KEY);

    // Make request to Tomorrow.io
    const response = await fetch(weatherUrl.toString(), {
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
