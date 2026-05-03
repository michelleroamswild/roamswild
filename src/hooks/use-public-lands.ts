import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PublicLand {
  id: string;
  name: string;
  managingAgency: string; // BLM, USFS, etc.
  managingAgencyFull: string;
  unitName?: string; // Full unit name (e.g., "Lake Mead National Recreation Area")
  lat: number;
  lng: number;
  distance: number;
  // Polygon coordinates for overlay (array of {lat, lng} points). One
  // PublicLand row per exterior ring of a (multi)polygon — multi-ring rows
  // get exploded so the existing point-in-polygon helpers (which take a
  // single ring) keep working unchanged.
  polygon?: { lat: number; lng: number }[];
  // Skip rendering the polygon when it's huge or tribal (filter-only).
  // Point-in-polygon checks still use it.
  renderOnMap: boolean;
  vertexCount?: number;
  // PAD-US IUCN_Cat — Ia/Ib/II/III/IV/V/VI or "Other Conservation Area".
  // Drives display-only logic in SpotDetailPanel; not used by the in/out
  // gate.
  protectClass?: string;
  // Free-text protection title (e.g. "Wilderness Area", "Inventoried
  // Roadless Area", "Area of Critical Environmental Concern"). We surface
  // public_lands.land_type here — same value the import_padus.py pipeline
  // assigns from the PAD-US Designation_Type lookup.
  protectionTitle?: string;
}

// Haversine distance in miles
function getDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

// Agency-code → human-readable label. Same set the previous external-API
// hook used so downstream consumers (legend, tooltips) keep working.
const agencyNames: Record<string, string> = {
  BLM: 'Bureau of Land Management',
  USFS: 'US Forest Service',
  FS: 'US Forest Service',
  FWS: 'Fish & Wildlife Service',
  NPS: 'National Park Service',
  STATE: 'State Park',
  SDOL: 'State Trust Land',
  SFW: 'State Fish & Wildlife',
  SPR: 'State Parks & Recreation',
  SDNR: 'State Natural Resources',
  SLB: 'State Land Board',
  SLO: 'State Land Office',
  SDC: 'State Dept of Conservation',
  SDF: 'State Dept of Forestry',
  OTHS: 'State Other',
  NGO: 'Land Trust',
  TRIB: 'Tribal Land',
  DOD: 'Department of Defense',
  BOR: 'Bureau of Reclamation',
  TVA: 'Tennessee Valley Authority',
};

// Polygons over this many vertices are kept for point-in-polygon checks
// but not rendered, since Google Maps polygon overlays choke on huge
// vertex counts.
const MAX_RENDER_VERTICES = 5000;

// Hard cap on total polygons we ever load, so a giant bbox can't load
// arbitrarily many rows.
const MAX_TOTAL_POLYGONS = 5000;

// PostgREST silently caps RPC responses at 1000 rows; page through with
// p_offset until a partial page comes back.
const PAGE_SIZE = 1000;

// PAD-US lumps actual State Parks (Snow Canyon, Valley of Fire, Beaver
// Dam, etc.) under Mang_Name='SPR' alongside city/local parks, historic
// sites, and state forests. The explorer's restricted-area filter +
// rendering both key off agency='STATE' to mean "real state park, no
// dispersed camping". Promote SPR rows to STATE only when land_type
// agrees — local parks and historic sites stay as SPR (rendering as
// state-trust) so we don't lose the cyan-vs-blue distinction.
const STATE_PARK_LAND_TYPES = new Set([
  'State Park',
  'State Recreation Area',
  'State Reserve',
  'State Reservation',
]);

interface RpcRow {
  id: string;
  name: string;
  unit_name: string | null;
  managing_agency: string;
  source_type: string;
  category: string | null;
  land_type: string | null;
  protect_class: string | null;
  area_acres: number | null;
  dispersed_camping_allowed: boolean | null;
  centroid_geojson: { type: 'Point'; coordinates: [number, number] } | null;
  geojson:
    | { type: 'MultiPolygon'; coordinates: number[][][][] }
    | { type: 'Polygon'; coordinates: number[][][] }
    | null;
}

// Flatten a GeoJSON Polygon or MultiPolygon into its exterior rings.
// Holes are dropped — they aren't relevant for point-in-polygon checks
// in this codebase, and Google Maps can't render them via the simple
// ring-array shape we use elsewhere.
function extractExteriorRings(
  geom: RpcRow['geojson'],
): { lat: number; lng: number }[][] {
  if (!geom) return [];
  if (geom.type === 'Polygon') {
    const ring = geom.coordinates[0];
    if (!ring) return [];
    return [ring.map(([lng, lat]) => ({ lat, lng }))];
  }
  // MultiPolygon
  return geom.coordinates
    .map((poly) => poly[0])
    .filter((ring): ring is number[][] => Array.isArray(ring) && ring.length > 0)
    .map((ring) => ring.map(([lng, lat]) => ({ lat, lng })));
}

