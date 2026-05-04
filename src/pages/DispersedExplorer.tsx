import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useSearchParams, useLocation, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { MapPin, MagnifyingGlass, Path, SpinnerGap, Tent, Drop, MapPinLine, Jeep, Funnel, ArrowRight, Plus, Minus, Copy, CheckCircle } from '@phosphor-icons/react';
import { supabase } from '@/integrations/supabase/client';
import { LocationSelector, SelectedLocation } from '@/components/LocationSelector';
import { useDispersedRoads, MVUMRoad, OSMTrack, PotentialSpot, EstablishedCampground } from '@/hooks/use-dispersed-roads';
import { usePublicLands } from '@/hooks/use-public-lands';
import { useDispersedDatabase } from '@/hooks/use-dispersed-database';
import { useRegionCache, type MapBounds } from '@/hooks/use-region-cache';
import { useCampsites } from '@/context/CampsitesContext';
import { useFriends } from '@/context/FriendsContext';
import { useAuth } from '@/context/AuthContext';
import { useGoogleMaps } from '@/components/GoogleMapsProvider';
import { Header } from '@/components/Header';
import { ConfirmSpotDialog } from '@/components/ConfirmSpotDialog';
import { AddCampsiteModal } from '@/components/AddCampsiteModal';
import type { Campsite } from '@/types/campsite';
import { isPointInPolygon, isWithinAnyPublicLand, findContainingLand, isFalseDeadEnd } from '@/utils/dispersedExplorer';
import { FloatingLegend } from '@/components/dispersed-explorer/FloatingLegend';
import { BulkPanPanel } from '@/components/dispersed-explorer/BulkPanPanel';
import { MobileViewTabs } from '@/components/dispersed-explorer/MobileViewTabs';
import { ResultsStatsRow } from '@/components/dispersed-explorer/ResultsStatsRow';
import { SpotFiltersPanel } from '@/components/dispersed-explorer/SpotFiltersPanel';
import { SpotResultsList } from '@/components/dispersed-explorer/SpotResultsList';
import { SpotDetailPanel } from '@/components/dispersed-explorer/SpotDetailPanel';
import { CampgroundDetailPanel } from '@/components/dispersed-explorer/CampgroundDetailPanel';
import { UserCampsiteDetailPanel } from '@/components/dispersed-explorer/UserCampsiteDetailPanel';
import { RoadDetailPanel } from '@/components/dispersed-explorer/RoadDetailPanel';
import { DispersedMap } from '@/components/dispersed-explorer/DispersedMap';
import type { UnifiedSpot } from '@/components/dispersed-explorer/types';
import { MapControls, type MapType } from '@/components/MapControls';
import { Mono } from '@/components/redesign';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { AccountAvatarMenu } from '@/components/AccountAvatarMenu';


