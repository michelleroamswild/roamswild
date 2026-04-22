import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { MapPin, MagnifyingGlass, Path, SpinnerGap, Tent, Drop, MapPinLine } from '@phosphor-icons/react';
import { supabase } from '@/integrations/supabase/client';
import { LocationSelector, SelectedLocation } from '@/components/LocationSelector';
import { useDispersedRoads, MVUMRoad, OSMTrack, PotentialSpot, EstablishedCampground } from '@/hooks/use-dispersed-roads';
import { usePublicLands } from '@/hooks/use-public-lands';
import { useDispersedDatabase } from '@/hooks/use-dispersed-database';
import { useCampsites } from '@/context/CampsitesContext';
import { useFriends } from '@/context/FriendsContext';
import { useAuth } from '@/context/AuthContext';
import { useGoogleMaps } from '@/components/GoogleMapsProvider';
import { Header } from '@/components/Header';
import { ConfirmSpotDialog } from '@/components/ConfirmSpotDialog';
import { AddCampsiteModal } from '@/components/AddCampsiteModal';
import { createSimpleMarkerIcon } from '@/utils/mapMarkers';
import type { Campsite } from '@/types/campsite';
import { isPointInPolygon, isWithinAnyPublicLand, findContainingLand, isFalseDeadEnd } from '@/utils/dispersedExplorer';
import { FloatingSpotDetailCard } from '@/components/dispersed-explorer/FloatingSpotDetailCard';
import { FloatingCampgroundDetailCard } from '@/components/dispersed-explorer/FloatingCampgroundDetailCard';
import { FloatingUserCampsiteDetailCard } from '@/components/dispersed-explorer/FloatingUserCampsiteDetailCard';
import { FloatingLegend } from '@/components/dispersed-explorer/FloatingLegend';
import { MobileViewTabs } from '@/components/dispersed-explorer/MobileViewTabs';
import { ResultsStatsRow } from '@/components/dispersed-explorer/ResultsStatsRow';
import { SpotFiltersPanel } from '@/components/dispersed-explorer/SpotFiltersPanel';
import { SpotResultsList } from '@/components/dispersed-explorer/SpotResultsList';
import { SelectedCampgroundCard } from '@/components/dispersed-explorer/SelectedCampgroundCard';
import { DispersedMap } from '@/components/dispersed-explorer/DispersedMap';
import type { UnifiedSpot } from '@/components/dispersed-explorer/types';


