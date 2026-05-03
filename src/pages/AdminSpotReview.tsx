import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Marker, MarkerClusterer, Polygon } from '@react-google-maps/api';
import {
  ArrowCounterClockwise,
  CheckCircle,
  FlagBanner,
  SpinnerGap,
  Trash,
  X as XIcon,
  ArrowLeft,
} from '@phosphor-icons/react';
import { toast } from 'sonner';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { GoogleMap } from '@/components/GoogleMap';
import { useGoogleMaps } from '@/components/GoogleMapsProvider';
import { Mono } from '@/components/redesign';
import { cn } from '@/lib/utils';

const ADMIN_EMAILS = ['michelle@roamswild.com', 'mictaylo@gmail.com'];
const KEEP_STORAGE_KEY = 'admin-spot-review-keep-v1';
const REMOVE_STORAGE_KEY = 'admin-spot-review-remove-v1';

// State bboxes (west, south, east, north) — used for both filtering the
// flagged-spot query and the bbox sent to get_public_lands_in_bbox. Order
// matters in the dropdown; "All" stays first.
type StateKey = 'ALL' | 'UT' | 'NV' | 'AZ' | 'CO' | 'NM' | 'ID' | 'OR' | 'WA' | 'CA' | 'WY' | 'MT';
interface StateInfo {
  label: string;
  bbox: { west: number; south: number; east: number; north: number };
  center: { lat: number; lng: number };
  zoom: number;
}
const STATES: Record<StateKey, StateInfo> = {
  ALL: { label: 'All states', bbox: { west: -125, south: 24,  east: -66,  north: 50 },   center: { lat: 39.5,  lng: -98.5  }, zoom: 4  },
  UT:  { label: 'Utah',       bbox: { west: -114.05, south: 36.99, east: -109.04, north: 42.0 },  center: { lat: 39.32, lng: -111.09 }, zoom: 7  },
  NV:  { label: 'Nevada',     bbox: { west: -120.0,  south: 35.0,  east: -114.04, north: 42.0 },  center: { lat: 39.5,  lng: -117.0 },  zoom: 6  },
  AZ:  { label: 'Arizona',    bbox: { west: -114.82, south: 31.33, east: -109.05, north: 37.0 },  center: { lat: 34.0,  lng: -111.5 },  zoom: 6  },
  CO:  { label: 'Colorado',   bbox: { west: -109.06, south: 36.99, east: -102.04, north: 41.0 },  center: { lat: 39.0,  lng: -105.5 },  zoom: 7  },
  NM:  { label: 'New Mexico', bbox: { west: -109.05, south: 31.33, east: -103.0,  north: 37.0 },  center: { lat: 34.5,  lng: -106.0 },  zoom: 6  },
  ID:  { label: 'Idaho',      bbox: { west: -117.24, south: 41.99, east: -111.04, north: 49.0 },  center: { lat: 45.0,  lng: -114.5 },  zoom: 6  },
  OR:  { label: 'Oregon',     bbox: { west: -124.55, south: 41.99, east: -116.46, north: 46.27 }, center: { lat: 44.0,  lng: -120.5 },  zoom: 6  },
  WA:  { label: 'Washington', bbox: { west: -124.85, south: 45.54, east: -116.92, north: 49.0 },  center: { lat: 47.5,  lng: -120.5 },  zoom: 7  },
  CA:  { label: 'California', bbox: { west: -124.41, south: 32.53, east: -114.13, north: 42.0 },  center: { lat: 36.78, lng: -119.42}, zoom: 5  },
  WY:  { label: 'Wyoming',    bbox: { west: -111.06, south: 40.99, east: -104.05, north: 45.0 },  center: { lat: 43.0,  lng: -107.5 },  zoom: 7  },
  MT:  { label: 'Montana',    bbox: { west: -116.05, south: 44.36, east: -104.04, north: 49.0 },  center: { lat: 47.0,  lng: -110.0 },  zoom: 6  },
};

// Polygon fill/stroke per managing agency. Default for anything we don't
// recognize is the same neutral stroke we use for "Other public land."
// Agency colors come from the shared brand palette via src/lib/land-colors.ts
// (HSL strings keyed off the same --land-* tokens DispersedMap and the
// FloatingLegend swatches use). bucketForAgency handles the
// SLB/SDOL/SDNR/SDC/SDF/SLO/SFW/SPR/etc. → STATE_TRUST collapse so we
// don't need a per-code lookup here.
import { colorsForAgency } from '@/lib/land-colors';

interface PublicLandPolygon {
  id: string;
  name: string;
  managingAgency: string;
  // Flat ring list for Google Maps `<Polygon paths={...}>` — Google handles
  // outer/hole detection via winding order, so the flat shape is fine for
  // rendering.
  paths: google.maps.LatLngLiteral[][];
  // Same data preserved as MultiPolygon-shaped sub-polygons (each sub-poly
  // is `[outerRing, ...holes]`). Used for point-in-polygon tests where we
  // need to honor the outer-vs-hole boundary correctly. A flat ring list
  // would silently misclassify the second sub-polygon's outer ring as a
  // hole and miss spots inside it (e.g. Navajo Nation's Aneth extension).
  subPolygons: google.maps.LatLngLiteral[][][];
  // Cached lat/lng bounding box — lets us cheaply skip polygons that
  // can't possibly contain a given point before running ray-casting.
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number };
}

