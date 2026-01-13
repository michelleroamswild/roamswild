import { useState, useCallback, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, MapPin, MagnifyingGlass, Path, Jeep, SpinnerGap, TreeEvergreen, Warning, Crosshair, Tent, Star, Drop, MapPinLine, Eye, EyeSlash } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { GoogleMap } from '@/components/GoogleMap';
import { Polyline, Marker, Polygon } from '@react-google-maps/api';
import { Autocomplete } from '@react-google-maps/api';
import { useDispersedRoads, MVUMRoad, OSMTrack, PotentialSpot } from '@/hooks/use-dispersed-roads';
import { usePublicLands } from '@/hooks/use-public-lands';
import { Header } from '@/components/Header';

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
  const [searchLocation, setSearchLocation] = useState<SearchLocation | null>(null);
  const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 39.5, lng: -105.5 });
  const [mapZoom, setMapZoom] = useState(7);
  const [selectedRoad, setSelectedRoad] = useState<MVUMRoad | OSMTrack | null>(null);
  const [selectedSpot, setSelectedSpot] = useState<PotentialSpot | null>(null);
  const [showPublicLands, setShowPublicLands] = useState(true);
  const mapRef = useRef<google.maps.Map | null>(null);

  const { mvumRoads, osmTracks, potentialSpots, loading, error } = useDispersedRoads(
    searchLocation?.lat ?? null,
    searchLocation?.lng ?? null,
    20 // 20 mile radius
  );

  // Fetch public lands (BLM, USFS, NPS, FWS) for overlay
  const { publicLands, loading: publicLandsLoading } = usePublicLands(
    searchLocation?.lat ?? 0,
    searchLocation?.lng ?? 0,
    25 // 25 mile radius for public lands
  );

  // Filter potential spots: only show derived spots (dead-ends, intersections)
  // if they're within BLM/USFS/NPS polygon boundaries. OSM camp sites always shown.
  const filteredPotentialSpots = useMemo(() => {
    // Always show OSM camp sites regardless of polygon data
    const campSites = potentialSpots.filter((spot) => spot.type === 'camp-site');

    if (!publicLands.length) {
      // No polygon data yet, only show verified camp sites
      console.log('No public lands loaded yet, showing only OSM camp sites');
      return campSites;
    }

    // Debug logging
    const polygonsWithData = publicLands.filter(l => l.polygon && l.polygon.length > 0);
    console.log(`Public lands: ${publicLands.length} total, ${polygonsWithData.length} with polygon data`);

    // Filter derived spots to only those within public land polygons
    const derivedSpots = potentialSpots.filter((spot) => spot.type !== 'camp-site');
    const filteredDerived = derivedSpots.filter((spot) =>
      isWithinAnyPublicLand(spot.lat, spot.lng, publicLands)
    );

    console.log(`Filtered: ${filteredDerived.length}/${derivedSpots.length} derived spots within public land polygons`);

    return [...campSites, ...filteredDerived];
  }, [potentialSpots, publicLands]);

  const onAutocompleteLoad = useCallback((autocompleteInstance: google.maps.places.Autocomplete) => {
    setAutocomplete(autocompleteInstance);
  }, []);

  const onPlaceChanged = useCallback(() => {
    if (autocomplete) {
      const place = autocomplete.getPlace();
      if (place.geometry?.location) {
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        setSearchLocation({
          lat,
          lng,
          name: place.name || place.formatted_address || 'Selected Location',
        });
        setMapCenter({ lat, lng });
        setMapZoom(12);
        setSelectedRoad(null);
        setSelectedSpot(null);
      }
    }
  }, [autocomplete]);

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
      setSelectedRoad(null);
      setSelectedSpot(null);
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
    if (track.tracktype === 'grade5' || track.tracktype === 'grade4') return '#f97316'; // Orange - rough
    if (track.tracktype === 'grade3') return '#eab308'; // Yellow - moderate
    return '#3b82f6'; // Blue - unknown/passable
  };

  // Get marker icon URL based on spot type and score
  const getSpotMarkerIcon = (spot: PotentialSpot) => {
    // Use different colors based on score
    let color = 'red'; // Default
    if (spot.score >= 35) color = 'green';
    else if (spot.score >= 25) color = 'yellow';
    else if (spot.score >= 15) color = 'orange';

    // Use Google Maps default marker icons
    return `http://maps.google.com/mapfiles/ms/icons/${color}-dot.png`;
  };

  const getSpotIcon = (type: PotentialSpot['type']) => {
    switch (type) {
      case 'camp-site': return <Tent className="w-4 h-4 text-green-600" />;
      case 'dead-end': return <MapPinLine className="w-4 h-4 text-orange-600" />;
      case 'intersection': return <Path className="w-4 h-4 text-blue-600" />;
      case 'water-access': return <Drop className="w-4 h-4 text-cyan-600" />;
      default: return <MapPin className="w-4 h-4 text-gray-600" />;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 35) return 'text-green-600 bg-green-100';
    if (score >= 25) return 'text-yellow-600 bg-yellow-100';
    if (score >= 15) return 'text-orange-600 bg-orange-100';
    return 'text-red-600 bg-red-100';
  };

  const totalRoads = mvumRoads.length + osmTracks.length;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container px-4 md:px-6 py-6">
        {/* Page Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link to="/">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
              <Jeep className="w-6 h-6 text-primary" />
              Dispersed Camping Explorer
            </h1>
            <p className="text-muted-foreground">Find offroad tracks and dispersed camping spots on public lands</p>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Sidebar */}
          <div className="space-y-4">
            {/* Search Card */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
                  <MagnifyingGlass className="w-4 h-4" />
                  Search Location
                </h3>
                <Autocomplete
                  onLoad={onAutocompleteLoad}
                  onPlaceChanged={onPlaceChanged}
                  options={{
                    types: ['geocode', 'establishment'],
                    componentRestrictions: { country: 'us' },
                  }}
                >
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search a location..."
                      className="w-full pl-10 pr-4 py-2.5 bg-muted border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                </Autocomplete>

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
                        onClick={() => setSearchLocation(null)}
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
                    {/* Summary */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                        <p className="text-xl font-bold text-green-700 dark:text-green-300">{mvumRoads.length}</p>
                        <p className="text-xs text-green-600 dark:text-green-400">MVUM Roads</p>
                      </div>
                      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <p className="text-xl font-bold text-blue-700 dark:text-blue-300">{osmTracks.length}</p>
                        <p className="text-xs text-blue-600 dark:text-blue-400">OSM Tracks</p>
                      </div>
                      <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                        <p className="text-xl font-bold text-orange-700 dark:text-orange-300">{filteredPotentialSpots.length}</p>
                        <p className="text-xs text-orange-600 dark:text-orange-400">Camp Spots</p>
                      </div>
                    </div>

                    {/* Public Lands Toggle */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-emerald-500/30 border-2 border-emerald-600 rounded" />
                        <span className="text-sm font-medium">Public Lands</span>
                        {publicLandsLoading && <SpinnerGap className="w-3 h-3 animate-spin text-muted-foreground" />}
                        {publicLands.length > 0 && (
                          <span className="text-xs text-muted-foreground">({publicLands.length})</span>
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

                    {/* Legend */}
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Legend</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-1 bg-green-500 rounded" />
                          <span>Passenger OK</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-1 bg-orange-500 rounded" />
                          <span>High Clearance</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-1 bg-yellow-500 rounded" />
                          <span>OHV/Moderate</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-1 bg-red-500 rounded" />
                          <span>4WD Only</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-1 bg-blue-500 rounded" />
                          <span>OSM Track</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 bg-emerald-500/30 border border-emerald-600 rounded" />
                          <span>BLM/USFS Land</span>
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
                              onClick={() => setSelectedRoad(road)}
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
                              onClick={() => setSelectedRoad(track)}
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
                    <Tent className="w-4 h-4 text-green-600" />
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
                        <Tent className="w-3 h-3 text-green-600" />
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

            {/* Selected Spot Details */}
            {selectedSpot && (
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
                    {getSpotIcon(selectedSpot.type)}
                    Spot Details
                  </h3>
                  <div className="space-y-2 text-sm">
                    <p><span className="text-muted-foreground">Name:</span> {selectedSpot.name}</p>
                    <p><span className="text-muted-foreground">Type:</span> {selectedSpot.type.replace('-', ' ')}</p>
                    <p><span className="text-muted-foreground">Score:</span> <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${getScoreColor(selectedSpot.score)}`}>{selectedSpot.score}</span></p>
                    <p><span className="text-muted-foreground">Coordinates:</span> {selectedSpot.lat.toFixed(5)}, {selectedSpot.lng.toFixed(5)}</p>
                    {selectedSpot.roadName && (
                      <p><span className="text-muted-foreground">Road:</span> {selectedSpot.roadName}</p>
                    )}
                    <div className="mt-2">
                      <p className="text-muted-foreground text-xs mb-1">Why it's promising:</p>
                      <div className="flex flex-wrap gap-1">
                        {selectedSpot.reasons.map((reason, i) => (
                          <span key={i} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                            {reason}
                          </span>
                        ))}
                      </div>
                    </div>
                    {selectedSpot.nearWater && (
                      <div className="flex items-center gap-1 text-cyan-600 mt-2">
                        <Drop className="w-4 h-4" />
                        <span className="text-xs">Near water source</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Selected Road Details */}
            {selectedRoad && (
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
                    <TreeEvergreen className="w-4 h-4 text-green-600" />
                    Road Details
                  </h3>
                  {'highClearanceVehicle' in selectedRoad ? (
                    // MVUM Road
                    <div className="space-y-2 text-sm">
                      <p><span className="text-muted-foreground">Name:</span> {selectedRoad.name}</p>
                      <p><span className="text-muted-foreground">Surface:</span> {selectedRoad.surfaceType}</p>
                      <p><span className="text-muted-foreground">Maintenance:</span> {selectedRoad.operationalMaintLevel}</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {selectedRoad.passengerVehicle && (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">Passenger</span>
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
                      </div>
                      {selectedRoad.seasonal && (
                        <p className="text-xs text-muted-foreground mt-2">Seasonal: {selectedRoad.seasonal}</p>
                      )}
                    </div>
                  ) : (
                    // OSM Track
                    <div className="space-y-2 text-sm">
                      <p><span className="text-muted-foreground">Name:</span> {selectedRoad.name || 'Unnamed'}</p>
                      <p><span className="text-muted-foreground">Type:</span> {selectedRoad.highway}</p>
                      {selectedRoad.surface && (
                        <p><span className="text-muted-foreground">Surface:</span> {selectedRoad.surface}</p>
                      )}
                      {selectedRoad.tracktype && (
                        <p><span className="text-muted-foreground">Grade:</span> {selectedRoad.tracktype}</p>
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
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Map */}
          <div className="lg:col-span-2 h-[600px] lg:h-[calc(100vh-200px)] rounded-xl overflow-hidden border border-border relative">
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

              {/* Public Lands Overlay (BLM, USFS) */}
              {showPublicLands && publicLands.map((land) => (
                land.polygon ? (
                  <Polygon
                    key={land.id}
                    paths={land.polygon}
                    options={{
                      fillColor: '#10b981',
                      fillOpacity: 0.25,
                      strokeColor: '#059669',
                      strokeOpacity: 0.7,
                      strokeWeight: 2,
                      clickable: false,
                    }}
                  />
                ) : null
              ))}

              {/* MVUM Roads */}
              {mvumRoads.map((road) => (
                <Polyline
                  key={`mvum-${road.id}`}
                  path={road.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }))}
                  options={{
                    strokeColor: getMVUMColor(road),
                    strokeOpacity: selectedRoad === road ? 1 : 0.7,
                    strokeWeight: selectedRoad === road ? 4 : 2,
                    clickable: true,
                  }}
                  onClick={() => setSelectedRoad(road)}
                />
              ))}

              {/* OSM Tracks */}
              {osmTracks.map((track) => (
                <Polyline
                  key={`osm-${track.id}`}
                  path={track.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }))}
                  options={{
                    strokeColor: getOSMColor(track),
                    strokeOpacity: selectedRoad === track ? 1 : 0.7,
                    strokeWeight: selectedRoad === track ? 4 : 2,
                    clickable: true,
                  }}
                  onClick={() => setSelectedRoad(track)}
                />
              ))}

              {/* Potential Camp Spots */}
              {filteredPotentialSpots.map((spot) => (
                <Marker
                  key={spot.id}
                  position={{ lat: spot.lat, lng: spot.lng }}
                  title={`${spot.name} (Score: ${spot.score})`}
                  icon={{
                    url: getSpotMarkerIcon(spot),
                    scaledSize: new google.maps.Size(
                      selectedSpot === spot ? 40 : 32,
                      selectedSpot === spot ? 40 : 32
                    ),
                  }}
                  onClick={() => {
                    setSelectedSpot(spot);
                    setSelectedRoad(null);
                  }}
                  zIndex={selectedSpot === spot ? 1000 : spot.score}
                />
              ))}
            </GoogleMap>
          </div>
        </div>
      </main>
    </div>
  );
};

export default DispersedExplorer;
