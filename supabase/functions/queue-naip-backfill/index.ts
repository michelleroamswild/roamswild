import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PG_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

interface RequestBody {
  spotIds: string[];
}

interface ExistingQueueRow {
  spot_id: string;
  status: "pending" | "processing" | "done" | "error";
}

interface ExistingNaipImageRow {
  spot_id: string;
}

// PostgREST helpers — kept tiny so we don't need supabase-js (esm.sh has been
// flaky for fresh function deploys).
async function pgGet<T>(path: string): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: PG_HEADERS });
  if (!res.ok) throw new Error(`PostgREST GET ${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T[];
}

async function pgInsert(table: string, rows: Array<Record<string, unknown>>): Promise<void> {
  if (rows.length === 0) return;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...PG_HEADERS, Prefer: "return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`PostgREST insert ${table}: ${res.status} ${await res.text()}`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json()) as RequestBody;
    if (!Array.isArray(body?.spotIds) || body.spotIds.length === 0) {
      return new Response(
        JSON.stringify({ enqueued: 0, skipped: 0, message: "spotIds is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Cap the request size — homepage typically asks for 4 at a time.
    const ids = Array.from(new Set(body.spotIds.filter((s) => typeof s === "string"))).slice(0, 50);

    // Skip spots that already have a NAIP image, plus spots with a queue row
    // in pending/processing/done state (errors *can* be retried — the worker
    // process is responsible for resetting them when it wants to try again).
    const idList = ids.map((id) => `"${id}"`).join(",");
    const [existingImages, existingQueue] = await Promise.all([
      pgGet<ExistingNaipImageRow>(
        `spot_images?spot_id=in.(${idList})&source=eq.naip&select=spot_id`,
      ),
      pgGet<ExistingQueueRow>(
        `naip_backfill_queue?spot_id=in.(${idList})&select=spot_id,status`,
      ),
    ]);

    const skip = new Set<string>();
    for (const r of existingImages) skip.add(r.spot_id);
    for (const r of existingQueue) {
      if (r.status === "pending" || r.status === "processing" || r.status === "done") {
        skip.add(r.spot_id);
      }
    }

    const toInsert = ids.filter((id) => !skip.has(id));
    if (toInsert.length > 0) {
      await pgInsert(
        "naip_backfill_queue",
        toInsert.map((spot_id) => ({ spot_id, status: "pending" })),
      );
    }

    return new Response(
      JSON.stringify({
        enqueued: toInsert.length,
        skipped: ids.length - toInsert.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("queue-naip-backfill error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message ?? "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