const DispersedExplorer = () => {
  const { isLoaded } = useGoogleMaps();
  const [searchParams, setSearchParams] = useSearchParams();
  const routerLocation = useLocation();
  const navState = routerLocation.state as { lat?: number; lng?: number; name?: string } | null;

  const initialLocation = navState?.lat && navState?.lng
    ? { lat: navState.lat, lng: navState.lng, name: navState.name || 'Search Result' }
    : { lat: 38.5733, lng: -109.5498, name: 'Moab, UT' };

  const [searchLocation, setSearchLocation] = useState<SelectedLocation | null>(initialLocation);
  const [initialLocationLoaded, setInitialLocationLoaded] = useState(false);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: initialLocation.lat, lng: initialLocation.lng });
  const [mapZoom, setMapZoom] = useState(12);
  const [selectedRoad, setSelectedRoad] = useState<MVUMRoad | OSMTrack | null>(null);
  const [selectedSpot, setSelectedSpot] = useState<PotentialSpot | null>(null);
  // Land-overlay agency toggles. Tribal lands are on by default so spots
  // inside reservations are visually flagged without the user needing to
  // hunt for a toggle. All other agencies start off.
  // Keys: 'USFS', 'BLM', 'NPS', 'STATE_PARK', 'STATE_TRUST', 'LAND_TRUST', 'TRIBAL'.
  const [visibleLandAgencies, setVisibleLandAgencies] = useState<Set<string>>(new Set(['TRIBAL']));
  const toggleLandAgency = useCallback((key: string) => {
    setVisibleLandAgencies((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  // Soft-delete queue, shared with AdminSpotReview via localStorage. Marking
  // a spot here hides it from the map + list locally and adds its UUID to
  // the same queue AdminSpotReview's "Delete N spots" button operates on.
  const REMOVE_STORAGE_KEY = 'admin-spot-review-remove-v1';
  const [removeIds, setRemoveIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(REMOVE_STORAGE_KEY);
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(REMOVE_STORAGE_KEY, JSON.stringify([...removeIds]));
    } catch {
      // localStorage may be unavailable (private mode, quota); not fatal —
      // the in-memory Set still hides spots for this session.
    }
  }, [removeIds]);
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key !== REMOVE_STORAGE_KEY) return;
      try {
        setRemoveIds(new Set(JSON.parse(e.newValue || '[]') as string[]));
      } catch {
        setRemoveIds(new Set());
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);
  // Quick "Save spot" flow — bookmark only, no confirmation/notes dialog.
  // The dialog version is still triggered by onConfirm → setConfirmDialogOpen.
  const handleSaveSpot = useCallback(async () => {
    const spot = selectedSpot;
    if (!spot) return;
    const result = await saveExplorerSpot(spot);
    if (result) {
      toast.success(`Saved "${result.name}"`, {
        description: 'Added to your campsites.',
      });
    } else {
      toast.error('Failed to save spot');
    }
  }, [selectedSpot, saveExplorerSpot]);

  const handleMarkForDelete = useCallback(() => {
    const id = selectedSpot?.id;
    if (!id) return;
    // Only DB-backed (UUID) spots can be queued — AdminSpotReview deletes
    // by UUID. Client-derived prefixed ids (e.g. "deadend-...") would be
    // a no-op there. Just close the panel in that case.
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      setSelectedSpot(null);
      return;
    }
    // Toggle: clicking the trash on a marked spot un-marks it. Panel stays
    // open so the icon swap (trash ↔ filled check) gives instant feedback
    // and the user can undo without re-finding the spot.
    setRemoveIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [selectedSpot]);

  const [bulkPanOpen, setBulkPanOpen] = useState(false);
  const [roadFilter, setRoadFilter] = useState<'all' | 'passenger' | 'high-clearance' | '4wd'>('all');
  // Multi-select filter for spot types/confidence - empty set means show all
  const [spotFilters, setSpotFilters] = useState<Set<string>>(new Set());
  // Source sub-filter under Dispersed (Known / Derived / Community).
  // Empty set = all sources. Only applied when 'dispersed' is in spotFilters.
  const [dispersedSourceFilters, setDispersedSourceFilters] = useState<Set<string>>(new Set());
  const toggleDispersedSource = useCallback((key: string) => {
    setDispersedSourceFilters(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);
  // Source-bucket classifier (Known / Derived / Community) for the
  // Dispersed sub-filter. Reads sub_kind first because legacy rows carry
  // provenance there ('community' / 'derived' / 'known' values that
  // pre-date the source field), then falls back to dbSource for newer
  // rows. Runtime-derived spots (no DB id, from road geometry) have
  // neither and land in 'derived' via the fallback.
  const classifyDispersedSource = (spot: PotentialSpot): 'known' | 'derived' | 'community' => {
    if (spot.dbSource === 'community') return 'community';
    if (spot.subKind === 'derived')   return 'derived';
    if (spot.subKind === 'known')     return 'known';
    const s = spot.dbSource;
    if (s === 'community' || s === 'user_added') return 'community';
    if (!s || s === 'derived') return 'derived';
    return 'known';  // ridb / usfs / blm / nps / fws / mvum / padus / osm
  };
  // True only for algorithmically-derived dispersed spots. Heuristic
  // filters (false-dead-end, near-campground, score gate, dedup) apply
  // ONLY to these — Known + Community + Utilities are vouched-for data
  // and skip every heuristic gate.
  const isAlgorithmicDerived = (spot: PotentialSpot): boolean => {
    // Anything that isn't a dispersed-camping row isn't algorithmic.
    // Utilities, established_campground, informal_camping → not derived.
    if (spot.kind && spot.kind !== 'dispersed_camping') return false;
    return classifyDispersedSource(spot) === 'derived';
  };
  const [recommendationPage, setRecommendationPage] = useState(0);
  const [spotsToShow, setSpotsToShow] = useState(30);
  const [osrmDistances, setOsrmDistances] = useState<Record<string, number>>({});
  const [osrmLoading, setOsrmLoading] = useState(false);
  const [copiedCoords, setCopiedCoords] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<{
    campabilityScore: number;
    summary: string;
    ground: { rating: string; detail: string };
    access: { rating: string; detail: string };
    cover: { rating: string; detail: string };
    hazards: { rating: string; detail: string };
    trail: { rating: string; detail: string } | null;
    bestUse: string;
    confidence: string;
    confidenceNote?: string;
  } | null>(null);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiCheckingCache, setAiCheckingCache] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const analysisCache = useRef<Map<string, typeof aiAnalysis>>(new Map());
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [existingCampsiteForSpot, setExistingCampsiteForSpot] = useState<Campsite | null>(null);
  const [sortBy, setSortBy] = useState<'distance' | 'rating' | 'recommended'>('recommended');
  const mapRef = useRef<google.maps.Map | null>(null);
  // Mirror the map instance in state so MapControls re-renders when the map
  // finishes loading (refs alone don't trigger updates).
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  // Map imagery — controlled by the styled MapControls overlay (Google's
  // default mapType chrome is disabled).
  const [mapTypeId, setMapTypeId] = useState<MapType>('hybrid');

  const { findExistingExplorerSpot, getExplorerSpots, saveExplorerSpot, campsites, friendsCampsites } = useCampsites();
  const { getFriendById } = useFriends();
  const { user } = useAuth();
  const [explorerSpots, setExplorerSpots] = useState<Campsite[]>([]);
  const [showMyCampsites, setShowMyCampsites] = useState(true);
  const [showFriendsCampsites, setShowFriendsCampsites] = useState(true);
  const [mobileView, setMobileView] = useState<'list' | 'map'>('list');
  const [mapTapPoint, setMapTapPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [saveFromMapOpen, setSaveFromMapOpen] = useState(false);
  const [selectedCampsite, setSelectedCampsite] = useState<Campsite | null>(null);

  // Toggle between database (fast) and client-side (comprehensive with roads) data sources.
  // Flipped to true when a loaded_regions cache hit covers the search area.
  const [useDatabase, setUseDatabase] = useState(false);

  // Region cache state
  const [cacheChecked, setCacheChecked] = useState(false);
  const [lastAnalysedAt, setLastAnalysedAt] = useState<Date | null>(null);
  const [reanalyseBust, setReanalyseBust] = useState(0);
  // True between Re-analyse click and save completion. While true, useDispersedRoads
  // fires alongside DB mode so we can refresh data without going pin-less.
  const [refreshing, setRefreshing] = useState(false);

  // Filter card collapse — when loading, the panel stays as a small pill so
  // the empty filter shell doesn't flash. Auto-expands when results land.
  const [filterCardOpen, setFilterCardOpen] = useState(false);
  const wasLoadingRef = useRef(false);
  // Bumped after a save to force useDispersedDatabase to refetch (so DB pins update).
  const [dbRefreshKey, setDbRefreshKey] = useState(0);
  const { checkRegionCache, saveRegionToCache } = useRegionCache();
  const regionSavedRef = useRef<string | null>(null);

  const RADIUS_MILES = 10;

  // Convert search location + radius to a bbox (approx — 1° lat ≈ 69 mi).
  const computeBounds = useCallback((lat: number, lng: number): MapBounds => {
    const dLat = RADIUS_MILES / 69;
    const dLng = RADIUS_MILES / (69 * Math.cos((lat * Math.PI) / 180));
    return {
      north: lat + dLat,
      south: lat - dLat,
      east: lng + dLng,
      west: lng - dLng,
    };
  }, []);


  // Database hooks - fast pre-computed spots, campgrounds, and roads
  const {
    potentialSpots: dbSpots,
    establishedCampgrounds: dbCampgrounds,
    mvumRoads: dbMvumRoads,
    osmTracks: dbOsmTracks,
    loading: dbLoading,
    error: dbError,
  } = useDispersedDatabase(
    searchLocation?.lat ?? null,
    searchLocation?.lng ?? null,
    10,
    dbRefreshKey,
    mapZoom
  );

  // Always use client-side for public lands (database has fragmented polygons)
  const { publicLands: clientPublicLands, loading: clientPublicLandsLoading } = usePublicLands(
    searchLocation?.lat ?? 0,
    searchLocation?.lng ?? 0,
    10
  );

  // Debug logging for public lands
  useEffect(() => {
    if (clientPublicLands.length > 0) {
      const byAgency: Record<string, { total: number; renderable: number; withPolygon: number }> = {};
      clientPublicLands.forEach(l => {
        if (!byAgency[l.managingAgency]) {
          byAgency[l.managingAgency] = { total: 0, renderable: 0, withPolygon: 0 };
        }
        byAgency[l.managingAgency].total++;
        if (l.polygon && l.polygon.length > 0) byAgency[l.managingAgency].withPolygon++;
        if (l.renderOnMap) byAgency[l.managingAgency].renderable++;
      });
      console.log('[DispersedExplorer] Public lands loaded:', clientPublicLands.length);
      console.log('[DispersedExplorer] By agency:', byAgency);

      // Specific BLM debugging
      const blmLands = clientPublicLands.filter(l => l.managingAgency === 'BLM');
      if (blmLands.length > 0) {
        console.log('[DispersedExplorer] BLM lands:', blmLands.map(l => ({
          id: l.id,
          name: l.name,
          hasPolygon: !!l.polygon,
          vertexCount: l.polygon?.length || 0,
          renderOnMap: l.renderOnMap,
        })));
      } else {
        console.log('[DispersedExplorer] WARNING: No BLM lands in clientPublicLands array!');
      }
    }
  }, [clientPublicLands]);


  // Client-side hooks for roads/spots - only fetch when not using database
  const {
    mvumRoads: clientMvumRoads,
    blmRoads: clientBlmRoads,
    osmTracks: clientOsmTracks,
    potentialSpots: clientSpots,
    establishedCampgrounds: clientCampgrounds,
    loading: clientLoading,
    error: clientError,
  } = useDispersedRoads(
    // Fire when in client mode OR mid-refresh (Re-analyse runs alongside DB mode
    // so the user keeps seeing pins while we fetch fresh data in the background).
    (!useDatabase || refreshing) ? (searchLocation?.lat ?? null) : null,
    (!useDatabase || refreshing) ? (searchLocation?.lng ?? null) : null,
    RADIUS_MILES,
    reanalyseBust
  );

  // Hybrid approach: database for spots/campgrounds/roads, client-side for public lands
  const mvumRoads = useDatabase ? dbMvumRoads : clientMvumRoads;
  const osmTracks = useDatabase ? dbOsmTracks : clientOsmTracks;
  const potentialSpots = useDatabase ? dbSpots : clientSpots;
  const establishedCampgrounds = useDatabase ? dbCampgrounds : clientCampgrounds;
  const loading = useDatabase ? dbLoading : clientLoading;
  const error = useDatabase ? dbError : clientError;

  // Auto-fallback: if DB mode finished loading and returned nothing for
  // this bbox (empty region, edge-function blip, auth issue), flip the
  // toggle off so the entire client path takes over. The client hook
  // ran in parallel because the !useDatabase gate at line ~260 only
  // suppresses Overpass fetches when DB hasn't been asked yet — once
  // refreshing or the cache miss kicks it on, client data is ready to
  // step in. This keeps downstream `useDatabase` branches coherent
  // instead of mixing source-mode logic across the file.
  useEffect(() => {
    if (
      useDatabase &&
      !dbLoading &&
      dbSpots.length === 0 &&
      dbMvumRoads.length === 0 &&
      dbOsmTracks.length === 0 &&
      dbCampgrounds.length === 0
    ) {
      console.log('[DispersedExplorer] DB returned empty for this bbox — switching to client/Overpass mode');
      setUseDatabase(false);
    }
  }, [useDatabase, dbLoading, dbSpots.length, dbMvumRoads.length, dbOsmTracks.length, dbCampgrounds.length]);

  // Auto-expand the filter panel when results land. Tracks the loading edge
  // so we only fire on the true→false transition, not on every re-render.
  useEffect(() => {
    if (wasLoadingRef.current && !loading) {
      setFilterCardOpen(true);
    }
    if (!searchLocation) {
      // Collapse back to the pill when the user clears their search.
      setFilterCardOpen(false);
    }
    wasLoadingRef.current = loading;
  }, [loading, searchLocation]);
  // Always use client public lands (complete boundaries from direct API)
  const publicLands = clientPublicLands;
  const publicLandsLoading = clientPublicLandsLoading;

  // Selected established campground
  const [selectedCampground, setSelectedCampground] = useState<EstablishedCampground | null>(null);

  // Handle URL parameters for initial location.
  //   ?lat=&lng=&name=   — center the map (e.g. "Find camps near me")
  //   ?spotId=<uuid>     — center the map AND open the detail panel for that
  //                        specific spot. Deep-link target from homepage cards.
  useEffect(() => {
    if (initialLocationLoaded) return;

    const lat = searchParams.get('lat');
    const lng = searchParams.get('lng');
    const name = searchParams.get('name');
    const spotId = searchParams.get('spotId');

    if (spotId) {
      // Fetch the row from the unified spots table and shape it into the
      // PotentialSpot the detail panel expects. Most of the road/access fields
      // live in `extra` JSONB on derived spots; we read what's there and let
      // the detail panel skip sections for fields it doesn't find.
      (async () => {
        const { data, error } = await supabase
          .from('spots')
          .select(
            'id, name, latitude, longitude, kind, source, public_land_manager, source_external_id, extra',
          )
          .eq('id', spotId)
          .maybeSingle();
        if (error || !data) {
          console.warn('[deep-link] spot not found:', spotId, error);
          setInitialLocationLoaded(true);
          return;
        }
        type SpotRow = {
          id: string;
          name: string | null;
          latitude: number | string;
          longitude: number | string;
          kind: string;
          source: string;
          public_land_manager: string | null;
          source_external_id: string | null;
          extra: Record<string, unknown> | null;
        };
        const row = data as unknown as SpotRow;
        const parsedLat = typeof row.latitude === 'string' ? parseFloat(row.latitude) : row.latitude;
        const parsedLng = typeof row.longitude === 'string' ? parseFloat(row.longitude) : row.longitude;
        const extra = row.extra ?? {};
        const reasons = Array.isArray((extra as { reasons?: unknown }).reasons)
          ? ((extra as { reasons: string[] }).reasons)
          : [];
        const spot: PotentialSpot = {
          id: row.id,
          lat: parsedLat,
          lng: parsedLng,
          name: row.name || 'Dispersed Spot',
          type: row.kind === 'established_campground' ? 'camp-site' : 'dead-end',
          score: ((extra as { score?: number }).score) ?? 0,
          reasons,
          source: row.source as PotentialSpot['source'],
          roadName: (extra as { road_name?: string }).road_name,
          isOnMVUMRoad: row.public_land_manager === 'USFS',
          isOnBLMRoad: row.public_land_manager === 'BLM',
          isOnPublicLand: !!row.public_land_manager,
          accessDifficulty:
            ((extra as { access_difficulty?: PotentialSpot['accessDifficulty'] }).access_difficulty) ?? null,
          accessRoad:
            ((extra as { access_road?: PotentialSpot['accessRoad'] }).access_road) ?? null,
        };
        setSearchLocation({ lat: parsedLat, lng: parsedLng, name: spot.name });
        setMapCenter({ lat: parsedLat, lng: parsedLng });
        setMapZoom(15);
        setSelectedSpot(spot);
        setInitialLocationLoaded(true);
      })();
      return;
    }

    if (lat && lng) {
      const parsedLat = parseFloat(lat);
      const parsedLng = parseFloat(lng);

      if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
        const location: SelectedLocation = {
          lat: parsedLat,
          lng: parsedLng,
          name: name || 'My Location',
        };
        setSearchLocation(location);
        setMapCenter({ lat: parsedLat, lng: parsedLng });
        setMapZoom(12);
      }
    }
    setInitialLocationLoaded(true);
  }, [searchParams, initialLocationLoaded]);

  // Mirror the currently-selected spot into the URL as ?spotId=<uuid>. Makes
  // every spot a shareable deep-link — the user can copy the address bar and
  // anyone who opens it lands on the same spot with the detail panel open.
  // Uses replace:true so navigating between spots doesn't bloat history, and
  // skips the sync until the initial-load effect has run so we don't fight it.
  useEffect(() => {
    if (!initialLocationLoaded) return;
    const currentSpotId = searchParams.get('spotId');
    const desiredSpotId = selectedSpot?.id ?? null;
    if (currentSpotId === desiredSpotId) return;
    const next = new URLSearchParams(searchParams);
    if (desiredSpotId) {
      next.set('spotId', desiredSpotId);
      // Drop the lat/lng/name combo — they were the alternate "center map"
      // entry path and are stale once we have a specific spot selected.
      next.delete('lat');
      next.delete('lng');
      next.delete('name');
    } else {
      next.delete('spotId');
    }
    setSearchParams(next, { replace: true });
  }, [selectedSpot?.id, initialLocationLoaded, searchParams, setSearchParams]);

  // Region cache: check if this area has been analysed before.
  // Hit → flip useDatabase=true so the database hook takes over.
  // Miss → keep useDatabase=false so the client hook runs a fresh analysis.
  useEffect(() => {
    if (!searchLocation) {
      setCacheChecked(false);
      setLastAnalysedAt(null);
      setUseDatabase(false);
      setRefreshing(false);
      regionSavedRef.current = null;
      return;
    }

    // During Re-analyse refresh, keep the existing useDatabase state and skip
    // the RPC — the user is already viewing cached data and we're just adding
    // a background fetch + save. No need to re-check the cache mid-refresh.
    if (refreshing) {
      setCacheChecked(true);
      return;
    }

    setCacheChecked(false);
    let cancelled = false;
    const bounds = computeBounds(searchLocation.lat, searchLocation.lng);

    checkRegionCache(bounds).then((result) => {
      if (cancelled) return;
      if (result.cached) {
        console.log('[RegionCache] → Switching to DATABASE mode (cache hit)');
        setUseDatabase(true);
        setLastAnalysedAt(result.analysedAt ?? null);
      } else {
        console.log('[RegionCache] → Staying in CLIENT mode (cache miss)');
        setUseDatabase(false);
        setLastAnalysedAt(null);
      }
      setCacheChecked(true);
    });

    return () => { cancelled = true; };
    // reanalyseBust intentionally in deps — force re-check after Re-analyse.
  }, [searchLocation, reanalyseBust, refreshing, checkRegionCache, computeBounds]);

  // Background save: after a fresh client analysis completes, persist to the
  // region cache so the next visitor in this area gets a cache hit.
  useEffect(() => {
    // Every run of this effect, log the conditions so it's visible why
    // a save is or isn't firing.
    const state = {
      useDatabase,
      hasSearchLocation: !!searchLocation,
      cacheChecked,
      clientLoading,
      clientSpotsCount: clientSpots.length,
      reanalyseBust,
    };
    console.log('[RegionCache][save-effect] state:', state);

    if (useDatabase && !refreshing) {
      console.log('[RegionCache][save-effect] ⏭  skip — in DATABASE mode, nothing to save');
      return;
    }
    if (!searchLocation) {
      console.log('[RegionCache][save-effect] ⏭  skip — no searchLocation');
      return;
    }
    if (!cacheChecked) {
      console.log('[RegionCache][save-effect] ⏭  skip — cache check not complete yet');
      return;
    }
    if (clientLoading) {
      console.log('[RegionCache][save-effect] ⏭  skip — client analysis still loading');
      return;
    }
    if (clientSpots.length === 0 && clientCampgrounds.length === 0) {
      console.log('[RegionCache][save-effect] ⏭  skip — nothing to save (client hook errored or returned nothing)');
      return;
    }

    const bounds = computeBounds(searchLocation.lat, searchLocation.lng);

    // Guard against stale spots during a location transition: when
    // searchLocation changes (e.g. Moab → Silverton), React batches
    // renders so this effect can fire with the NEW searchLocation but
    // the OLD clientSpots array still from the previous area. Filter
    // out anything outside current bounds — if nothing matches, the
    // data is stale and we bail until the hook repopulates.
    const spotsInBounds = clientSpots.filter(
      (s) =>
        s.lat >= bounds.south &&
        s.lat <= bounds.north &&
        s.lng >= bounds.west &&
        s.lng <= bounds.east
    );
    const campgroundsInBounds = clientCampgrounds.filter(
      (c) =>
        c.lat >= bounds.south &&
        c.lat <= bounds.north &&
        c.lng >= bounds.west &&
        c.lng <= bounds.east
    );

    if (spotsInBounds.length === 0 && campgroundsInBounds.length === 0) {
      console.log('[RegionCache][save-effect] ⏭  skip — clientSpots belong to a different area (stale during transition)');
      return;
    }

    const regionKey = `${searchLocation.lat.toFixed(3)},${searchLocation.lng.toFixed(3)}:${reanalyseBust}`;
    if (regionSavedRef.current === regionKey) {
      console.log('[RegionCache][save-effect] ⏭  skip — region already persisted this session:', regionKey);
      return;
    }
    regionSavedRef.current = regionKey;

    // Enrich each spot with the resolved public-land entity (best-effort —
    // if publicLands hasn't loaded, fields stay undefined and the save
    // function persists null).
    const enrichedSpots = spotsInBounds.map((spot) => {
      const land = findContainingLand(spot.lat, spot.lng, publicLands);
      if (!land) return spot;
      return {
        ...spot,
        landName: land.name || undefined,
        landProtectClass: land.protectClass,
        landProtectionTitle: land.protectionTitle,
      };
    });
    const enrichedCount = enrichedSpots.filter((s) => s.landName).length;

    const totalRoads =
      clientMvumRoads.length + clientOsmTracks.length + clientBlmRoads.length;
    console.log(
      '[RegionCache][save-effect] ▶️  firing save of',
      enrichedSpots.length,
      'spots (',
      enrichedCount,
      'with land entity) +',
      campgroundsInBounds.length,
      'campgrounds +',
      totalRoads,
      'roads for regionKey',
      regionKey,
      clientSpots.length !== spotsInBounds.length
        ? `(filtered ${clientSpots.length - spotsInBounds.length} stale spots outside bounds)`
        : ''
    );
    saveRegionToCache(
      enrichedSpots,
      campgroundsInBounds,
      {
        mvumRoads: clientMvumRoads,
        osmTracks: clientOsmTracks,
        blmRoads: clientBlmRoads,
      },
      bounds
    ).then(() => {
      setLastAnalysedAt(new Date());
      // If this was a Re-analyse cycle, exit refreshing state and force the
      // DB hook to refetch so newly saved spots become visible immediately.
      if (refreshing) {
        setRefreshing(false);
        setDbRefreshKey((k) => k + 1);
      }
    });
  }, [useDatabase, searchLocation, cacheChecked, clientLoading, clientSpots, clientCampgrounds, clientMvumRoads, clientOsmTracks, clientBlmRoads, publicLands, reanalyseBust, refreshing, computeBounds, saveRegionToCache]);

  // Fetch confirmed explorer spots from database when search location changes
  useEffect(() => {
    if (searchLocation) {
      getExplorerSpots(searchLocation.lat, searchLocation.lng, 10).then(setExplorerSpots);
    } else {
      setExplorerSpots([]);
    }
  }, [searchLocation, getExplorerSpots]);

  // Reset spots list pagination when search or filters change
  useEffect(() => {
    setSpotsToShow(30);
  }, [searchLocation, spotFilters]);

  // Check if selected spot already exists in database
  useEffect(() => {
    if (selectedSpot) {
      findExistingExplorerSpot(selectedSpot.lat, selectedSpot.lng).then(setExistingCampsiteForSpot);
    } else {
      setExistingCampsiteForSpot(null);
    }
  }, [selectedSpot, findExistingExplorerSpot]);

  // The active AI target — either the selected potential spot or the
  // user's selected saved campsite. Both render the same AI assessment
  // section, both cache by lat/lng coordinates.
  const aiTarget = selectedSpot
    ? { lat: selectedSpot.lat, lng: selectedSpot.lng }
    : selectedCampsite
      ? { lat: selectedCampsite.lat, lng: selectedCampsite.lng }
      : null;

  // Load cached AI analysis when an AI target is selected
  useEffect(() => {
    if (!aiTarget) {
      setAiAnalysis(null);
      setAiError(null);
      setAiCheckingCache(false);
      return;
    }

    const cacheKey = `${aiTarget.lat.toFixed(5)},${aiTarget.lng.toFixed(5)}`;
    const cached = analysisCache.current.get(cacheKey);
    if (cached) {
      setAiAnalysis(cached);
      setAiError(null);
      setAiCheckingCache(false);
      return;
    }

    setAiAnalysis(null);
    setAiError(null);
    setAiCheckingCache(true);

    let cancelled = false;
    const eps = 0.00001;
    supabase
      .from('spot_analyses')
      .select('analysis')
      .gte('lat', aiTarget.lat - eps)
      .lte('lat', aiTarget.lat + eps)
      .gte('lng', aiTarget.lng - eps)
      .lte('lng', aiTarget.lng + eps)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (data?.analysis) {
          const analysis = data.analysis as NonNullable<typeof aiAnalysis>;
          setAiAnalysis(analysis);
          analysisCache.current.set(cacheKey, analysis);
        }
        setAiCheckingCache(false);
      });

    return () => { cancelled = true; };
  }, [aiTarget?.lat, aiTarget?.lng]);

  // Helper to check if a point is within a restricted area
  // Restricted: National Parks, Tribal Lands
  // Allowed: State Parks (per user request — render the polygon but
  // don't filter spots out), National Recreation Areas, Monuments,
  // Seashores, Preserves, BLM, USFS, etc.
  const isWithinRestrictedArea = useCallback(
    (lat: number, lng: number): boolean => {
      const restrictedLands = publicLands.filter((l) => {
        // State Parks: NOT restricted from the spot-filtering side. The
        // SPR→STATE normalization in use-public-lands.ts is for polygon
        // rendering only. Used to filter community spots out of state
        // parks erroneously.

        // Tribal lands are always restricted (need permission)
        if (l.managingAgency === 'TRIB') return true;

        // For NPS lands, check the unit name to distinguish National Parks from Recreation Areas
        if (l.managingAgency === 'NPS') {
          // Check both unitName and name fields
          const unitName = (l.unitName || l.name || '').toLowerCase();

          // If we don't have a proper unit name, don't restrict (can't confirm it's a National Park)
          if (!unitName || unitName === 'national park service' || unitName === 'nps') {
            return false;
          }

          // Allow dispersed camping in these NPS unit types
          const allowedNPSTypes = [
            'recreation area',
            'national seashore',
            'national lakeshore',
            'national preserve',
            'national reserve',
            'national monument',
          ];
          // If it's an allowed NPS type, don't restrict it
          const isAllowed = allowedNPSTypes.some(type => unitName.includes(type));
          if (isAllowed) {
            return false;
          }
          // Only restrict if it explicitly contains "national park" (actual National Parks)
          if (unitName.includes('national park')) {
            return true;
          }
          // Unknown NPS unit type - don't restrict by default
          return false;
        }

        return false;
      });

      return restrictedLands.some(
        (land) => land.polygon && isPointInPolygon({ lat, lng }, land.polygon)
      );
    },
    [publicLands]
  );

  // Helper to check if a spot is near an established campground
  const isNearEstablishedCampground = useCallback(
    (lat: number, lng: number, thresholdMiles: number = 0.3): boolean => {
      // Convert threshold to approximate degrees (1 degree ≈ 69 miles at this latitude)
      const thresholdDeg = thresholdMiles / 69;
      return establishedCampgrounds.some((cg) => {
        const latDiff = Math.abs(lat - cg.lat);
        const lngDiff = Math.abs(lng - cg.lng);
        // Quick bounding box check first
        if (latDiff > thresholdDeg || lngDiff > thresholdDeg) return false;
        // More accurate distance check
        const dist = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
        return dist < thresholdDeg;
      });
    },
    [establishedCampgrounds]
  );

  // Helper to check if within tribal land only (for OSM camp sites which are allowed on tribal land)
  const isWithinTribalLand = useCallback(
    (lat: number, lng: number): boolean => {
      const tribalLands = publicLands.filter((l) => l.managingAgency === 'TRIB');
      return tribalLands.some(
        (land) => land.polygon && isPointInPolygon({ lat, lng }, land.polygon)
      );
    },
    [publicLands]
  );

  // Helper to detect if a camp site is actually an established campground
  // Uses the isEstablishedCampground flag computed by database using same logic as Full mode
  const isLikelyEstablishedCampground = useCallback((spot: PotentialSpot): boolean => {
    // Primary: use the database-computed flag (matches Full mode's OSM tag scoring)
    if (spot.isEstablishedCampground !== undefined) {
      return spot.isEstablishedCampground;
    }

    // Fallback for older data: check reasons array
    if (spot.reasons?.includes('Established campground')) {
      return true;
    }

    // Final fallback: check name pattern for sites without database classification
    const name = spot.name || '';
    const nameIndicatesCampground = /campground|camping area|camp\s|rv\s*park|yurt|group camp/i.test(name);
    const isDispersedPattern = /dispersed|primitive|backcountry|wild|fire\s*ring|dead.?end/i.test(name);
    return nameIndicatesCampground && !isDispersedPattern;
  }, []);

  // For Fast mode: extract established campgrounds from misclassified database camp sites
  // These should show as blue dots (campgrounds) not green dots (known sites)
  const additionalCampgrounds = useMemo((): EstablishedCampground[] => {
    if (!useDatabase) return []; // Only needed for Fast mode

    const campSites = potentialSpots.filter((spot) => spot.type === 'camp-site');
    return campSites
      .filter(isLikelyEstablishedCampground)
      .map((spot) => ({
        id: spot.id,
        name: spot.name || 'Campground',
        lat: spot.lat,
        lng: spot.lng,
        facilityType: 'Campground',
        agencyName: undefined,
        reservable: false,
        url: undefined,
      }));
  }, [useDatabase, potentialSpots, isLikelyEstablishedCampground]);

  // Combined campgrounds: original from API + additional from misclassified camp sites
  const allEstablishedCampgrounds = useMemo((): EstablishedCampground[] => {
    if (!useDatabase) return establishedCampgrounds;

    // Deduplicate by checking if already in original list (by location proximity)
    const combined = [...establishedCampgrounds];
    const DEDUP_THRESHOLD = 0.001; // ~100 meters

    for (const additional of additionalCampgrounds) {
      const isDuplicate = combined.some(existing => {
        const latDiff = Math.abs(existing.lat - additional.lat);
        const lngDiff = Math.abs(existing.lng - additional.lng);
        return latDiff < DEDUP_THRESHOLD && lngDiff < DEDUP_THRESHOLD;
      });
      if (!isDuplicate) {
        combined.push(additional);
      }
    }
    return combined;
  }, [useDatabase, establishedCampgrounds, additionalCampgrounds]);

  // Restrict the user's saved campsites and friends' shared campsites to the
  // current search radius so the "My Sites" / friends stats match the other
  // tiles (which are already radius-bounded by their fetch hooks).
  const campsitesInRadius = useMemo(() => {
    if (!searchLocation) return [];
    const dLat = RADIUS_MILES / 69;
    const dLng = RADIUS_MILES / (69 * Math.cos((searchLocation.lat * Math.PI) / 180));
    return campsites.filter(
      (cs) =>
        Math.abs(cs.lat - searchLocation.lat) <= dLat &&
        Math.abs(cs.lng - searchLocation.lng) <= dLng
    );
  }, [campsites, searchLocation]);

  const friendsCampsitesInRadius = useMemo(() => {
    if (!searchLocation) return [];
    const dLat = RADIUS_MILES / 69;
    const dLng = RADIUS_MILES / (69 * Math.cos((searchLocation.lat * Math.PI) / 180));
    return friendsCampsites.filter(
      (cs) =>
        Math.abs(cs.lat - searchLocation.lat) <= dLat &&
        Math.abs(cs.lng - searchLocation.lng) <= dLng
    );
  }, [friendsCampsites, searchLocation]);

  // Filter potential spots with smart rules:
  // - OSM camp sites: Always show (they're verified camping locations)
  // - MVUM-derived spots: Always show (MVUM roads are definitely on National Forest)
  // - OSM-derived spots: Validate against public land polygons when available
  // - EXCLUDE spots within National Parks or State Parks (dispersed camping not allowed)
  // - EXCLUDE spots near established campgrounds (use the campground instead)
  const filteredPotentialSpots = useMemo(() => {
    // Helper to check if a point is near any road (for filtering backcountry camps)
    const isNearAnyRoad = (lat: number, lng: number, thresholdMiles: number = 0.25): boolean => {
      const thresholdDeg = thresholdMiles / 69; // Approximate conversion
      const allRoads = [...mvumRoads, ...osmTracks];

      for (const road of allRoads) {
        if (!road.geometry?.coordinates?.length) continue;
        for (const coord of road.geometry.coordinates) {
          const roadLng = coord[0];
          const roadLat = coord[1];
          const latDiff = Math.abs(lat - roadLat);
          const lngDiff = Math.abs(lng - roadLng);
          if (latDiff < thresholdDeg && lngDiff < thresholdDeg) {
            return true;
          }
        }
      }
      return false;
    };

    // For Full mode (client-side), spots are already filtered in use-dispersed-roads.ts
    // For Fast mode, private road filtering is handled at database import time
    // Only apply extra filtering for Fast mode (database) spots
    let campSites = potentialSpots.filter((spot) => spot.type === 'camp-site');

    if (useDatabase) {
      // Filter database camp sites to match Full mode behavior:
      // - Exclude established campgrounds (they go to campgrounds list)
      // - Exclude backcountry/hike-in camps not near any road
      // - Exclude individual pitch sites ("Site 1", "Site 2") near campgrounds
      // - Exclude "Host" sites (camp host sites at established campgrounds)
      // - Exclude camps too close to established campgrounds
      // - Exclude camps too close to each other (deduplication)
      const hasRoadData = mvumRoads.length > 0 || osmTracks.length > 0;

      campSites = campSites
        .filter((spot) => {
          const name = spot.name || '';

          // Filter out established campgrounds (they're added to campgrounds list above)
          if (isLikelyEstablishedCampground(spot)) return false;

          // Filter out backcountry/hike-in camps that aren't near any road.
          // When road data is loaded (admin import ran for this area), check
          // real-time proximity — it's more accurate. When we have no road
          // data (region was saved by browser but no admin import yet),
          // fall back to the is_road_accessible flag we persisted at save time.
          if (hasRoadData) {
            if (!isNearAnyRoad(spot.lat, spot.lng, 0.25)) return false;
          } else {
            if (spot.isRoadAccessible === false) return false;
          }

          // NOTE: Private road filtering is handled at database import time
          // Spots near private roads should not be in the database

          // Filter out "Host" sites (camp hosts at established campgrounds)
          if (/^Host$/i.test(name) || /CAMP HOST/i.test(name)) return false;

          // NOTE: We do NOT filter individual OSM camp sites (Site 1, Site 2, etc.)
          // These are explicitly tagged camping locations and should be shown
          // The individual site filter only applies to derived spots (dead-ends)

          // NOTE: We do NOT filter camp sites by campground proximity here
          // OSM camp sites are explicitly tagged camping locations and should be shown
          // The 0.25-mile campground proximity filter only applies to derived spots (dead-ends)

          return true;
        })
        // Deduplicate camps that are very close to each other (within ~50 meters)
        .filter((spot, index, array) => {
          const DEDUP_THRESHOLD = 0.0005; // ~50 meters
          // Keep this spot only if no earlier spot is within threshold
          return !array.slice(0, index).some(earlier => {
            const latDiff = Math.abs(spot.lat - earlier.lat);
            const lngDiff = Math.abs(spot.lng - earlier.lng);
            return latDiff < DEDUP_THRESHOLD && lngDiff < DEDUP_THRESHOLD;
          });
        });
    }

    // Apply restricted area filtering to all camp sites (both modes)
    campSites = campSites.filter((spot) => {
      // Allow OSM camp sites on tribal lands (they're likely tribal campgrounds)
      if (isWithinTribalLand(spot.lat, spot.lng)) return true;
      // Otherwise apply normal restricted area filtering
      return !isWithinRestrictedArea(spot.lat, spot.lng);
    });

    // Get derived spots (dead-ends, intersections)
    const derivedSpots = potentialSpots.filter((spot) => spot.type !== 'camp-site');

    // Check if we have MVUM roads - if so, we're in National Forest territory
    const hasMVUMRoads = mvumRoads.length > 0;

    // Combine all roads for false dead-end filtering
    const allRoads = [...mvumRoads, ...osmTracks];

    // Filter derived spots:
    // - EXCLUDE false dead-ends (spots near the interior of other roads - they're really intersections)
    // - MVUM roads: definitely National Forest - always include
    // - BLM roads: definitely BLM land - always include
    // - OSM tracks: REQUIRE actual polygon intersection when polygon data is available
    //   (bounding box heuristics are too loose - spots within bbox but outside polygon are private land)
    // - EXCLUDE spots within National Parks or State Parks (no dispersed camping allowed)
    // - EXCLUDE spots near established campgrounds (use the campground instead)
    // - EXCLUDE spots outside public land polygons (e.g., Potash fields, private ranches)
    const filteredDerived = derivedSpots.filter((spot) => {
      // Soft-delete queue: hide spots the user marked in the explorer.
      // Same Set is read by AdminSpotReview's bulk-delete button.
      if (removeIds.has(spot.id)) return false;

      // Restricted-area check applies to ALL spots, including community.
      // No dispersed camping allowed inside National Parks / State Parks.
      if (isWithinRestrictedArea(spot.lat, spot.lng)) return false;

      // Heuristic gates (false-dead-end, near-campground, score gate,
      // dedup) apply ONLY to algorithmically-derived spots. Vouched-for
      // data (Known / Community / Utilities) bypasses all of them.
      if (!isAlgorithmicDerived(spot)) return true;

      // First check: filter out false dead-ends (actually intersections)
      // This matches the logic in use-dispersed-roads.ts for Full mode
      if (isFalseDeadEnd(spot, allRoads)) return false;

      // NOTE: Private road filtering is handled at database import time
      // Derived spots near private roads should not be in the database

      // Exclude derived spots near established campgrounds (use the campground instead)
      // Uses 0.5 miles to match Full mode behavior
      if (isNearEstablishedCampground(spot.lat, spot.lng, 0.5)) return false;

      // MVUM roads are definitely on public land (National Forest) - always include
      if (spot.isOnMVUMRoad) return true;

      // BLM roads are definitely on public land (BLM) - always include
      if (spot.isOnBLMRoad) return true;

      // For ALL other spots, validate against polygon data if available.
      // In Full mode (client-side) this is the authoritative check because
      // the isOnPublicLand heuristic is loose (bbox-based). In Fast mode
      // (database) the flag was set at save time when client polygons were
      // loaded, so it's more trustworthy than a potentially sparse polygon
      // re-check at load time — trust it.
      if (publicLands.length > 0) {
        const withinPublicLand = isWithinAnyPublicLand(spot.lat, spot.lng, publicLands);
        if (withinPublicLand) return true;

        // Not in any loaded polygon. In DB mode, the flag is still reliable —
        // trust it rather than rejecting (polygon coverage may be fragmented).
        if (useDatabase && spot.isOnPublicLand) return true;

        // Full mode: polygon check overrides heuristic, reject.
        return false;
      }

      // No polygon coverage yet — fall back to isOnPublicLand heuristic or MVUM presence
      if (spot.isOnPublicLand) return true;
      return hasMVUMRoads;
    });

    const blmPolygons = publicLands.filter(l => l.managingAgency === 'BLM').length;
    const usfsPolygons = publicLands.filter(l => l.managingAgency === 'USFS' || l.managingAgency === 'FS').length;
    const npsPolygons = publicLands.filter(l => l.managingAgency === 'NPS').length;
    const statePolygons = publicLands.filter(l => l.managingAgency === 'STATE').length;
    const stateTrustPolygons = publicLands.filter(l => ['SDOL', 'SFW', 'SPR', 'SDNR', 'SLB', 'SLO', 'SDC', 'SDF', 'OTHS'].includes(l.managingAgency)).length;
    const landTrustPolygons = publicLands.filter(l => l.managingAgency === 'NGO').length;
    console.log(`Polygons: ${blmPolygons} BLM, ${usfsPolygons} USFS, ${npsPolygons} NPS, ${statePolygons} State Park, ${stateTrustPolygons} State Trust, ${landTrustPolygons} Land Trust, ${publicLands.length} total`);

    // Log false dead-end filtering (matching Full mode behavior)
    const falseDeadEndCount = derivedSpots.filter(s => isFalseDeadEnd(s, allRoads)).length;
    if (falseDeadEndCount > 0) {
      console.log(`Filtered out ${falseDeadEndCount} false dead-ends (actually intersections)`);
    }

    // Remove derived spots that are very close to camp sites
    // OSM camp sites are explicitly tagged and should take precedence
    // Use 0.06 miles (~100 meters) to match Full mode.
    // Community spots bypass — they're submissions ABOUT specific
    // locations, often within 100m of an OSM camp-site by design (the
    // submitter is describing a real campsite they used). Discarding
    // them as "duplicates" of an OSM tag drops real data.
    const CAMP_DEDUP_MILES = 0.06;
    const dedupedDerived = filteredDerived.filter(derived => {
      // Camp-site dedup is a derive-pipeline cleanup. Vouched-for data
      // (Known / Community / Utilities) bypasses it.
      if (!isAlgorithmicDerived(derived)) return true;
      const nearCampSite = campSites.some(camp => {
        const latDiff = Math.abs(derived.lat - camp.lat);
        const lngDiff = Math.abs(derived.lng - camp.lng);
        // Approximate: 1 degree ≈ 69 miles
        const distMiles = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff) * 69;
        return distMiles < CAMP_DEDUP_MILES;
      });
      return !nearCampSite;
    });

    // Also deduplicate derived spots that are very close to each other.
    // Community spots are exempt: two community submissions for adjacent
    // sites along the same road (e.g. a string of dispersed pull-offs)
    // should both render, even when they're within 50m. Algorithmic
    // dead-ends still get the squelch since they're noisy.
    const DERIVED_DEDUP_THRESHOLD = 0.0005; // ~50 meters
    const finalDerived = dedupedDerived.filter((spot, index, array) => {
      // 50m self-dedup applies only to algorithmically-derived spots.
      if (!isAlgorithmicDerived(spot)) return true;
      // Keep this spot only if no earlier algorithmically-derived spot
      // is within threshold (vouched-for earlier rows don't count).
      return !array.slice(0, index).some(earlier => {
        if (!isAlgorithmicDerived(earlier)) return false;
        const latDiff = Math.abs(spot.lat - earlier.lat);
        const lngDiff = Math.abs(spot.lng - earlier.lng);
        return latDiff < DERIVED_DEDUP_THRESHOLD && lngDiff < DERIVED_DEDUP_THRESHOLD;
      });
    });

    console.log(`Derived spots: ${derivedSpots.length} total, ${filteredDerived.length} after filtering, ${finalDerived.length} after dedup`);

    // Score gate removed — quality scoring will be revisited later.

    // Enrich unnamed spots with public land names
    // Track counts per land area for numbering
    const landCounts = new Map<string, number>();
    const enrichedDerived = finalDerived.map(spot => {
      // Only enrich spots with coordinate-based names (starting with "Dispersed")
      if (!spot.name.startsWith('Dispersed ')) return spot;

      const containingLand = findContainingLand(spot.lat, spot.lng, publicLands);
      if (containingLand && containingLand.name) {
        // Shorten long land names
        let landName = containingLand.name
          .replace(/National Recreation Area$/i, 'NRA')
          .replace(/National Monument$/i, 'NM')
          .replace(/National Forest$/i, 'NF')
          .replace(/Wilderness Study Area$/i, 'WSA')
          .replace(/Special Recreation Management Area$/i, 'SRMA');

        // Get count for this land area
        const count = (landCounts.get(landName) || 0) + 1;
        landCounts.set(landName, count);

        return { ...spot, name: `${landName} #${count}` };
      }

      return spot;
    });

    const allSpots = [...campSites, ...enrichedDerived];

    // Apply filters
    return allSpots.filter((spot) => {
      // Soft-delete queue applies to every spot category (community + known
      // camp-sites slip past the derived-only filter above, so guard here).
      if (removeIds.has(spot.id)) return false;

      // Kind-family filter (multi-select). Empty set = show all. We trust
      // `kind` first; `type` is only a fallback for runtime-derived spots
      // (from road geometry) that have no kind set. Otherwise rows like
      // dispersed_camping + sub_kind='known' (which the hook maps to
      // type='camp-site') would leak into the Established filter.
      if (spotFilters.size > 0) {
        const isDispersed   = spot.kind ? spot.kind === 'dispersed_camping' : spot.type === 'dead-end';
        const isEstablished = spot.kind ? spot.kind === 'established_campground' : spot.type === 'camp-site';
        const isInformal    = spot.kind === 'informal_camping';
        const isWater       = spot.kind === 'water';
        const isShower      = spot.kind === 'shower';
        const isLaundromat  = spot.kind === 'laundromat';

        const matches =
          (spotFilters.has('dispersed')   && isDispersed)   ||
          (spotFilters.has('established') && isEstablished) ||
          (spotFilters.has('informal')    && isInformal)    ||
          (spotFilters.has('water')       && isWater)       ||
          (spotFilters.has('shower')      && isShower)      ||
          (spotFilters.has('laundromat')  && isLaundromat);

        if (!matches) return false;

        // Source sub-filter — only applies to Dispersed when active.
        if (isDispersed && dispersedSourceFilters.size > 0) {
          const bucket = classifyDispersedSource(spot);
          if (!dispersedSourceFilters.has(bucket)) return false;
        }
      }

      // Vehicle-access spot filter removed — see TODO.md "Vehicle access
      // + access difficulty cleanup". Bringing it back requires the data
      // to actually be trustworthy.

      return true;
    });
  }, [potentialSpots, publicLands, mvumRoads, osmTracks, isWithinRestrictedArea, isWithinTribalLand, isNearEstablishedCampground, isLikelyEstablishedCampground, useDatabase, roadFilter, spotFilters, dispersedSourceFilters, removeIds]);

  // Calculate top recommendations based on multiple factors
  const topRecommendations = useMemo(() => {
    if (!searchLocation || filteredPotentialSpots.length === 0) return [];

    // Helper to calculate distance in miles (straight-line)
    const getStraightLineDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
      const R = 3959; // Earth's radius in miles
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLng/2) * Math.sin(dLng/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c;
    };

    // Estimate driving distance using terrain multiplier
    // Rural/mountain roads are typically 1.4-1.6x longer than straight-line
    const DRIVING_MULTIPLIER = 1.5;
    const getDrivingDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
      return getStraightLineDistance(lat1, lng1, lat2, lng2) * DRIVING_MULTIPLIER;
    };

    // Helper to count nearby spots (cluster density) - uses straight-line for speed
    const countNearbySpots = (spot: PotentialSpot, allSpots: PotentialSpot[], radiusMiles: number = 0.5) => {
      return allSpots.filter(s =>
        s.id !== spot.id && getStraightLineDistance(spot.lat, spot.lng, s.lat, s.lng) <= radiusMiles
      ).length;
    };

    // Score each spot for recommendation
    const scoredSpots = filteredPotentialSpots.map(spot => {
      let recScore = 0;
      // Use estimated driving distance for user-facing values
      const drivingDistance = getDrivingDistance(searchLocation.lat, searchLocation.lng, spot.lat, spot.lng);
      const nearbyCount = countNearbySpots(spot, filteredPotentialSpots);

      // 1. Base score from spot confidence (0-15 points)
      if (spot.score >= 35) recScore += 15;
      else if (spot.score >= 25) recScore += 10;
      else if (spot.score >= 15) recScore += 5;

      // 2. Distance score - sweet spot is 3-12 miles driving (0-20 points)
      if (drivingDistance >= 3 && drivingDistance <= 12) recScore += 20;
      else if (drivingDistance >= 1.5 && drivingDistance <= 15) recScore += 12;
      else if (drivingDistance < 1.5) recScore += 4; // Too close
      else if (drivingDistance <= 20) recScore += 8;
      // > 20 miles driving gets 0 points

      // 3. Cluster density bonus (0-40 points) - HEAVILY weighted
      // More nearby spots = more options and fallback camping areas
      if (nearbyCount >= 15) recScore += 40;
      else if (nearbyCount >= 10) recScore += 35;
      else if (nearbyCount >= 6) recScore += 28;
      else if (nearbyCount >= 3) recScore += 20;
      else if (nearbyCount >= 1) recScore += 10;
      // Isolated spots (0 nearby) get no cluster bonus

      // 4. Road reliability bonus (0-5 points) - reduced since users can filter
      if (spot.isOnMVUMRoad) recScore += 5;
      else if (spot.isOnBLMRoad) recScore += 4;
      else if (spot.isOnPublicLand) recScore += 2;

      // 5. Spot type bonus (0-10 points)
      if (spot.type === 'camp-site') recScore += 10; // Explicitly tagged
      else if (spot.type === 'dead-end') recScore += 6; // Good for privacy
      else if (spot.type === 'intersection') recScore += 2; // Less ideal

      return {
        spot,
        recScore,
        drivingDistance,
        nearbyCount,
      };
    });

    // Sort by recommendation score
    const sortedSpots = scoredSpots.sort((a, b) => b.recScore - a.recScore);

    // Pick spots from different clusters (at least 1 mile apart)
    const minClusterDistance = 1; // miles
    const selectedRecs: typeof sortedSpots = [];

    for (const candidate of sortedSpots) {
      // Check if this spot is far enough from already selected spots
      const isFarEnough = selectedRecs.every(selected =>
        getStraightLineDistance(candidate.spot.lat, candidate.spot.lng, selected.spot.lat, selected.spot.lng) >= minClusterDistance
      );

      if (isFarEnough) {
        selectedRecs.push(candidate);
      }

      // We want enough for multiple pages (e.g., 12 recommendations = 4 pages of 3)
      if (selectedRecs.length >= 12) break;
    }

    return selectedRecs;
  }, [filteredPotentialSpots, searchLocation]);

  // Get current page of recommendations
  const currentRecommendations = useMemo(() => {
    const startIndex = recommendationPage * 3;
    return topRecommendations.slice(startIndex, startIndex + 3);
  }, [topRecommendations, recommendationPage]);

  const hasMoreRecommendations = (recommendationPage + 1) * 3 < topRecommendations.length;

  // Toggle a filter in the multi-select set
  const toggleFilter = useCallback((filter: string) => {
    setSpotFilters(prev => {
      const next = new Set(prev);
      if (next.has(filter)) {
        next.delete(filter);
      } else {
        next.add(filter);
      }
      return next;
    });
  }, []);

  // Whenever any filter changes, close the detail panel + map popovers and
  // drop back to the results list for the new filter set. Watches every
  // filter input — spot kinds, source sub-filter, road overlay, land
  // managers — so any toggle resets the view.
  useEffect(() => {
    setSelectedSpot(null);
    setSelectedCampground(null);
    setSelectedCampsite(null);
    setSelectedRoad(null);
  }, [spotFilters, dispersedSourceFilters, roadFilter, visibleLandAgencies]);

  // Computed visibility for campgrounds and user campsites based on filters
  // They show when: no filters are selected, OR their specific filter is selected
  const showCampgroundsFiltered = spotFilters.size === 0 || spotFilters.has('established');
  const showMyCampsitesFiltered = spotFilters.size === 0 || spotFilters.has('mine');

  // Create unified list of all spots (derived, campgrounds, user campsites)
  const unifiedSpotList = useMemo((): UnifiedSpot[] => {
    const unified: UnifiedSpot[] = [];

    // Helper to calculate distance in miles
    const getDistanceMiles = (lat: number, lng: number) => {
      if (!searchLocation) return 999;
      const R = 3959; // Earth's radius in miles
      const dLat = (lat - searchLocation.lat) * Math.PI / 180;
      const dLng = (lng - searchLocation.lng) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(searchLocation.lat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
                Math.sin(dLng/2) * Math.sin(dLng/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c;
    };

    // Build a map of recommendation scores from topRecommendations
    const recScoreMap = new Map<string, number>();
    topRecommendations.forEach((rec, idx) => {
      recScoreMap.set(rec.spot.id, rec.recScore);
    });

    // Add filtered derived spots — skip any whose UUID is in the local
    // remove queue so they disappear immediately after the user marks
    // them, without a DB round-trip. sub_kind='community' rows split
    // into the 'community' category so they get their own filter pill,
    // legend swatch, and pin color (pink) instead of being lumped in
    // with computed dead-ends.
    filteredPotentialSpots.forEach(spot => {
      if (removeIds.has(spot.id)) return;
      const distance = getDistanceMiles(spot.lat, spot.lng);
      const recScore = recScoreMap.get(spot.id);
      const isCommunity = spot.dbSource === 'community';
      unified.push({
        id: `${isCommunity ? 'community' : 'derived'}-${spot.id}`,
        name: spot.name,
        lat: spot.lat,
        lng: spot.lng,
        category: isCommunity ? 'community' : 'derived',
        score: spot.score,
        spotType: spot.type,
        reasons: spot.reasons,
        distance,
        recScore,
        isRecommended: recScore !== undefined,
        originalSpot: spot,
      });
    });

    // Add campgrounds if filter allows
    if (showCampgroundsFiltered) {
      allEstablishedCampgrounds.forEach(cg => {
        const distance = getDistanceMiles(cg.lat, cg.lng);
        unified.push({
          id: `campground-${cg.id}`,
          name: cg.name,
          lat: cg.lat,
          lng: cg.lng,
          category: 'campground',
          reservable: cg.reservable,
          facilityType: cg.facilityType,
          url: cg.url,
          agencyName: cg.agencyName,
          distance,
          recScore: cg.reservable ? 50 : 30, // Give campgrounds a baseline rec score
          originalCampground: cg,
        });
      });
    }

    // Add user campsites if filter allows AND we have a search location
    // (Don't show My Campsites before search is made)
    if (searchLocation && showMyCampsites && showMyCampsitesFiltered) {
      campsites.forEach(cs => {
        const distance = getDistanceMiles(cs.lat, cs.lng);
        unified.push({
          id: `mine-${cs.id}`,
          name: cs.name,
          lat: cs.lat,
          lng: cs.lng,
          category: 'mine',
          campsiteType: cs.type,
          distance,
          recScore: 100, // User's own campsites get top priority in recommended
          originalCampsite: cs,
        });
      });
    }

    // Add friends' campsites if filter allows AND we have a search location
    const showFriendsFiltered = spotFilters.size === 0 || spotFilters.has('friend');
    if (searchLocation && showFriendsCampsites && showFriendsFiltered) {
      friendsCampsites.forEach(cs => {
        const distance = getDistanceMiles(cs.lat, cs.lng);
        const friend = getFriendById(cs.userId);
        unified.push({
          id: `friend-${cs.id}`,
          name: cs.name,
          lat: cs.lat,
          lng: cs.lng,
          category: 'friend',
          campsiteType: cs.type,
          distance,
          recScore: 90, // Friends' campsites get high priority, just below user's own
          sharedBy: friend?.name || friend?.email || 'Friend',
          originalCampsite: cs,
        });
      });
    }

    // Sort based on selected sort option
    if (sortBy === 'distance') {
      unified.sort((a, b) => (a.distance ?? 999) - (b.distance ?? 999));
    } else if (sortBy === 'rating') {
      // Sort by score (derived spots) or prioritize reservable campgrounds
      unified.sort((a, b) => {
        const scoreA = a.score ?? (a.category === 'campground' ? 50 : a.category === 'mine' ? 60 : a.category === 'friend' ? 55 : 0);
        const scoreB = b.score ?? (b.category === 'campground' ? 50 : b.category === 'mine' ? 60 : b.category === 'friend' ? 55 : 0);
        return scoreB - scoreA;
      });
    } else {
      // 'recommended' - sort by recScore, then by distance
      unified.sort((a, b) => {
        // Recommended spots first
        if (a.isRecommended && !b.isRecommended) return -1;
        if (!a.isRecommended && b.isRecommended) return 1;
        // Then by recScore
        const recA = a.recScore ?? 0;
        const recB = b.recScore ?? 0;
        if (recA !== recB) return recB - recA;
        // Then by distance
        return (a.distance ?? 999) - (b.distance ?? 999);
      });
    }

    return unified;
  }, [filteredPotentialSpots, allEstablishedCampgrounds, campsites, friendsCampsites, showCampgroundsFiltered, showMyCampsites, showMyCampsitesFiltered, showFriendsCampsites, getFriendById, searchLocation, topRecommendations, sortBy, removeIds]);

  // Helper to get icon for unified spot based on category and type

  // Fetch actual driving distances from OSRM for top recommendations
  useEffect(() => {
    if (!searchLocation || topRecommendations.length === 0) {
      setOsrmDistances({});
      return;
    }

    const fetchOsrmDistances = async () => {
      setOsrmLoading(true);
      try {
        // Build coordinates string: origin first, then all destinations
        const spots = topRecommendations.map(r => r.spot);
        const coords = [
          `${searchLocation.lng},${searchLocation.lat}`,
          ...spots.map(s => `${s.lng},${s.lat}`)
        ].join(';');

        // Use OSRM table endpoint - gets distances from source (0) to all destinations
        const url = `https://router.project-osrm.org/table/v1/driving/${coords}?sources=0&destinations=${spots.map((_, i) => i + 1).join(';')}&annotations=distance`;

        const response = await fetch(url);
        if (!response.ok) {
          console.warn('OSRM request failed:', response.status);
          return;
        }

        const data = await response.json();
        if (data.code !== 'Ok' || !data.distances?.[0]) {
          console.warn('OSRM returned error:', data.code);
          return;
        }

        // Convert meters to miles and store by spot ID
        const distances: Record<string, number> = {};
        spots.forEach((spot, index) => {
          const meters = data.distances[0][index];
          if (meters !== null && meters !== undefined) {
            distances[spot.id] = meters / 1609.34; // Convert meters to miles
          }
        });

        setOsrmDistances(distances);
        console.log('OSRM distances fetched for', Object.keys(distances).length, 'spots');
      } catch (err) {
        console.warn('OSRM fetch failed:', err);
      } finally {
        setOsrmLoading(false);
      }
    };

    // Debounce the fetch to avoid too many requests
    const timeoutId = setTimeout(fetchOsrmDistances, 500);
    return () => clearTimeout(timeoutId);
  }, [searchLocation, topRecommendations]);

  const handleLocationChange = useCallback((location: SelectedLocation | null) => {
    setSearchLocation(location);
    if (location) {
      setMapCenter({ lat: location.lat, lng: location.lng });
      setMapZoom(12);
    }
    setSelectedRoad(null);
    setSelectedSpot(null);
    setSelectedCampground(null);
    setRecommendationPage(0); // Reset recommendations on new search
  }, []);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    setMapInstance(map);
  }, []);

  const onMapClick = useCallback((e: google.maps.MapMouseEvent) => {
    // If a pin is currently selected, treat a map click as "dismiss selection"
    // and don't trigger a new search.
    if (selectedSpot || selectedCampground || selectedCampsite) {
      setSelectedSpot(null);
      setSelectedCampground(null);
      setSelectedCampsite(null);
      setAiAnalysis(null);
      setAiError(null);
      setSelectedRoad(null);
      return;
    }
    if (e.latLng) {
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      setMapTapPoint({ lat, lng });
      setSearchLocation({
        lat,
        lng,
        name: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      });
      setRecommendationPage(0); // Reset recommendations on new search
      setSelectedRoad(null);
    }
  }, [selectedSpot, selectedCampground, selectedCampsite]);

  // Color coding for road types
  const getMVUMColor = (road: MVUMRoad) => {
    if (road.highClearanceVehicle && !road.passengerVehicle) return '#f97316'; // Orange - high clearance only
    if (road.atv || road.motorcycle) return '#eab308'; // Yellow - OHV
    return '#22c55e'; // Green - passenger vehicle OK
  };

  const getOSMColor = (track: OSMTrack) => {
    if (track.fourWdOnly) return '#ef4444'; // Red - 4WD only
    if (track.tracktype === 'grade5' || track.tracktype === 'grade4') return '#ef4444'; // Red - 4WD
    if (track.tracktype === 'grade3') return '#f97316'; // Orange - high clearance
    if (track.tracktype === 'grade2') return '#f97316'; // Orange - gravel, be conservative
    if (track.tracktype === 'grade1') return '#3b82f6'; // Blue - paved/solid, likely OK
    // Unknown grade - be conservative, treat as high clearance
    if (track.highway === 'track') return '#f97316'; // Orange - tracks are usually rough
    return '#eab308'; // Yellow - unclassified roads, unknown conditions
  };

  // Filter roads based on selected filter
  const filteredMvumRoads = useMemo(() => {
    if (roadFilter === 'all') return mvumRoads;
    return mvumRoads.filter(road => {
      if (roadFilter === 'passenger') return road.passengerVehicle || (!road.highClearanceVehicle && !road.atv && !road.motorcycle);
      if (roadFilter === 'high-clearance') return road.highClearanceVehicle || road.passengerVehicle;
      if (roadFilter === '4wd') return true; // MVUM roads are generally accessible
      return true;
    });
  }, [mvumRoads, roadFilter]);

  const filteredOsmTracks = useMemo(() => {
    // Filter out paved/residential roads - they're only in the data for junction detection
    const displayableTracks = osmTracks.filter(track => !track.isPaved);

    if (roadFilter === 'all') return displayableTracks;
    return displayableTracks.filter(track => {
      if (roadFilter === 'passenger') {
        // Only show grade1 (paved) tracks for passenger vehicles
        // OSM data quality varies too much to trust grade2+ as passenger-accessible
        return !track.fourWdOnly && track.tracktype === 'grade1';
      }
      if (roadFilter === 'high-clearance') {
        // Show grade1-3 tracks (exclude grade4/5 and 4WD only)
        return !track.fourWdOnly && track.tracktype !== 'grade5' && track.tracktype !== 'grade4';
      }
      if (roadFilter === '4wd') return true; // Show all for 4WD
      return true;
    });
  }, [osmTracks, roadFilter]);

  // Get marker icon for a spot — pin color = kind, full stop.
  const getSpotMarkerIcon = useCallback((spot: PotentialSpot, isSelected: boolean) => {
    // Pin color = kind, no overrides. Quality flags (outside polygon, near
    // private edge) and provenance (community source) surface elsewhere
    // (Signals chips on the detail panel) — they don't change the pin fill.
    let fillColor: string;
    // Trust `kind` first — only fall back to `type` for runtime-derived
    // spots that have no kind. Otherwise rows like dispersed_camping +
    // sub_kind='known' (mapped to type='camp-site') would render blue.
    if (spot.kind === 'dispersed_camping') {
      fillColor = 'hsl(96 28% 38%)';   // --pin-dispersed (moss green)
    } else if (spot.kind === 'established_campground') {
      fillColor = 'hsl(206 38% 46%)';  // --pin-campground (blue)
    } else if (spot.kind === 'informal_camping') {
      fillColor = 'hsl(45 62% 56%)';   // --pin-informal (gold)
    } else if (!spot.kind && spot.type === 'camp-site') {
      fillColor = 'hsl(206 38% 46%)';  // --pin-campground (OSM camp-site fallback)
    } else if (!spot.kind && spot.type === 'dead-end') {
      fillColor = 'hsl(96 28% 38%)';   // --pin-dispersed (runtime-derived fallback)
    } else if (spot.kind === 'water') {
      fillColor = 'hsl(150 13% 65%)';  // --pin-water (grey-green)
    } else if (spot.kind === 'shower') {
      fillColor = 'hsl(250 22% 60%)';  // --pin-shower (soft periwinkle)
    } else if (spot.kind === 'laundromat') {
      fillColor = 'hsl(24 68% 52%)';   // --pin-laundromat (orange)
    } else {
      fillColor = 'hsl(30 14% 50%)';   // unknown / no kind — warm grey
    }

    const size = isSelected ? 12 : 9;
    return {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor,
      fillOpacity: 1,
      strokeColor: isSelected ? '#3f3e2c' : 'hsl(36 23% 97%)',  // cream
      strokeWeight: isSelected ? 2.5 : 2,
      scale: size,
    };
  }, []);

  const getSpotIcon = (type: PotentialSpot['type']) => {
    switch (type) {
      case 'camp-site': return <Tent className="w-4 h-4 text-pine-6" />;
      case 'dead-end': return <MapPinLine className="w-4 h-4 text-ember" />;
      case 'intersection': return <Path className="w-4 h-4 text-water" />;
      default: return <MapPin className="w-4 h-4 text-ink-3" />;
    }
  };


  const totalRoads = mvumRoads.length + osmTracks.length;

  const runSpotAnalysis = async (force: boolean = false) => {
    // Pull payload from whichever target is active (potential spot or
    // user's saved campsite). Coords are the cache key; the rest is
    // best-effort context the analyze-campsite function reads when it has it.
    const body: Record<string, unknown> = selectedSpot
      ? {
          lat: selectedSpot.lat,
          lng: selectedSpot.lng,
          name: selectedSpot.name,
          type: selectedSpot.type,
          score: selectedSpot.score,
          reasons: selectedSpot.reasons,
          source: selectedSpot.source,
          roadName: selectedSpot.roadName,
          isOnPublicLand: selectedSpot.isOnPublicLand,
          passengerReachable: selectedSpot.passengerReachable,
          highClearanceReachable: selectedSpot.highClearanceReachable,
          highClearance: selectedSpot.highClearance,
        }
      : selectedCampsite
        ? {
            lat: selectedCampsite.lat,
            lng: selectedCampsite.lng,
            name: selectedCampsite.name,
            type: 'camp-site',
          }
        : null;
    if (!body) return;
    if (aiAnalysis && !force) return;
    if (force) {
      setAiAnalysis(null);
      setAiError(null);
    }
    setAiAnalyzing(true);
    setAiError(null);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-campsite', {
        body: { ...body, ...(force && { force: true }) },
      });
      if (error) throw error;
      setAiAnalysis(data.analysis);
      analysisCache.current.set(`${(body.lat as number).toFixed(5)},${(body.lng as number).toFixed(5)}`, data.analysis);
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setAiAnalyzing(false);
    }
  };

  const copySpotCoords = () => {
    if (!selectedSpot) return;
    navigator.clipboard.writeText(`${selectedSpot.lat.toFixed(5)}, ${selectedSpot.lng.toFixed(5)}`);
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 2000);
  };

  const clearAllSelections = () => {
    setSelectedSpot(null);
    setSelectedCampground(null);
    setSelectedCampsite(null);
    setSelectedRoad(null);
    setAiAnalysis(null);
    setAiError(null);
  };

  useEffect(() => {
    if (selectedSpot || selectedCampground || selectedCampsite || selectedRoad) {
      setMobileView('list');
    }
  }, [selectedSpot, selectedCampground, selectedCampsite, selectedRoad]);

  const handleUnifiedSpotClick = (spot: UnifiedSpot) => {
    // Community spots use the same selectedSpot path as derived — they're
    // both PotentialSpot under the hood, just with different provenance.
    if ((spot.category === 'derived' || spot.category === 'community') && spot.originalSpot) {
      setSelectedSpot(spot.originalSpot);
      setSelectedCampground(null);
      setSelectedCampsite(null);
      // Cache lookup handled by useEffect on selectedSpot change
    } else if (spot.category === 'campground' && spot.originalCampground) {
      setSelectedCampground(spot.originalCampground);
      setSelectedSpot(null);
      setSelectedCampsite(null);
    } else if (spot.category === 'mine' && spot.originalCampsite) {
      setSelectedCampsite(spot.originalCampsite);
      setSelectedSpot(null);
      setSelectedCampground(null);
    } else if (spot.category === 'friend' && spot.originalCampsite) {
      setSelectedCampsite(spot.originalCampsite);
      setSelectedSpot(null);
      setSelectedCampground(null);
    }
    setSelectedRoad(null);
    setMapCenter({ lat: spot.lat, lng: spot.lng });
    setMapZoom(15);
  };

  // Helper to safely convert coordinates to LatLng, filtering out invalid ones
  const toLatLngPath = (coordinates: any[]): google.maps.LatLngLiteral[] => {
    if (!Array.isArray(coordinates)) return [];
    return coordinates
      .map((coord) => {
        // Handle [lng, lat] array format
        if (Array.isArray(coord) && typeof coord[0] === 'number' && typeof coord[1] === 'number') {
          return { lat: coord[1], lng: coord[0] };
        }
        // Handle {lat, lng} or {lat, lon} object format
        if (coord && typeof coord.lat === 'number') {
          const lng = typeof coord.lng === 'number' ? coord.lng : coord.lon;
          if (typeof lng === 'number') {
            return { lat: coord.lat, lng };
          }
        }
        return null;
      })
      .filter((p): p is google.maps.LatLngLiteral => p !== null && isFinite(p.lat) && isFinite(p.lng));
  };

  // Coordinates display for the desktop search bar — decimal degrees so it
  // pastes straight into Google Maps when copied.
  const coordLabel = searchLocation
    ? `${searchLocation.lat.toFixed(5)}, ${searchLocation.lng.toFixed(5)}`
    : null;
  const placeLabel = searchLocation?.name?.split(',')[0]?.trim() || null;

  return (
    <div className="h-screen bg-paper text-ink font-sans flex flex-col overflow-hidden">
      {/* === Mobile: global Header + search bar + view tabs === */}
      <div className="lg:hidden shrink-0">
        <Header showBorder />
        <div className="p-3 pb-2 space-y-2 border-b border-line dark:border-line-2 bg-cream dark:bg-paper-2">
          <LocationSelector
            value={searchLocation}
            onChange={handleLocationChange}
            placeholder="Search location..."
            showMyLocation={false}
            showSavedLocations={false}
            showCoordinates={false}
            onMapClickHint={false}
            compact={true}
          />
          <MobileViewTabs mobileView={mobileView} onChange={setMobileView} />
        </div>
      </div>

      {/* === Map-first layout (matches the Pine Grove "explore-mapfirst-split"
           design): full-bleed map with three floating header pills on top
           and two floating cards underneath (filters left, results right).
           Mobile keeps the stacked map ⇄ list flow above. === */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        {/* Full-bleed map (desktop). On mobile: only when mobileView === 'map'. */}
        <div
          className={cn(
            'lg:absolute lg:inset-0',
            mobileView === 'map' ? 'flex-1 flex' : 'hidden lg:block',
          )}
        >
          <div className="relative w-full h-full">
            <DispersedMap
              mapRef={mapRef}
              mapCenter={mapCenter}
              mapZoom={mapZoom}
              mapTypeId={mapTypeId}
              onMapLoad={onMapLoad}
              onMapClick={onMapClick}
              searchLocation={searchLocation}
              visibleLandAgencies={visibleLandAgencies}
              publicLands={publicLands}
              filteredMvumRoads={filteredMvumRoads}
              filteredOsmTracks={filteredOsmTracks}
              selectedRoad={selectedRoad}
              onSelectRoad={setSelectedRoad}
              filteredPotentialSpots={filteredPotentialSpots}
              selectedSpot={selectedSpot}
              onSpotClusterClick={(spot) => {
                setSelectedSpot(spot);
                setSelectedRoad(null);
                setSelectedCampground(null);
                setSelectedCampsite(null);
                setCopiedCoords(false);
              }}
              getSpotMarkerIcon={getSpotMarkerIcon}
              showCampgroundsFiltered={showCampgroundsFiltered}
              allEstablishedCampgrounds={allEstablishedCampgrounds}
              selectedCampground={selectedCampground}
              onSelectCampground={(cg) => {
                setSelectedCampground(cg);
                setSelectedSpot(null);
                setSelectedRoad(null);
                setSelectedCampsite(null);
              }}
              showMyCampsites={showMyCampsites}
              showMyCampsitesFiltered={showMyCampsitesFiltered}
              campsites={campsites}
              selectedCampsite={selectedCampsite}
              onSelectCampsite={(cs) => {
                setSelectedCampsite(cs);
                setSelectedSpot(null);
                setSelectedRoad(null);
                setSelectedCampground(null);
              }}
              onCloseSelection={clearAllSelections}
              mapTapPoint={mapTapPoint}
              onDismissMapTap={() => setMapTapPoint(null)}
              onOpenSaveFromMap={() => setSaveFromMapOpen(true)}
            />
          </div>
        </div>

        {/* Map controls — pine-styled zoom + map-type toggle. Bottom-right
            on lg+ but shifted past the results panel (panel ends at 425px
            from the right edge: 20px gap + 400px width) plus a 20px
            breathing margin. Mobile: top-right of the map. */}
        <div className={cn(
          'absolute top-4 right-4 z-10 lg:top-auto lg:bottom-5 lg:right-[445px]',
          mobileView === 'map' ? 'block' : 'hidden lg:block',
        )}>
          <MapControls
            map={mapInstance}
            mapType={mapTypeId}
            onMapTypeChange={setMapTypeId}
          />
        </div>

        {/* Floating legend — bottom-left on mobile, bottom-center between
            cards on desktop (clears both floating cards + the bottom edge). */}
        <div className={cn(
          'lg:absolute lg:bottom-5 lg:left-[360px] lg:z-10',
          mobileView === 'map' ? 'block' : 'hidden lg:block',
        )}>
          <FloatingLegend
            visibleLandAgencies={visibleLandAgencies}
            onToggleLandAgency={toggleLandAgency}
          />
        </div>

        {/* Bulk auto-pan helper — center-bottom of the map gutter on lg+
            (free of the side panels and the legend). Mobile keeps its
            existing top-right corner positioning via the inner button. */}
        <div className={cn(
          'lg:absolute lg:bottom-5 lg:left-1/2 lg:-translate-x-1/2 lg:right-auto lg:z-10',
          mobileView === 'map' ? 'block' : 'hidden lg:block',
        )}>
          {!bulkPanOpen ? (
            <button
              onClick={() => setBulkPanOpen(true)}
              className="absolute top-4 right-4 lg:relative lg:top-0 lg:right-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white dark:bg-paper-2 border border-line dark:border-line-2 text-[11px] font-mono uppercase tracking-[0.10em] font-semibold text-ink-2 hover:text-ink hover:border-ink-3 shadow-[0_4px_12px_rgba(29,34,24,.10)] transition-colors"
              title="Bulk auto-pan: walk a state grid and let the analysis pipeline run"
            >
              Bulk auto-pan
            </button>
          ) : (
            <BulkPanPanel
              loading={loading}
              lastAnalysedAt={lastAnalysedAt}
              setSearchLocation={setSearchLocation}
              onClose={() => setBulkPanOpen(false)}
            />
          )}
        </div>

        {/* === DESKTOP FLOATING HEADER (3 pills) ===
             Logo + nav (left) · centered search bar · location + avatar (right).
             All sit at top:5 over the full-bleed map. */}
        <ExploreHeaderPills
          coordLabel={coordLabel}
          placeLabel={placeLabel}
          searchLocation={searchLocation}
          onSearchChange={handleLocationChange}
        />

        {/* === LEFT FILTER PANEL — genie collapse ===
             Header strip stays put at the same width; the body collapses
             with a smooth max-height animation. While loading, the panel
             stays collapsed; on results-arrival it auto-expands. */}
        <aside
          className={cn(
            'hidden lg:flex absolute top-[88px] left-5 w-[330px] z-10 flex-col bg-cream dark:bg-paper-2 border border-line dark:border-line-2 rounded-[16px] shadow-[0_18px_44px_rgba(29,34,24,.14)] overflow-hidden transition-[max-height] duration-300 ease-out',
            filterCardOpen ? 'max-h-[calc(100vh-108px)]' : 'max-h-[60px]',
          )}
        >
          {/* Header — always visible. Click the strip (or the +/- toggle)
              to open/close. Reset lives inline so it stays reachable while
              the body is collapsed. */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => setFilterCardOpen((o) => !o)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setFilterCardOpen((o) => !o);
              }
            }}
            aria-expanded={filterCardOpen}
            className="shrink-0 px-[18px] py-4 flex items-center justify-between gap-2 cursor-pointer hover:bg-paper-2/40 dark:hover:bg-paper/40 transition-colors select-none"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Funnel className="w-4 h-4 text-ink flex-shrink-0" weight="regular" />
              <span className="text-[15px] font-sans font-bold tracking-[-0.01em] text-ink">
                Filters
              </span>
              {!loading && spotFilters.size > 0 && (
                <Mono className="text-pine-6">{spotFilters.size} active</Mono>
              )}
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              {/* Reset — only when there are active filters. Lives inline so
                  the action is reachable even when the body is collapsed. */}
              {(spotFilters.size > 0 || visibleLandAgencies.size > 0) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSpotFilters(new Set());
                    setVisibleLandAgencies(new Set());
                  }}
                  className="text-[11px] font-mono uppercase tracking-[0.10em] font-semibold text-ink-3 hover:text-ember transition-colors"
                >
                  Reset
                </button>
              )}
              {!loading && searchLocation && (spotFilters.size === 0 && visibleLandAgencies.size === 0) && (
                <Mono className="text-ink-3">{unifiedSpotList.length}</Mono>
              )}
              {/* +/- toggle indicator */}
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-line text-ink-3">
                {filterCardOpen ? (
                  <Minus className="w-3 h-3" weight="bold" />
                ) : (
                  <Plus className="w-3 h-3" weight="bold" />
                )}
              </span>
            </div>
          </div>

          {/* Result summary — big sans count + mono "IN VIEW" + subtitle */}
          {searchLocation && !loading && (
            <div className="px-[18px] pb-4">
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-[24px] font-sans font-bold tracking-[-0.02em] text-ink leading-none">
                  {unifiedSpotList.length} {unifiedSpotList.length === 1 ? 'spot' : 'spots'}
                </div>
                <Mono className="text-ink-3">In view</Mono>
              </div>
              <p className="text-[12px] text-ink-3 mt-1.5">
                {filteredPotentialSpots.length + allEstablishedCampgrounds.length + campsites.length} indexed nearby
              </p>
            </div>
          )}

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-[18px]">
            {loading && (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-pine-6/10 mb-3">
                  <SpinnerGap className="w-5 h-5 text-pine-6 animate-spin" />
                </div>
                <Mono className="text-pine-6">Discovering campsites…</Mono>
              </div>
            )}

            {!searchLocation && !loading && (
              <div className="border border-dashed border-line dark:border-line-2 bg-white/50 dark:bg-paper/50 rounded-[14px] px-5 py-10 text-center">
                <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-pine-6/10 text-pine-6 mb-3">
                  <MagnifyingGlass className="w-5 h-5" weight="regular" />
                </div>
                <p className="text-[14px] font-sans font-semibold text-ink">Search for a location</p>
                <p className="text-[12px] text-ink-3 mt-1.5 leading-[1.5]">
                  Pick a region above, or tap anywhere on the map.
                </p>
              </div>
            )}

            {searchLocation && !loading && (
              <SpotFiltersPanel
                spotFilters={spotFilters}
                onToggleFilter={toggleFilter}
                onClearFilters={() => setSpotFilters(new Set())}
                roadFilter={roadFilter}
                onChangeRoadFilter={setRoadFilter}
                dispersedSourceFilters={dispersedSourceFilters}
                onToggleDispersedSource={toggleDispersedSource}
                visibleLandAgencies={visibleLandAgencies}
                onToggleLandAgency={toggleLandAgency}
              />
            )}
          </div>

          {/* Sticky cache strip footer — surfaces freshness without burning
              filter real estate. */}
          {searchLocation && !loading && (
            <div className="px-[18px] py-3 border-t border-line dark:border-line-2 bg-cream dark:bg-paper-2">
              <CacheStrip
                useDatabase={useDatabase}
                lastAnalysedAt={lastAnalysedAt}
                refreshing={refreshing}
                onReanalyse={() => {
                  regionSavedRef.current = null;
                  setRefreshing(true);
                  setReanalyseBust((n) => n + 1);
                }}
              />
            </div>
          )}
        </aside>

        {/* === RIGHT FLOATING CARD: Results / Detail panel === */}
        <aside
          className={cn(
            'flex flex-col overflow-hidden bg-cream dark:bg-paper-2',
            'lg:absolute lg:top-[88px] lg:right-5 lg:bottom-5 lg:w-[400px] lg:z-10',
            'lg:border lg:border-line dark:lg:border-line-2 lg:rounded-[16px] lg:shadow-[0_18px_44px_rgba(29,34,24,.14)]',
            mobileView === 'list' ? 'flex-1' : 'hidden lg:flex',
          )}
        >
          {selectedSpot ? (
            <SpotDetailPanel
              selectedSpot={selectedSpot}
              existingCampsiteForSpot={existingCampsiteForSpot}
              aiAnalysis={aiAnalysis}
              aiAnalyzing={aiAnalyzing}
              aiCheckingCache={aiCheckingCache}
              aiError={aiError}
              copiedCoords={copiedCoords}
              fromDatabase={useDatabase}
              onBack={clearAllSelections}
              onCopyCoords={copySpotCoords}
              onAnalyze={() => runSpotAnalysis(false)}
              onReanalyze={() => runSpotAnalysis(true)}
              onDismissError={() => setAiError(null)}
              onSave={handleSaveSpot}
              onConfirm={() => setConfirmDialogOpen(true)}
              onMarkForDelete={handleMarkForDelete}
              isMarkedForDelete={!!selectedSpot && removeIds.has(selectedSpot.id)}
            />
          ) : selectedCampground ? (
            <CampgroundDetailPanel campground={selectedCampground} onBack={clearAllSelections} />
          ) : selectedCampsite ? (
            <UserCampsiteDetailPanel
              campsite={selectedCampsite}
              onBack={clearAllSelections}
              aiAnalysis={aiAnalysis}
              aiAnalyzing={aiAnalyzing}
              aiCheckingCache={aiCheckingCache}
              aiError={aiError}
              onAnalyze={() => runSpotAnalysis(false)}
              onReanalyze={() => runSpotAnalysis(true)}
              onDismissError={() => setAiError(null)}
            />
          ) : selectedRoad ? (
            <RoadDetailPanel
              road={selectedRoad}
              fromDatabase={useDatabase}
              onBack={clearAllSelections}
            />
          ) : (
            <>
              {/* Results header — larger title + sort dropdown on the right
                  (was a static mono cap reading "Sort · recommended"). The
                  filter panel no longer carries a sort group; sort lives
                  here next to the count instead. */}
              <div className="px-4 py-3.5 border-b border-line flex items-center justify-between gap-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-[18px] font-sans font-bold tracking-[-0.015em] text-ink">Results</span>
                  {searchLocation && !loading && <Mono className="text-ink-3">{unifiedSpotList.length}</Mono>}
                </div>
                {searchLocation && !loading && unifiedSpotList.length > 0 && (
                  <Select value={sortBy} onValueChange={(v) => setSortBy(v as 'distance' | 'rating' | 'recommended')}>
                    <SelectTrigger className="w-auto h-8 pl-3 pr-2.5 gap-3 text-[12px] font-sans font-semibold rounded-full">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="text-ink-3">Sort:</span>
                        <SelectValue />
                      </span>
                    </SelectTrigger>
                    <SelectContent align="end">
                      <SelectItem value="recommended">Recommended</SelectItem>
                      <SelectItem value="distance">Distance</SelectItem>
                      <SelectItem value="rating">Rating</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Mobile-only: search + cache + stats + filters live above the
                  list since there's no left card on small screens. */}
              <div className="lg:hidden p-4 space-y-3 border-b border-line">
                {searchLocation && !loading && (
                  <>
                    <CacheStrip
                      useDatabase={useDatabase}
                      lastAnalysedAt={lastAnalysedAt}
                      refreshing={refreshing}
                      onReanalyse={() => {
                        regionSavedRef.current = null;
                        setRefreshing(true);
                        setReanalyseBust((n) => n + 1);
                      }}
                    />
                    <ResultsStatsRow
                      filteredPotentialSpots={filteredPotentialSpots}
                      allEstablishedCampgrounds={allEstablishedCampgrounds}
                      campsites={campsitesInRadius}
                    />
                    <SpotFiltersPanel
                      spotFilters={spotFilters}
                      onToggleFilter={toggleFilter}
                      onClearFilters={() => setSpotFilters(new Set())}
                      roadFilter={roadFilter}
                      onChangeRoadFilter={setRoadFilter}
                      dispersedSourceFilters={dispersedSourceFilters}
                      onToggleDispersedSource={toggleDispersedSource}
                      visibleLandAgencies={visibleLandAgencies}
                      onToggleLandAgency={toggleLandAgency}
                    />
                  </>
                )}
              </div>

              {/* Body — no horizontal padding so result rows go full-width
                  (each row owns its own px-4 gutter). */}
              <div className="flex-1 min-h-0 overflow-y-auto">
                {loading && (
                  <div className="flex flex-col items-center justify-center py-12 px-4">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-pine-6/10 mb-3">
                      <SpinnerGap className="w-5 h-5 text-pine-6 animate-spin" />
                    </div>
                    <Mono className="text-pine-6">Discovering campsites…</Mono>
                  </div>
                )}

                {!searchLocation && !loading && (
                  <div className="border border-dashed border-line dark:border-line-2 bg-white/50 dark:bg-paper/50 rounded-[14px] m-4 px-5 py-10 text-center">
                    <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-pine-6/10 text-pine-6 mb-3">
                      <MagnifyingGlass className="w-5 h-5" weight="regular" />
                    </div>
                    <p className="text-[14px] font-sans font-semibold text-ink">Search for a location</p>
                    <p className="text-[12px] text-ink-3 mt-1.5 leading-[1.5]">
                      Pick a region in the search above, or tap anywhere on the map.
                    </p>
                  </div>
                )}

                {searchLocation && !loading && (
                  <SpotResultsList
                    unifiedSpotList={unifiedSpotList}
                    spotsToShow={spotsToShow}
                    selectedSpot={selectedSpot}
                    selectedCampground={selectedCampground}
                    selectedCampsite={selectedCampsite}
                    hasFilters={spotFilters.size > 0}
                    onClickSpot={handleUnifiedSpotClick}
                    onClearFilters={() => setSpotFilters(new Set())}
                    onShowMore={() => setSpotsToShow(prev => Math.min(prev + 50, unifiedSpotList.length))}
                    onShowLess={() => setSpotsToShow(30)}
                  />
                )}
              </div>
            </>
          )}
        </aside>
      </div>

      {/* Confirm Spot Dialog */}
      {selectedSpot && (
        <ConfirmSpotDialog
          spot={selectedSpot}
          open={confirmDialogOpen}
          onOpenChange={setConfirmDialogOpen}
          existingCampsite={existingCampsiteForSpot}
          onConfirmed={() => {
            // Refresh the existing campsite data for this spot
            findExistingExplorerSpot(selectedSpot.lat, selectedSpot.lng).then(setExistingCampsiteForSpot);
            // Refresh explorer spots list
            if (searchLocation) {
              getExplorerSpots(searchLocation.lat, searchLocation.lng, 10).then(setExplorerSpots);
            }
          }}
        />
      )}

      {/* Save from map tap */}
      {mapTapPoint && (
        <AddCampsiteModal
          isOpen={saveFromMapOpen}
          onClose={() => {
            setSaveFromMapOpen(false);
            setMapTapPoint(null);
          }}
          initialLat={mapTapPoint.lat}
          initialLng={mapTapPoint.lng}
        />
      )}
    </div>
  );
};

