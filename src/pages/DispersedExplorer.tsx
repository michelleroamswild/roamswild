import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { MapPin, MagnifyingGlass, Path, SpinnerGap, TreeEvergreen, Warning, Crosshair, Tent, Drop, MapPinLine, Eye, EyeSlash, Info, Star, NavigationArrow, Car, Jeep, Copy, Check, MapTrifold, CheckCircle, Users } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Card, CardContent } from '@/components/ui/card';
import { GoogleMap } from '@/components/GoogleMap';
import { Polyline, Marker, Polygon, InfoWindow } from '@react-google-maps/api';
import { PlaceSearch } from '@/components/PlaceSearch';
import { useDispersedRoads, MVUMRoad, OSMTrack, PotentialSpot, EstablishedCampground } from '@/hooks/use-dispersed-roads';
import { usePublicLands } from '@/hooks/use-public-lands';
import { useCampsites } from '@/context/CampsitesContext';
import { useGoogleMaps } from '@/components/GoogleMapsProvider';
import { Header } from '@/components/Header';
import { ConfirmSpotDialog } from '@/components/ConfirmSpotDialog';
import { createMarkerIcon } from '@/utils/mapMarkers';
import type { Campsite } from '@/types/campsite';

interface SearchLocation {
  lat: number;
  lng: number;
  name: string;
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

const DispersedExplorer = () => {
  const { isLoaded } = useGoogleMaps();
  const [searchLocation, setSearchLocation] = useState<SearchLocation | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 39.5, lng: -105.5 });
  const [mapZoom, setMapZoom] = useState(7);
  const [selectedRoad, setSelectedRoad] = useState<MVUMRoad | OSMTrack | null>(null);
  const [selectedSpot, setSelectedSpot] = useState<PotentialSpot | null>(null);
  const [showPublicLands, setShowPublicLands] = useState(true);
  const [roadFilter, setRoadFilter] = useState<'all' | 'passenger' | 'high-clearance' | '4wd'>('all');
  const [recommendationPage, setRecommendationPage] = useState(0);
  const [osrmDistances, setOsrmDistances] = useState<Record<string, number>>({});
  const [osrmLoading, setOsrmLoading] = useState(false);
  const [copiedCoords, setCopiedCoords] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [existingCampsiteForSpot, setExistingCampsiteForSpot] = useState<Campsite | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);

  const { findExistingExplorerSpot, getExplorerSpots, campsites } = useCampsites();
  const [explorerSpots, setExplorerSpots] = useState<Campsite[]>([]);
  const [showMyCampsites, setShowMyCampsites] = useState(true);
  const [selectedCampsite, setSelectedCampsite] = useState<Campsite | null>(null);

  const { mvumRoads, osmTracks, potentialSpots, establishedCampgrounds, loading, error } = useDispersedRoads(
    searchLocation?.lat ?? null,
    searchLocation?.lng ?? null,
    10 // 10 mile radius
  );

  // Selected established campground
  const [selectedCampground, setSelectedCampground] = useState<EstablishedCampground | null>(null);

  // Fetch public lands (BLM, USFS, NPS, FWS) for overlay
  const { publicLands, loading: publicLandsLoading } = usePublicLands(
    searchLocation?.lat ?? 0,
    searchLocation?.lng ?? 0,
    12 // 12 mile radius for public lands (slightly larger than road search to ensure coverage)
  );

  // Fetch confirmed explorer spots from database when search location changes
  useEffect(() => {
    if (searchLocation) {
      getExplorerSpots(searchLocation.lat, searchLocation.lng, 15).then(setExplorerSpots);
    } else {
      setExplorerSpots([]);
    }
  }, [searchLocation, getExplorerSpots]);

  // Check if selected spot already exists in database
  useEffect(() => {
    if (selectedSpot) {
      findExistingExplorerSpot(selectedSpot.lat, selectedSpot.lng).then(setExistingCampsiteForSpot);
    } else {
      setExistingCampsiteForSpot(null);
    }
  }, [selectedSpot, findExistingExplorerSpot]);

  // Helper to check if a point is within a restricted area (NPS or State Park)
  // Dispersed camping is typically not allowed in National Parks or State Parks
  const isWithinRestrictedArea = useCallback(
    (lat: number, lng: number): boolean => {
      const restrictedLands = publicLands.filter(
        (l) => l.managingAgency === 'NPS' || l.managingAgency === 'STATE'
      );
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

  // Filter potential spots with smart rules:
  // - OSM camp sites: Always show (they're verified camping locations)
  // - MVUM-derived spots: Always show (MVUM roads are definitely on National Forest)
  // - OSM-derived spots: Validate against public land polygons when available
  // - EXCLUDE spots within National Parks or State Parks (dispersed camping not allowed)
  // - EXCLUDE spots near established campgrounds (use the campground instead)
  const filteredPotentialSpots = useMemo(() => {
    // Always show OSM camp sites - they're explicitly tagged as camping locations
    // But still exclude those in National Parks and State Parks
    const campSites = potentialSpots
      .filter((spot) => spot.type === 'camp-site')
      .filter((spot) => !isWithinRestrictedArea(spot.lat, spot.lng));

    // Get derived spots (dead-ends, intersections)
    const derivedSpots = potentialSpots.filter((spot) => spot.type !== 'camp-site');

    // Check if we have MVUM roads - if so, we're in National Forest territory
    const hasMVUMRoads = mvumRoads.length > 0;

    // Filter derived spots:
    // - MVUM roads: definitely National Forest - always include
    // - BLM roads: definitely BLM land - always include
    // - OSM tracks: REQUIRE polygon validation if we have polygon coverage
    // - EXCLUDE spots within National Parks or State Parks
    // - EXCLUDE spots near established campgrounds
    // - EXCLUDE spots outside public land polygons (e.g., Potash fields, private land)
    const filteredDerived = derivedSpots.filter((spot) => {
      // First check: exclude spots in National Parks or State Parks (dispersed camping not allowed)
      if (isWithinRestrictedArea(spot.lat, spot.lng)) return false;

      // Exclude spots near established campgrounds (use the campground instead)
      if (isNearEstablishedCampground(spot.lat, spot.lng)) return false;

      // MVUM roads are definitely on public land (National Forest) - always include
      if (spot.isOnMVUMRoad) return true;

      // BLM roads are definitely on public land (BLM) - always include
      if (spot.isOnBLMRoad) return true;

      // For OSM-derived spots, check if within a public land polygon
      // This is the key filter for private land like Potash fields
      if (publicLands.length > 0) {
        const withinPublicLand = isWithinAnyPublicLand(spot.lat, spot.lng, publicLands);
        if (withinPublicLand) return true;

        // Spot is NOT within any public land polygon, BUT:
        // - If we have MVUM roads in the area, we're definitely in National Forest
        //   so trust the OSM track's isOnPublicLand flag (polygon coverage has gaps)
        // - If no MVUM roads and good polygon coverage, reject as likely private land
        if (hasMVUMRoads && spot.isOnPublicLand) return true;

        if (publicLands.length >= 3) {
          return false; // Have good polygon coverage and no MVUM roads - reject spots outside public land
        }
      }

      // Only fall back to heuristics when we have minimal polygon coverage
      // The isOnPublicLand flag is based on OSM track characteristics
      if (spot.isOnPublicLand) return true;

      // Use MVUM presence as proxy for "in National Forest area"
      return hasMVUMRoads;
    });

    const blmPolygons = publicLands.filter(l => l.managingAgency === 'BLM').length;
    const usfsPolygons = publicLands.filter(l => l.managingAgency === 'USFS' || l.managingAgency === 'FS').length;
    const npsPolygons = publicLands.filter(l => l.managingAgency === 'NPS').length;
    const statePolygons = publicLands.filter(l => l.managingAgency === 'STATE').length;
    const stateTrustPolygons = publicLands.filter(l => ['SDOL', 'SFW', 'SPR', 'SDNR'].includes(l.managingAgency)).length;
    const landTrustPolygons = publicLands.filter(l => l.managingAgency === 'NGO').length;
    console.log(`Polygons: ${blmPolygons} BLM, ${usfsPolygons} USFS, ${npsPolygons} NPS, ${statePolygons} State Park, ${stateTrustPolygons} State Trust, ${landTrustPolygons} Land Trust, ${publicLands.length} total`);

    const allSpots = [...campSites, ...filteredDerived];

    // Apply road type filter to spots based on ROUTE REACHABILITY
    // This checks if you can actually reach the spot via roads accessible to your vehicle type
    // (not just whether the spot is near a road of that type)
    if (roadFilter === 'all') {
      return allSpots;
    }

    return allSpots.filter((spot) => {
      if (roadFilter === 'passenger') {
        // Only show spots that are REACHABLE via passenger-accessible roads
        // This means the entire route from the main road to this spot uses only passenger roads
        return spot.passengerReachable === true;
      }

      if (roadFilter === 'high-clearance') {
        // Show spots reachable by high-clearance vehicles (passenger + high-clearance roads, no 4WD)
        return spot.highClearanceReachable === true;
      }

      // '4wd' filter - show all spots (4WD can get anywhere)
      return true;
    });
  }, [potentialSpots, publicLands, mvumRoads, osmTracks, isWithinRestrictedArea, isNearEstablishedCampground, roadFilter]);

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

  const handlePlaceSelect = useCallback((place: google.maps.places.PlaceResult) => {
    if (place.geometry?.location) {
      const lat = typeof place.geometry.location.lat === 'function'
        ? place.geometry.location.lat()
        : place.geometry.location.lat;
      const lng = typeof place.geometry.location.lng === 'function'
        ? place.geometry.location.lng()
        : place.geometry.location.lng;
      setSearchLocation({
        lat,
        lng,
        name: place.name || place.formatted_address || 'Selected Location',
      });
      setMapCenter({ lat, lng });
      setMapZoom(12);
      setSelectedRoad(null);
      setSelectedSpot(null);
      setSelectedCampground(null);
      setRecommendationPage(0); // Reset recommendations on new search
    }
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
    if (roadFilter === 'all') return osmTracks;
    return osmTracks.filter(track => {
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
  // - Tent icons for confirmed spots and OSM camp-sites
  // - Simple colored circles for derived/potential spots
  const getSpotMarkerIcon = useCallback((spot: PotentialSpot, isSelected: boolean) => {
    const confirmedSpot = isSpotConfirmed(spot);

    // Confirmed spots get tent icon
    if (confirmedSpot) {
      return createMarkerIcon('camp', {
        isActive: isSelected,
        size: isSelected ? 40 : 32
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
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      <div className="flex-1 grid lg:grid-cols-2">
        {/* Map - Left side on desktop, bottom on mobile */}
        <div className="order-2 lg:order-1 h-[400px] lg:h-auto lg:min-h-[calc(100vh-64px)] lg:sticky lg:top-[64px] relative">
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
                position: google.maps.ControlPosition?.TOP_RIGHT,
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
                  }}
                  onClick={() => setSelectedRoad(road)}
                />
              );
            })}

            {/* OSM Tracks */}
            {filteredOsmTracks.map((track) => {
              const path = toLatLngPath(track.geometry?.coordinates);
              if (path.length < 2) return null;
              return (
                <Polyline
                  key={`osm-${track.id}`}
                  path={path}
                  options={{
                    strokeColor: getOSMColor(track),
                    strokeOpacity: selectedRoad === track ? 1 : 0.7,
                    strokeWeight: selectedRoad === track ? 4 : 2,
                    clickable: true,
                  }}
                  onClick={() => setSelectedRoad(track)}
                />
              );
            })}

            {/* Potential Camp Spots */}
            {filteredPotentialSpots
              .filter((spot) => isFinite(spot.lat) && isFinite(spot.lng))
              .map((spot) => (
              <Marker
                key={spot.id}
                position={{ lat: spot.lat, lng: spot.lng }}
                title={`${spot.name} (Score: ${spot.score})`}
                icon={getSpotMarkerIcon(spot, selectedSpot === spot)}
                onClick={() => {
                  setSelectedSpot(spot);
                  setSelectedRoad(null);
                  setSelectedCampground(null);
                  setSelectedCampsite(null);
                  setCopiedCoords(false);
                }}
                zIndex={selectedSpot === spot ? 1000 : spot.score}
              />
            ))}

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
                      onClick={() => {
                        window.open(
                          `https://www.google.com/maps/@${selectedSpot.lat},${selectedSpot.lng},500m/data=!3m1!1e3`,
                          '_blank'
                        );
                      }}
                      className="flex-1 px-2 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded hover:bg-emerald-700 transition-colors"
                    >
                      Satellite
                    </button>
                    <button
                      onClick={() => {
                        window.open(
                          `https://www.google.com/maps/dir/?api=1&destination=${selectedSpot.lat},${selectedSpot.lng}`,
                          '_blank'
                        );
                      }}
                      className="flex-1 px-2 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 transition-colors"
                    >
                      Directions
                    </button>
                  </div>
                </div>
              </InfoWindow>
            )}

            {/* Established Campgrounds */}
            {establishedCampgrounds
              .filter((cg) => isFinite(cg.lat) && isFinite(cg.lng))
              .map((cg) => (
              <Marker
                key={cg.id}
                position={{ lat: cg.lat, lng: cg.lng }}
                title={cg.name}
                icon={{
                  url: 'https://maps.google.com/mapfiles/ms/icons/purple-dot.png',
                  scaledSize: new google.maps.Size(
                    selectedCampground === cg ? 44 : 36,
                    selectedCampground === cg ? 44 : 36
                  ),
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
            {showMyCampsites && campsites
              .filter((cs) => isFinite(cs.lat) && isFinite(cs.lng))
              .map((cs) => (
              <Marker
                key={`my-${cs.id}`}
                position={{ lat: cs.lat, lng: cs.lng }}
                title={cs.name}
                icon={createMarkerIcon('camp', {
                  isActive: selectedCampsite?.id === cs.id,
                  size: selectedCampsite?.id === cs.id ? 44 : 36
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
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => {
                        window.open(
                          `https://www.google.com/maps/@${selectedCampsite.lat},${selectedCampsite.lng},500m/data=!3m1!1e3`,
                          '_blank'
                        );
                      }}
                      className="flex-1 px-2 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded hover:bg-emerald-700 transition-colors"
                    >
                      Satellite
                    </button>
                    <button
                      onClick={() => {
                        window.open(
                          `https://www.google.com/maps/dir/?api=1&destination=${selectedCampsite.lat},${selectedCampsite.lng}`,
                          '_blank'
                        );
                      }}
                      className="flex-1 px-2 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 transition-colors"
                    >
                      Directions
                    </button>
                  </div>
                </div>
              </InfoWindow>
            )}
          </GoogleMap>
        </div>

        {/* Sidebar - Right side on desktop, top on mobile */}
        <div className="order-1 lg:order-2 space-y-4 p-4 md:p-6 lg:max-h-[calc(100vh-64px)] lg:overflow-y-auto">
            {/* Search Card */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
                  <MagnifyingGlass className="w-4 h-4" />
                  Search Location
                </h3>
                <PlaceSearch
                  onPlaceSelect={handlePlaceSelect}
                  placeholder="Search a location..."
                  defaultValue={searchLocation?.name}
                />

                {searchLocation && (
                  <div className="mt-3 p-3 bg-primary/5 rounded-lg border border-primary/20">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">{searchLocation.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {searchLocation.lat.toFixed(4)}, {searchLocation.lng.toFixed(4)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => {
                          setSearchLocation(null);
                          setSelectedCampground(null);
                          setSelectedSpot(null);
                          setSelectedRoad(null);
                        }}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                )}

                <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                  <Crosshair className="w-3 h-3" />
                  Or click anywhere on the map to drop a pin
                </p>
              </CardContent>
            </Card>

            {/* Stats Cards - Shows after search when we have results */}
            {searchLocation && !loading && (
              <div className="grid grid-cols-4 gap-2">
                <div className="p-2 bg-card rounded-lg border border-border text-center">
                  <p className="text-2xl font-bold text-foreground">{filteredPotentialSpots.length}</p>
                  <p className="text-xs font-medium text-muted-foreground mt-1">Total</p>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="p-2 bg-mossgreen/10 dark:bg-mossgreen/20 rounded-lg border border-mossgreen/30 text-center cursor-pointer">
                      <p className="text-2xl font-bold text-mossgreen">{filteredPotentialSpots.filter(s => s.type === 'camp-site').length}</p>
                      <p className="text-xs font-medium text-mossgreen mt-1 flex items-center justify-center gap-1">
                        Known <Info className="w-3.5 h-3.5" weight="bold" />
                      </p>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="font-medium">Known Campsites</p>
                    <p className="text-xs text-muted-foreground">Campsites tagged by the OSM community - verified camping locations</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="p-2 bg-softamber/10 dark:bg-softamber/20 rounded-lg border border-softamber/30 text-center cursor-pointer">
                      <p className="text-2xl font-bold text-softamber">{filteredPotentialSpots.filter(s => s.type !== 'camp-site' && s.score >= 35).length}</p>
                      <p className="text-xs font-medium text-softamber mt-1 flex items-center justify-center gap-1">
                        High <Info className="w-3.5 h-3.5" weight="bold" />
                      </p>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="font-medium">High Confidence (Score 35+)</p>
                    <p className="text-xs text-muted-foreground">Dead-ends on MVUM/BLM roads with multiple positive indicators</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="p-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800 text-center cursor-pointer">
                      <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{filteredPotentialSpots.filter(s => s.type !== 'camp-site' && s.score >= 25 && s.score < 35).length}</p>
                      <p className="text-xs font-medium text-orange-600 dark:text-orange-400 mt-1 flex items-center justify-center gap-1">
                        Medium <Info className="w-3.5 h-3.5" weight="bold" />
                      </p>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="font-medium">Medium Confidence (Score 25-34)</p>
                    <p className="text-xs text-muted-foreground">Dead-ends on public land tracks</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            )}

            {/* Top Recommendations Card */}
            {currentRecommendations.length > 0 && (
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium text-foreground flex items-center gap-2">
                      <Star className="w-4 h-4 text-primary" weight="fill" />
                      Top Recommendations
                    </h3>
                    {topRecommendations.length > 3 && (
                      <span className="text-xs text-muted-foreground">
                        {recommendationPage + 1} of {Math.ceil(topRecommendations.length / 3)}
                      </span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {currentRecommendations.map((rec, index) => {
                      const isKnownSite = rec.spot.type === 'camp-site';
                      const confidenceColor = isKnownSite ? 'bg-mossgreen' : rec.spot.score >= 35 ? 'bg-softamber' : rec.spot.score >= 25 ? 'bg-orange-500' : 'bg-coralred';
                      const confidenceLabel = isKnownSite ? 'Known' : rec.spot.score >= 35 ? 'High' : rec.spot.score >= 25 ? 'Medium' : 'Lower';
                      const globalIndex = recommendationPage * 3 + index + 1;

                      return (
                        <button
                          key={rec.spot.id}
                          onClick={() => {
                            setSelectedSpot(rec.spot);
                            setSelectedRoad(null);
                            setSelectedCampground(null);
                            if (mapRef.current) {
                              mapRef.current.panTo({ lat: rec.spot.lat, lng: rec.spot.lng });
                              mapRef.current.setZoom(14);
                            }
                          }}
                          className={`w-full text-left p-3 rounded-lg border transition-all hover:shadow-md ${
                            selectedSpot?.id === rec.spot.id
                              ? 'border-primary bg-primary/10 shadow-md'
                              : 'border-border bg-background hover:border-primary/50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-medium text-foreground">#{globalIndex}</span>
                                <span className={`w-2 h-2 rounded-full ${confidenceColor}`} />
                                <span className="text-xs text-muted-foreground">{confidenceLabel} confidence</span>
                              </div>
                              <p className="text-sm text-foreground truncate">{rec.spot.name || rec.spot.roadName || 'Unnamed spot'}</p>
                              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <NavigationArrow className="w-3 h-3" />
                                  {osrmDistances[rec.spot.id] !== undefined ? (
                                    <>{osrmDistances[rec.spot.id].toFixed(1)} mi</>
                                  ) : osrmLoading ? (
                                    <SpinnerGap className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <>~{rec.drivingDistance.toFixed(1)} mi</>
                                  )}
                                </span>
                                {rec.nearbyCount > 0 && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    {rec.nearbyCount} nearby
                                  </span>
                                )}
                                {rec.spot.isOnMVUMRoad && (
                                  <span className="text-green-600 dark:text-green-400">USFS</span>
                                )}
                                {rec.spot.isOnBLMRoad && (
                                  <span className="text-amber-600 dark:text-amber-400">BLM</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Pagination buttons */}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                    <p className="text-[10px] text-muted-foreground">
                      {Object.keys(osrmDistances).length > 0
                        ? 'Driving distances via OSM'
                        : osrmLoading
                          ? 'Loading driving distances...'
                          : '~distances are estimates'}
                    </p>
                    <div className="flex items-center gap-2">
                      {recommendationPage > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setRecommendationPage(p => p - 1)}
                        >
                          Previous
                        </Button>
                      )}
                      {hasMoreRecommendations && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-3 text-xs"
                          onClick={() => setRecommendationPage(p => p + 1)}
                        >
                          Next options
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Results Card */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
                  <Path className="w-4 h-4" />
                  Roads Found
                </h3>

                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <SpinnerGap className="w-6 h-6 text-primary animate-spin" />
                  </div>
                ) : error ? (
                  <div className="flex items-center gap-2 text-destructive py-4">
                    <Warning className="w-4 h-4" />
                    <span className="text-sm">{error}</span>
                  </div>
                ) : !searchLocation ? (
                  <p className="text-sm text-muted-foreground py-4">
                    Search for a location to find nearby roads
                  </p>
                ) : (
                  <div className="space-y-4">
                    {/* Public Lands Toggle */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex gap-0.5">
                          <div className="w-2 h-4 bg-emerald-500/40 border border-emerald-600 rounded-l" title="USFS" />
                          <div className="w-2 h-4 bg-amber-500/40 border border-amber-600 rounded-r" title="BLM" />
                        </div>
                        <span className="text-sm font-medium">Public Lands</span>
                        {publicLandsLoading && <SpinnerGap className="w-3 h-3 animate-spin text-muted-foreground" />}
                        {publicLands.length > 0 && (
                          <span className="text-xs text-muted-foreground" title={`${publicLands.filter(l => l.renderOnMap).length} rendered, ${publicLands.filter(l => !l.renderOnMap).length} filter-only`}>
                            ({publicLands.length})
                          </span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => setShowPublicLands(!showPublicLands)}
                      >
                        {showPublicLands ? (
                          <Eye className="w-4 h-4" />
                        ) : (
                          <EyeSlash className="w-4 h-4" />
                        )}
                      </Button>
                    </div>

                    {/* My Campsites Toggle */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Tent className="w-4 h-4 text-wildviolet" />
                        <span className="text-sm font-medium">My Campsites</span>
                        {campsites.length > 0 && (
                          <span className="text-xs text-muted-foreground">
                            ({campsites.length})
                          </span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => setShowMyCampsites(!showMyCampsites)}
                      >
                        {showMyCampsites ? (
                          <Eye className="w-4 h-4" />
                        ) : (
                          <EyeSlash className="w-4 h-4" />
                        )}
                      </Button>
                    </div>

                    {/* Road Type Filter */}
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Filter by Vehicle</p>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          onClick={() => setRoadFilter('all')}
                          className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                            roadFilter === 'all'
                              ? 'bg-foreground text-background border-foreground'
                              : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                          }`}
                        >
                          All Roads
                        </button>
                        <button
                          onClick={() => setRoadFilter('passenger')}
                          className={`px-2.5 py-1 text-xs rounded-full border transition-colors flex items-center gap-1.5 ${
                            roadFilter === 'passenger'
                              ? 'text-white border-[#3b82f6]'
                              : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                          }`}
                          style={roadFilter === 'passenger' ? { backgroundColor: '#3b82f6' } : {}}
                        >
                          <span className="w-2 h-0.5 rounded" style={{ backgroundColor: '#3b82f6' }} />
                          Passenger OK
                        </button>
                        <button
                          onClick={() => setRoadFilter('high-clearance')}
                          className={`px-2.5 py-1 text-xs rounded-full border transition-colors flex items-center gap-1.5 ${
                            roadFilter === 'high-clearance'
                              ? 'text-white border-[#f97316]'
                              : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                          }`}
                          style={roadFilter === 'high-clearance' ? { backgroundColor: '#f97316' } : {}}
                        >
                          <span className="w-2 h-0.5 rounded" style={{ backgroundColor: '#f97316' }} />
                          High Clearance
                        </button>
                        <button
                          onClick={() => setRoadFilter('4wd')}
                          className={`px-2.5 py-1 text-xs rounded-full border transition-colors flex items-center gap-1.5 ${
                            roadFilter === '4wd'
                              ? 'text-white border-[#ef4444]'
                              : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                          }`}
                          style={roadFilter === '4wd' ? { backgroundColor: '#ef4444' } : {}}
                        >
                          <span className="w-2 h-0.5 rounded" style={{ backgroundColor: '#ef4444' }} />
                          4WD / All
                        </button>
                      </div>
                      {roadFilter !== 'all' && (
                        <p className="text-[10px] text-muted-foreground">
                          Spots filtered by route accessibility (entire path to spot)
                        </p>
                      )}
                    </div>

                    {/* Legend */}
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Legend</p>
                      <div className="grid grid-cols-2 gap-1.5 text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 bg-emerald-500/30 border border-emerald-600 rounded" />
                          <span>USFS Land</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 bg-amber-500/30 border border-amber-600 rounded" />
                          <span>BLM Land</span>
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
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 bg-purple-500 rounded-full" />
                          <span>Campground</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Tent className="w-3 h-3 text-wildviolet" />
                          <span>My Campsites</span>
                        </div>
                      </div>
                    </div>

                    {/* Road List */}
                    {totalRoads > 0 && (
                      <div className="space-y-2 max-h-[300px] overflow-y-auto">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          High Clearance / 4WD Roads ({mvumRoads.filter(r => r.highClearanceVehicle).length + osmTracks.filter(t => t.fourWdOnly || t.tracktype === 'grade4' || t.tracktype === 'grade5').length})
                        </p>
                        {mvumRoads
                          .filter(r => r.highClearanceVehicle && !r.passengerVehicle)
                          .slice(0, 10)
                          .map((road) => (
                            <button
                              key={`mvum-${road.id}`}
                              onClick={() => { setSelectedRoad(road); setSelectedCampground(null); setSelectedSpot(null); }}
                              className={`w-full text-left p-2 rounded-lg border transition-colors ${
                                selectedRoad === road
                                  ? 'bg-primary/10 border-primary'
                                  : 'bg-muted/50 border-transparent hover:bg-muted'
                              }`}
                            >
                              <p className="text-sm font-medium text-foreground truncate">{road.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {road.surfaceType} • MVUM
                              </p>
                            </button>
                          ))}
                        {osmTracks
                          .filter(t => t.fourWdOnly || t.tracktype === 'grade4' || t.tracktype === 'grade5')
                          .slice(0, 10)
                          .map((track) => (
                            <button
                              key={`osm-${track.id}`}
                              onClick={() => { setSelectedRoad(track); setSelectedCampground(null); setSelectedSpot(null); }}
                              className={`w-full text-left p-2 rounded-lg border transition-colors ${
                                selectedRoad === track
                                  ? 'bg-primary/10 border-primary'
                                  : 'bg-muted/50 border-transparent hover:bg-muted'
                              }`}
                            >
                              <p className="text-sm font-medium text-foreground truncate">
                                {track.name || 'Unnamed Track'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {track.surface || track.tracktype || 'track'} • OSM
                              </p>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Potential Spots Card */}
            {filteredPotentialSpots.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
                    <Tent className="w-4 h-4 text-wildviolet" />
                    Potential Camp Spots
                    <span className="ml-auto text-xs text-muted-foreground">{filteredPotentialSpots.length} found</span>
                  </h3>

                  <div className="space-y-2 max-h-[250px] overflow-y-auto">
                    {filteredPotentialSpots.slice(0, 20).map((spot) => (
                      <button
                        key={spot.id}
                        onClick={() => {
                          setSelectedSpot(spot);
                          setSelectedRoad(null);
                          setSelectedCampground(null);
                          setMapCenter({ lat: spot.lat, lng: spot.lng });
                          setMapZoom(15);
                        }}
                        className={`w-full text-left p-2 rounded-lg border transition-colors ${
                          selectedSpot === spot
                            ? 'bg-primary/10 border-primary'
                            : 'bg-muted/50 border-transparent hover:bg-muted'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {getSpotIcon(spot.type)}
                          <span className="text-sm font-medium text-foreground truncate flex-1">{spot.name}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${getScoreColor(spot.score)}`}>
                            {spot.score}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {spot.reasons.slice(0, 2).map((reason, i) => (
                            <span key={i} className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              {reason}
                            </span>
                          ))}
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Spot Legend */}
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-xs text-muted-foreground mb-2">Spot Types</p>
                    <div className="grid grid-cols-2 gap-1 text-xs">
                      <div className="flex items-center gap-1">
                        <Tent className="w-3 h-3 text-wildviolet" />
                        <span>Camp Site</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <MapPinLine className="w-3 h-3 text-orange-600" />
                        <span>Dead End</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Path className="w-3 h-3 text-blue-600" />
                        <span>Intersection</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Drop className="w-3 h-3 text-cyan-600" />
                        <span>Near Water</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Established Campgrounds Card */}
            {establishedCampgrounds.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  {/* Large number at top */}
                  <div className="p-3 bg-muted/50 rounded-lg text-center mb-4">
                    <p className="text-3xl font-bold text-foreground">{establishedCampgrounds.length}</p>
                    <p className="text-sm text-muted-foreground mt-1">Campgrounds</p>
                  </div>

                  <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
                    <TreeEvergreen className="w-4 h-4 text-purple-600" />
                    USFS/BLM Campgrounds
                  </h3>

                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {establishedCampgrounds.slice(0, 15).map((cg) => (
                      <button
                        key={cg.id}
                        onClick={() => {
                          setSelectedCampground(cg);
                          setSelectedSpot(null);
                          setSelectedRoad(null);
                          setMapCenter({ lat: cg.lat, lng: cg.lng });
                          setMapZoom(14);
                        }}
                        className={`w-full text-left p-2 rounded-lg border transition-colors ${
                          selectedCampground === cg
                            ? 'bg-purple-100 dark:bg-purple-900/30 border-purple-400'
                            : 'bg-muted/50 border-transparent hover:bg-muted'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <TreeEvergreen className="w-4 h-4 text-purple-600 flex-shrink-0" />
                          <span className="text-sm font-medium text-foreground truncate flex-1">{cg.name}</span>
                          {cg.reservable && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded">Reserve</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground ml-6 truncate">{cg.facilityType}</p>
                      </button>
                    ))}
                  </div>

                  <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
                    Official campgrounds from Recreation.gov - these are <strong>not</strong> dispersed camping
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Selected Campground Details */}
            {selectedCampground && (
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
                    <TreeEvergreen className="w-4 h-4 text-purple-600" />
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
                        className="inline-flex items-center gap-1 text-xs text-purple-600 hover:underline mt-2"
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
                           selectedSpot.score >= 35 ? 'High' : selectedSpot.score >= 25 ? 'Medium' : 'Lower'}
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

            {/* Selected Road Details */}
            {selectedRoad && (
              <Card>
                <CardContent className="p-4">
                  {'highClearanceVehicle' in selectedRoad ? (
                    // MVUM Road
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium text-foreground flex items-center gap-2">
                          <TreeEvergreen className="w-4 h-4 text-green-600" />
                          Road Details
                        </h3>
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 rounded text-xs font-medium">
                          USFS MVUM
                        </span>
                      </div>
                      <div className="space-y-2 text-sm">
                        <p><span className="text-muted-foreground">Name:</span> {selectedRoad.name}</p>
                        <p><span className="text-muted-foreground">Surface:</span> {selectedRoad.surfaceType}</p>
                        <p><span className="text-muted-foreground">Maintenance:</span> {selectedRoad.operationalMaintLevel}</p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {selectedRoad.passengerVehicle && (
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">Passenger OK</span>
                          )}
                          {selectedRoad.highClearanceVehicle && (
                            <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs">High Clearance</span>
                          )}
                          {selectedRoad.atv && (
                            <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs">ATV</span>
                          )}
                          {selectedRoad.motorcycle && (
                            <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs">Motorcycle</span>
                          )}
                          {!selectedRoad.passengerVehicle && !selectedRoad.highClearanceVehicle && !selectedRoad.atv && !selectedRoad.motorcycle && (
                            <span className="px-2 py-0.5 bg-muted text-muted-foreground rounded text-xs">No vehicle info</span>
                          )}
                        </div>
                        {selectedRoad.seasonal && (
                          <p className="text-xs text-muted-foreground mt-2">Seasonal: {selectedRoad.seasonal}</p>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground border-t border-border pt-2">
                        Source: USFS Motor Vehicle Use Map (official Forest Service data)
                      </p>
                    </div>
                  ) : (
                    // OSM Track
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium text-foreground flex items-center gap-2">
                          <Path className="w-4 h-4 text-blue-600" />
                          Road Details
                        </h3>
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded text-xs font-medium">
                          OpenStreetMap
                        </span>
                      </div>
                      <div className="space-y-2 text-sm">
                        <p><span className="text-muted-foreground">Name:</span> {selectedRoad.name || 'Unnamed'}</p>
                        <p><span className="text-muted-foreground">Type:</span> {selectedRoad.highway}</p>
                        <p><span className="text-muted-foreground">OSM Way ID:</span> <a href={`https://www.openstreetmap.org/way/${selectedRoad.id}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{selectedRoad.id}</a></p>
                        {selectedRoad.surface && (
                          <p><span className="text-muted-foreground">Surface:</span> {selectedRoad.surface}</p>
                        )}
                        {selectedRoad.tracktype && (
                          <p><span className="text-muted-foreground">Grade:</span> {selectedRoad.tracktype}
                            <span className="text-muted-foreground ml-1">
                              ({selectedRoad.tracktype === 'grade1' ? 'paved/solid' :
                                selectedRoad.tracktype === 'grade2' ? 'gravel - verify conditions' :
                                selectedRoad.tracktype === 'grade3' ? 'unpaved - high clearance' :
                                selectedRoad.tracktype === 'grade4' ? 'rough - 4WD likely' :
                                selectedRoad.tracktype === 'grade5' ? 'very rough - 4WD required' : ''})
                            </span>
                          </p>
                        )}
                        {!selectedRoad.tracktype && selectedRoad.surface && (
                          <p className="text-xs text-amber-600 dark:text-amber-400">
                            No grade info - verify road conditions before travel
                          </p>
                        )}
                        <div className="flex flex-wrap gap-1 mt-2">
                          {selectedRoad.fourWdOnly && (
                            <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">4WD Only</span>
                          )}
                          {selectedRoad.access && (
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">{selectedRoad.access}</span>
                          )}
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground border-t border-border pt-2">
                        Source: OpenStreetMap (community data - may not reflect actual conditions)
                      </p>
                      <p className="text-[10px] text-amber-600 dark:text-amber-400">
                        OSM grades don't account for steepness, obstacles, or seasonal conditions. Always verify before travel.
                      </p>
                    </div>
                  )}
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
              getExplorerSpots(searchLocation.lat, searchLocation.lng, 15).then(setExplorerSpots);
            }
          }}
        />
      )}
    </div>
  );
};

export default DispersedExplorer;
