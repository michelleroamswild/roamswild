import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { PotentialSpot, EstablishedCampground, MVUMRoad, OSMTrack } from './use-dispersed-roads';
import type { PublicLand } from './use-public-lands';

// Supabase Edge Function base URL
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface DatabaseSpot {
  id: string;
  lat: number;
  lng: number;
  name: string;
  type: 'dead-end' | 'camp-site' | 'intersection';
  score: number;
  reasons: string[];
  source: 'derived';
  roadName?: string;
  highClearance: boolean;
  isOnMVUMRoad: boolean;
  isOnBLMRoad: boolean;
  isOnPublicLand: boolean;
  passengerReachable: boolean;
  highClearanceReachable: boolean;
  status: string;
  managingAgency: string;
  distanceMiles: number;
  // Classification flag for established vs dispersed campground
  isEstablishedCampground?: boolean;
  // Road accessibility flag (for filtering backcountry/hike-in camps)
  isRoadAccessible?: boolean;
  // Raw OSM tags for future use
  osmTags?: Record<string, any>;
}

interface DatabaseCampground {
  id: string;
  name: string;
  lat: number;
  lng: number;
  facilityType: string;
  agencyName?: string;
  reservable: boolean;
  url?: string;
  distanceMiles: number;
}

interface DatabasePublicLand {
  id: string;
  name: string;
  managingAgency: string;
  managingAgencyFull: string;
  unitName?: string;
  lat: number;
  lng: number;
  distance: number;
  polygon?: { lat: number; lng: number }[];
  renderOnMap: boolean;
  vertexCount?: number;
  dispersedCampingAllowed?: boolean;
  landType?: string;
}

interface DatabaseRoad {
  id: string;
  externalId?: string | null;
  name: string;
  sourceType: string;
  vehicleAccess: string;
  coordinates: { lat: number; lng: number }[];
  managingAgency?: string;
  distanceMiles: number;
  // OSM-specific tags
  highway?: string;
  surface?: string;
  tracktype?: string;
  access?: string;
  fourWdOnly?: boolean;
  osmTags?: Record<string, string>;
  // MVUM-specific tags (per-vehicle-class flags, maintenance level)
  mvumTags?: {
    passenger?: boolean;
    high_clearance?: boolean;
    atv?: boolean;
    motorcycle?: boolean;
    operational_maint_level?: string | null;
  };
  seasonalClosure?: string;
}

export interface DispersedDatabaseResult {
  potentialSpots: PotentialSpot[];
  establishedCampgrounds: EstablishedCampground[];
  // Roads from database
  mvumRoads: MVUMRoad[];
  osmTracks: OSMTrack[];
  loading: boolean;
  error: string | null;
  // Database-specific metadata
  fromDatabase: boolean;
}

export interface PublicLandsDatabaseResult {
  publicLands: PublicLand[];
  loading: boolean;
  error: string | null;
  fromDatabase: boolean;
}

/**
 * Hook to fetch dispersed camping data from the PostGIS database.
 * This is a drop-in replacement for useDispersedRoads that uses pre-computed
 * data from the database instead of client-side computation.
 *
 * Falls back to empty results if database is unavailable.
 */
