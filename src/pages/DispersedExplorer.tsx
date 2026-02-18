import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MapPin, MagnifyingGlass, Path, SpinnerGap, TreeEvergreen, Warning, Crosshair, Tent, Drop, MapPinLine, Eye, EyeSlash, Info, Star, NavigationArrow, Car, Jeep, Copy, Check, MapTrifold, CheckCircle, Users, Funnel, ListBullets } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Card, CardContent } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { GoogleMap } from '@/components/GoogleMap';
import { Polyline, Marker, Polygon, InfoWindow } from '@react-google-maps/api';
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
import { SpotClusterer } from '@/components/SpotClusterer';
import { createSimpleMarkerIcon } from '@/utils/mapMarkers';
import type { Campsite } from '@/types/campsite';

// Using SelectedLocation from LocationSelector

// Unified spot type for the combined list
interface UnifiedSpot {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: 'derived' | 'campground' | 'mine' | 'friend';
  // For friend's campsites
  sharedBy?: string;
  // For derived spots
  score?: number;
  spotType?: 'dead-end' | 'camp-site' | 'intersection';
  reasons?: string[];
  // For campgrounds
  reservable?: boolean;
  facilityType?: string;
  url?: string;
  agencyName?: string;
  // For user campsites
  campsiteType?: string;
  // Computed for sorting
  distance?: number;
  recScore?: number;
  isRecommended?: boolean;
  // Original data reference
  originalSpot?: PotentialSpot;
  originalCampground?: EstablishedCampground;
  originalCampsite?: Campsite;
}

/**
 * Ray-casting algorithm to check if a point is inside a polygon
 */