export default DispersedExplorer;

// Tiny inline component for the "Database cache / Fresh analysis" status pill.
// Used in both the desktop filter card and the mobile results block. Label
// stacks above the date so neither truncates in the narrow filter card.
const CacheStrip = ({
  useDatabase,
  lastAnalysedAt,
  refreshing,
  onReanalyse,
}: {
  useDatabase: boolean;
  lastAnalysedAt: Date | null;
  refreshing: boolean;
  onReanalyse: () => void;
}) => {
  const label = useDatabase ? 'Database cache' : 'Fresh analysis';
  const labelClass = useDatabase ? 'text-pine-6' : 'text-clay';
  const dotClass = useDatabase ? 'bg-pine-6' : 'bg-clay';
  const dateText = lastAnalysedAt
    ? `${lastAnalysedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${lastAnalysedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
    : null;

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-[10px] border border-line dark:border-line-2 bg-white dark:bg-paper">
      <div className="flex items-start gap-2 min-w-0">
        <span className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${dotClass}`} />
        <div className="flex flex-col min-w-0 leading-tight">
          <Mono className={labelClass}>{label}</Mono>
          {dateText && <Mono className="text-ink-3">{dateText}</Mono>}
        </div>
      </div>
      {lastAnalysedAt && (
        <button
          onClick={onReanalyse}
          disabled={refreshing}
          className="text-[11px] font-mono uppercase tracking-[0.10em] font-semibold text-pine-6 hover:text-pine-5 transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {refreshing ? 'Refreshing…' : 'Re-analyse'}
        </button>
      )}
    </div>
  );
};