const DispersedExplorer = () => {
  const { isLoaded } = useGoogleMaps();
  const [searchParams] = useSearchParams();
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
  const [showPublicLands, setShowPublicLands] = useState(true);
  const [roadFilter, setRoadFilter] = useState<'all' | 'passenger' | 'high-clearance' | '4wd'>('all');
  // Multi-select filter for spot types/confidence - empty set means show all
  const [spotFilters, setSpotFilters] = useState<Set<string>>(new Set());
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
  const [aiError, setAiError] = useState<string | null>(null);
  const analysisCache = useRef<Map<string, typeof aiAnalysis>>(new Map());
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [existingCampsiteForSpot, setExistingCampsiteForSpot] = useState<Campsite | null>(null);
  const [sortBy, setSortBy] = useState<'distance' | 'rating' | 'recommended'>('recommended');
  const mapRef = useRef<google.maps.Map | null>(null);

  const { findExistingExplorerSpot, getExplorerSpots, campsites, friendsCampsites } = useCampsites();
  const { getFriendById } = useFriends();
  const { user } = useAuth();
  const [explorerSpots, setExplorerSpots] = useState<Campsite[]>([]);
  const [showMyCampsites, setShowMyCampsites] = useState(true);
  const [showFriendsCampsites, setShowFriendsCampsites] = useState(true);
  const [mobileView, setMobileView] = useState<'list' | 'map'>('list');
  const [mapTapPoint, setMapTapPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [saveFromMapOpen, setSaveFromMapOpen] = useState(false);
  const [selectedCampsite, setSelectedCampsite] = useState<Campsite | null>(null);

  // Toggle between database (fast) and client-side (comprehensive with roads) data sources
  // Currently defaulting to Full mode (client-side) while database ingestion is paused
  const [useDatabase, setUseDatabase] = useState(false);


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
    10
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
    osmTracks: clientOsmTracks,
    potentialSpots: clientSpots,
    establishedCampgrounds: clientCampgrounds,
    loading: clientLoading,
    error: clientError,
  } = useDispersedRoads(
    !useDatabase ? (searchLocation?.lat ?? null) : null,
    !useDatabase ? (searchLocation?.lng ?? null) : null,
    10
  );

  // Hybrid approach: database for spots/campgrounds/roads, client-side for public lands
  const mvumRoads = useDatabase ? dbMvumRoads : clientMvumRoads;
  const osmTracks = useDatabase ? dbOsmTracks : clientOsmTracks;
  const potentialSpots = useDatabase ? dbSpots : clientSpots;
  const establishedCampgrounds = useDatabase ? dbCampgrounds : clientCampgrounds;
  const loading = useDatabase ? dbLoading : clientLoading;
  const error = useDatabase ? dbError : clientError;
  // Always use client public lands (complete boundaries from direct API)
  const publicLands = clientPublicLands;
  const publicLandsLoading = clientPublicLandsLoading;

  // Selected established campground
  const [selectedCampground, setSelectedCampground] = useState<EstablishedCampground | null>(null);

  // Handle URL parameters for initial location (e.g., from "Find camps near me")
  useEffect(() => {
    if (initialLocationLoaded) return;

    const lat = searchParams.get('lat');
    const lng = searchParams.get('lng');
    const name = searchParams.get('name');

    if (lat && lng) {
      const parsedLat = parseFloat(lat);
      const parsedLng = parseFloat(lng);

      if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
        const location: SearchLocation = {
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

  // Helper to check if a point is within a restricted area
  // Restricted: National Parks, State Parks, Tribal Lands
  // Allowed: National Recreation Areas, Monuments, Seashores, Preserves, BLM, USFS, etc.
  const isWithinRestrictedArea = useCallback(
    (lat: number, lng: number): boolean => {
      const restrictedLands = publicLands.filter((l) => {
        // State Parks are always restricted
        if (l.managingAgency === 'STATE') return true;

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
      campSites = campSites
        .filter((spot) => {
          const name = spot.name || '';

          // Filter out established campgrounds (they're added to campgrounds list above)
          if (isLikelyEstablishedCampground(spot)) return false;

          // Filter out backcountry/hike-in camps that aren't near any road
          // Use real-time check against loaded roads to match Full mode behavior
          // (database flag may not be backfilled, so we check against actual road data)
          if (!isNearAnyRoad(spot.lat, spot.lng, 0.25)) return false;

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
      // First check: filter out false dead-ends (actually intersections)
      // This matches the logic in use-dispersed-roads.ts for Full mode
      if (isFalseDeadEnd(spot, allRoads)) return false;

      // NOTE: Private road filtering is handled at database import time
      // Derived spots near private roads should not be in the database

      // Exclude spots in National Parks or State Parks (dispersed camping not allowed)
      if (isWithinRestrictedArea(spot.lat, spot.lng)) return false;

      // Exclude derived spots near established campgrounds (use the campground instead)
      // Uses 0.5 miles to match Full mode behavior
      if (isNearEstablishedCampground(spot.lat, spot.lng, 0.5)) return false;

      // MVUM roads are definitely on public land (National Forest) - always include
      if (spot.isOnMVUMRoad) return true;

      // BLM roads are definitely on public land (BLM) - always include
      if (spot.isOnBLMRoad) return true;

      // For ALL other spots (including those claiming isOnPublicLand from OSM heuristics),
      // validate against polygon data if available - this is the authoritative check
      if (publicLands.length > 0) {
        const withinPublicLand = isWithinAnyPublicLand(spot.lat, spot.lng, publicLands);
        if (withinPublicLand) return true;

        // Spot is NOT within any public land polygon - reject as likely private land
        // This overrides the isOnPublicLand heuristic from OSM road characteristics
        return false;
      }

      // No polygon coverage - fall back to isOnPublicLand heuristic or MVUM presence
      if (spot.isOnPublicLand) return true;
      return hasMVUMRoads;
    });

    const blmPolygons = publicLands.filter(l => l.managingAgency === 'BLM').length;
    const usfsPolygons = publicLands.filter(l => l.managingAgency === 'USFS' || l.managingAgency === 'FS').length;
    const npsPolygons = publicLands.filter(l => l.managingAgency === 'NPS').length;
    const statePolygons = publicLands.filter(l => l.managingAgency === 'STATE').length;
    const stateTrustPolygons = publicLands.filter(l => ['SDOL', 'SFW', 'SPR', 'SDNR'].includes(l.managingAgency)).length;
    const landTrustPolygons = publicLands.filter(l => l.managingAgency === 'NGO').length;
    console.log(`Polygons: ${blmPolygons} BLM, ${usfsPolygons} USFS, ${npsPolygons} NPS, ${statePolygons} State Park, ${stateTrustPolygons} State Trust, ${landTrustPolygons} Land Trust, ${publicLands.length} total`);

    // Log false dead-end filtering (matching Full mode behavior)
    const falseDeadEndCount = derivedSpots.filter(s => isFalseDeadEnd(s, allRoads)).length;
    if (falseDeadEndCount > 0) {
      console.log(`Filtered out ${falseDeadEndCount} false dead-ends (actually intersections)`);
    }

    // Remove derived spots that are very close to camp sites
    // OSM camp sites are explicitly tagged and should take precedence
    // Use 0.06 miles (~100 meters) to match Full mode
    const CAMP_DEDUP_MILES = 0.06;
    const dedupedDerived = filteredDerived.filter(derived => {
      const nearCampSite = campSites.some(camp => {
        const latDiff = Math.abs(derived.lat - camp.lat);
        const lngDiff = Math.abs(derived.lng - camp.lng);
        // Approximate: 1 degree ≈ 69 miles
        const distMiles = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff) * 69;
        return distMiles < CAMP_DEDUP_MILES;
      });
      return !nearCampSite;
    });

    // Also deduplicate derived spots that are very close to each other
    const DERIVED_DEDUP_THRESHOLD = 0.0005; // ~50 meters
    const finalDerived = dedupedDerived.filter((spot, index, array) => {
      // Keep this spot only if no earlier spot is within threshold
      return !array.slice(0, index).some(earlier => {
        const latDiff = Math.abs(spot.lat - earlier.lat);
        const lngDiff = Math.abs(spot.lng - earlier.lng);
        return latDiff < DERIVED_DEDUP_THRESHOLD && lngDiff < DERIVED_DEDUP_THRESHOLD;
      });
    });

    console.log(`Derived spots: ${derivedSpots.length} total, ${filteredDerived.length} after filtering, ${finalDerived.length} after dedup`);

    // Filter out spots with score < 25 (we don't show the Unverified category)
    const qualifiedDerived = finalDerived.filter(s => s.score >= 25);

    // Enrich unnamed spots with public land names
    // Track counts per land area for numbering
    const landCounts = new Map<string, number>();
    const enrichedDerived = qualifiedDerived.map(spot => {
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
      // Spot type/confidence filter (multi-select)
      // If no filters selected (empty set), show all spots
      if (spotFilters.size > 0) {
        const isKnown = spot.type === 'camp-site';
        const isHigh = !isKnown && spot.score >= 35;
        const isMedium = !isKnown && spot.score >= 25 && spot.score < 35;

        // Check if spot matches any selected filter
        const matches =
          (spotFilters.has('known') && isKnown) ||
          (spotFilters.has('high') && isHigh) ||
          (spotFilters.has('medium') && isMedium);

        if (!matches) return false;
      }

      // Road type filter based on ROUTE REACHABILITY
      if (roadFilter !== 'all') {
        if (roadFilter === 'passenger') {
          // Only show spots that are REACHABLE via passenger-accessible roads
          if (spot.passengerReachable !== true) return false;
        } else if (roadFilter === 'high-clearance') {
          // Show spots reachable by high-clearance vehicles (passenger + high-clearance roads, no 4WD)
          if (spot.highClearanceReachable !== true) return false;
        }
        // '4wd' filter - show all spots (4WD can get anywhere)
      }

      return true;
    });
  }, [potentialSpots, publicLands, mvumRoads, osmTracks, isWithinRestrictedArea, isWithinTribalLand, isNearEstablishedCampground, isLikelyEstablishedCampground, useDatabase, roadFilter, spotFilters]);

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

  // Computed visibility for campgrounds and user campsites based on filters
  // They show when: no filters are selected, OR their specific filter is selected
  const showCampgroundsFiltered = spotFilters.size === 0 || spotFilters.has('campgrounds');
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

    // Add filtered derived spots
    filteredPotentialSpots.forEach(spot => {
      const distance = getDistanceMiles(spot.lat, spot.lng);
      const recScore = recScoreMap.get(spot.id);
      unified.push({
        id: `derived-${spot.id}`,
        name: spot.name,
        lat: spot.lat,
        lng: spot.lng,
        category: 'derived',
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
  }, [filteredPotentialSpots, allEstablishedCampgrounds, campsites, friendsCampsites, showCampgroundsFiltered, showMyCampsites, showMyCampsitesFiltered, showFriendsCampsites, getFriendById, searchLocation, topRecommendations, sortBy]);

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
  }, []);

  const onMapClick = useCallback((e: google.maps.MapMouseEvent) => {
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
      setSelectedSpot(null);
      setSelectedCampground(null);
      setSelectedCampsite(null);
    }
  }, []);

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

  // Check if a spot has been confirmed in the database
  const isSpotConfirmed = useCallback((spot: PotentialSpot): Campsite | null => {
    // Check if this spot exists in explorerSpots (within ~50m)
    const radiusDegrees = 50 / 111000;
    return explorerSpots.find(es =>
      Math.abs(es.lat - spot.lat) < radiusDegrees &&
      Math.abs(es.lng - spot.lng) < radiusDegrees
    ) || null;
  }, [explorerSpots]);

  // Get marker icon for a spot
  // - Purple dots for confirmed spots and OSM camp-sites
  // - Simple colored circles for derived/potential spots
  const getSpotMarkerIcon = useCallback((spot: PotentialSpot, isSelected: boolean) => {
    const confirmedSpot = isSpotConfirmed(spot);

    // Confirmed spots get purple dot
    if (confirmedSpot) {
      return createSimpleMarkerIcon('camp', {
        isActive: isSelected,
        size: isSelected ? 10 : 8
      });
    }

    // All non-confirmed spots get simple circles with confidence-based colors
    // OSM camp-sites (known) get mossgreen, derived spots get colors based on score
    let fillColor = '#e83a3a'; // accent-coralred darkened hsl(0 83% 51%) - low confidence
    if (spot.type === 'camp-site') fillColor = '#3d7a40'; // accent-mossgreen darkened hsl(118 39% 30%)
    else if (spot.score >= 35) fillColor = '#eab308'; // Yellow - high confidence
    else if (spot.score >= 25) fillColor = '#f97316'; // Orange - medium confidence

    const size = isSelected ? 10 : 7;
    return {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor,
      fillOpacity: 1,
      strokeColor: isSelected ? '#3f3e2c' : '#ffffff',
      strokeWeight: isSelected ? 2 : 1,
      scale: size,
    };
  }, [isSpotConfirmed]);

  const getSpotIcon = (type: PotentialSpot['type']) => {
    switch (type) {
      case 'camp-site': return <Tent className="w-4 h-4 text-mossgreen" />;
      case 'dead-end': return <MapPinLine className="w-4 h-4 text-orange-600" />;
      case 'intersection': return <Path className="w-4 h-4 text-blue-600" />;
      case 'water-access': return <Drop className="w-4 h-4 text-cyan-600" />;
      default: return <MapPin className="w-4 h-4 text-gray-600" />;
    }
  };


  const totalRoads = mvumRoads.length + osmTracks.length;

  const runSpotAnalysis = async (force: boolean = false) => {
    if (!selectedSpot) return;
    if (aiAnalysis && !force) return;
    if (force) {
      setAiAnalysis(null);
      setAiError(null);
    }
    setAiAnalyzing(true);
    setAiError(null);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-campsite', {
        body: {
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
          ...(force && { force: true }),
        },
      });
      if (error) throw error;
      setAiAnalysis(data.analysis);
      analysisCache.current.set(`${selectedSpot.lat.toFixed(5)},${selectedSpot.lng.toFixed(5)}`, data.analysis);
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

  const handleUnifiedSpotClick = (spot: UnifiedSpot) => {
    if (spot.category === 'derived' && spot.originalSpot) {
      const s = spot.originalSpot;
      setSelectedSpot(s);
      setSelectedCampground(null);
      setSelectedCampsite(null);
      setAiError(null);
      const ck = `${s.lat.toFixed(5)},${s.lng.toFixed(5)}`;
      const ca = analysisCache.current.get(ck);
      if (ca) {
        setAiAnalysis(ca);
      } else {
        setAiAnalysis(null);
        const eps2 = 0.00001;
        supabase
          .from('spot_analyses')
          .select('analysis')
          .gte('lat', s.lat - eps2)
          .lte('lat', s.lat + eps2)
          .gte('lng', s.lng - eps2)
          .lte('lng', s.lng + eps2)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
          .then(({ data }) => {
            if (data?.analysis) {
              setAiAnalysis(data.analysis);
              analysisCache.current.set(ck, data.analysis);
            }
          });
      }
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

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <Header showBorder />

      {/* Mobile: Search + toggle above content */}
      <div className="lg:hidden shrink-0 p-3 pb-0 space-y-2">
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

      <div className="flex-1 flex flex-col lg:grid lg:grid-cols-2 overflow-hidden">
        {/* Map - Left side on desktop, toggled on mobile */}
        <div className={`order-2 lg:order-1 lg:h-full relative ${mobileView === 'map' ? 'flex-1' : 'hidden lg:block'}`}>
          <DispersedMap
            mapRef={mapRef}
            mapCenter={mapCenter}
            mapZoom={mapZoom}
            onMapLoad={onMapLoad}
            onMapClick={onMapClick}
            searchLocation={searchLocation}
            showPublicLands={showPublicLands}
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
              setAiError(null);
              const cacheKey = `${spot.lat.toFixed(5)},${spot.lng.toFixed(5)}`;
              const cached = analysisCache.current.get(cacheKey);
              if (cached) {
                setAiAnalysis(cached);
              } else {
                setAiAnalysis(null);
                const eps = 0.00001;
                supabase
                  .from('spot_analyses')
                  .select('analysis')
                  .gte('lat', spot.lat - eps)
                  .lte('lat', spot.lat + eps)
                  .gte('lng', spot.lng - eps)
                  .lte('lng', spot.lng + eps)
                  .order('created_at', { ascending: false })
                  .limit(1)
                  .maybeSingle()
                  .then(({ data }) => {
                    if (data?.analysis) {
                      setAiAnalysis(data.analysis);
                      analysisCache.current.set(cacheKey, data.analysis);
                    }
                  });
              }
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
            onCloseCampsiteInfo={() => setSelectedCampsite(null)}
            mapTapPoint={mapTapPoint}
            onDismissMapTap={() => setMapTapPoint(null)}
            onOpenSaveFromMap={() => setSaveFromMapOpen(true)}
          />

          {selectedSpot && (
            <FloatingSpotDetailCard
              selectedSpot={selectedSpot}
              existingCampsiteForSpot={existingCampsiteForSpot}
              aiAnalysis={aiAnalysis}
              aiAnalyzing={aiAnalyzing}
              aiError={aiError}
              copiedCoords={copiedCoords}
              onClose={() => { setSelectedSpot(null); setAiAnalysis(null); setAiError(null); }}
              onCopyCoords={copySpotCoords}
              onAnalyze={() => runSpotAnalysis(false)}
              onReanalyze={() => runSpotAnalysis(true)}
              onDismissError={() => setAiError(null)}
              onConfirm={() => setConfirmDialogOpen(true)}
            />
          )}

          {selectedCampground && (
            <FloatingCampgroundDetailCard
              campground={selectedCampground}
              onClose={() => setSelectedCampground(null)}
            />
          )}

          {selectedCampsite && (
            <FloatingUserCampsiteDetailCard
              campsite={selectedCampsite}
              onClose={() => setSelectedCampsite(null)}
            />
          )}

          <FloatingLegend
            showPublicLands={showPublicLands}
            onTogglePublicLands={() => setShowPublicLands(!showPublicLands)}
          />
        </div>

        {/* Sidebar - Right side on desktop, toggled on mobile */}
        <div className={`order-1 lg:order-2 space-y-3 sm:space-y-5 p-3 sm:p-4 md:p-6 min-h-0 overflow-y-auto ${mobileView === 'list' ? 'flex-1' : 'hidden lg:block'}`}>
            {/* Search - desktop only (mobile has it above the toggle) */}
            <div className="hidden lg:block">
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
            </div>

            {/* Loading state */}
            {loading && (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <SpinnerGap className="w-10 h-10 animate-spin mb-4" />
                <p className="text-base">Discovering campsites...</p>
              </div>
            )}

            {/* Search prompt before search */}
            {!searchLocation && !loading && (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <MagnifyingGlass className="w-12 h-12 mb-4 opacity-50" />
                <p className="text-lg text-center font-medium">Search for a location to discover campsites</p>
                <p className="text-sm mt-2 opacity-75">Or click anywhere on the map</p>
              </div>
            )}

            {/* Results: Stats, Filters, Campsites */}
            {searchLocation && !loading && (
              <>
                <ResultsStatsRow
                  filteredPotentialSpots={filteredPotentialSpots}
                  allEstablishedCampgrounds={allEstablishedCampgrounds}
                  campsites={campsites}
                />

                <SpotFiltersPanel
                  spotFilters={spotFilters}
                  onToggleFilter={toggleFilter}
                  onClearFilters={() => setSpotFilters(new Set())}
                  roadFilter={roadFilter}
                  onChangeRoadFilter={setRoadFilter}
                  sortBy={sortBy}
                  onChangeSortBy={setSortBy}
                />

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
              </>
            )}

            {selectedCampground && (
              <SelectedCampgroundCard campground={selectedCampground} />
            )}
        </div>
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