// One row in the admin review queue. Comes from the `spots` table where the
// quality flags in `extra` say something might be wrong.
interface FlaggedSpot {
  id: string;
  name: string;
  lat: number;
  lng: number;
  kind: string;
  source: string;
  manager: string | null;
  outsidePolygon: boolean;
  nearEdge: boolean;
  metersFromEdge: number | null;
  // Set by mark_road_intersection_spots — true when the spot's coords sit
  // within ~5m of 2+ distinct road segments. Catches T-intersection
  // false-positive dead-ends.
  atIntersection: boolean;
  // Sample-validation result. Populated by tools that cross-checked the
  // spot against an authoritative source (PAD-US Fee Managers Esri service).
  // Lets admin double-check the script's findings against their own knowledge.
  qualitySampled?: boolean;
  qualitySampleResult?: string | null;       // e.g. 'pad_confirms_outside', 'pad_says_inside'
  qualitySamplePadAgency?: string | null;    // e.g. 'FED/BLM', 'TRIB/TRIB', '(none)'
  // Set client-side from the loaded polygons via point-in-polygon. True when
  // the spot's coords fall inside any TRIB polygon currently on the map.
  inTribal?: boolean;
}

type FilterMode = 'unreviewed' | 'all' | 'keep' | 'remove';
// Flag-type filter — independent of the review-state filter above. Lets the
// admin focus on outside-polygon vs near-edge separately. 'sampled' surfaces
// only spots that have been cross-checked against an authoritative source.
// 'tribal' surfaces flagged spots whose coords fall inside any loaded
// TRIB polygon — most tribal nations don't permit dispersed camping.
// 'intersection' surfaces spots flagged by mark_road_intersection_spots
// (T-intersection false-positive dead-ends).
type FlagFilter = 'all' | 'outside' | 'edge' | 'sampled' | 'tribal' | 'intersection';

// ----- helpers --------------------------------------------------------------

const loadSet = (key: string): Set<string> => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set<string>();
  } catch {
    return new Set<string>();
  }
};
const persistSet = (key: string, set: Set<string>) => {
  try {
    localStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    // ignore quota / privacy-mode failures
  }
};

// Parse a GeoJSON Polygon / MultiPolygon into both shapes we need:
//   - flat ring list (for Google Maps' `<Polygon paths>` — it handles
//     outer/hole detection via winding order)
//   - per-sub-polygon ring list (for PIP, which has to honor the
//     outer-vs-hole boundary correctly)
const geojsonToShapes = (
  geojson: unknown,
): {
  paths: google.maps.LatLngLiteral[][];
  subPolygons: google.maps.LatLngLiteral[][][];
} => {
  if (!geojson || typeof geojson !== 'object') return { paths: [], subPolygons: [] };
  const g = geojson as { type?: string; coordinates?: unknown };
  const ringToLatLng = (ring: number[][]) => ring.map(([lng, lat]) => ({ lat, lng }));

  if (g.type === 'Polygon' && Array.isArray(g.coordinates)) {
    const rings = (g.coordinates as number[][][]).map(ringToLatLng);
    return { paths: rings, subPolygons: [rings] };
  }
  if (g.type === 'MultiPolygon' && Array.isArray(g.coordinates)) {
    const subPolygons: google.maps.LatLngLiteral[][][] = [];
    const paths: google.maps.LatLngLiteral[][] = [];
    for (const poly of g.coordinates as number[][][][]) {
      const rings = poly.map(ringToLatLng);
      subPolygons.push(rings);
      for (const ring of rings) paths.push(ring);
    }
    return { paths, subPolygons };
  }
  return { paths: [], subPolygons: [] };
};

const reasonLabel = (s: FlaggedSpot): string => {
  if (s.outsidePolygon) return 'Not in any polygon';
  if (s.nearEdge && s.metersFromEdge != null) return `${Math.round(s.metersFromEdge)}m from edge`;
  return 'Flagged';
};

// Ray-casting point-in-polygon. Treats the first ring as the outer boundary
// and any subsequent rings as holes. Robust enough for our use (polygon
// coords already validated upstream and we only care about screen accuracy).
const pointInRing = (lat: number, lng: number, ring: google.maps.LatLngLiteral[]): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].lng, yi = ring[i].lat;
    const xj = ring[j].lng, yj = ring[j].lat;
    const intersect = ((yi > lat) !== (yj > lat)) &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
};

// Test against one MultiPolygon-shaped polygon. Each sub-polygon's first
// ring is the outer; remaining rings are holes. Point is inside the
// MultiPolygon if any sub-poly's outer contains it AND none of that
// sub-poly's holes do.
const pointInMultiPolygon = (
  lat: number,
  lng: number,
  subPolygons: google.maps.LatLngLiteral[][][],
): boolean => {
  for (const rings of subPolygons) {
    if (rings.length === 0) continue;
    if (!pointInRing(lat, lng, rings[0])) continue;
    let inHole = false;
    for (let i = 1; i < rings.length; i++) {
      if (pointInRing(lat, lng, rings[i])) { inHole = true; break; }
    }
    if (!inHole) return true;
  }
  return false;
};

