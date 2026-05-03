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

## Hide OSM tracks in cities

The road overlay on `/dispersed` shows every OSM track inside city limits,
which is visual noise — those streets aren't relevant to dispersed-camping
exploration. Probably worth a filter that drops road segments inside (or
within some buffer of) admin-boundary city polygons before render. Cheapest
implementation lives client-side: pass an `is_in_city` flag from the road
import and skip rendering when true. Could share the same OSM admin-
boundary import that the spot quality filter (#1 town distance) eventually
needs.

## Map polish — popovers, controls, overlays, pin consistency

The map UI is leftover from before the Pine + Paper redesign. A handful of
improvements have piled up worth doing as one coordinated pass rather than
piecemeal:

- **Redesign info popovers / tooltips** that appear on marker click. They
  currently use Google's default chrome (white tail, generic typography) —
  should match the Pine + Paper card surfaces (rounded-[14px], cream/paper
  bg, mono captions, ink text).
- **Redesign map controls** (zoom buttons, satellite toggle, legend
  positioning). Currently using the default Maps controls; should be small
  pill-style buttons matching the rest of the UI.
- **Adopt brand colors for overlays.** Today's polygon fills and stroke
  colors (`#d97706` BLM orange, `#06b6d4` state-trust cyan, `#7c3aed` NPS
  purple, `#ec4899` land-trust pink) are arbitrary Tailwind defaults. Pick
  hues from the Pine + Paper palette (clay, sage, water, ember, etc.) so
  agency colors fit the rest of the design system.
- **Adopt brand colors for spot pins.** Same idea on the marker side —
  current red `#dc2626` / black `#000000` / orange `#f97316` / yellow
  `#eab308` are off-system. Map every pin state to a token from the palette.
- **Consistency across pages.** Every page that renders a Google Map
  (Index hero featured-spot, Index Near You grid, DispersedExplorer,
  AdminSpotReview, MapPreview, LocationDetail, IoTest) should share the
  same control style, popover style, and pin vocabulary. Pull them into a
  small shared module so future maps inherit the conventions automatically.

## Nationwide PAD-US Designations import

Designations (Wilderness, National Monuments, WSAs, ACECs, USFS Roadless
Areas) are currently imported for Utah only — `scripts/public-lands/
import_padus.py --include-designations --state UT`. PAD-US Fee/Easement
is already nationwide; only the Designation overlay layer is UT-only.

Not blocking: Designations are explicitly excluded from both
`compute_spot_public_land_edge_distance` and the `derive_*` functions
(see migration 20260233), so importing them won't reclassify any
existing spots or pull in new ones. What they unlock:

- AdminSpotReview map renders Wilderness/NM/WSA boundaries nationwide,
  not just UT.
- Future "spot is in Bears Ears NM / Mount Hood Wilderness" labels on
  spot cards.
- Proper coincident-edge handling outside UT (the Death Ridge fix in
  20260238 unions overlapping ownership polygons; non-UT areas with
  Designation overlays would benefit from the same logic).

To run: drop `--state UT` and run nationwide. Two prerequisites:

1. **Path is hardcoded.** `PADUS_GDB` constant at line 58 of
   `import_padus.py` expects `~/Desktop/PADUS4_0Geodatabase/`. Actual
   GDB lives at `~/Desktop/_Michelle Roams Wild/RoamsWild/
   PADUS4_0Geodatabase/`. Make it env-var configurable
   (`PADUS_GDB_PATH`) — one-line change.
2. **Insert pipeline is sequential.** ~30-100k rows × ~1.5s each via
   single REST POSTs = ~12-25 hours. Either run overnight (safe since
   `--resume` skips already-imported rows) or batch the inserts first
   (single `POST /rest/v1/public_lands` with array body) to drop wall
   time to maybe an hour.

## Paginate `get_public_lands_in_bbox`

PostgREST silently caps RPC results at 1000 rows. After the Designations
import (Grand Staircase, Bears Ears, Vermilion Cliffs, plus 500+ WSAs/
ACECs), Utah has 5000+ polygons intersecting its bbox — but the admin
map only ever sees the largest 1000 (`ORDER BY ST_Area DESC`). Smaller
agency-specific polygons get truncated.

Fix: add `p_offset` to `get_public_lands_in_bbox`, paginate from the
client until a page returns < 1000. Same pattern as the Range-header
trick we tried — except this version actually works because it's
parameter-driven, not header-driven. Call site is
`src/pages/AdminSpotReview.tsx`'s polygon-load effect (and similarly in
`src/hooks/use-public-lands.ts` for the explorer map).

Deferred because the truncated view is good enough for state-level
review work — the missing polygons are typically smaller agency rows
behind the giant NMs / forests visually, and the admin still sees the
big picture.

## Navigation flicker between pages

When navigating from the home page (which has a `data-dark-band` section) to
another page, the header's `onDark` state can carry stale dark-band styling
across the route change for a frame, plus the browser doesn't reset scroll
position. A small `<ScrollToTop>` component listening on `pathname` plus an
explicit `onDark` reset in `Header.tsx`'s pathname effect would fix both.