function isPointInPolygon(
  point: { lat: number; lng: number },
  polygon: { lat: number; lng: number }[]
): boolean {
  if (!polygon || polygon.length < 3) return false;

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;

    const intersect =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Check if a point is within any of the public land polygons
 */
function isWithinAnyPublicLand(
  lat: number,
  lng: number,
  publicLands: { polygon?: { lat: number; lng: number }[] }[]
): boolean {
  return publicLands.some(
    (land) => land.polygon && isPointInPolygon({ lat, lng }, land.polygon)
  );
}

/**
 * Find which public land a point is within and return its name
 */
function findContainingLand(
  lat: number,
  lng: number,
  publicLands: { name?: string; unitName?: string; managingAgency?: string; polygon?: { lat: number; lng: number }[] }[]
): { name: string; agency: string } | null {
  for (const land of publicLands) {
    if (land.polygon && isPointInPolygon({ lat, lng }, land.polygon)) {
      // Prefer unitName (e.g., "Manti-La Sal National Forest") over generic name
      const name = land.unitName || land.name || '';
      return { name, agency: land.managingAgency || '' };
    }
  }
  return null;
}

/**
 * Check if a dead-end spot is actually near the interior of another road (false dead-end).
 * This happens when OSM tracks are split into segments that don't share exact coordinates.
 * Matches the logic in use-dispersed-roads.ts findDeadEnds() filter.
 */
function isFalseDeadEnd(
  spot: { lat: number; lng: number; type: string },
  roads: { geometry?: { type: string; coordinates: [number, number][] } }[]
): boolean {
  if (spot.type !== 'dead-end') return false;

  // Use the same threshold as client-side: ~12 meters
  const INTERSECTION_THRESHOLD = 0.00012;

  for (const road of roads) {
    if (!road.geometry?.coordinates?.length) continue;
    const coords = road.geometry.coordinates;

    // Skip roads with fewer than 5 points (too short to reliably detect "interior")
    if (coords.length < 5) continue;

    // Check if spot is near road's endpoints (which would be a legitimate junction)
    const startPt = { lng: coords[0][0], lat: coords[0][1] };
    const endPt = { lng: coords[coords.length - 1][0], lat: coords[coords.length - 1][1] };

    const distToStart = Math.abs(spot.lat - startPt.lat) + Math.abs(spot.lng - startPt.lng);
    if (distToStart < INTERSECTION_THRESHOLD * 2) continue; // Near start endpoint - legitimate

    const distToEnd = Math.abs(spot.lat - endPt.lat) + Math.abs(spot.lng - endPt.lng);
    if (distToEnd < INTERSECTION_THRESHOLD * 2) continue; // Near end endpoint - legitimate

    // Check interior points only (skip first 2 and last 2 points to avoid endpoint proximity)
    for (let i = 2; i < coords.length - 2; i++) {
      const pt = { lng: coords[i][0], lat: coords[i][1] };
      const latDiff = Math.abs(spot.lat - pt.lat);
      const lngDiff = Math.abs(spot.lng - pt.lng);
      if (latDiff < INTERSECTION_THRESHOLD && lngDiff < INTERSECTION_THRESHOLD) {
        return true; // This dead-end is near the interior of another road - it's a false dead-end
      }
    }
  }
  return false;
}

const DispersedExplorer = () => {
  const { isLoaded } = useGoogleMaps();
  const [searchParams] = useSearchParams();
  const [searchLocation, setSearchLocation] = useState<SelectedLocation | null>(null);
  const [initialLocationLoaded, setInitialLocationLoaded] = useState(false);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 39.5, lng: -105.5 });
  const [mapZoom, setMapZoom] = useState(7);
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
  const getUnifiedSpotIcon = (spot: UnifiedSpot) => {
    if (spot.category === 'campground') {
      return <div className="w-4 h-4 rounded-full bg-blue-500 flex-shrink-0" />;
    }
    if (spot.category === 'mine') {
      return <Tent className="w-4 h-4 text-wildviolet flex-shrink-0" weight="fill" />;
    }
    if (spot.category === 'friend') {
      return <Users className="w-4 h-4 text-emerald-500 flex-shrink-0" weight="fill" />;
    }
    // Derived spots - color based on confidence
    if (spot.spotType === 'camp-site') {
      return <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: '#3d7a40' }} />;
    }
    if (spot.score && spot.score >= 35) {
      return <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: '#eab308' }} />;
    }
    if (spot.score && spot.score >= 25) {
      return <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: '#f97316' }} />;
    }
    return <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: '#e83a3a' }} />;
  };

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
      setSearchLocation({
        lat,
        lng,
        name: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      });
      setRecommendationPage(0); // Reset recommendations on new search
      setSelectedRoad(null);
      setSelectedSpot(null);
      setSelectedCampground(null);
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

  const getScoreColor = (score: number) => {
    if (score >= 35) return 'text-softamber bg-softamber/20';
    if (score >= 25) return 'text-orange-600 bg-orange-100';
    return 'text-coralred bg-coralred/20';
  };

  const totalRoads = mvumRoads.length + osmTracks.length;

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
        <Card>
          <CardContent className="p-3">
            <LocationSelector
              value={searchLocation}
              onChange={handleLocationChange}
              placeholder="Search location..."
              showMyLocation={true}
              showSavedLocations={true}
              showCoordinates={true}
              onMapClickHint={true}
              compact={true}
              coordinatesDisplay={searchLocation ? `${searchLocation.lat.toFixed(4)}, ${searchLocation.lng.toFixed(4)}` : undefined}
            />
          </CardContent>
        </Card>
        <div className="flex border-b border-border">
          <button
            onClick={() => setMobileView('list')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-sm font-medium transition-colors ${
              mobileView === 'list'
                ? 'text-foreground border-b-2 border-primary'
                : 'text-muted-foreground'
            }`}
          >
            <ListBullets className="w-4 h-4" />
            List
          </button>
          <button
            onClick={() => setMobileView('map')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-sm font-medium transition-colors ${
              mobileView === 'map'
                ? 'text-foreground border-b-2 border-primary'
                : 'text-muted-foreground'
            }`}
          >
            <MapTrifold className="w-4 h-4" />
            Map
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:grid lg:grid-cols-2 overflow-hidden">
        {/* Map - Left side on desktop, toggled on mobile */}
        <div className={`order-2 lg:order-1 lg:h-full relative ${mobileView === 'map' ? 'flex-1' : 'hidden lg:block'}`}>
          {/* Click instruction overlay */}
          {!searchLocation && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-background/90 backdrop-blur-sm px-4 py-2 rounded-full border border-border shadow-lg flex items-center gap-2">
              <Crosshair className="w-4 h-4 text-primary" />
              <span className="text-sm text-foreground">Click anywhere on the map to search that area</span>
            </div>
          )}
          <GoogleMap
            center={mapCenter}
            zoom={mapZoom}
            className="w-full h-full"
            onLoad={onMapLoad}
            onClick={onMapClick}
            options={{
              mapTypeId: 'hybrid',
              mapTypeControl: true,
              mapTypeControlOptions: {
                position: typeof google !== 'undefined' ? google.maps.ControlPosition?.TOP_RIGHT : undefined,
              },
            }}
          >
            {/* Search location marker */}
            {searchLocation && (
              <Marker
                position={{ lat: searchLocation.lat, lng: searchLocation.lng }}
                title={searchLocation.name}
              />
            )}

            {/* Public Lands Overlay (BLM, USFS, etc.) */}
            {/* Note: Large polygons (renderOnMap=false) are skipped for rendering but still used for filtering */}
            {showPublicLands && publicLands.map((land) => {
              if (!land.polygon) return null;
              // Skip very large polygons to avoid performance issues
              // These are still used for point-in-polygon filtering
              if (!land.renderOnMap) return null;

              // Different colors for different agencies
              const isBLM = land.managingAgency === 'BLM';
              const isNPS = land.managingAgency === 'NPS';
              const isState = land.managingAgency === 'STATE';
              // State trust lands (SDOL=State Dept of Lands, SFW=State Fish & Wildlife, etc.)
              const isStateTrust = ['SDOL', 'SFW', 'SPR', 'SDNR'].includes(land.managingAgency);
              // Land trusts (NGO = Mojave Desert Land Trust, etc.)
              const isLandTrust = land.managingAgency === 'NGO';
              // orange for BLM, purple for NPS, blue for State Parks, cyan for State Trust, pink for Land Trust, green for USFS
              const fillColor = isBLM ? '#d97706' : isNPS ? '#7c3aed' : isState ? '#3b82f6' : isStateTrust ? '#06b6d4' : isLandTrust ? '#ec4899' : '#10b981';
              const strokeColor = isBLM ? '#b45309' : isNPS ? '#6d28d9' : isState ? '#2563eb' : isStateTrust ? '#0891b2' : isLandTrust ? '#db2777' : '#059669';

              return (
                <Polygon
                  key={land.id}
                  paths={land.polygon}
                  options={{
                    fillColor,
                    fillOpacity: 0.25,
                    strokeColor,
                    strokeOpacity: 0.7,
                    strokeWeight: 2,
                    clickable: false,
                    zIndex: 1,
                  }}
                />
              );
            })}

            {/* MVUM Roads */}
            {filteredMvumRoads.map((road) => {
              const path = toLatLngPath(road.geometry?.coordinates);
              if (path.length < 2) return null;
              return (
                <Polyline
                  key={`mvum-${road.id}`}
                  path={path}
                  options={{
                    strokeColor: getMVUMColor(road),
                    strokeOpacity: selectedRoad === road ? 1 : 0.7,
                    strokeWeight: selectedRoad === road ? 4 : 2,
                    clickable: true,
                    zIndex: selectedRoad === road ? 100 : 10,
                  }}
                  onClick={() => setSelectedRoad(road)}
                />
              );
            })}

            {/* OSM Tracks */}
            {filteredOsmTracks.map((track, index) => {
              const path = toLatLngPath(track.geometry?.coordinates);
              if (path.length < 2) return null;
              return (
                <Polyline
                  key={`osm-${track.id}-${index}`}
                  path={path}
                  options={{
                    strokeColor: getOSMColor(track),
                    strokeOpacity: selectedRoad === track ? 1 : 0.7,
                    strokeWeight: selectedRoad === track ? 4 : 2,
                    clickable: true,
                    zIndex: selectedRoad === track ? 100 : 10,
                  }}
                  onClick={() => setSelectedRoad(track)}
                />
              );
            })}

            {/* Road Info Window */}
            {selectedRoad && (() => {
              const path = toLatLngPath(selectedRoad.geometry?.coordinates);
              if (path.length === 0) return null;
              // Get center point of the road
              const centerIndex = Math.floor(path.length / 2);
              const centerPoint = path[centerIndex];
              const isMVUM = 'highClearanceVehicle' in selectedRoad;

              return (
                <InfoWindow
                  position={centerPoint}
                  onCloseClick={() => setSelectedRoad(null)}
                >
                  <div className="p-1 min-w-[200px] max-w-[280px]">
                    {isMVUM ? (
                      <>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-semibold text-sm">{selectedRoad.name}</span>
                          <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-medium">USFS</span>
                        </div>
                        <div className="space-y-1 text-xs text-gray-600">
                          <p><span className="font-medium">Surface:</span> {selectedRoad.surfaceType}</p>
                          <p><span className="font-medium">Maintenance:</span> {selectedRoad.operationalMaintLevel}</p>
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {selectedRoad.passengerVehicle && (
                              <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px]">Passenger</span>
                            )}
                            {selectedRoad.highClearanceVehicle && (
                              <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-[10px]">High Clearance</span>
                            )}
                            {selectedRoad.atv && (
                              <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded text-[10px]">ATV</span>
                            )}
                            {selectedRoad.motorcycle && (
                              <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded text-[10px]">Motorcycle</span>
                            )}
                          </div>
                          {selectedRoad.seasonal && (
                            <p className="text-[10px] text-gray-500 mt-1">Seasonal: {selectedRoad.seasonal}</p>
                          )}
                        </div>
                        <p className="text-[9px] text-gray-400 mt-2 pt-1 border-t border-gray-200">
                          Source: USFS Motor Vehicle Use Map
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-semibold text-sm">{selectedRoad.name || 'Unnamed Track'}</span>
                          <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-medium">OSM</span>
                        </div>
                        <div className="space-y-1 text-xs text-gray-600">
                          <p><span className="font-medium">Type:</span> {selectedRoad.highway}</p>
                          {selectedRoad.surface && (
                            <p><span className="font-medium">Surface:</span> {selectedRoad.surface}</p>
                          )}
                          {selectedRoad.tracktype && (
                            <p><span className="font-medium">Grade:</span> {selectedRoad.tracktype}
                              <span className="text-gray-500 ml-1">
                                ({selectedRoad.tracktype === 'grade1' ? 'paved' :
                                  selectedRoad.tracktype === 'grade2' ? 'gravel' :
                                  selectedRoad.tracktype === 'grade3' ? 'high clearance' :
                                  selectedRoad.tracktype === 'grade4' ? '4WD likely' :
                                  selectedRoad.tracktype === 'grade5' ? '4WD required' : ''})
                              </span>
                            </p>
                          )}
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {selectedRoad.fourWdOnly && (
                              <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-[10px]">4WD Only</span>
                            )}
                            {selectedRoad.access && (
                              <span className="px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded text-[10px]">{selectedRoad.access}</span>
                            )}
                          </div>
                        </div>
                        <p className="text-[9px] text-gray-400 mt-2 pt-1 border-t border-gray-200">
                          <a href={`https://www.openstreetmap.org/way/${selectedRoad.id}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                            View on OSM
                          </a>
                          <span className="mx-1">•</span>
                          Verify conditions before travel
                        </p>
                      </>
                    )}
                  </div>
                </InfoWindow>
              );
            })()}

            {/* Potential Camp Spots with Clustering */}
            <SpotClusterer
              map={mapRef.current}
              spots={filteredPotentialSpots}
              onSpotClick={(spot) => {
                setSelectedSpot(spot);
                setSelectedRoad(null);
                setSelectedCampground(null);
                setSelectedCampsite(null);
                setCopiedCoords(false);
              }}
              selectedSpot={selectedSpot}
              getMarkerIcon={getSpotMarkerIcon}
            />

            {/* Info window for selected spot */}
            {selectedSpot && (
              <InfoWindow
                position={{ lat: selectedSpot.lat, lng: selectedSpot.lng }}
                onCloseClick={() => setSelectedSpot(null)}
                options={{ pixelOffset: new google.maps.Size(0, -32) }}
              >
                <div className="min-w-[220px] max-w-[280px]">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h4 className="font-semibold text-gray-900 text-sm leading-tight">
                      {selectedSpot.name || 'Unnamed Spot'}
                    </h4>
                    <span className={`flex-shrink-0 w-2.5 h-2.5 rounded-full mt-1 ${
                      selectedSpot.type === 'camp-site' ? 'bg-mossgreen' :
                      selectedSpot.score >= 35 ? 'bg-softamber' :
                      selectedSpot.score >= 25 ? 'bg-orange-500' : 'bg-coralred'
                    }`} />
                  </div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {selectedSpot.isOnMVUMRoad && (
                      <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-medium">USFS</span>
                    )}
                    {selectedSpot.isOnBLMRoad && (
                      <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-medium">BLM</span>
                    )}
                    {selectedSpot.passengerReachable && (
                      <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-medium">Passenger OK</span>
                    )}
                    {selectedSpot.highClearanceReachable && !selectedSpot.passengerReachable && (
                      <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-[10px] font-medium">High Clearance</span>
                    )}
                    {!selectedSpot.passengerReachable && !selectedSpot.highClearanceReachable && (
                      <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-medium">4WD</span>
                    )}
                  </div>
                  <p className="text-gray-600 text-xs mb-3">
                    {selectedSpot.type === 'camp-site' ? 'Known camp site' :
                     selectedSpot.type === 'dead-end' ? 'Road terminus' : 'Road junction'}
                    {selectedSpot.roadName && ` • ${selectedSpot.roadName}`}
                  </p>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setConfirmDialogOpen(true)}
                      className="flex-1 px-2 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded hover:bg-emerald-700 transition-colors"
                    >
                      {existingCampsiteForSpot ? 'Saved' : 'Save'}
                    </button>
                    <button
                      onClick={() => {
                        window.open(
                          `https://www.google.com/maps/search/?api=1&query=${selectedSpot.lat},${selectedSpot.lng}`,
                          '_blank'
                        );
                      }}
                      className="flex-1 px-2 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 transition-colors"
                    >
                      Open Map
                    </button>
                  </div>
                </div>
              </InfoWindow>
            )}

            {/* Established Campgrounds */}
            {showCampgroundsFiltered && allEstablishedCampgrounds
              .filter((cg) => isFinite(cg.lat) && isFinite(cg.lng))
              .map((cg) => (
              <Marker
                key={cg.id}
                position={{ lat: cg.lat, lng: cg.lng }}
                title={cg.name}
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  fillColor: '#3b82f6', // blue-500
                  fillOpacity: 1,
                  strokeColor: selectedCampground === cg ? '#1e3a8a' : '#ffffff',
                  strokeWeight: selectedCampground === cg ? 2 : 1,
                  scale: selectedCampground === cg ? 10 : 8,
                }}
                onClick={() => {
                  setSelectedCampground(cg);
                  setSelectedSpot(null);
                  setSelectedRoad(null);
                  setSelectedCampsite(null);
                }}
                zIndex={selectedCampground === cg ? 1001 : 500}
              />
            ))}

            {/* User's Saved Campsites */}
            {showMyCampsites && showMyCampsitesFiltered && campsites
              .filter((cs) => isFinite(cs.lat) && isFinite(cs.lng))
              .map((cs) => (
              <Marker
                key={`my-${cs.id}`}
                position={{ lat: cs.lat, lng: cs.lng }}
                title={cs.name}
                icon={createSimpleMarkerIcon('camp', {
                  isActive: selectedCampsite?.id === cs.id,
                  size: selectedCampsite?.id === cs.id ? 10 : 8
                })}
                onClick={() => {
                  setSelectedCampsite(cs);
                  setSelectedSpot(null);
                  setSelectedRoad(null);
                  setSelectedCampground(null);
                }}
                zIndex={selectedCampsite?.id === cs.id ? 1002 : 600}
              />
            ))}

            {/* Info window for selected user campsite */}
            {selectedCampsite && (
              <InfoWindow
                position={{ lat: selectedCampsite.lat, lng: selectedCampsite.lng }}
                onCloseClick={() => setSelectedCampsite(null)}
                options={{ pixelOffset: new google.maps.Size(0, -32) }}
              >
                <div className="min-w-[200px] max-w-[260px]">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h4 className="font-semibold text-gray-900 text-sm leading-tight">
                      {selectedCampsite.name}
                    </h4>
                    <span className="flex-shrink-0 px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-medium">
                      My Spot
                    </span>
                  </div>
                  {selectedCampsite.description && (
                    <p className="text-gray-600 text-xs mb-2 line-clamp-2">{selectedCampsite.description}</p>
                  )}
                  <div className="flex flex-wrap gap-1 mb-2">
                    {selectedCampsite.roadAccess && (
                      <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-[10px] font-medium">
                        {selectedCampsite.roadAccess === '2wd' ? '2WD OK' : selectedCampsite.roadAccess.toUpperCase()}
                      </span>
                    )}
                    {selectedCampsite.waterAvailable && (
                      <span className="px-1.5 py-0.5 bg-cyan-100 text-cyan-700 rounded text-[10px] font-medium">Water</span>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      window.open(
                        `https://www.google.com/maps/search/?api=1&query=${selectedCampsite.lat},${selectedCampsite.lng}`,
                        '_blank'
                      );
                    }}
                    className="w-full px-2 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 transition-colors"
                  >
                    Open Map
                  </button>
                </div>
              </InfoWindow>
            )}
          </GoogleMap>

          {/* Floating Legend Button */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="absolute bottom-4 left-4 z-10 w-12 h-12 rounded-full bg-background border border-border shadow-lg flex items-center justify-center hover:bg-secondary transition-colors"
                aria-label="Show legend"
              >
                <MapTrifold className="w-5 h-5 text-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="start"
              className="w-72 p-4"
              sideOffset={8}
            >
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <MapTrifold className="w-4 h-4" />
                  Map Legend
                </h3>

                {/* Land Overlays */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Land Overlays</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0"
                      onClick={() => setShowPublicLands(!showPublicLands)}
                    >
                      {showPublicLands ? (
                        <Eye className="w-3.5 h-3.5" />
                      ) : (
                        <EyeSlash className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-emerald-500/30 border border-emerald-600 rounded" />
                      <span>USFS</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-amber-500/30 border border-amber-600 rounded" />
                      <span>BLM</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-violet-500/30 border border-violet-600 rounded" />
                      <span>NPS</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-blue-500/30 border border-blue-600 rounded" />
                      <span>State Park</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-cyan-500/30 border border-cyan-600 rounded" />
                      <span>State Trust</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-pink-500/30 border border-pink-600 rounded" />
                      <span>Land Trust</span>
                    </div>
                  </div>
                </div>

                {/* Spot Markers */}
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Spot Markers</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#3d7a40' }} />
                      <span>Known Campsite</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#eab308' }} />
                      <span>High Confidence</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#f97316' }} />
                      <span>Moderate</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-blue-500 rounded-full" />
                      <span>Campground</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Tent className="w-3 h-3 text-wildviolet" weight="fill" />
                      <span>My Campsite</span>
                    </div>
                  </div>
                </div>

                {/* Road Colors */}
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Road Access</p>
                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-0.5 bg-blue-500 rounded" />
                      <span>Paved</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-0.5 bg-green-500 rounded" />
                      <span>Passenger</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-0.5 bg-orange-500 rounded" />
                      <span>High Clearance</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-0.5 bg-red-500 rounded" />
                      <span>4WD</span>
                    </div>
                  </div>
                </div>

                {/* Data Source Toggle - Hidden while database ingestion is paused
                <div className="space-y-2 pt-2 border-t border-border">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Data Source</p>
                  <div className="flex gap-2">
                    <Button
                      variant={useDatabase ? "default" : "outline"}
                      size="sm"
                      className="flex-1 h-7 text-xs"
                      onClick={() => setUseDatabase(true)}
                    >
                      Fast Mode
                    </Button>
                    <Button
                      variant={!useDatabase ? "default" : "outline"}
                      size="sm"
                      className="flex-1 h-7 text-xs"
                      onClick={() => setUseDatabase(false)}
                    >
                      Full Mode
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {useDatabase
                      ? "Using pre-computed spots (faster)"
                      : "Computing from road network (shows roads)"}
                  </p>
                </div>
                */}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Sidebar - Right side on desktop, toggled on mobile */}
        <div className={`order-1 lg:order-2 space-y-3 sm:space-y-5 p-3 sm:p-4 md:p-6 min-h-0 overflow-y-auto ${mobileView === 'list' ? 'flex-1' : 'hidden lg:block'}`}>
            {/* Search Card - desktop only (mobile has it above the toggle) */}
            <Card className="hidden lg:block">
              <CardContent className="p-4">
                <LocationSelector
                  value={searchLocation}
                  onChange={handleLocationChange}
                  placeholder="Search location..."
                  showMyLocation={true}
                  showSavedLocations={true}
                  showCoordinates={true}
                  onMapClickHint={true}
                  compact={true}
                  coordinatesDisplay={searchLocation ? `${searchLocation.lat.toFixed(4)}, ${searchLocation.lng.toFixed(4)}` : undefined}
                />
              </CardContent>
            </Card>

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
                {/* Stats row - 5 across, desktop only */}
                <div className="hidden sm:grid grid-cols-5 gap-2 mb-5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="p-2 bg-mossgreen/10 dark:bg-mossgreen/20 rounded-lg border border-mossgreen/30 text-center cursor-pointer">
                        <p className="text-xl font-bold text-mossgreen">{filteredPotentialSpots.filter(s => s.type === 'camp-site').length}</p>
                        <p className="text-xs font-medium text-mossgreen">Known</p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-medium">Known Campsites</p>
                      <p className="text-xs text-muted-foreground">Campsites tagged by the OSM community</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="p-2 bg-softamber/10 dark:bg-softamber/20 rounded-lg border border-softamber/30 text-center cursor-pointer">
                        <p className="text-xl font-bold text-softamber">{filteredPotentialSpots.filter(s => s.type !== 'camp-site' && s.score >= 35).length}</p>
                        <p className="text-xs font-medium text-softamber">High</p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-medium">High Confidence (35+)</p>
                      <p className="text-xs text-muted-foreground">Official roads (MVUM/BLM), named roads, or good access</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="p-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800 text-center cursor-pointer">
                        <p className="text-xl font-bold text-orange-600 dark:text-orange-400">{filteredPotentialSpots.filter(s => s.type !== 'camp-site' && s.score >= 25 && s.score < 35).length}</p>
                        <p className="text-xs font-medium text-orange-600 dark:text-orange-400">Moderate</p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-medium">Moderate Confidence (25-34)</p>
                      <p className="text-xs text-muted-foreground">Unnamed tracks on public land</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 text-center cursor-pointer">
                        <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{allEstablishedCampgrounds.length}</p>
                        <p className="text-xs font-medium text-blue-600 dark:text-blue-400">Campgrounds</p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-medium">Established Campgrounds</p>
                      <p className="text-xs text-muted-foreground">USFS/BLM campgrounds from Recreation.gov</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="p-2 bg-violet-50 dark:bg-violet-900/20 rounded-lg border border-violet-200 dark:border-violet-800 text-center cursor-pointer">
                        <p className="text-xl font-bold text-violet-600 dark:text-violet-400">{campsites.length}</p>
                        <p className="text-xs font-medium text-violet-600 dark:text-violet-400">My Sites</p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-medium">Your Saved Campsites</p>
                      <p className="text-xs text-muted-foreground">Campsites you've saved to your account</p>
                    </TooltipContent>
                  </Tooltip>
                </div>

                {/* Filters section */}
                <div className="space-y-4 mb-5">
                  {/* Spot Type Filter */}
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => toggleFilter('campgrounds')}
                      className={`px-3 py-1 text-xs rounded-full border transition-colors flex items-center gap-1.5 ${
                        spotFilters.has('campgrounds')
                          ? 'text-white border-blue-500'
                          : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                      }`}
                      style={spotFilters.has('campgrounds') ? { backgroundColor: '#3b82f6' } : {}}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#3b82f6' }} />
                      Campgrounds
                    </button>
                    <button
                      onClick={() => toggleFilter('mine')}
                      className={`px-3 py-1 text-xs rounded-full border transition-colors flex items-center gap-1.5 ${
                        spotFilters.has('mine')
                          ? 'text-white border-violet-500'
                          : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                      }`}
                      style={spotFilters.has('mine') ? { backgroundColor: '#8b5cf6' } : {}}
                    >
                      <Tent className="w-3 h-3" weight="fill" />
                      Mine
                    </button>
                    <button
                      onClick={() => toggleFilter('known')}
                      className={`px-3 py-1 text-xs rounded-full border transition-colors flex items-center gap-1.5 ${
                        spotFilters.has('known')
                          ? 'text-white border-mossgreen'
                          : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                      }`}
                      style={spotFilters.has('known') ? { backgroundColor: '#3d7a40' } : {}}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#3d7a40' }} />
                      Known
                    </button>
                    <button
                      onClick={() => toggleFilter('high')}
                      className={`px-3 py-1 text-xs rounded-full border transition-colors flex items-center gap-1.5 ${
                        spotFilters.has('high')
                          ? 'text-white border-softamber'
                          : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                      }`}
                      style={spotFilters.has('high') ? { backgroundColor: '#eab308' } : {}}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#eab308' }} />
                      High
                    </button>
                    <button
                      onClick={() => toggleFilter('medium')}
                      className={`px-3 py-1 text-xs rounded-full border transition-colors flex items-center gap-1.5 ${
                        spotFilters.has('medium')
                          ? 'text-white border-orange-500'
                          : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                      }`}
                      style={spotFilters.has('medium') ? { backgroundColor: '#f97316' } : {}}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#f97316' }} />
                      Moderate
                    </button>
                    {spotFilters.size > 0 && (
                      <button
                        onClick={() => setSpotFilters(new Set())}
                        className="px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  {/* Vehicle Access + Sort row */}
                  <div className="flex items-center justify-between">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => setRoadFilter('all')}
                        className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                          roadFilter === 'all'
                            ? 'bg-foreground text-background border-foreground'
                            : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                        }`}
                      >
                        All
                      </button>
                      <button
                        onClick={() => setRoadFilter('passenger')}
                        className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                          roadFilter === 'passenger'
                            ? 'text-white border-[#3b82f6]'
                            : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                        }`}
                        style={roadFilter === 'passenger' ? { backgroundColor: '#3b82f6' } : {}}
                      >
                        2WD
                      </button>
                      <button
                        onClick={() => setRoadFilter('high-clearance')}
                        className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                          roadFilter === 'high-clearance'
                            ? 'text-white border-[#f97316]'
                            : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                        }`}
                        style={roadFilter === 'high-clearance' ? { backgroundColor: '#f97316' } : {}}
                      >
                        HC
                      </button>
                      <button
                        onClick={() => setRoadFilter('4wd')}
                        className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                          roadFilter === '4wd'
                            ? 'text-white border-[#ef4444]'
                            : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                        }`}
                        style={roadFilter === '4wd' ? { backgroundColor: '#ef4444' } : {}}
                      >
                        4WD
                      </button>
                    </div>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as 'distance' | 'rating' | 'recommended')}
                      className="text-xs bg-muted/50 border border-border rounded px-2.5 py-1 text-foreground"
                    >
                      <option value="recommended">Recommended</option>
                      <option value="distance">Distance</option>
                      <option value="rating">Rating</option>
                    </select>
                  </div>
                </div>

                {/* Campsites as individual cards */}
                {unifiedSpotList.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Funnel className="w-10 h-10 mb-3 opacity-50" />
                    <p className="text-base text-center font-medium">No campsites match your filters</p>
                    <p className="text-sm mt-1.5 opacity-75">Try adjusting your filters above</p>
                    {spotFilters.size > 0 && (
                      <button
                        onClick={() => setSpotFilters(new Set())}
                        className="mt-3 text-sm text-primary hover:underline font-medium"
                      >
                        Clear all filters
                      </button>
                    )}
                  </div>
                ) : (
                <div className="space-y-3">
                  {unifiedSpotList.slice(0, spotsToShow).map((spot) => {
                    const isSelected =
                      (spot.category === 'derived' && selectedSpot?.id === spot.originalSpot?.id) ||
                      (spot.category === 'campground' && selectedCampground?.id === spot.originalCampground?.id) ||
                      (spot.category === 'mine' && selectedCampsite?.id === spot.originalCampsite?.id) ||
                      (spot.category === 'friend' && selectedCampsite?.id === spot.originalCampsite?.id);

                    return (
                      <Card
                        key={spot.id}
                        className={`cursor-pointer transition-all hover:shadow-md ${
                          isSelected
                            ? 'ring-2 ring-primary shadow-md'
                            : spot.isRecommended
                              ? 'border-primary/30 bg-primary/5'
                              : ''
                        }`}
                        onClick={() => {
                          if (spot.category === 'derived' && spot.originalSpot) {
                            setSelectedSpot(spot.originalSpot);
                            setSelectedCampground(null);
                            setSelectedCampsite(null);
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
                        }}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2.5">
                            {getUnifiedSpotIcon(spot)}
                            <span className="text-base font-medium text-foreground truncate flex-1">{spot.name}</span>
                            {spot.isRecommended && (
                              <Star className="w-4 h-4 text-primary flex-shrink-0" weight="fill" />
                            )}
                            {spot.category === 'derived' && spot.score !== undefined && (
                              <span className={`text-sm px-2 py-0.5 rounded font-medium ${getScoreColor(spot.score)}`}>
                                {spot.score}
                              </span>
                            )}
                            {spot.category === 'campground' && spot.reservable && (
                              <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">Reserve</span>
                            )}
                          </div>
                          <div className="mt-2 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                            {spot.distance !== undefined && spot.distance < 100 && (
                              <span className="flex items-center gap-1">
                                <NavigationArrow className="w-3.5 h-3.5" />
                                {spot.distance.toFixed(1)} mi
                              </span>
                            )}
                            {spot.category === 'derived' && spot.reasons && spot.reasons.slice(0, 2).map((reason, i) => (
                              <span key={i} className="bg-muted px-2 py-0.5 rounded">{reason}</span>
                            ))}
                            {spot.category === 'campground' && spot.facilityType && (
                              <span>{spot.facilityType}</span>
                            )}
                            {spot.category === 'mine' && spot.campsiteType && (
                              <span>{spot.campsiteType}</span>
                            )}
                            {spot.category === 'friend' && spot.sharedBy && (
                              <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded">
                                Shared by {spot.sharedBy}
                              </span>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
                )}

                {/* Show More / Show Less controls */}
                {unifiedSpotList.length > 30 && (
                  <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Showing {Math.min(spotsToShow, unifiedSpotList.length)} of {unifiedSpotList.length}
                    </p>
                    <div className="flex gap-2">
                      {spotsToShow < unifiedSpotList.length && (
                        <button
                          onClick={() => setSpotsToShow(prev => Math.min(prev + 50, unifiedSpotList.length))}
                          className="text-sm text-primary hover:underline font-medium"
                        >
                          Show More
                        </button>
                      )}
                      {spotsToShow > 30 && (
                        <button
                          onClick={() => setSpotsToShow(30)}
                          className="text-sm text-muted-foreground hover:underline"
                        >
                          Show Less
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Selected Campground Details */}
            {selectedCampground && (
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
                    <TreeEvergreen className="w-4 h-4 text-blue-600" />
                    Campground Details
                  </h3>
                  <div className="space-y-2 text-sm">
                    <p><span className="text-muted-foreground">Name:</span> {selectedCampground.name}</p>
                    <p><span className="text-muted-foreground">Type:</span> {selectedCampground.facilityType}</p>
                    <p><span className="text-muted-foreground">Coordinates:</span> {selectedCampground.lat.toFixed(5)}, {selectedCampground.lng.toFixed(5)}</p>
                    {selectedCampground.reservable && (
                      <p className="flex items-center gap-1">
                        <span className="text-muted-foreground">Reservable:</span>
                        <span className="text-green-600">Yes</span>
                      </p>
                    )}
                    {selectedCampground.description && (
                      <p className="text-xs text-muted-foreground mt-2">{selectedCampground.description}</p>
                    )}
                    {selectedCampground.url && (
                      <a
                        href={selectedCampground.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-2"
                      >
                        View on Recreation.gov →
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Selected Spot Details */}
            {selectedSpot && (
              <Card className="border-primary/30">
                <CardContent className="p-4">
                  <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
                    {selectedSpot.type === 'camp-site' ? (
                      <Tent className="w-5 h-5 text-wildviolet" />
                    ) : selectedSpot.type === 'dead-end' ? (
                      <MapPinLine className="w-5 h-5 text-orange-600" />
                    ) : (
                      <Path className="w-5 h-5 text-blue-600" />
                    )}
                    {selectedSpot.name || 'Unnamed Spot'}
                  </h3>

                  <div className="space-y-4">
                    {/* Confidence Score */}
                    <div className="flex items-center justify-between p-2.5 bg-muted/50 rounded-lg">
                      <span className="text-sm font-medium">
                        {selectedSpot.type === 'camp-site' ? 'Type' : 'Confidence'}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${
                          selectedSpot.type === 'camp-site' ? 'bg-mossgreen' :
                          selectedSpot.score >= 35 ? 'bg-softamber' :
                          selectedSpot.score >= 25 ? 'bg-orange-500' : 'bg-coralred'
                        }`} />
                        <span className="text-sm font-medium">
                          {selectedSpot.type === 'camp-site' ? 'Known Campsite' :
                           selectedSpot.score >= 35 ? 'High' : 'Moderate'}
                        </span>
                        {selectedSpot.type !== 'camp-site' && (
                          <span className="text-xs text-muted-foreground">({selectedSpot.score} pts)</span>
                        )}
                      </div>
                    </div>

                    {/* Data Source */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Data Source</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedSpot.isOnMVUMRoad && (
                          <span className="px-2 py-1 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 rounded-full text-xs font-medium flex items-center gap-1">
                            <TreeEvergreen className="w-3 h-3" />
                            USFS MVUM
                          </span>
                        )}
                        {selectedSpot.isOnBLMRoad && (
                          <span className="px-2 py-1 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 rounded-full text-xs font-medium">
                            BLM Road
                          </span>
                        )}
                        {selectedSpot.source === 'osm' && (
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 rounded-full text-xs font-medium flex items-center gap-1">
                            <MapTrifold className="w-3 h-3" />
                            OpenStreetMap
                          </span>
                        )}
                        {selectedSpot.source === 'derived' && !selectedSpot.isOnMVUMRoad && !selectedSpot.isOnBLMRoad && (
                          <span className="px-2 py-1 bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 rounded-full text-xs font-medium">
                            OSM Track Analysis
                          </span>
                        )}
                        {selectedSpot.isOnPublicLand && !selectedSpot.isOnMVUMRoad && !selectedSpot.isOnBLMRoad && (
                          <span className="px-2 py-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 rounded-full text-xs font-medium">
                            On Public Land
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Vehicle Access */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Vehicle Access</p>
                      <div className="flex items-center gap-2">
                        <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${
                          selectedSpot.passengerReachable
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          <Car className="w-3.5 h-3.5" />
                          Passenger
                          {selectedSpot.passengerReachable && ' ✓'}
                        </div>
                        <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${
                          selectedSpot.highClearanceReachable
                            ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300'
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          <Jeep className="w-3.5 h-3.5" />
                          High Clearance
                          {selectedSpot.highClearanceReachable && ' ✓'}
                        </div>
                      </div>
                      {!selectedSpot.passengerReachable && !selectedSpot.highClearanceReachable && (
                        <p className="text-xs text-muted-foreground">4WD may be required to reach this spot</p>
                      )}
                    </div>

                    {/* Why it's promising */}
                    {selectedSpot.reasons.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Why It's Promising</p>
                        <div className="flex flex-wrap gap-1">
                          {selectedSpot.reasons.map((reason, i) => (
                            <span key={i} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                              {reason}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Road Name */}
                    {selectedSpot.roadName && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Road</p>
                        <p className="text-sm">{selectedSpot.roadName}</p>
                      </div>
                    )}

                    {/* Coordinates */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Coordinates</p>
                      <div className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                        <code className="text-xs font-mono">
                          {selectedSpot.lat.toFixed(6)}, {selectedSpot.lng.toFixed(6)}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2"
                          onClick={() => {
                            navigator.clipboard.writeText(`${selectedSpot.lat.toFixed(6)}, ${selectedSpot.lng.toFixed(6)}`);
                            setCopiedCoords(true);
                            setTimeout(() => setCopiedCoords(false), 2000);
                          }}
                        >
                          {copiedCoords ? (
                            <Check className="w-3.5 h-3.5 text-green-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Confirmation Status */}
                    {existingCampsiteForSpot && (
                      <div className="p-2.5 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                        <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                          <Users className="w-4 h-4" />
                          <span className="text-sm font-medium">
                            {existingCampsiteForSpot.confirmationCount} {existingCampsiteForSpot.confirmationCount === 1 ? 'user has' : 'users have'} confirmed
                          </span>
                        </div>
                        {existingCampsiteForSpot.isConfirmed && (
                          <div className="flex items-center gap-1 mt-1 text-green-600 dark:text-green-400">
                            <CheckCircle className="w-3 h-3" />
                            <span className="text-xs">Verified camping spot</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="space-y-2 pt-1">
                      <Button
                        variant="default"
                        size="sm"
                        className="w-full"
                        onClick={() => setConfirmDialogOpen(true)}
                      >
                        <CheckCircle className="w-4 h-4 mr-1.5" />
                        {existingCampsiteForSpot ? 'Add My Confirmation' : 'Confirm This Spot'}
                      </Button>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 text-xs"
                          onClick={() => {
                            window.open(
                              `https://www.google.com/maps/search/?api=1&query=${selectedSpot.lat},${selectedSpot.lng}`,
                              '_blank'
                            );
                          }}
                        >
                          Google Maps
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 text-xs"
                          onClick={() => {
                            window.open(
                              `https://www.google.com/maps/@${selectedSpot.lat},${selectedSpot.lng},500m/data=!3m1!1e3`,
                              '_blank'
                            );
                          }}
                        >
                          Satellite View
                        </Button>
                      </div>
                    </div>

                    <p className="text-[10px] text-muted-foreground text-center pt-1">
                      Always verify on satellite imagery and check local regulations
                    </p>
                  </div>
                </CardContent>
              </Card>
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
    </div>
  );
};

export default DispersedExplorer;