export function useDispersedDatabase(
  lat: number | null,
  lng: number | null,
  radiusMiles: number = 10,
  refreshKey: number = 0,
  zoom: number = 14
): DispersedDatabaseResult {
  const [potentialSpots, setPotentialSpots] = useState<PotentialSpot[]>([]);
  const [establishedCampgrounds, setEstablishedCampgrounds] = useState<EstablishedCampground[]>([]);
  const [mvumRoads, setMvumRoads] = useState<MVUMRoad[]>([]);
  const [osmTracks, setOsmTracks] = useState<OSMTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!lat || !lng || !SUPABASE_URL) {
      setPotentialSpots([]);
      setEstablishedCampgrounds([]);
      setMvumRoads([]);
      setOsmTracks([]);
      return;
    }

    const controller = new AbortController();

    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        // Bbox derived from lat/lng/radius. Rough conversion: 1°lat ≈ 69mi,
        // 1°lng ≈ 50mi at continental-US latitudes. The bbox is a square
        // a little larger than the radius circle (corners ≈ 1.4×); the
        // explorer's downstream client filter chain (false-dead-end,
        // restricted areas, polygon checks, dedup) trims the corners
        // anyway, so the looseness costs nothing.
        const dLat = radiusMiles / 69;
        const dLng = radiusMiles / 50;
        const minLat = lat - dLat;
        const maxLat = lat + dLat;
        const minLng = lng - dLng;
        const maxLng = lng + dLng;

        // Three parallel fetches:
        //   - DIRECT PostgREST query against `spots` for all kinds the
        //     explorer renders. This replaces the old `dispersed-spots`
        //     edge function entirely. The edge fn just wrapped a SELECT
        //     in a slow geography ST_DWithin; every enrichment field
        //     (access_difficulty, access_road, near/outside polygon
        //     flags, osm_tags, derivation_reasons, confidence_score) is
        //     persisted on the row at write time by save-derived-spots /
        //     import-region. So a bbox SELECT covers it without calling
        //     an edge function.
        //   - dispersed-campgrounds edge fn → RIDB-imported campgrounds
        //     (different table, different shape, keep edge fn for now)
        //   - dispersed-roads edge fn → MVUM + OSM roads (server-side
        //     simplification is real work, keep edge fn for now)
        // Split the spots fetch into two narrower queries (camping + utility)
        // running in parallel. The wider 6-kind IN clause was tripping the
        // planner into seq-scan during high-write windows; smaller IN sets
        // stick to the index more reliably and fail/recover independently.
        const spotsCommonSelect =
          'id, name, description, latitude, longitude, kind, sub_kind, source, public_land_manager, public_land_unit, public_land_designation, land_type, amenities, extra';

        const [campingSpotsResult, utilitySpotsResult, campgroundsResponse, roadsResponse] = await Promise.all([
          supabase
            .from('spots')
            .select(spotsCommonSelect)
            .in('kind', ['dispersed_camping', 'established_campground', 'informal_camping'])
            .gte('latitude', minLat)
            .lte('latitude', maxLat)
            .gte('longitude', minLng)
            .lte('longitude', maxLng)
            .limit(2000)
            .abortSignal(controller.signal)
            .then((res) => res, (err) => ({ data: null, error: err as Error })),
          supabase
            .from('spots')
            .select(spotsCommonSelect)
            .in('kind', ['water', 'shower', 'laundromat'])
            .gte('latitude', minLat)
            .lte('latitude', maxLat)
            .gte('longitude', minLng)
            .lte('longitude', maxLng)
            .limit(500)
            .abortSignal(controller.signal)
            .then((res) => res, (err) => ({ data: null, error: err as Error })),
          fetch(
            `${SUPABASE_URL}/functions/v1/dispersed-campgrounds?lat=${lat}&lng=${lng}&radius=${radiusMiles}`,
            { signal: controller.signal }
          ),
          fetch(
            `${SUPABASE_URL}/functions/v1/dispersed-roads?lat=${lat}&lng=${lng}&radius=${radiusMiles}&limit=1000&zoom=${zoom}`,
            { signal: controller.signal }
          ),
        ]);

        // Camping query is required; utility query is best-effort — if the
        // DB stresses out and only the wider one fails, we still want
        // camping spots to render. Log the failure and continue.
        if (campingSpotsResult.error) {
          throw new Error(`Spots query failed: ${campingSpotsResult.error.message ?? campingSpotsResult.error}`);
        }
        if (utilitySpotsResult.error) {
          console.warn('Utility spots query failed (continuing without):', utilitySpotsResult.error.message ?? utilitySpotsResult.error);
        }

        // Merge — same shape, just two source queries.
        const spotsResult = {
          data: [
            ...(campingSpotsResult.data ?? []),
            ...(utilitySpotsResult.data ?? []),
          ],
          error: null as null,
        };
        if (!campgroundsResponse.ok) {
          console.warn(`Campgrounds API error: ${campgroundsResponse.status}`);
        }

        const campgroundsData = campgroundsResponse.ok ? await campgroundsResponse.json() : { campgrounds: [] };

        // Roads are optional - don't fail if they don't load
        let roadsData: { roads?: DatabaseRoad[] } = { roads: [] };
        if (roadsResponse.ok) {
          roadsData = await roadsResponse.json();
        } else {
          console.warn('Roads API error:', roadsResponse.status);
        }

        // Map raw spot rows → PotentialSpot. Pulls every enrichment
        // field straight from the row (column or extra/amenities) — no
        // computation, no derivation. Mirrors what dispersed-spots
        // edge fn used to reshape, but locally and faster.
        type RawSpot = {
          id: string;
          name: string | null;
          description: string | null;
          latitude: number;
          longitude: number;
          kind: string;
          sub_kind: string | null;
          source: string;
          public_land_manager: string | null;
          public_land_unit: string | null;
          public_land_designation: string | null;
          land_type: string | null;
          amenities: Record<string, unknown> | null;
          extra: Record<string, unknown> | null;
        };
        const rawSpots: RawSpot[] = Array.isArray(spotsResult.data) ? (spotsResult.data as RawSpot[]) : [];
        const haversineMiles = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
          const R = 3959;
          const dLat = (b.lat - a.lat) * Math.PI / 180;
          const dLng = (b.lng - a.lng) * Math.PI / 180;
          const s = Math.sin(dLat / 2) ** 2
            + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
          return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
        };
        const statusPriority = (status: string | undefined): number => {
          if (status === 'admin_verified') return 0;
          if (status === 'user_confirmed') return 1;
          return 2;
        };

        // Sort raw rows BEFORE mapping so we can read status + score
        // straight from extra without round-tripping through the
        // mapped shape. status priority → confidence DESC → distance
        // ASC mirrors the old get_dispersed_spots ORDER BY exactly.
        rawSpots.sort((ra, rb) => {
          const ea = (ra.extra ?? {}) as Record<string, unknown>;
          const eb = (rb.extra ?? {}) as Record<string, unknown>;
          const sa = statusPriority(ea.status as string | undefined);
          const sb = statusPriority(eb.status as string | undefined);
          if (sa !== sb) return sa - sb;
          const ca = typeof ea.confidence_score === 'number' ? (ea.confidence_score as number) : 0;
          const cb = typeof eb.confidence_score === 'number' ? (eb.confidence_score as number) : 0;
          if (ca !== cb) return cb - ca;
          const da = haversineMiles({ lat, lng }, { lat: ra.latitude, lng: ra.longitude });
          const db = haversineMiles({ lat, lng }, { lat: rb.latitude, lng: rb.longitude });
          return da - db;
        });

        const spots: PotentialSpot[] = rawSpots.map((row) => {
          const extra = (row.extra ?? {}) as Record<string, unknown>;
          const amen = (row.amenities ?? {}) as Record<string, unknown>;
          const isCamp = row.kind === 'established_campground' || row.sub_kind === 'known';
          const type: PotentialSpot['type'] = isCamp ? 'camp-site' : 'dead-end';
          const isMvumAgency = row.public_land_manager === 'USFS' || row.public_land_manager === 'FS';
          const isBlmAgency = row.public_land_manager === 'BLM';
          // Map DB source enum → PotentialSpot source enum
          const sourceMap: Record<string, PotentialSpot['source']> = {
            osm: 'osm', mvum: 'mvum', blm: 'blm', usfs: 'mvum', derived: 'derived', community: 'derived', user_added: 'derived',
          };
          const mapped = sourceMap[row.source] ?? 'derived';
          const dbSource = row.source;
          const vehicleReq = (amen.vehicle_required as string | undefined) ?? null;
          return {
            id: row.id,
            lat: row.latitude,
            lng: row.longitude,
            name: row.name || (extra.road_name as string | undefined) || (extra.name_original as string | undefined) || (isCamp ? 'Campsite' : 'Dispersed spot'),
            type,
            kind: row.kind,
            subKind: row.sub_kind ?? undefined,
            description: row.description ?? undefined,
            score: typeof extra.confidence_score === 'number' ? (extra.confidence_score as number) : 0,
            reasons: Array.isArray(extra.derivation_reasons) ? (extra.derivation_reasons as string[]) : [],
            source: mapped,
            dbSource,
            amenities: amen,
            roadName: (extra.road_name as string | undefined) ?? undefined,
            highClearance: vehicleReq !== 'passenger',
            isOnMVUMRoad: isMvumAgency,
            isOnBLMRoad: isBlmAgency,
            isOnPublicLand: row.land_type === 'public',
            passengerReachable: extra.is_passenger_reachable === true || vehicleReq === 'passenger',
            highClearanceReachable: extra.is_high_clearance_reachable !== false && vehicleReq !== '4wd',
            isEstablishedCampground: row.kind === 'established_campground',
            isRoadAccessible: extra.is_road_accessible !== false,
            accessDifficulty: (extra.access_difficulty as string | undefined) ?? null,
            accessRoad: (extra.access_road as Record<string, unknown> | undefined) ?? null,
            nearPublicLandEdge: extra.near_public_land_edge === true,
            metersFromPublicLandEdge:
              typeof extra.meters_from_public_land_edge === 'number'
                ? (extra.meters_from_public_land_edge as number)
                : null,
            outsidePublicLandPolygon: extra.outside_public_land_polygon === true,
            osmTags: (extra.osm_tags as Record<string, string> | undefined) ?? undefined,
            landName: row.public_land_unit ?? undefined,
            landProtectClass: row.public_land_designation ?? undefined,
            landProtectionTitle: row.public_land_designation ?? undefined,
          };
        });


        const campgrounds: EstablishedCampground[] = (campgroundsData.campgrounds || []).map(
          (c: DatabaseCampground) => ({
            id: c.id,
            name: c.name,
            lat: c.lat,
            lng: c.lng,
            facilityType: c.facilityType,
            agencyName: c.agencyName,
            reservable: c.reservable,
            url: c.url,
          })
        );

        // Transform roads to MVUM/OSM format for backwards compatibility
        const dbRoads = roadsData.roads || [];
        const transformedMvumRoads: MVUMRoad[] = dbRoads
          .filter((r: DatabaseRoad) => r.sourceType === 'mvum')
          .map((r: DatabaseRoad) => ({
            // Use external_id (USFS OBJECTID) when present so dedup/identity
            // matches the live MVUM API; fall back to row UUID.
            id: r.externalId || r.id,
            name: r.name,
            surfaceType: r.surface || '',
            // Prefer mvum_tags when present (richer); fall back to inferring
            // from vehicle_access enum for older rows that predate the JSONB.
            highClearanceVehicle:
              r.mvumTags?.high_clearance ?? (r.vehicleAccess !== 'passenger'),
            passengerVehicle:
              r.mvumTags?.passenger ?? (r.vehicleAccess === 'passenger'),
            atv: r.mvumTags?.atv ?? false,
            motorcycle: r.mvumTags?.motorcycle ?? false,
            seasonal: r.seasonalClosure || '',
            operationalMaintLevel: r.mvumTags?.operational_maint_level || '',
            geometry: {
              type: 'LineString' as const,
              coordinates: (r.coordinates || []).map(c => [c.lng, c.lat] as [number, number]),
            },
          }));

        const transformedOsmTracks: OSMTrack[] = dbRoads
          .filter((r: DatabaseRoad) => r.sourceType === 'osm')
          .map((r: DatabaseRoad) => {
            // external_id is stored as `osm_<wayId>` — strip the prefix
            // before parseInt so the resulting id is a real OSM way id.
            // Required for /way/{id} links and /api/0.6/way/{id}/history.
            const raw = r.externalId ?? '';
            const digits = raw.startsWith('osm_') ? raw.slice(4) : raw;
            const wayId = parseInt(digits, 10);
            return ({
            id: Number.isFinite(wayId) ? wayId : Math.random(),
            name: r.name,
            highway: r.highway || 'track',
            surface: r.surface,
            tracktype: r.tracktype,
            access: r.access,
            fourWdOnly: r.fourWdOnly || r.vehicleAccess === '4wd',
            geometry: {
              type: 'LineString' as const,
              coordinates: (r.coordinates || []).map(c => [c.lng, c.lat] as [number, number]),
            },
            osmTags: r.osmTags,
            });
          });

        setPotentialSpots(spots);
        setEstablishedCampgrounds(campgrounds);
        setMvumRoads(transformedMvumRoads);
        setOsmTracks(transformedOsmTracks);
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.error('Error fetching from database:', err);
        setError(err.message);
        // Clear data on error
        setPotentialSpots([]);
        setEstablishedCampgrounds([]);
        setMvumRoads([]);
        setOsmTracks([]);
      } finally {
        setLoading(false);
      }
    }

    fetchData();

    return () => controller.abort();
  }, [lat, lng, radiusMiles, refreshKey]);

  return {
    potentialSpots,
    establishedCampgrounds,
    mvumRoads,
    osmTracks,
    loading,
    error,
    fromDatabase: true,
  };
}

