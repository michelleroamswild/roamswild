# TODO

Deferred work that has clear scope but is intentionally postponed. Items are
roughly ordered by when we expect to want them, not by priority.

## NAIP imagery — bulk worker rollout

Lazy-backfill plumbing is already in place: `naip_backfill_queue` table on
local + cloud, `queue-naip-backfill` edge function deployed, homepage enqueues
missing chips and subscribes to `spot_images` realtime so cards swap in mid-
session. What's left is hosting the Python worker.

- **Stand up the Fly.io worker.** Dockerfile + `fly.toml` for a single 256MB
  machine running `python3 scripts/naip-imagery/process_queue.py --watch`.
  ~$2/mo at idle. Drains the queue continuously so chips appear within ~30s
  of any user landing on a spot.
- **Add a bulk-enqueue admin tool.** Either a small CLI or an admin-only edge
  function that takes a bbox and inserts every matching spot into
  `naip_backfill_queue`. Reuses the same Fly worker — no separate bulk infra.
- **Why deferred:** worth waiting until more derived spots are loaded so the
  bulk backfill isn't immediately stale.

## Spot-quality filters rebuild

Tracked in auto-memory (`memory/project_spot_quality_filters.md`). Derived
spots in towns / on houses are slipping through. The old
`is_near_private_road` filter was neutralized during the disk-IO emergency
and never put back. Needs:

- A clean rebuild of the private-road / built-environment filter that doesn't
  hammer disk IO during the derive functions.
- A pass over current derived spots to flag the bad ones already in the table.

## Surprise Me — populate the rich highlight buckets server-side

The edge function (`supabase/functions/surprise-me/index.ts`) declares
`response.highlights: { topTrails, campsites, pointsOfInterest, photoSpots }`
in TypeScript but never populates any of them. Today the homepage gets
highlights via Claude (cached in `region_ai_enrichments`), which is fine —
but if you ever want data-source highlights (USFS trail names, OSM peaks,
etc.) the edge function would need to query each bucket inside the region's
bbox and include it on the response.

## Pre-existing supabase typing errors

`src/pages/Index.tsx` throws several "type instantiation is excessively deep"
errors during `tsc --noEmit`, all from `.from('spots').select(...)` calls.
Pre-existing on `main`, doesn't affect runtime. Likely a generated-types
regression or a too-broad relationship typing in
`src/integrations/supabase/types.ts`. Cosmetic but worth fixing eventually.

## Navigation flicker between pages

When navigating from the home page (which has a `data-dark-band` section) to
another page, the header's `onDark` state can carry stale dark-band styling
across the route change for a frame, plus the browser doesn't reset scroll
position. A small `<ScrollToTop>` component listening on `pathname` plus an
explicit `onDark` reset in `Header.tsx`'s pathname effect would fix both.
