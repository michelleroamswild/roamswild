import { useState, useEffect, useCallback } from 'react';
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
        // Fetch spots, campgrounds, and roads in parallel
        // Use high limit to get all spots - client-side handles filtering/display
        const [spotsResponse, campgroundsResponse, roadsResponse] = await Promise.all([
          fetch(
            `${SUPABASE_URL}/functions/v1/dispersed-spots?lat=${lat}&lng=${lng}&radius=${radiusMiles}&include_derived=true&limit=1000`,
            { signal: controller.signal }
          ),
          fetch(
            `${SUPABASE_URL}/functions/v1/dispersed-campgrounds?lat=${lat}&lng=${lng}&radius=${radiusMiles}`,
            { signal: controller.signal }
          ),
          fetch(
            `${SUPABASE_URL}/functions/v1/dispersed-roads?lat=${lat}&lng=${lng}&radius=${radiusMiles}&limit=1000&zoom=${zoom}`,
            { signal: controller.signal }
          ),
        ]);

        if (!spotsResponse.ok) {
          throw new Error(`Spots API error: ${spotsResponse.status}`);
        }
        if (!campgroundsResponse.ok) {
          throw new Error(`Campgrounds API error: ${campgroundsResponse.status}`);
        }

        const spotsData = await spotsResponse.json();
        const campgroundsData = await campgroundsResponse.json();

        // Roads are optional - don't fail if they don't load
        let roadsData: { roads?: DatabaseRoad[] } = { roads: [] };
        if (roadsResponse.ok) {
          roadsData = await roadsResponse.json();
        } else {
          console.warn('Roads API error:', roadsResponse.status);
        }

        // Transform to expected interfaces
        const spots: PotentialSpot[] = (spotsData.spots || []).map((s: DatabaseSpot) => ({
          id: s.id,
          lat: s.lat,
          lng: s.lng,
          name: s.name || s.roadName || 'Dispersed Spot',
          type: s.type,
          score: s.score,
          reasons: s.reasons,
          source: s.source,
          roadName: s.roadName,
          highClearance: s.highClearance,
          isOnMVUMRoad: s.isOnMVUMRoad,
          isOnBLMRoad: s.isOnBLMRoad,
          isOnPublicLand: s.isOnPublicLand,
          passengerReachable: s.passengerReachable,
          highClearanceReachable: s.highClearanceReachable,
          // Classification flag from database (computed using same logic as Full mode)
          isEstablishedCampground: s.isEstablishedCampground,
          // Road accessibility flag (for filtering backcountry/hike-in camps)
          isRoadAccessible: s.isRoadAccessible,
          // Difficulty of the worst nearby road (per spots.extra.access_difficulty)
          accessDifficulty: (s as { accessDifficulty?: string }).accessDifficulty ?? null,
          // The worst-nearby road's tags (road_name, tracktype, smoothness, …)
          accessRoad: (s as { accessRoad?: Record<string, unknown> }).accessRoad ?? null,
          // Public-land-edge proximity flag (catches spots on inholdings)
          nearPublicLandEdge: (s as { nearPublicLandEdge?: boolean }).nearPublicLandEdge ?? false,
          metersFromPublicLandEdge:
            (s as { metersFromPublicLandEdge?: number | null }).metersFromPublicLandEdge ?? null,
          // Stronger flag: spot's coords don't fall inside any public-land polygon.
          outsidePublicLandPolygon:
            (s as { outsidePublicLandPolygon?: boolean }).outsidePublicLandPolygon ?? false,
        }));

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