export function usePublicLands(
  centerLat: number,
  centerLng: number,
  radiusMiles: number = 50,
) {
  const [publicLands, setPublicLands] = useState<PublicLand[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!centerLat || !centerLng) return;

    let cancelled = false;
    async function fetchPublicLands() {
      setLoading(true);
      setError(null);
      setPublicLands([]);

      try {
        // bbox in lat/lng degrees. Same rough conversion the old hook
        // used: ~50 mi/° longitude, ~69 mi/° latitude. Good enough for
        // the radius-based "lands near me" semantics we need; the RPC
        // does proper PostGIS ST_Intersects on the result.
        const dLat = radiusMiles / 69;
        const dLng = radiusMiles / 50;
        const bbox = {
          west: centerLng - dLng,
          east: centerLng + dLng,
          south: centerLat - dLat,
          north: centerLat + dLat,
        };

        // Page through results until a partial page comes back. The RPC
        // isn't in the generated supabase types yet — cast through `as
        // never` like AdminSpotReview does.
        const allRows: RpcRow[] = [];
        let offset = 0;
        while (allRows.length < MAX_TOTAL_POLYGONS) {
          const { data, error: rpcError } = await (
            supabase.rpc as unknown as (
              fn: string,
              args: Record<string, unknown>,
            ) => Promise<{ data: unknown; error: { message: string } | null }>
          )('get_public_lands_in_bbox', {
            p_west: bbox.west,
            p_south: bbox.south,
            p_east: bbox.east,
            p_north: bbox.north,
            p_simplify_degrees: 0.0003,
            p_limit: PAGE_SIZE,
            p_offset: offset,
          });
          if (cancelled) return;
          if (rpcError) {
            console.warn('[usePublicLands] RPC failed:', rpcError);
            break;
          }
          const page = (data ?? []) as RpcRow[];
          allRows.push(...page);
          if (page.length < PAGE_SIZE) break;
          offset += PAGE_SIZE;
        }

        const lands: PublicLand[] = [];
        for (const row of allRows) {
          const rings = extractExteriorRings(row.geojson);
          if (rings.length === 0) continue;

          const rawAgency = row.managing_agency || 'FED';
          const agencyCode = rawAgency === 'SPR' && row.land_type && STATE_PARK_LAND_TYPES.has(row.land_type)
            ? 'STATE'
            : rawAgency;

          // Centroid: prefer the RPC's pre-computed value (it's the
          // PostGIS ST_Centroid of the full unsimplified boundary).
          // Fall back to ring-arithmetic if missing.
          let centroidLat: number;
          let centroidLng: number;
          if (row.centroid_geojson) {
            const [lng, lat] = row.centroid_geojson.coordinates;
            centroidLat = lat;
            centroidLng = lng;
          } else {
            const firstRing = rings[0];
            const sumLat = firstRing.reduce((a, p) => a + p.lat, 0);
            const sumLng = firstRing.reduce((a, p) => a + p.lng, 0);
            centroidLat = sumLat / firstRing.length;
            centroidLng = sumLng / firstRing.length;
          }

          rings.forEach((ring, ringIndex) => {
            const vertexCount = ring.length;
            // Tribal lands now render on the map (red bucket in DispersedMap)
            // — used to be filter-only because there was no rendering bucket
            // for them. The vertex cap still applies regardless of agency.
            const renderOnMap = vertexCount <= MAX_RENDER_VERTICES;
            lands.push({
              id: `${row.source_type}-${row.id}-${ringIndex}`,
              name: row.name,
              managingAgency: agencyCode,
              managingAgencyFull: agencyNames[agencyCode] || agencyCode,
              unitName: row.unit_name ?? undefined,
              lat: centroidLat,
              lng: centroidLng,
              distance: getDistanceMiles(centerLat, centerLng, centroidLat, centroidLng),
              polygon: ring,
              renderOnMap,
              vertexCount,
              protectClass: row.protect_class ?? undefined,
              protectionTitle: row.land_type ?? undefined,
            });
          });
        }

        // Sort by distance, then cap total. The cap protects against
        // dense states where bbox returns thousands of small parcels.
        lands.sort((a, b) => a.distance - b.distance);
        const capped = lands.slice(0, MAX_TOTAL_POLYGONS);

        if (cancelled) return;

        const renderableCount = capped.filter((l) => l.renderOnMap).length;
        const filterOnlyCount = capped.length - renderableCount;
        const byAgency: Record<string, { total: number; renderable: number }> = {};
        for (const l of capped) {
          if (!byAgency[l.managingAgency]) byAgency[l.managingAgency] = { total: 0, renderable: 0 };
          byAgency[l.managingAgency].total++;
          if (l.renderOnMap) byAgency[l.managingAgency].renderable++;
        }
        console.log(
          `[usePublicLands] ${capped.length} polygons (${renderableCount} renderable, ${filterOnlyCount} filter-only) from ${allRows.length} rows`,
          byAgency,
        );

        setPublicLands(capped);
      } catch (err) {
        if (cancelled) return;
        console.error('[usePublicLands] fetch failed:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch public lands');
        setPublicLands([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchPublicLands();
    return () => {
      cancelled = true;
    };
  }, [centerLat, centerLng, radiusMiles]);

  return { publicLands, loading, error };
}
