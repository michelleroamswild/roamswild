import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GOOGLE_MAPS_API_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AnalyzeRequest {
  lat: number;
  lng: number;
  name: string;
  type: 'dead-end' | 'camp-site' | 'intersection';
  score: number;
  reasons: string[];
  source?: string;
  roadName?: string;
  isOnPublicLand?: boolean;
  passengerReachable?: boolean;
  highClearanceReachable?: boolean;
  highClearance?: boolean;
  force?: boolean; // bypass cache
}

interface CampsiteAnalysis {
  campabilityScore: number;
  summary: string;
  ground: { rating: string; detail: string };
  access: { rating: string; detail: string };
  cover: { rating: string; detail: string };
  hazards: { rating: string; detail: string };
  trail: { rating: string; detail: string } | null;
  bestUse: string;
  confidence: 'high' | 'medium' | 'low';
  confidenceNote?: string;
}

async function fetchSatelliteImage(lat: number, lng: number): Promise<string> {
  const url = `https://maps.googleapis.com/maps/api/staticmap?` +
    `center=${lat},${lng}` +
    `&zoom=18` +
    `&size=600x600` +
    `&maptype=satellite` +
    `&key=${GOOGLE_MAPS_API_KEY}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch satellite image: ${response.status}`);
  }

  const imageBuffer = new Uint8Array(await response.arrayBuffer());
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < imageBuffer.length; i += chunkSize) {
    binary += String.fromCharCode(...imageBuffer.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function analyzeWithGemini(
  imageBase64: string,
  spot: AnalyzeRequest,
): Promise<CampsiteAnalysis> {
  const prompt = `You are an expert overlanding and dispersed camping analyst. You're evaluating a potential camping spot from satellite imagery combined with structured data.

## Spot Data
- **Name:** ${spot.name}
- **Coordinates:** ${spot.lat.toFixed(5)}, ${spot.lng.toFixed(5)}
- **Type:** ${spot.type} (${spot.type === 'dead-end' ? 'road terminus' : spot.type === 'camp-site' ? 'known campsite' : 'road junction'})
- **Algorithmic Score:** ${spot.score}/50
- **Reasons flagged:** ${spot.reasons.join(', ')}
- **Road source:** ${spot.source || 'unknown'}
${spot.roadName ? `- **Road/Trail name:** ${spot.roadName}` : ''}
${spot.isOnPublicLand !== undefined ? `- **Public land:** ${spot.isOnPublicLand ? 'Yes' : 'Unknown'}` : ''}
- **Vehicle access:** ${spot.passengerReachable ? 'Passenger vehicle OK' : spot.highClearanceReachable ? 'High clearance recommended' : spot.highClearance ? 'High clearance/4WD' : 'Unknown'}

## Your Task
Analyze the satellite image and the data above. Assess this location's viability as a dispersed campsite for vehicle-based camping (overlanding, van life, car camping).

Evaluate these factors by looking at the image:

1. **Ground** — Is there a visible flat clearing, pulloff, or open area suitable for parking a vehicle and setting up camp? What does the surface look like (dirt, gravel, rock, vegetation)?

2. **Access** — Can you see a road or track leading to a usable stopping point? Is there a clear pulloff or does the road just end in brush?

3. **Cover** — What's the tree/vegetation cover like? Is there shade potential? Is it exposed to wind?

4. **Hazards** — Any visible concerns: cliff edges, steep dropoffs, drainage channels or washes (flood risk), structures suggesting private use, fencing, or development nearby?

5. **Trail/Road** — If a road or trail name is provided, share what you know about it: difficulty rating, surface type, typical conditions, reputation, and whether it's suitable for the vehicle access level indicated. If you don't recognize the trail name, say so. Set this to null if no road name is provided.

Also assess your own confidence — if the satellite imagery is low resolution, obscured by clouds, or the area is hard to read, say so.

CRITICAL: All "detail" fields and "bestUse" MUST be 8 words or fewer. No full sentences. Use terse fragments like dashboard labels. Examples: "Flat gravel, fits 2 vehicles" or "Steep wash 30m south" or "Dense juniper canopy". The "trail" detail can be up to 15 words since it conveys road character.

Respond ONLY with valid JSON in this exact format:
{
  "campabilityScore": <0-100 integer>,
  "summary": "<2-3 sentences>",
  "ground": { "rating": "<good|fair|poor|unclear>", "detail": "<8 words max>" },
  "access": { "rating": "<good|fair|poor|unclear>", "detail": "<8 words max>" },
  "cover": { "rating": "<good|fair|poor|unclear>", "detail": "<8 words max>" },
  "hazards": { "rating": "<none|minor|moderate|significant|unclear>", "detail": "<8 words max>" },
  "trail": <null if no road name, or { "rating": "<easy|moderate|difficult|extreme|unknown>", "detail": "<15 words max describing the road/trail>" }>,
  "bestUse": "<8 words max>",
  "confidence": "<high|medium|low>",
  "confidenceNote": "<optional, 8 words max>"
}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: "image/png",
                  data: imageBase64,
                },
              },
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2048,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("No response from Gemini");
  }

  const analysis: CampsiteAnalysis = JSON.parse(text);
  return analysis;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Gemini API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!GOOGLE_MAPS_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Google Maps API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const spot: AnalyzeRequest = await req.json();

    if (!spot.lat || !spot.lng || !spot.name) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: lat, lng, name" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const latKey = Math.round(spot.lat * 100000) / 100000;
    const lngKey = Math.round(spot.lng * 100000) / 100000;

    // Check cache first (unless force re-analyze)
    if (!spot.force) {
      const { data: cached } = await db
        .from('spot_analyses')
        .select('analysis')
        .eq('lat_key', latKey)
        .eq('lng_key', lngKey)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cached) {
        return new Response(
          JSON.stringify({ analysis: cached.analysis, cached: true, coordinates: { lat: spot.lat, lng: spot.lng } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // No cache hit — run analysis
    const imageBase64 = await fetchSatelliteImage(spot.lat, spot.lng);
    const analysis = await analyzeWithGemini(imageBase64, spot);

    // Save to cache
    await db.from('spot_analyses').insert({
      lat: spot.lat,
      lng: spot.lng,
      spot_name: spot.name,
      spot_type: spot.type,
      analysis,
      model_version: 'gemini-2.5-flash',
    });

    return new Response(
      JSON.stringify({ analysis, cached: false, coordinates: { lat: spot.lat, lng: spot.lng } }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Analysis error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