// === Custom desktop floating header for the explore page ===
// Three pills sit absolute at the top of the map:
//   1. Logo + nav links (left)
//   2. Search bar (center)
//   3. Place label + avatar (right)
// Mirrors the Pine Grove "explore-mapfirst-split" reference exactly. The
// global Header is hidden on lg+ here and used only on mobile.
const ExploreHeaderPills = ({
  coordLabel,
  placeLabel,
  searchLocation,
  onSearchChange,
}: {
  coordLabel: string | null;
  placeLabel: string | null;
  searchLocation: SelectedLocation | null;
  onSearchChange: (loc: SelectedLocation) => void;
}) => {
  const { pathname } = useLocation();
  const isOn = (p: string) => (p === '/' ? pathname === '/' : pathname.startsWith(p));
  const [copiedHeaderCoords, setCopiedHeaderCoords] = useState(false);

  return (
  <div className="hidden lg:block pointer-events-none">
    {/* Left pill — logo + nav links */}
    <div className="absolute top-5 left-5 z-20 pointer-events-auto inline-flex items-center gap-2.5 px-3.5 py-2 bg-cream/95 dark:bg-paper-2/95 backdrop-blur-md border border-line dark:border-line-2 rounded-full shadow-[0_4px_12px_rgba(29,34,24,.08)]">
      <Link to="/" className="inline-flex items-center gap-2 pl-0.5">
        <Jeep className="w-5 h-5 text-pine-6" weight="regular" />
        <span className="text-[14px] font-sans font-bold tracking-[-0.01em] text-ink">RoamsWild</span>
      </Link>
      <span className="w-px h-3.5 bg-line mx-1" />
      <NavLink to="/dispersed" active={isOn('/dispersed')}>Explore</NavLink>
      <NavLink to="/my-trips"  active={isOn('/my-trips')}>Trips</NavLink>
      <NavLink to="/saved"     active={isOn('/saved')}>Saved</NavLink>
    </div>

    {/* Center pill — search bar with leading icon, input, mono coords,
        and a solid pine "Search" button (matches the design exactly). */}
    <div className="absolute top-5 left-1/2 -translate-x-1/2 z-20 pointer-events-auto w-[min(560px,calc(100vw-740px))] min-w-[380px]">
      <div className="flex items-center gap-2.5 bg-cream dark:bg-paper-2 border border-line dark:border-line-2 rounded-[14px] shadow-[0_12px_32px_rgba(29,34,24,.12)] pl-3.5 pr-1.5 py-1.5">
        <MagnifyingGlass className="w-4 h-4 text-ink-3 flex-shrink-0" weight="regular" />
        <div className="flex-1 min-w-0">
          {/* LocationSelector handles the actual Places autocomplete — strip
              its chrome so it slots into our pill cleanly. */}
          <LocationSelector
            value={searchLocation}
            onChange={onSearchChange}
            placeholder="Search a region, road, or coordinate"
            showMyLocation={false}
            showSavedLocations={false}
            showCoordinates={false}
            onMapClickHint={false}
            compact={true}
            className="!gap-0 !flex-row [&_input]:!border-none [&_input]:!shadow-none [&_input]:!h-auto [&_input]:!py-1.5 [&_input]:!pl-0 [&_input]:!bg-transparent [&_input]:!text-[14px] [&_button]:!hidden [&_.relative>svg:first-child]:!hidden"
          />
        </div>
        {coordLabel && (
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(coordLabel);
              setCopiedHeaderCoords(true);
              setTimeout(() => setCopiedHeaderCoords(false), 2000);
            }}
            title="Copy coordinates — paste into Google Maps to open"
            className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.10em] text-ink-3 hover:text-ink transition-colors hidden xl:inline-flex whitespace-nowrap"
          >
            {copiedHeaderCoords ? (
              <CheckCircle size={13} weight="fill" className="text-pine-6" />
            ) : (
              <Copy size={11} weight="regular" />
            )}
            {coordLabel}
          </button>
        )}
        <button
          type="button"
          // Visual "Search" affordance — Places autocomplete already commits
          // selection on dropdown click, so this button is a no-op marker.
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-pine-6 text-cream dark:text-ink-pine text-[12px] font-sans font-semibold hover:bg-pine-5 transition-colors flex-shrink-0"
          tabIndex={-1}
        >
          Search
          <ArrowRight className="w-3 h-3" weight="bold" />
        </button>
      </div>
    </div>

    {/* Right pill — place label + account menu (opens the same dropdown
        as the global Header's avatar). */}
    <div className="absolute top-5 right-5 z-20 pointer-events-auto inline-flex items-center gap-2 pl-3 pr-1 py-1 bg-cream/95 dark:bg-paper-2/95 backdrop-blur-md border border-line dark:border-line-2 rounded-full shadow-[0_4px_12px_rgba(29,34,24,.08)]">
      {placeLabel && <Mono className="text-ink-2">{placeLabel}</Mono>}
      <AccountAvatarMenu size="sm" />
    </div>
  </div>
  );
};

// Same active treatment as the global Header (solid-ink fill with cream
// text) so the active-page indicator looks identical across both navs.
const NavLink = ({
  to,
  active,
  children,
}: {
  to: string;
  active?: boolean;
  children: React.ReactNode;
}) => (
  <Link
    to={to}
    className={cn(
      'inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-sans font-semibold tracking-[-0.005em] transition-colors',
      active
        ? 'bg-ink dark:bg-ink-pine text-cream hover:bg-ink-2'
        : 'text-ink hover:bg-ink/5 dark:hover:bg-paper/40',
    )}
  >
    {children}
  </Link>
);
