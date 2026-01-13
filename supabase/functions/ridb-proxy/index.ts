import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RIDB_API_KEY = Deno.env.get("RIDB_API_KEY");
const RIDB_BASE_URL = "https://ridb.recreation.gov/api/v1";

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
    const endpoint = url.searchParams.get("endpoint");

    if (!endpoint) {
      return new Response(
        JSON.stringify({ error: "Missing endpoint parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!RIDB_API_KEY) {
      return new Response(
        JSON.stringify({ error: "RIDB API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build the RIDB URL with remaining query params
    const ridbUrl = new URL(`${RIDB_BASE_URL}${endpoint}`);
    url.searchParams.forEach((value, key) => {
      if (key !== "endpoint") {
        ridbUrl.searchParams.set(key, value);
      }
    });

    // Make request to RIDB
    const response = await fetch(ridbUrl.toString(), {
      headers: {
        "apikey": RIDB_API_KEY,
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
