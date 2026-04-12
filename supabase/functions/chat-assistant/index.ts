import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MODEL = "claude-haiku-4-5-20251001";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are Basecamp, a friendly outdoor trip planning assistant for RoamsWild — an app for planning road trips with camping, hiking, and outdoor adventures.

RESPONSE FORMAT:
You must ALWAYS respond with valid JSON in this exact format:
{
  "message": "Your response text here",
  "tripSuggestion": null
}

For the "message" field:
- Keep it short — 2-3 sentences max for simple answers
- Use bullet points (• ) for lists
- Never use markdown headers, bold, or other formatting — just plain text and bullet points

TRIP PLANNING FLOW:
When a user wants to plan a trip, gather these details through conversation (ask 1-2 questions at a time):
1. Where do they want to go? (destinations)
2. How long? (number of days)
3. What activities? (hiking, offroading, sightseeing)
4. Camping preference? (dispersed, campground, or mixed)
5. Pace? (relaxed, moderate, or packed)

Once you have enough info to build a trip, include a tripSuggestion object:
{
  "message": "Here's what I've got:\\n\\n• 5 days through Utah\\n• Zion → Bryce → Capitol Reef\\n• Dispersed camping\\n• Moderate pace with daily hiking",
  "tripSuggestion": {
    "name": "Utah Canyon Tour",
    "duration": 5,
    "destinations": ["Zion National Park, Utah", "Bryce Canyon, Utah", "Capitol Reef National Park, Utah"],
    "activities": ["hiking"],
    "lodgingPreference": "dispersed",
    "pacePreference": "moderate"
  }
}

CRITICAL RULES:
- Your ENTIRE response must be a single valid JSON object — nothing before or after it
- NEVER wrap the JSON in markdown code fences or backticks
- NEVER include the JSON as text inside the message field
- The message field contains ONLY the human-readable text the user will see
- Only include tripSuggestion when you have at least destinations and duration
- Destination names should be specific enough to search on Google Maps (include state/region)
- For general questions (hike recommendations, gear advice, etc.) set tripSuggestion to null
- Be warm and casual — like a well-traveled friend
- Give specific, real place names and trail names when recommending
- If the user seems unsure, help narrow things down with a quick question`;

function buildSystemPrompt(context?: {
  tripSummary?: string | null;
}): string {
  let prompt = SYSTEM_PROMPT;
  if (context?.tripSummary) {
    prompt += `\n\nThe user is currently working on a trip in the app. Here's a summary:\n${context.tripSummary}`;
  }
  return prompt;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Anthropic API key not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { messages, context } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "Messages array is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: buildSystemPrompt(context),
        messages: messages.map(
          (m: { role: string; content: string }) => ({
            role: m.role,
            content: m.content,
          })
        ),
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("Anthropic API error:", response.status, errBody);
      return new Response(
        JSON.stringify({ error: `API error: ${response.status}` }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const data = await response.json();
    let rawText =
      data.content?.[0]?.text ?? '{"message": "Sorry, I couldn\'t generate a response."}';

    // Strip markdown code fences if Claude wrapped the JSON
    rawText = rawText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

    // Parse Claude's JSON response
    let message = rawText;
    let tripSuggestion = null;

    try {
      const parsed = JSON.parse(rawText);
      message = parsed.message ?? rawText;
      tripSuggestion = parsed.tripSuggestion ?? null;
    } catch {
      // If Claude didn't return valid JSON, strip any embedded JSON blocks from the display text
      message = rawText.replace(/```(?:json)?[\s\S]*?```/g, '').replace(/\{[\s\S]*"tripSuggestion"[\s\S]*\}/g, '').trim();
      if (!message) message = "I've got your trip details! Try asking me again.";
    }

    return new Response(
      JSON.stringify({ message, tripSuggestion }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Chat assistant error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