// Cheap bbox-then-PIP test against a list of polygons. Returns true on first
// match. O(n_polygons × points_per_polygon) worst case; fine for the few
// hundred TRIB polygons we typically have loaded for one state.
const pointInAnyPolygon = (lat: number, lng: number, polys: PublicLandPolygon[]): boolean => {
  for (const p of polys) {
    if (lat < p.bbox.minLat || lat > p.bbox.maxLat) continue;
    if (lng < p.bbox.minLng || lng > p.bbox.maxLng) continue;
    if (pointInMultiPolygon(lat, lng, p.subPolygons)) return true;
  }
  return false;
};

const computeBbox = (paths: google.maps.LatLngLiteral[][]) => {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const ring of paths) {
    for (const pt of ring) {
      if (pt.lat < minLat) minLat = pt.lat;
      if (pt.lat > maxLat) maxLat = pt.lat;
      if (pt.lng < minLng) minLng = pt.lng;
      if (pt.lng > maxLng) maxLng = pt.lng;
    }
  }
  return { minLat, maxLat, minLng, maxLng };
};

// ----- component ------------------------------------------------------------

const AdminSpotReview = () => {
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const { isLoaded: mapsLoaded } = useGoogleMaps();
  const isAdmin = !!user?.email && ADMIN_EMAILS.includes(user.email);

  const [spots, setSpots] = useState<FlaggedSpot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keepIds, setKeepIds] = useState<Set<string>>(() => loadSet(KEEP_STORAGE_KEY));
  const [removeIds, setRemoveIds] = useState<Set<string>>(() => loadSet(REMOVE_STORAGE_KEY));
  const [filter, setFilter] = useState<FilterMode>('unreviewed');
  const [flagFilter, setFlagFilter] = useState<FlagFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Default to Utah — that's where we have polygon data right now. Admin can
  // switch states once the nationwide PAD-US import finishes.
  const [stateKey, setStateKey] = useState<StateKey>('UT');
  const [polygons, setPolygons] = useState<PublicLandPolygon[]>([]);
  const [showPolygons, setShowPolygons] = useState(true);
  // Viewport filter — when active, the visible list narrows to only spots
  // inside the current map bounds. Lets the admin pan/zoom into a problem
  // area, hit "Mark visible", and bulk-queue just that area for delete.
  const [useViewportFilter, setUseViewportFilter] = useState(false);
  const [viewportBounds, setViewportBounds] = useState<{
    north: number; south: number; east: number; west: number;
  } | null>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const stateInfo = STATES[stateKey];

  // Auth gate.
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login');
      return;
    }
    if (!authLoading && user && !isAdmin) {
      navigate('/');
    }
  }, [user, authLoading, isAdmin, navigate]);

  // Load all flagged spots inside the selected state's bbox. Paginated because
  // the count can run into tens of thousands; the dropdown lets the admin
  // limit scope to one state at a time.
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      const PAGE_SIZE = 1000;
      const collected: FlaggedSpot[] = [];
      try {
        for (let from = 0; ; from += PAGE_SIZE) {
          // PostgREST `or` with two JSONB key-equality terms, scoped to bbox.
          // Only `sub_kind='derived'` rows are reviewable — community / known /
          // campground spots are curated or explicit and don't need flag review.
          const { data, error: dbError } = await supabase
            .from('spots')
            .select('id, name, latitude, longitude, kind, source, public_land_manager, extra')
            .eq('sub_kind', 'derived')
            .in('kind', ['dispersed_camping', 'informal_camping', 'established_campground'])
            .or(
              'extra->>outside_public_land_polygon.eq.true,extra->>near_public_land_edge.eq.true,extra->>at_road_intersection.eq.true',
            )
            .gte('latitude', stateInfo.bbox.south)
            .lte('latitude', stateInfo.bbox.north)
            .gte('longitude', stateInfo.bbox.west)
            .lte('longitude', stateInfo.bbox.east)
            .range(from, from + PAGE_SIZE - 1);
          if (cancelled) return;
          if (dbError) throw dbError;
          const page = (data ?? []) as unknown as Array<{
            id: string;
            name: string | null;
            latitude: number | string;
            longitude: number | string;
            kind: string;
            source: string;
            public_land_manager: string | null;
            extra: Record<string, unknown> | null;
          }>;
          for (const r of page) {
            const extra = r.extra ?? {};
            const lat = typeof r.latitude === 'string' ? parseFloat(r.latitude) : r.latitude;
            const lng = typeof r.longitude === 'string' ? parseFloat(r.longitude) : r.longitude;
            collected.push({
              id: r.id,
              name: r.name || 'Unnamed',
              lat,
              lng,
              kind: r.kind,
              source: r.source,
              manager: r.public_land_manager,
              outsidePolygon: !!(extra as { outside_public_land_polygon?: boolean })
                .outside_public_land_polygon,
              nearEdge: !!(extra as { near_public_land_edge?: boolean }).near_public_land_edge,
              metersFromEdge:
                (extra as { meters_from_public_land_edge?: number | null })
                  .meters_from_public_land_edge ?? null,
              atIntersection: !!(extra as { at_road_intersection?: boolean })
                .at_road_intersection,
              qualitySampled: !!(extra as { quality_sampled?: boolean }).quality_sampled,
              qualitySampleResult:
                (extra as { quality_sample_result?: string | null }).quality_sample_result ?? null,
              qualitySamplePadAgency:
                (extra as { quality_sample_pad_agency?: string | null })
                  .quality_sample_pad_agency ?? null,
            });
          }
          if (page.length < PAGE_SIZE) break;
        }
        if (!cancelled) setSpots(collected);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, stateKey]);

  // Load public_lands polygon overlay for the selected state's bbox. Skip
  // when the state changes if the user has the overlay toggled off.
  useEffect(() => {
    if (!isAdmin || !showPolygons) {
      setPolygons([]);
      return;
    }
    let cancelled = false;
    (async () => {
      // The RPC isn't in the generated types yet — cast through `as never`.
      const { data, error: rpcError } = await (supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>)(
        'get_public_lands_in_bbox',
        {
          p_west: stateInfo.bbox.west,
          p_south: stateInfo.bbox.south,
          p_east: stateInfo.bbox.east,
          p_north: stateInfo.bbox.north,
          // Coarser simplify (~110m) so giant Designation polygons like
          // Grand Staircase / Bears Ears render in time. State-level zoom
          // can't see sub-pixel detail anyway. RPC default is 0.0003 (~33m).
          p_simplify_degrees: 0.001,
          p_limit: 5000,
        },
      );
      if (cancelled) return;
      if (rpcError) {
        console.warn('[admin] polygon load failed:', rpcError);
        setPolygons([]);
        return;
      }
      type Row = { id: string; name: string; managing_agency: string; geojson: unknown };
      const rows = (data ?? []) as Row[];
      const parsed: PublicLandPolygon[] = [];
      for (const r of rows) {
        const { paths, subPolygons } = geojsonToShapes(r.geojson);
        if (paths.length === 0) continue;
        parsed.push({
          id: r.id,
          name: r.name,
          managingAgency: r.managing_agency,
          paths,
          subPolygons,
          bbox: computeBbox(paths),
        });
      }
      setPolygons(parsed);
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, stateKey, showPolygons, stateInfo.bbox.east, stateInfo.bbox.north, stateInfo.bbox.south, stateInfo.bbox.west]);

  // Mutually-exclusive vote helper (can't both keep and remove the same spot).
  const setVote = (id: string, target: 'keep' | 'remove' | null) => {
    const nextKeep = new Set(keepIds);
    const nextRemove = new Set(removeIds);
    nextKeep.delete(id);
    nextRemove.delete(id);
    if (target === 'keep') nextKeep.add(id);
    if (target === 'remove') nextRemove.add(id);
    setKeepIds(nextKeep);
    setRemoveIds(nextRemove);
    persistSet(KEEP_STORAGE_KEY, nextKeep);
    persistSet(REMOVE_STORAGE_KEY, nextRemove);
  };

  // Track the map's current viewport bounds. Updated on `idle` (fires
  // after pan/zoom settles) rather than `bounds_changed` to avoid thrashing
  // during continuous drag. Stored north/south/east/west matching the
  // bbox shape used elsewhere in this file.
  useEffect(() => {
    if (!mapInstance) return;
    const update = () => {
      const b = mapInstance.getBounds();
      if (!b) return;
      const ne = b.getNorthEast();
      const sw = b.getSouthWest();
      setViewportBounds({
        north: ne.lat(), east: ne.lng(),
        south: sw.lat(), west: sw.lng(),
      });
    };
    update();
    const listener = mapInstance.addListener('idle', update);
    return () => listener.remove();
  }, [mapInstance]);

  // Pre-filter polygons to TRIB once so the per-spot PIP doesn't walk every
  // BLM/USFS row in the state. Recomputed only when the polygon set changes.
  const tribalPolygons = useMemo(
    () => polygons.filter((p) => p.managingAgency === 'TRIB'),
    [polygons],
  );

  // Tag each spot with `inTribal` derived from a client-side PIP test against
  // the loaded TRIB polygons. Costs O(spots × tribal_polys) but bbox-rejects
  // most pairs cheaply. Recomputed when either input changes.
  const spotsWithTribal = useMemo(() => {
    if (tribalPolygons.length === 0) {
      return spots.map((s) => ({ ...s, inTribal: false }));
    }
    return spots.map((s) => ({
      ...s,
      inTribal: pointInAnyPolygon(s.lat, s.lng, tribalPolygons),
    }));
  }, [spots, tribalPolygons]);

  // Filtered list — what the user is actively looking at right now. Three
  // independent filters compose: review-state (unreviewed/keep/remove/all),
  // flag-type (all/outside/edge/sampled/tribal), and the optional viewport
  // bounds (only spots currently on screen).
  const visible = useMemo(() => {
    let next = spotsWithTribal;
    // Flag-type filter
    if (flagFilter === 'outside') next = next.filter((s) => s.outsidePolygon);
    else if (flagFilter === 'edge') next = next.filter((s) => !s.outsidePolygon && s.nearEdge);
    else if (flagFilter === 'sampled') next = next.filter((s) => s.qualitySampled);
    else if (flagFilter === 'tribal') next = next.filter((s) => s.inTribal);
    else if (flagFilter === 'intersection') next = next.filter((s) => s.atIntersection);
    // Review-state filter
    if (filter === 'keep') next = next.filter((s) => keepIds.has(s.id));
    else if (filter === 'remove') next = next.filter((s) => removeIds.has(s.id));
    else if (filter === 'unreviewed')
      next = next.filter((s) => !keepIds.has(s.id) && !removeIds.has(s.id));
    // Viewport filter — only spots currently visible on the map
    if (useViewportFilter && viewportBounds) {
      const b = viewportBounds;
      next = next.filter(
        (s) => s.lat >= b.south && s.lat <= b.north && s.lng >= b.west && s.lng <= b.east,
      );
    }
    return next;
  }, [spotsWithTribal, filter, flagFilter, keepIds, removeIds, useViewportFilter, viewportBounds]);

  // Pre-computed bucket counts for the flag-filter pills. Counts honor the
  // active review-state filter and viewport filter so the pills act as a
  // drilldown — when the user is on "Unreviewed", spots already voted keep
  // or remove fall out of every flag count, including the All count. When
  // the viewport filter is active, spots outside the current map bounds
  // also fall out. Review-state pills themselves keep absolute counts.
  const flagCounts = useMemo(() => {
    let outside = 0;
    let edge = 0;
    let sampled = 0;
    let tribal = 0;
    let intersection = 0;
    let all = 0;
    const b = useViewportFilter ? viewportBounds : null;
    for (const s of spotsWithTribal) {
      if (filter === 'keep' && !keepIds.has(s.id)) continue;
      if (filter === 'remove' && !removeIds.has(s.id)) continue;
      if (filter === 'unreviewed' && (keepIds.has(s.id) || removeIds.has(s.id))) continue;
      if (b && (s.lat < b.south || s.lat > b.north || s.lng < b.west || s.lng > b.east)) continue;
      all++;
      if (s.outsidePolygon) outside++;
      else if (s.nearEdge) edge++;
      if (s.qualitySampled) sampled++;
      if (s.inTribal) tribal++;
      if (s.atIntersection) intersection++;
    }
    return { outside, edge, sampled, tribal, intersection, all };
  }, [spotsWithTribal, filter, keepIds, removeIds, useViewportFilter, viewportBounds]);

  const selected = visible.find((s) => s.id === selectedId) ?? null;

  const handleSelectFromList = (s: FlaggedSpot) => {
    setSelectedId(s.id);
    if (mapInstance) {
      mapInstance.panTo({ lat: s.lat, lng: s.lng });
      if ((mapInstance.getZoom() ?? 0) < 14) mapInstance.setZoom(14);
    }
  };

  const handleSelectFromMap = (s: FlaggedSpot) => {
    setSelectedId(s.id);
    const node = itemRefs.current[s.id];
    if (node) node.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  // Hard-delete every spot the user voted to remove. Confirms first because
  // it actually drops rows from the unified spots table.
  const handleBulkDelete = async () => {
    if (removeIds.size === 0) return;
    if (!confirm(`Delete ${removeIds.size} spots from the database? This is permanent.`)) return;
    setDeleting(true);
    try {
      const ids = [...removeIds];
      // Batch in chunks of 200 — PostgREST `in.()` filter has practical
      // length limits well under that, and we want to surface partial
      // failures rather than rolling back the whole thing.
      const BATCH = 200;
      let totalDeleted = 0;
      for (let i = 0; i < ids.length; i += BATCH) {
        const slice = ids.slice(i, i + BATCH);
        const { error: delError, count } = await supabase
          .from('spots')
          .delete({ count: 'exact' })
          .in('id', slice);
        if (delError) throw delError;
        totalDeleted += count ?? slice.length;
      }
      toast.success(`Deleted ${totalDeleted} spots`);
      // Drop them from local state + clear the remove vote set.
      setSpots((prev) => prev.filter((s) => !removeIds.has(s.id)));
      setRemoveIds(new Set());
      persistSet(REMOVE_STORAGE_KEY, new Set());
    } catch (err) {
      toast.error('Delete failed', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setDeleting(false);
    }
  };

  const clearVotes = () => {
    if (!confirm('Clear all keep/remove votes? Spots in the DB are unchanged.')) return;
    setKeepIds(new Set());
    setRemoveIds(new Set());
    persistSet(KEEP_STORAGE_KEY, new Set());
    persistSet(REMOVE_STORAGE_KEY, new Set());
  };

  // Bulk-mark every spot in the current `visible` list as remove. Pairs
  // with the flag-filter pills (especially Tribal) so the admin can fan
  // out a filter, eyeball the count, and queue the whole bucket in one
  // click. Doesn't touch the DB on its own — the existing "Delete N"
  // button still has to run to commit.
  const markAllVisibleForRemove = () => {
    if (visible.length === 0) return;
    if (!confirm(`Mark all ${visible.length} visible spots for delete? (Existing keep votes will be overridden.)`)) return;
    const nextKeep = new Set(keepIds);
    const nextRemove = new Set(removeIds);
    for (const s of visible) {
      nextKeep.delete(s.id);
      nextRemove.add(s.id);
    }
    setKeepIds(nextKeep);
    setRemoveIds(nextRemove);
    persistSet(KEEP_STORAGE_KEY, nextKeep);
    persistSet(REMOVE_STORAGE_KEY, nextRemove);
  };

  const filterPill = (mode: FilterMode, label: string, count: number) => (
    <button
      onClick={() => setFilter(mode)}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-sans font-semibold tracking-[-0.005em] transition-colors border',
        filter === mode
          ? 'bg-ink text-cream border-ink'
          : 'bg-white text-ink-2 border-line hover:border-ink-3/40 hover:bg-cream',
      )}
    >
      {label}
      <span
        className={cn(
          'px-1 rounded-full text-[10px] font-mono',
          filter === mode ? 'bg-cream/20 text-cream' : 'bg-ink/10 text-ink-3',
        )}
      >
        {count}
      </span>
    </button>
  );

  if (authLoading || !isAdmin) {
    return (
      <div className="h-screen flex items-center justify-center bg-paper text-ink-3">
        <SpinnerGap size={28} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-paper text-ink font-sans">
      {/* Header */}
      <div className="shrink-0 border-b border-line bg-cream px-4 py-3 flex items-center justify-between flex-wrap gap-2">
        <div className="min-w-0 flex items-center gap-3">
          <button
            onClick={() => navigate('/admin')}
            className="inline-flex items-center justify-center w-8 h-8 rounded-full text-ink-3 hover:text-ink hover:bg-ink/5 transition-colors"
            aria-label="Back to admin"
          >
            <ArrowLeft size={16} weight="regular" />
          </button>
          <div className="min-w-0">
            <Mono className="text-pine-6 inline-flex items-center gap-1.5">
              <FlagBanner className="w-3 h-3" weight="regular" />
              Spot quality review
            </Mono>
            <p className="text-[12px] text-ink-3 mt-0.5">
              {error ? (
                <span className="text-ember">Error: {error}</span>
              ) : loading ? (
                'Loading flagged spots…'
              ) : (
                <>
                  <span className="font-sans font-semibold text-ink">{spots.length}</span> flagged ·{' '}
                  <span className="text-pine-6">{keepIds.size} kept</span> ·{' '}
                  <span className="text-ember">{removeIds.size} marked for delete</span>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* State scope — defaults to Utah where we have polygon data. */}
          <select
            value={stateKey}
            onChange={(e) => {
              setStateKey(e.target.value as StateKey);
              setSelectedId(null);
            }}
            className="px-3 py-1 rounded-full text-[12px] font-sans font-semibold tracking-[-0.005em] bg-white border border-line hover:border-ink-3/40 transition-colors cursor-pointer"
          >
            {(Object.keys(STATES) as StateKey[]).map((k) => (
              <option key={k} value={k}>
                {STATES[k].label}
              </option>
            ))}
          </select>

          {/* Polygon overlay toggle */}
          <button
            onClick={() => setShowPolygons((p) => !p)}
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-sans font-semibold tracking-[-0.005em] transition-colors border',
              showPolygons
                ? 'bg-ink text-cream border-ink'
                : 'bg-white text-ink-2 border-line hover:border-ink-3/40 hover:bg-cream',
            )}
          >
            Polygons
            <span
              className={cn(
                'px-1 rounded-full text-[10px] font-mono',
                showPolygons ? 'bg-cream/20 text-cream' : 'bg-ink/10 text-ink-3',
              )}
            >
              {polygons.length}
            </span>
          </button>

          {/* Viewport filter toggle — when active, all flag-pill counts and
              the visible list narrow to spots inside the current map bounds.
              Pairs with "Mark visible (N)" so the admin can pan/zoom into
              an area, sanity-check it, and bulk-queue just that area. */}
          <button
            onClick={() => setUseViewportFilter((v) => !v)}
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-sans font-semibold tracking-[-0.005em] transition-colors border',
              useViewportFilter
                ? 'bg-ink text-cream border-ink'
                : 'bg-white text-ink-2 border-line hover:border-ink-3/40 hover:bg-cream',
            )}
            title="Limit list to spots currently visible on the map"
          >
            Viewport
          </button>

          {/* Flag-type pills — ember for the quality flags, water for sampled
              (a separate dimension — "has been cross-checked"), red for
              tribal (a separate spatial flag — "lat/lng falls inside a
              TRIB polygon"). */}
          {(['all', 'outside', 'edge', 'sampled', 'tribal', 'intersection'] as const).map((mode) => {
            const active = flagFilter === mode;
            const label =
              mode === 'all' ? 'All flags'
              : mode === 'outside' ? 'Outside'
              : mode === 'edge' ? 'Edge'
              : mode === 'sampled' ? 'Sampled'
              : mode === 'tribal' ? 'Tribal'
              : 'Intersection';
            const count =
              mode === 'all' ? flagCounts.all
              : mode === 'outside' ? flagCounts.outside
              : mode === 'edge' ? flagCounts.edge
              : mode === 'sampled' ? flagCounts.sampled
              : mode === 'tribal' ? flagCounts.tribal
              : flagCounts.intersection;
            const isSampled = mode === 'sampled';
            const isTribal = mode === 'tribal';
            const isIntersection = mode === 'intersection';
            return (
              <button
                key={mode}
                onClick={() => setFlagFilter(mode)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-sans font-semibold tracking-[-0.005em] transition-colors border',
                  active
                    ? isSampled
                      ? 'bg-water text-cream border-water'
                      : isTribal
                        ? 'bg-[#dc2626] text-cream border-[#dc2626]'
                        : isIntersection
                          ? 'bg-clay text-cream border-clay'
                          : 'bg-ember text-cream border-ember'
                    : isSampled
                      ? 'bg-white text-water border-water/40 hover:bg-water/5'
                      : isTribal
                        ? 'bg-white text-[#dc2626] border-[#dc2626]/40 hover:bg-[#dc2626]/5'
                        : isIntersection
                          ? 'bg-white text-clay border-clay/40 hover:bg-clay/5'
                          : 'bg-white text-ember border-ember/40 hover:bg-ember/5',
                )}
              >
                {label}
                <span
                  className={cn(
                    'px-1 rounded-full text-[10px] font-mono',
                    active
                      ? 'bg-cream/20 text-cream'
                      : isSampled
                        ? 'bg-water/10 text-water'
                        : isTribal
                          ? 'bg-[#dc2626]/10 text-[#dc2626]'
                          : isIntersection
                            ? 'bg-clay/10 text-clay'
                            : 'bg-ember/10 text-ember',
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}

          {filterPill('unreviewed', 'Unreviewed', spots.length - keepIds.size - removeIds.size)}
          {filterPill('keep', 'Kept', keepIds.size)}
          {filterPill('remove', 'Remove', removeIds.size)}
          {filterPill('all', 'All', spots.length)}

          <button
            onClick={clearVotes}
            disabled={keepIds.size === 0 && removeIds.size === 0}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-sans font-semibold tracking-[-0.005em] transition-colors border bg-white text-ink-2 border-line hover:border-ink-3/40 hover:bg-cream disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ArrowCounterClockwise size={11} weight="regular" />
            Clear votes
          </button>

          {/* Bulk mark visible — useful with the Tribal filter to queue the
              whole bucket for removal in one click. */}
          <button
            onClick={markAllVisibleForRemove}
            disabled={visible.length === 0}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-sans font-semibold tracking-[-0.005em] transition-colors border bg-white text-ember border-ember/40 hover:bg-ember/5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Mark visible ({visible.length})
          </button>

          <button
            onClick={handleBulkDelete}
            disabled={removeIds.size === 0 || deleting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-sans font-semibold tracking-[-0.005em] bg-ember text-cream hover:bg-ember/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {deleting ? <SpinnerGap size={12} className="animate-spin" /> : <Trash size={12} weight="regular" />}
            Delete {removeIds.size}
          </button>
        </div>
      </div>

      {/* Main: map + list */}
      <div className="flex-1 min-h-0 flex">
        {/* Map */}
        <div className="flex-1 min-w-0 relative">
          {mapsLoaded && (
            <GoogleMap
              center={stateInfo.center}
              zoom={stateInfo.zoom}
              className="w-full h-full"
              options={{
                mapTypeId: 'hybrid',
                streetViewControl: false,
                fullscreenControl: true,
                rotateControl: false,
                clickableIcons: false,
              }}
              onLoad={setMapInstance}
            >
              {/* PAD-US polygon overlay — rendered first so spot markers
                  sit on top. Z-ordering on the map: polygons zIndex<10,
                  markers default ~1000. Tribal polygons get heavier
                  treatment (saturated red, thicker stroke, higher zIndex)
                  because dispersed camping is rarely permitted on tribal
                  land and admins need to see those boundaries clearly. */}
              {polygons.map((poly) => {
                const colors = colorsForAgency(poly.managingAgency);
                const isTribal = poly.managingAgency === 'TRIB';
                return (
                  <Polygon
                    key={poly.id}
                    paths={poly.paths}
                    options={{
                      fillColor: colors.fill,
                      fillOpacity: isTribal ? 0.32 : 0.18,
                      strokeColor: colors.stroke,
                      strokeOpacity: isTribal ? 0.9 : 0.55,
                      strokeWeight: isTribal ? 3 : 1,
                      clickable: false,
                      zIndex: isTribal ? 5 : 1,
                    }}
                  />
                );
              })}

              {/* Marker cluster — keeps the map responsive at 5k+ markers. */}
              <MarkerClusterer averageCenter enableRetinaIcons gridSize={50} maxZoom={11}>
                {(clusterer) => (
                  <>
                    {visible.map((s) => {
                      const fillColor = removeIds.has(s.id)
                        ? '#dc2626'
                        : keepIds.has(s.id)
                        ? '#3a7a40'
                        : '#f59e0b';
                      const isSelected = s.id === selectedId;
                      return (
                        <Marker
                          key={s.id}
                          position={{ lat: s.lat, lng: s.lng }}
                          clusterer={clusterer}
                          icon={
                            typeof google !== 'undefined' && typeof google.maps?.SymbolPath !== 'undefined'
                              ? {
                                  path: google.maps.SymbolPath.CIRCLE,
                                  fillColor,
                                  fillOpacity: 1,
                                  strokeColor: isSelected ? '#000000' : '#ffffff',
                                  strokeWeight: isSelected ? 2.5 : 1,
                                  scale: isSelected ? 9 : 6,
                                }
                              : undefined
                          }
                          onClick={() => handleSelectFromMap(s)}
                        />
                      );
                    })}
                  </>
                )}
              </MarkerClusterer>
            </GoogleMap>
          )}
        </div>

        {/* Sidebar list */}
        <aside className="w-[420px] shrink-0 border-l border-line bg-cream flex flex-col">
          <div className="flex-1 overflow-y-auto">
            {visible.length === 0 ? (
              <div className="px-4 py-12 text-center text-ink-3 text-[13px]">
                {loading ? 'Loading…' : 'Nothing here.'}
              </div>
            ) : (
              <div className="divide-y divide-line">
                {visible.map((s) => {
                  const isKept = keepIds.has(s.id);
                  const isRemove = removeIds.has(s.id);
                  return (
                    <div
                      key={s.id}
                      ref={(node) => {
                        itemRefs.current[s.id] = node;
                      }}
                      onClick={() => handleSelectFromList(s)}
                      className={cn(
                        'px-3 py-2.5 cursor-pointer transition-colors',
                        s.id === selectedId
                          ? 'bg-pine-6/10'
                          : isRemove
                          ? 'bg-ember/[0.05] hover:bg-ember/[0.08]'
                          : isKept
                          ? 'bg-pine-6/[0.05] hover:bg-pine-6/[0.08]'
                          : 'hover:bg-white',
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-sans font-semibold text-[13px] tracking-[-0.005em] text-ink truncate">
                              {s.name}
                            </span>
                            {s.outsidePolygon && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-ember/15 text-ember text-[9px] font-mono font-bold uppercase tracking-[0.10em]">
                                Outside
                              </span>
                            )}
                            {!s.outsidePolygon && s.nearEdge && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-clay/15 text-clay text-[9px] font-mono font-bold uppercase tracking-[0.10em]">
                                Edge
                              </span>
                            )}
                            {s.inTribal && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-[#dc2626]/15 text-[#dc2626] text-[9px] font-mono font-bold uppercase tracking-[0.10em]">
                                Tribal
                              </span>
                            )}
                            {s.atIntersection && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-clay/15 text-clay text-[9px] font-mono font-bold uppercase tracking-[0.10em]">
                                Intersection
                              </span>
                            )}
                            {s.qualitySampled && (
                              <span
                                className={cn(
                                  'inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-[0.10em]',
                                  s.qualitySampleResult === 'pad_confirms_outside'
                                    ? 'bg-pine-6/15 text-pine-6'      // sampled + agrees with our flag
                                    : s.qualitySampleResult === 'pad_says_inside'
                                    ? 'bg-water/15 text-water'        // sampled + disagrees (false positive)
                                    : 'bg-ink/10 text-ink-3'           // sampled, other result
                                )}
                                title={`Cross-checked against PAD-US Fee Managers: ${s.qualitySampleResult ?? '?'}${s.qualitySamplePadAgency ? ` (${s.qualitySamplePadAgency})` : ''}`}
                              >
                                Sampled
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-ink-3 mt-0.5 font-mono">
                            {reasonLabel(s)}
                            {s.manager && <> · {s.manager}</>}
                            <> · {s.lat.toFixed(5)}, {s.lng.toFixed(5)}</>
                          </div>
                          {s.qualitySampled && (
                            <div className="text-[11px] mt-0.5 font-mono">
                              <span className="text-ink-3">PAD says: </span>
                              <span
                                className={cn(
                                  s.qualitySampleResult === 'pad_says_inside'
                                    ? 'text-water font-bold'
                                    : s.qualitySampleResult === 'pad_confirms_outside'
                                    ? 'text-pine-6 font-bold'
                                    : 'text-ink-3'
                                )}
                              >
                                {s.qualitySampleResult === 'pad_confirms_outside'
                                  ? 'outside (✓ agrees)'
                                  : s.qualitySampleResult === 'pad_says_inside'
                                  ? `inside ${s.qualitySamplePadAgency} (✗ false +)`
                                  : s.qualitySampleResult === 'pad_inside_we_edge'
                                  ? `inside ${s.qualitySamplePadAgency}`
                                  : s.qualitySampleResult ?? '?'}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Vote buttons. Mutually exclusive — clicking the
                            currently-active one clears the vote. */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setVote(s.id, isKept ? null : 'keep');
                            }}
                            title="Mark as legitimate"
                            className={cn(
                              'inline-flex items-center justify-center w-7 h-7 rounded-full transition-colors',
                              isKept
                                ? 'bg-pine-6 text-cream hover:bg-pine-5'
                                : 'text-ink-3 hover:text-pine-6 hover:bg-pine-6/10',
                            )}
                          >
                            <CheckCircle size={14} weight={isKept ? 'fill' : 'regular'} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setVote(s.id, isRemove ? null : 'remove');
                            }}
                            title="Mark for deletion"
                            className={cn(
                              'inline-flex items-center justify-center w-7 h-7 rounded-full transition-colors',
                              isRemove
                                ? 'bg-ember text-cream hover:bg-ember/90'
                                : 'text-ink-3 hover:text-ember hover:bg-ember/10',
                            )}
                          >
                            <XIcon size={14} weight="bold" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Selected detail strip */}
          {selected && (
            <div className="shrink-0 border-t border-line bg-white px-4 py-3 text-[12px]">
              <Mono className="text-pine-6 mb-1">Selected</Mono>
              <div className="font-sans font-semibold text-ink">{selected.name}</div>
              <div className="text-ink-3 mt-1 font-mono">
                {selected.kind} · {selected.source}
                {selected.manager && <> · {selected.manager}</>}
              </div>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${selected.lat},${selected.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-2 text-pine-6 hover:underline text-[11px] font-mono"
                onClick={(e) => e.stopPropagation()}
              >
                Open in Google Maps →
              </a>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};

export default AdminSpotReview;
