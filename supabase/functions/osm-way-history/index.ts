import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const CACHE_TTL_DAYS = 30;

interface OsmHistoryVersion {
  type: string;
  id: number;
  version: number;
  timestamp: string;
  user?: string;
  uid?: number;
  tags?: Record<string, string>;
  visible?: boolean;
}

interface OsmHistoryResponse {
  elements: OsmHistoryVersion[];
}

interface CachedRow {
  way_id: number;
  grades_seen: string[];
  fwd_only_seen: boolean[];
  current_grade: string | null;
  current_fwd_only: boolean | null;
  versions_count: number;
  first_version_at: string | null;
  last_edit_at: string | null;
  raw_history: unknown;
  fetched_at: string;
}

// Normalize tracktype variants. Older OSM data sometimes had `grade_3` etc.
function normaliseGrade(value?: string): string | undefined {
  if (!value) return undefined;
  return value.toLowerCase().replace(/[\s_-]+/g, "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Accept way_id from either query string (for curl/REST callers) or
    // a JSON POST body (for supabase-js .invoke() callers).
    const url = new URL(req.url);
    let wayIdRaw: string | null = url.searchParams.get("way_id");
    let force = url.searchParams.get("force") === "true";

    if (!wayIdRaw && (req.method === "POST" || req.method === "PUT")) {
      try {
        const body = await req.json();
        if (body && typeof body === "object") {
          if (body.way_id !== undefined && body.way_id !== null) {
            wayIdRaw = String(body.way_id);
          }
          if (body.force === true) force = true;
        }
      } catch {
        /* body parse failed — fall through to validation below */
      }
    }

    const wayId = wayIdRaw ? Number(wayIdRaw) : NaN;
    if (!Number.isFinite(wayId) || wayId <= 0) {
      return new Response(
        JSON.stringify({ error: "way_id required (query param or JSON body)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Cache check
    if (!force) {
      const { data: cached } = await db
        .from("osm_way_history")
        .select("*")
        .eq("way_id", wayId)
        .maybeSingle();

      if (cached) {
        const ageMs = Date.now() - new Date(cached.fetched_at).getTime();
        const ageDays = ageMs / (1000 * 60 * 60 * 24);
        if (ageDays < CACHE_TTL_DAYS) {
          return new Response(
            JSON.stringify({ ...cached, cached: true }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // Fetch full history from OSM
    const osmUrl = `https://www.openstreetmap.org/api/0.6/way/${wayId}/history.json`;
    const osmResp = await fetch(osmUrl, {
      headers: { "User-Agent": "RoamsWild/1.0 (osm-way-history edge fn)" },
    });
    if (!osmResp.ok) {
      return new Response(
        JSON.stringify({ error: `OSM API ${osmResp.status}: ${osmResp.statusText}`, way_id: wayId }),
        { status: osmResp.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const data = (await osmResp.json()) as OsmHistoryResponse;
    const versions = (data.elements ?? []).filter((v) => v.type === "way");
    versions.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const grades_seen: string[] = [];
    const fwd_only_seen: boolean[] = [];
    let current_grade: string | null = null;
    let current_fwd_only: boolean | null = null;

    for (const v of versions) {
      const grade = normaliseGrade(v.tags?.tracktype);
      const fwd = v.tags?.["4wd_only"] === "yes";
      if (grade) grades_seen.push(grade);
      fwd_only_seen.push(fwd);
    }

    const lastVisible = [...versions].reverse().find((v) => v.visible !== false);
    if (lastVisible) {
      current_grade = normaliseGrade(lastVisible.tags?.tracktype) ?? null;
      current_fwd_only = lastVisible.tags?.["4wd_only"] === "yes";
    }

    const row: CachedRow = {
      way_id: wayId,
      grades_seen,
      fwd_only_seen,
      current_grade,
      current_fwd_only,
      versions_count: versions.length,
      first_version_at: versions[0]?.timestamp ?? null,
      last_edit_at: versions[versions.length - 1]?.timestamp ?? null,
      raw_history: data,
      fetched_at: new Date().toISOString(),
    };

    const { error: upsertErr } = await db
      .from("osm_way_history")
      .upsert(row, { onConflict: "way_id" });

    if (upsertErr) {
      console.error("upsert failed:", upsertErr);
      return new Response(
        JSON.stringify({ error: upsertErr.message, way_id: wayId }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ...row, cached: false }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("osm-way-history error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
