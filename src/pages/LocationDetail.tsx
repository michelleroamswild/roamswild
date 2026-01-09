import { useState, useEffect } from "react";
import { useParams, Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, MapPin, Mountain, Navigation, Star, Share2, ExternalLink, Compass, Plus, Trash2, Footprints, Route } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useSavedLocations } from "@/context/SavedLocationsContext";
import { GoogleMap } from "@/components/GoogleMap";
import { Marker, InfoWindow } from "@react-google-maps/api";
import { useNearbyPlaces, GoogleSavedPlace } from "@/hooks/use-nearby-places";
import { useNearbyHikes, HikeResult } from "@/hooks/use-nearby-hikes";
import { toast } from "sonner";

type NearbyPlace = GoogleSavedPlace & { distance: number };

interface LocationState {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

// Helper to get weather message based on elevation in feet
function getElevationMessage(elevationFeet: number): string | null {
  if (elevationFeet >= 8000) return "This is covered in snow";
  if (elevationFeet >= 6000) return "Make sure you bring your puffy";
  if (elevationFeet >= 3000) return "It might be a bit chilly here";
  return null;
}

// SVG icons for map markers
const CAR_ICON_SVG = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#c9a227" stroke="#ffffff" stroke-width="1.5">
  <circle cx="12" cy="12" r="11" fill="#c9a227"/>
  <path d="M7 13l1.5-4.5h7L17 13M7 13h10M7 13v3h2v-2h6v2h2v-3" stroke="#ffffff" stroke-width="1.5" fill="none" transform="translate(0, 1)"/>
  <circle cx="8.5" cy="15" r="1" fill="#ffffff"/>
  <circle cx="15.5" cy="15" r="1" fill="#ffffff"/>
</svg>
`)}`;

const BOOT_ICON_SVG = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#10b981" stroke="#ffffff" stroke-width="1.5">
  <circle cx="12" cy="12" r="11" fill="#10b981"/>
  <path d="M8 7v6l-2 2v2h10v-2l-1-1v-3h-3V8l-1-1H8z" stroke="#ffffff" stroke-width="1.2" fill="none" transform="translate(1, 0)"/>
</svg>
`)}`;

const LocationDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const { locations, addLocation, removeLocation, isLocationSaved } = useSavedLocations();
  const [selectedPlace, setSelectedPlace] = useState<NearbyPlace | null>(null);
  const [selectedHike, setSelectedHike] = useState<HikeResult | null>(null);
  const [selectedPlaceElevation, setSelectedPlaceElevation] = useState<number | null>(null);
  const [elevation, setElevation] = useState<number | null>(null);
  const [mapsLoaded, setMapsLoaded] = useState(false);

  // Get location from router state (search) or from saved locations
  const stateLocation = routerLocation.state as LocationState | null;
  const savedLocation = locations.find(l => l.placeId === id || l.id === id);

  // Combine into a unified location object
  const location = savedLocation ? {
    placeId: savedLocation.placeId,
    name: savedLocation.name,
    address: savedLocation.address,
    type: savedLocation.type,
    lat: savedLocation.lat,
    lng: savedLocation.lng,
  } : stateLocation ? {
    placeId: stateLocation.placeId,
    name: stateLocation.name,
    address: stateLocation.address,
    type: "Place",
    lat: stateLocation.lat,
    lng: stateLocation.lng,
  } : null;

  const isSaved = location ? isLocationSaved(location.placeId) : false;

  // Get nearby places from Google Takeout data (50 mile radius)
  const { nearbyPlaces, loading: nearbyLoading } = useNearbyPlaces(
    location?.lat ?? 0,
    location?.lng ?? 0,
    50
  );

  // Get nearby hikes from Google Places and Hiking Project
  const { hikes, loading: hikesLoading } = useNearbyHikes(
    location?.lat ?? 0,
    location?.lng ?? 0,
    30
  );

  // Fetch elevation when Google Maps is loaded
  useEffect(() => {
    if (!location || !mapsLoaded || !window.google?.maps) return;

    const elevator = new google.maps.ElevationService();
    elevator.getElevationForLocations(
      { locations: [{ lat: location.lat, lng: location.lng }] },
      (results, status) => {
        if (status === google.maps.ElevationStatus.OK && results?.[0]) {
          setElevation(results[0].elevation);
        }
      }
    );
  }, [location, mapsLoaded]);

  // Fetch elevation for selected camp spot
  useEffect(() => {
    if (!selectedPlace || !mapsLoaded || !window.google?.maps) {
      setSelectedPlaceElevation(null);
      return;
    }

    const elevator = new google.maps.ElevationService();
    elevator.getElevationForLocations(
      { locations: [{ lat: selectedPlace.lat, lng: selectedPlace.lng }] },
      (results, status) => {
        if (status === google.maps.ElevationStatus.OK && results?.[0]) {
          setSelectedPlaceElevation(results[0].elevation);
        }
      }
    );
  }, [selectedPlace, mapsLoaded]);