/**
 * Hook to fetch public lands from the PostGIS database.
 * This is a drop-in replacement for usePublicLands.
 */
export function usePublicLandsDatabase(
  centerLat: number,
  centerLng: number,
  radiusMiles: number = 10
): PublicLandsDatabaseResult {
  const [publicLands, setPublicLands] = useState<PublicLand[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!centerLat || !centerLng || !SUPABASE_URL) {
      setPublicLands([]);
      return;
    }

    const controller = new AbortController();

    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `${SUPABASE_URL}/functions/v1/dispersed-public-lands?lat=${centerLat}&lng=${centerLng}&radius=${radiusMiles}&include_geometry=true`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error(`Public lands API error: ${response.status}`);
        }

        const data = await response.json();

        const lands: PublicLand[] = (data.publicLands || []).map((l: DatabasePublicLand) => ({
          id: l.id,
          name: l.name,
          managingAgency: l.managingAgency,
          managingAgencyFull: l.managingAgencyFull,
          unitName: l.unitName,
          lat: l.lat,
          lng: l.lng,
          distance: l.distance,
          polygon: l.polygon,
          renderOnMap: l.renderOnMap,
          vertexCount: l.vertexCount,
        }));

        setPublicLands(lands);
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.error('Error fetching public lands from database:', err);
        setError(err.message);
        setPublicLands([]);
      } finally {
        setLoading(false);
      }
    }

    fetchData();

    return () => controller.abort();
  }, [centerLat, centerLng, radiusMiles]);

  return {
    publicLands,
    loading,
    error,
    fromDatabase: true,
  };
}

/**
 * Combined hook that uses database APIs with fallback to client-side computation.
 * Tries database first, falls back to original hooks if database fails or is empty.
 */
export function useDispersedWithFallback(
  lat: number | null,
  lng: number | null,
  radiusMiles: number = 10,
  options: { preferDatabase?: boolean } = {}
): DispersedDatabaseResult & { usingFallback: boolean } {
  const { preferDatabase = true } = options;

  const dbResult = useDispersedDatabase(lat, lng, radiusMiles);

  // If preferDatabase is false or database returns no data, we could fall back
  // For now, just return database results
  // Fallback to client-side would require importing useDispersedRoads

  const hasData = dbResult.potentialSpots.length > 0 || dbResult.establishedCampgrounds.length > 0;

  return {
    ...dbResult,
    usingFallback: !preferDatabase || (!hasData && !dbResult.loading),
  };
}
