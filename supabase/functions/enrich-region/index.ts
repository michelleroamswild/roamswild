import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Tiny PostgREST helper — avoids the supabase-js dep so a fresh deploy
// doesn't depend on esm.sh resolving (it sometimes 522s for fresh imports).
const PG_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

async function pgGet<T>(path: string): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: PG_HEADERS });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`PostgREST GET ${path}: ${res.status} ${txt}`);
  }
  return (await res.json()) as T[];
}

async function pgUpsert(table: string, row: Record<string, unknown>, onConflict: string): Promise<void> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`,
    {
      method: "POST",
      headers: { ...PG_HEADERS, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(row),
    },
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`PostgREST upsert ${table}: ${res.status} ${txt}`);
  }
}

const MODEL = "claude-haiku-4-5-20251001";

// Bump when the prompt or response shape changes — old rows below this version
// get regenerated automatically on next request.
const PROMPT_VERSION = 1;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are an outdoor recreation editor writing short, factual descriptions of US public-land regions for an off-grid camping app.

You receive a region name, biome, and approximate coordinates. Return a SINGLE JSON object — nothing before or after — with this exact shape:
{
  "description": "string or null",
  "highlights": [
    { "name": "string", "blurb": "string" }
  ]
}

RULES — HALLUCINATION IS THE ENEMY:
- Only name features (peaks, canyons, lakes, trails, viewpoints, hot springs, arches, etc.) you are CONFIDENT a hiker who'd planned a trip there would recognize.
- If you don't recognize the region, return: { "description": null, "highlights": [] }. An honest blank is far better than invented place names.
- Never make up names. If the region is a generic BLM block, USFS land district, or numbered allotment, return blanks.
- Do not list towns, ranches, businesses, or developments — only natural features.
- Keep names in the form a USGS quad map or NPS sign would use ("Marys Peak", "Cathedral Gorge", "Alvord Hot Springs"), not generic descriptors.

DESCRIPTION:
- 1-2 sentences. 200 chars max.
- Plain prose, no markdown, no marketing fluff, no superlatives ("breathtaking", "stunning", "majestic" — banned).
- Mention what makes the area distinct: terrain, dominant ecosystem, a defining feature.

HIGHLIGHTS:
- Up to 5 entries.
- Each "name" should be a specific named place a visitor could navigate to.
- Each "blurb" is 1 short fragment (under 60 chars), e.g. "9-mile loop on the rim", "best sunset overlook", "alpine lake at 9,400 ft".
- If you can only confidently name 1-2 features, return just those — don't pad.

Your ENTIRE response must be valid JSON. No code fences. No prose around it.`;

interface RequestBody {
  regionId: string;
}

interface RegionRow {
  id: string;
  name: string;
  primary_biome: string | null;
  bbox_north: number;
  bbox_south: number;
  bbox_east: number;
  bbox_west: number;
}

interface EnrichmentRow {
  region_id: string;
  description: string | null;
  highlights: Array<{ name: string; blurb: string }>;
  model: string;
  prompt_version: number;
  generated_at: string;
  refreshed_at: string;
}

async function callClaude(region: RegionRow): Promise<{
  description: string | null;
  highlights: Array<{ name: string; blurb: string }>;
}> {
  const centerLat = (region.bbox_north + region.bbox_south) / 2;
  const centerLng = (region.bbox_east + region.bbox_west) / 2;

  const userMessage = JSON.stringify({
    name: region.name,
    biome: region.primary_biome,
    center: { lat: Number(centerLat.toFixed(4)), lng: Number(centerLng.toFixed(4)) },
    bbox: {
      north: Number(region.bbox_north),
      south: Number(region.bbox_south),
      east: Number(region.bbox_east),
      west: Number(region.bbox_west),
    },
  });

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      // Low temperature — we want recall of well-known features, not creative riffs.
      temperature: 0.2,
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Anthropic ${response.status}: ${errBody}`);
  }

  const data = await response.json();
  let raw: string =
    data.content?.[0]?.text ?? '{"description": null, "highlights": []}';
  raw = raw.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

  try {
    const parsed = JSON.parse(raw);
    const description =
      typeof parsed.description === "string" && parsed.description.trim().length > 0
        ? parsed.description.trim()
        : null;
    const rawHighlights = Array.isArray(parsed.highlights) ? parsed.highlights : [];
    const highlights = rawHighlights
      .filter(
        (h: unknown): h is { name: string; blurb: string } =>
          !!h &&
          typeof (h as { name?: unknown }).name === "string" &&
          typeof (h as { blurb?: unknown }).blurb === "string" &&
          (h as { name: string }).name.trim().length > 0,
      )
      .slice(0, 5)
      .map((h: { name: string; blurb: string }) => ({
        name: h.name.trim(),
        blurb: h.blurb.trim(),
      }));
    return { description, highlights };
  } catch (err) {
    console.error("Failed to parse Claude response:", raw, err);
    return { description: null, highlights: [] };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Anthropic API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = (await req.json()) as RequestBody;
    if (!body?.regionId || typeof body.regionId !== "string") {
      return new Response(
        JSON.stringify({ error: "regionId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 1. Cache check — return immediately if a current-prompt-version row exists.
    const cachedRows = await pgGet<EnrichmentRow>(
      `region_ai_enrichments?region_id=eq.${body.regionId}` +
        `&select=region_id,description,highlights,model,prompt_version,generated_at,refreshed_at`,
    ).catch((err) => {
      console.error("Cache lookup error:", err);
      return [] as EnrichmentRow[];
    });
    const cached = cachedRows[0];
    if (cached && cached.prompt_version >= PROMPT_VERSION && cached.model === MODEL) {
      return new Response(
        JSON.stringify({
          description: cached.description,
          highlights: cached.highlights ?? [],
          cached: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Cache miss (or stale) — fetch the region row.
    const regionRows = await pgGet<RegionRow>(
      `regions?id=eq.${body.regionId}` +
        `&select=id,name,primary_biome,bbox_north,bbox_south,bbox_east,bbox_west`,
    );
    const region = regionRows[0];
    if (!region) {
      return new Response(
        JSON.stringify({ error: "Region not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 3. Call Claude.
    const enrichment = await callClaude(region);

    // 4. Upsert into the cache. Failure here shouldn't block the response —
    //    next caller will just regenerate.
    try {
      await pgUpsert(
        "region_ai_enrichments",
        {
          region_id: region.id,
          description: enrichment.description,
          highlights: enrichment.highlights,
          model: MODEL,
          prompt_version: PROMPT_VERSION,
          refreshed_at: new Date().toISOString(),
        },
        "region_id",
      );
    } catch (err) {
      console.error("Upsert failed:", err);
    }

    return new Response(
      JSON.stringify({
        description: enrichment.description,
        highlights: enrichment.highlights,
        cached: false,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("enrich-region error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message ?? "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