  if (!location) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <MapPin className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-30" />
          <h1 className="text-2xl font-display font-bold text-foreground mb-2">Location Not Found</h1>
          <p className="text-muted-foreground mb-6">This location may have been removed.</p>
          <Link to="/">
            <Button variant="hero">Back to Home</Button>
          </Link>
        </div>
      </div>
    );
  }

  const handleOpenInMaps = () => {
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}`,
      '_blank'
    );
  };

  const handleGetDirections = () => {
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}`,
      '_blank'
    );
  };

  const handleSaveLocation = () => {
    if (!location) return;

    const added = addLocation({
      placeId: location.placeId,
      name: location.name,
      address: location.address,
      type: location.type,
      lat: location.lat,
      lng: location.lng,
    });

    if (added) {
      toast.success(`Saved ${location.name}`, {
        description: "Added to your saved locations",
      });
    }
  };

  const handleRemoveLocation = () => {
    if (!savedLocation) return;

    removeLocation(savedLocation.id);
    toast.success(`Removed ${location.name}`, {
      description: "Removed from saved locations",
    });
  };

  const handleCreateTrip = () => {
    navigate('/create-trip', {
      state: {
        startLocation: {
          name: location.name,
          lat: location.lat,
          lng: location.lng,
          placeId: location.placeId,
        },
      },
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="container px-4 md:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/">
                <Button variant="ghost" size="icon" className="rounded-full">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-display font-bold text-foreground">{location.name}</h1>
                <p className="text-sm text-muted-foreground">{location.type}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCreateTrip}
                className="hidden sm:flex"
              >
                <Route className="w-4 h-4 mr-2" />
                Create Trip
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full sm:hidden"
                onClick={handleCreateTrip}
                title="Create Trip"
              >
                <Route className="w-5 h-5" />
              </Button>
              {isSaved ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full"
                  onClick={handleRemoveLocation}
                  title="Remove from favorites"
                >
                  <Star className="w-5 h-5 text-terracotta fill-terracotta" />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full"
                  onClick={handleSaveLocation}
                  title="Add to favorites"
                >
                  <Star className="w-5 h-5" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="rounded-full">
                <Share2 className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container px-4 md:px-6 py-6">
        <div className="grid lg:grid-cols-5 gap-6">
          {/* Map Section */}
          <div className="lg:col-span-3 order-2 lg:order-1">
            <Card className="overflow-hidden h-[400px] lg:h-[calc(100vh-180px)] lg:sticky lg:top-24">
              <div className="relative w-full h-full">
                <GoogleMap
                  center={{ lat: location.lat, lng: location.lng }}
                  zoom={nearbyPlaces.length > 0 ? 10 : 14}
                  className="w-full h-full"
                  onLoad={() => setMapsLoaded(true)}
                >
                  {/* Main location marker */}
                  <Marker
                    position={{ lat: location.lat, lng: location.lng }}
                    icon={{
                      path: google.maps.SymbolPath.CIRCLE,
                      fillColor: '#2d5a3d',
                      fillOpacity: 1,
                      strokeColor: '#ffffff',
                      strokeWeight: 3,
                      scale: 12,
                    }}
                  />
                  {/* Nearby camp spots markers (car icon) */}
                  {nearbyPlaces.map((place) => (
                    <Marker
                      key={place.id}
                      position={{ lat: place.lat, lng: place.lng }}
                      title={`${place.name} (${place.distance.toFixed(1)} mi)`}
                      icon={{
                        url: CAR_ICON_SVG,
                        scaledSize: new google.maps.Size(28, 28),
                        anchor: new google.maps.Point(14, 14),
                      }}
                      onClick={() => {
                        setSelectedPlace(place);
                        setSelectedHike(null);
                      }}
                    />
                  ))}
                  {/* Nearby hikes markers (boot icon) */}
                  {hikes.map((hike) => (
                    <Marker
                      key={hike.id}
                      position={{ lat: hike.lat, lng: hike.lng }}
                      title={hike.name}
                      icon={{
                        url: BOOT_ICON_SVG,
                        scaledSize: new google.maps.Size(28, 28),
                        anchor: new google.maps.Point(14, 14),
                      }}
                      onClick={() => {
                        setSelectedHike(hike);
                        setSelectedPlace(null);
                      }}
                    />
                  ))}
                  {/* Info popup for selected place */}
                  {selectedPlace && (
                    <InfoWindow
                      position={{ lat: selectedPlace.lat, lng: selectedPlace.lng }}
                      onCloseClick={() => setSelectedPlace(null)}
                    >
                      <div className="p-1 min-w-[220px]">
                        <h4 className="font-semibold text-gray-900 text-base mb-1">
                          {selectedPlace.name}
                        </h4>
                        {selectedPlace.note && (
                          <p className="text-gray-600 text-sm mb-2 italic">{selectedPlace.note}</p>
                        )}
                        <div className="flex items-center gap-3 text-gray-500 text-sm mb-2">
                          <span>{selectedPlace.distance.toFixed(1)} mi away</span>
                          {selectedPlaceElevation !== null && (
                            <>
                              <span>•</span>
                              <span>{Math.round(selectedPlaceElevation * 3.28084).toLocaleString()} ft</span>
                            </>
                          )}
                        </div>
                        {selectedPlaceElevation !== null && (() => {
                          const elevFeet = Math.round(selectedPlaceElevation * 3.28084);
                          const message = getElevationMessage(elevFeet);
                          if (!message) return null;
                          return (
                            <p className="text-xs bg-blue-50 text-blue-700 px-2 py-1.5 rounded mb-3">
                              {elevFeet >= 8000 ? '❄️' : elevFeet >= 6000 ? '🧥' : '🌡️'} {message}
                            </p>
                          );
                        })()}
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              window.open(
                                `https://www.google.com/maps/dir/?api=1&destination=${selectedPlace.lat},${selectedPlace.lng}`,
                                '_blank'
                              );
                            }}
                            className="flex-1 px-3 py-1.5 bg-emerald-600 text-white text-sm rounded hover:bg-emerald-700 transition-colors"
                          >
                            Directions
                          </button>
                          <button
                            onClick={() => {
                              window.open(
                                `https://www.google.com/maps/search/?api=1&query=${selectedPlace.lat},${selectedPlace.lng}`,
                                '_blank'
                              );
                            }}
                            className="px-3 py-1.5 border border-gray-300 text-gray-700 text-sm rounded hover:bg-gray-100 transition-colors"
                          >
                            View
                          </button>
                        </div>
                      </div>
                    </InfoWindow>
                  )}
                  {/* Info popup for selected hike */}
                  {selectedHike && (
                    <InfoWindow
                      position={{ lat: selectedHike.lat, lng: selectedHike.lng }}
                      onCloseClick={() => setSelectedHike(null)}
                    >
                      <div className="p-1 min-w-[200px]">
                        <h4 className="font-semibold text-gray-900 text-base mb-1">
                          {selectedHike.name}
                        </h4>
                        {selectedHike.rating && (
                          <div className="flex items-center gap-1 text-sm text-gray-600 mb-2">
                            <span className="text-amber-500">★</span>
                            <span>{selectedHike.rating.toFixed(1)}</span>
                            {selectedHike.reviewCount && (
                              <span className="text-gray-400">({selectedHike.reviewCount})</span>
                            )}
                          </div>
                        )}
                        {selectedHike.location && (
                          <p className="text-gray-500 text-sm mb-3">{selectedHike.location}</p>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              window.open(
                                `https://www.google.com/maps/dir/?api=1&destination=${selectedHike.lat},${selectedHike.lng}`,
                                '_blank'
                              );
                            }}
                            className="flex-1 px-3 py-1.5 bg-emerald-600 text-white text-sm rounded hover:bg-emerald-700 transition-colors"
                          >
                            Directions
                          </button>
                          <button
                            onClick={() => {
                              window.open(
                                `https://www.google.com/maps/search/?api=1&query=${selectedHike.lat},${selectedHike.lng}`,
                                '_blank'
                              );
                            }}
                            className="px-3 py-1.5 border border-gray-300 text-gray-700 text-sm rounded hover:bg-gray-100 transition-colors"
                          >
                            View
                          </button>
                        </div>
                      </div>
                    </InfoWindow>
                  )}
                </GoogleMap>

                {/* Map Actions Overlay */}
                <div className="absolute bottom-4 left-4 right-4 z-10">
                  <div className="bg-card/95 backdrop-blur-sm rounded-xl border border-border p-4 shadow-lg">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-terracotta" />
                          <span className="text-sm text-foreground">
                            {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={handleOpenInMaps}>
                          <ExternalLink className="w-4 h-4 mr-2" />
                          Open in Maps
                        </Button>
                        <Button variant="hero" size="sm" onClick={handleGetDirections}>
                          <Navigation className="w-4 h-4 mr-2" />
                          Directions
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Info Panel */}
          <div className="lg:col-span-2 order-1 lg:order-2 space-y-4">
            {/* Location Info */}
            <Card className="bg-gradient-card">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="flex items-center justify-center w-14 h-14 bg-primary/10 rounded-xl">
                    <MapPin className="w-7 h-7 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-xl font-display font-bold text-foreground">{location.name}</h2>
                    <p className="text-muted-foreground mt-1">{location.address}</p>
                    <span className="inline-block mt-2 px-3 py-1 bg-secondary rounded-full text-sm text-foreground">
                      {location.type}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-display font-semibold text-foreground mb-4">Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-secondary/50 rounded-xl">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Mountain className="w-4 h-4" />
                      <span className="text-sm">Elevation</span>
                    </div>
                    {elevation !== null ? (
                      <>
                        <p className="text-xl font-bold text-foreground">
                          {Math.round(elevation * 3.28084).toLocaleString()} ft
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {Math.round(elevation).toLocaleString()} m
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-xl font-bold text-foreground">--</p>
                        <p className="text-xs text-muted-foreground">Loading...</p>
                      </>
                    )}
                  </div>
                  <div className="p-4 bg-secondary/50 rounded-xl">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <MapPin className="w-4 h-4" />
                      <span className="text-sm">Coordinates</span>
                    </div>
                    <p className="text-sm font-bold text-foreground">{location.lat.toFixed(4)}</p>
                    <p className="text-sm font-bold text-foreground">{location.lng.toFixed(4)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Nearby Camp Spots */}
            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-display font-semibold text-foreground mb-4">
                  Nearby Camp Spots
                </h3>
                {nearbyLoading ? (
                  <div className="text-center py-4 text-muted-foreground">
                    <p>Loading nearby spots...</p>
                  </div>
                ) : nearbyPlaces.length > 0 ? (
                  <div className="space-y-3">
                    {nearbyPlaces.slice(0, 5).map((place) => (
                      <div
                        key={place.id}
                        className="flex items-center gap-3 p-3 bg-secondary/50 rounded-lg hover:bg-secondary transition-colors cursor-pointer"
                        onClick={() => {
                          window.open(
                            `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`,
                            '_blank'
                          );
                        }}
                      >
                        <div className="flex items-center justify-center w-10 h-10 bg-primary/10 rounded-lg flex-shrink-0">
                          <Compass className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate">
                            {place.name}
                          </p>
                          {place.note ? (
                            <p className="text-sm text-muted-foreground truncate italic">
                              {place.note}
                            </p>
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              {place.distance.toFixed(1)} miles away
                            </p>
                          )}
                        </div>
                        <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      </div>
                    ))}
                    {nearbyPlaces.length > 5 && (
                      <p className="text-sm text-muted-foreground text-center pt-2">
                        +{nearbyPlaces.length - 5} more places nearby
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    <Compass className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p>No camp spots within 50 miles</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Nearby Hikes */}
            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-display font-semibold text-foreground mb-4">
                  Nearby Hikes
                </h3>
                {hikesLoading ? (
                  <div className="text-center py-4 text-muted-foreground">
                    <p>Finding nearby trails...</p>
                  </div>
                ) : hikes.length > 0 ? (
                  <div className="space-y-3">
                    {hikes.slice(0, 5).map((hike) => (
                      <div
                        key={hike.id}
                        className="flex items-center gap-3 p-3 bg-secondary/50 rounded-lg hover:bg-secondary transition-colors cursor-pointer"
                        onClick={() => {
                          window.open(
                            `https://www.google.com/maps/search/?api=1&query=${hike.lat},${hike.lng}`,
                            '_blank'
                          );
                        }}
                      >
                        <div className="flex items-center justify-center w-10 h-10 bg-emerald-500/10 rounded-lg flex-shrink-0">
                          <Footprints className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate">
                            {hike.name}
                          </p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            {hike.rating ? (
                              <span className="flex items-center gap-1">
                                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                {hike.rating.toFixed(1)}
                                {hike.reviewCount && (
                                  <span className="text-xs">({hike.reviewCount})</span>
                                )}
                              </span>
                            ) : (
                              <span>{hike.location}</span>
                            )}
                          </div>
                        </div>
                        <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      </div>
                    ))}
                    {hikes.length > 5 && (
                      <p className="text-sm text-muted-foreground text-center pt-2">
                        +{hikes.length - 5} more hikes nearby
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    <Footprints className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p>No hikes found within 30 miles</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex gap-3">
              <Button variant="hero" size="lg" className="flex-1" onClick={handleGetDirections}>
                <Navigation className="w-4 h-4 mr-2" />
                Get Directions
              </Button>
              <Button variant="outline" size="lg" onClick={handleOpenInMaps}>
                <ExternalLink className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default LocationDetail;
