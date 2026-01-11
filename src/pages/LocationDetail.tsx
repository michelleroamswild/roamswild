import { useState, useEffect } from "react";
import { useParams, Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, MapPin, Mountains, NavigationArrow, Star, ShareNetwork, ArrowSquareOut, Compass, Plus, Trash, Sneaker, Path, Calendar, Tent, SpinnerGap, Camera, CaretDown, CaretUp, X, Tree, TreeEvergreen, Sun, Cloud, CloudRain, Snowflake, Wind } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useSavedLocations } from "@/context/SavedLocationsContext";
import { GoogleMap } from "@/components/GoogleMap";
import { Marker, InfoWindow, Polygon } from "@react-google-maps/api";
import { useNearbyPlaces, GoogleSavedPlace } from "@/hooks/use-nearby-places";
import { useNearbyHikes, HikeResult } from "@/hooks/use-nearby-hikes";
import { usePhotoHotspots, PhotoHotspot } from "@/hooks/use-photo-hotspots";
import { usePublicLands, PublicLand } from "@/hooks/use-public-lands";
import { useNoaaWeather, getWeatherIcon } from "@/hooks/use-noaa-weather";
import { toast } from "sonner";
import { useTrip } from "@/context/TripContext";
import { useTripGenerator } from "@/hooks/use-trip-generator";
import { createMarkerIcon } from "@/utils/mapMarkers";
import { getTripUrl } from "@/utils/slugify";

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

// Photo hotspot icon (camera) - special marker for photo locations
const PHOTO_HOTSPOT_ICON_SVG = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
  <circle cx="20" cy="20" r="18" fill="#f97316" stroke="#ffffff" stroke-width="2"/>
  <path d="M28 15h-2.5l-1.5-2h-8l-1.5 2H12c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V17c0-1.1-.9-2-2-2z" fill="none" stroke="#ffffff" stroke-width="1.5"/>
  <circle cx="20" cy="21" r="4" fill="none" stroke="#ffffff" stroke-width="1.5"/>
</svg>
`)}`;

// Public lands icon (forest green with tree)
const PUBLIC_LAND_ICON_SVG = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
  <circle cx="20" cy="20" r="18" fill="#166534" stroke="#ffffff" stroke-width="2"/>
  <path d="M20 8l-8 12h4v8h8v-8h4L20 8z" fill="#ffffff"/>
</svg>
`)}`;

const MARKER_SIZE = 38;

const LocationDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const { locations, addLocation, removeLocation, isLocationSaved } = useSavedLocations();
  const { setTripConfig, setGeneratedTrip } = useTrip();
  const { generateTrip, generating, error: tripError } = useTripGenerator();

  const [selectedPlace, setSelectedPlace] = useState<NearbyPlace | null>(null);
  const [selectedHike, setSelectedHike] = useState<HikeResult | null>(null);
  const [selectedPlaceElevation, setSelectedPlaceElevation] = useState<number | null>(null);
  const [elevation, setElevation] = useState<number | null>(null);
  const [mapsLoaded, setMapsLoaded] = useState(false);

  // Trip planning state
  const [tripDuration, setTripDuration] = useState<number[]>([3]);
  const [activitiesPerDay, setActivitiesPerDay] = useState<number[]>([1]);
  const [sameCampsite, setSameCampsite] = useState(false);

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

  // Get photo hotspots from Flickr
  const { hotspots: photoHotspots, loading: photoHotspotsLoading } = usePhotoHotspots(
    location?.lat ?? 0,
    location?.lng ?? 0,
    50
  );

  // Get nearby public lands (BLM, USFS) for dispersed camping
  const { publicLands, loading: publicLandsLoading } = usePublicLands(
    location?.lat ?? 0,
    location?.lng ?? 0,
    50
  );

  // Get NOAA weather for this location
  const { weather, loading: weatherLoading } = useNoaaWeather(
    location?.lat ?? null,
    location?.lng ?? null
  );

  // Photo hotspots UI state
  const [showPhotoHotspots, setShowPhotoHotspots] = useState(false);
  const [photoHotspotsExpanded, setPhotoHotspotsExpanded] = useState(false);
  const [selectedPhotoHotspot, setSelectedPhotoHotspot] = useState<PhotoHotspot | null>(null);
  const [enlargedPhoto, setEnlargedPhoto] = useState<{ url: string; name: string } | null>(null);

  // Public lands UI state
  const [showPublicLands, setShowPublicLands] = useState(false);
  const [publicLandsExpanded, setPublicLandsExpanded] = useState(false);
  const [selectedPublicLand, setSelectedPublicLand] = useState<PublicLand | null>(null);

  // Auto-show public lands on map when they're found and no campsites
  useEffect(() => {
    if (publicLands.length > 0 && nearbyPlaces.length === 0 && !nearbyLoading) {
      setShowPublicLands(true);
      setPublicLandsExpanded(true);
    }
  }, [publicLands, nearbyPlaces, nearbyLoading]);

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
            <Button variant="primary">Back to Home</Button>
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

  const handleGenerateTrip = async () => {
    if (!location) return;
    
    const tripConfig = {
      name: `Trip to ${location.name}`,
      duration: tripDuration[0],
      destinations: [],
      returnToStart: false,
      baseLocation: {
        id: location.placeId,
        placeId: location.placeId,
        name: location.name,
        address: location.address,
        coordinates: { lat: location.lat, lng: location.lng },
      },
      activitiesPerDay: activitiesPerDay[0],
      sameCampsite: sameCampsite,
    };

    const tripResult = await generateTrip(tripConfig);

    if (tripResult) {
      setTripConfig(tripResult.config);
      setGeneratedTrip(tripResult);
      navigate(getTripUrl(tripResult.config.name));
    }
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
                variant="primary"
                size="sm"
                onClick={handleCreateTrip}
                className="hidden sm:flex"
              >
                <Path className="w-4 h-4 mr-2" />
                Create Trip
              </Button>
              <Button
                variant="primary"
                size="icon"
                className="rounded-full sm:hidden"
                onClick={handleCreateTrip}
                title="Create Trip"
              >
                <Path className="w-5 h-5" />
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
                <ShareNetwork className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="w-full">
        <div className="grid lg:grid-cols-2">
          {/* Map Section */}
          <div className="order-2 lg:order-1 h-[400px] lg:h-[calc(100vh-73px)] lg:sticky lg:top-[73px]">
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
                    icon={createMarkerIcon('viewpoint', { size: 40 })}
                  />
                  {/* Nearby camp spots markers (tent icon) */}
                  {nearbyPlaces.map((place) => (
                    <Marker
                      key={place.id}
                      position={{ lat: place.lat, lng: place.lng }}
                      title={`${place.name} (${place.distance.toFixed(1)} mi)`}
                      icon={createMarkerIcon('camp', { size: MARKER_SIZE })}
                      onClick={() => {
                        setSelectedPlace(place);
                        setSelectedHike(null);
                        setSelectedPhotoHotspot(null);
                        setSelectedPublicLand(null);
                      }}
                    />
                  ))}
                  {/* Nearby hikes markers (boot icon) */}
                  {hikes.map((hike) => (
                    <Marker
                      key={hike.id}
                      position={{ lat: hike.lat, lng: hike.lng }}
                      title={hike.name}
                      icon={createMarkerIcon('hike', { size: MARKER_SIZE })}
                      onClick={() => {
                        setSelectedHike(hike);
                        setSelectedPlace(null);
                        setSelectedPhotoHotspot(null);
                        setSelectedPublicLand(null);
                      }}
                    />
                  ))}
                  {/* Photo hotspot markers */}
                  {showPhotoHotspots && photoHotspots.map((hotspot) => (
                    <Marker
                      key={hotspot.id}
                      position={{ lat: hotspot.lat, lng: hotspot.lng }}
                      title={`${hotspot.name} (${hotspot.photoCount} photos)`}
                      icon={{
                        url: PHOTO_HOTSPOT_ICON_SVG,
                        scaledSize: new google.maps.Size(MARKER_SIZE - 4, MARKER_SIZE - 4),
                        anchor: new google.maps.Point((MARKER_SIZE - 4) / 2, (MARKER_SIZE - 4) / 2),
                      }}
                      onClick={() => {
                        setSelectedPhotoHotspot(hotspot);
                        setSelectedPlace(null);
                        setSelectedHike(null);
                        setSelectedPublicLand(null);
                      }}
                    />
                  ))}
                  {/* Public lands polygon overlays */}
                  {showPublicLands && publicLands.map((land) => (
                    land.polygon ? (
                      <Polygon
                        key={land.id}
                        paths={land.polygon}
                        options={{
                          fillColor: '#4ba391',
                          fillOpacity: 0.3,
                          strokeColor: '#3c8a79',
                          strokeOpacity: 0.8,
                          strokeWeight: 2,
                          clickable: true,
                        }}
                        onClick={() => {
                          setSelectedPublicLand(land);
                          setSelectedPlace(null);
                          setSelectedHike(null);
                          setSelectedPhotoHotspot(null);
                        }}
                      />
                    ) : null
                  ))}
                  {/* Info popup for selected photo hotspot */}
                  {selectedPhotoHotspot && (
                    <InfoWindow
                      position={{ lat: selectedPhotoHotspot.lat, lng: selectedPhotoHotspot.lng }}
                      onCloseClick={() => setSelectedPhotoHotspot(null)}
                    >
                      <div className="min-w-[200px]">
                        {selectedPhotoHotspot.samplePhotoUrl && (
                          <button
                            onClick={() => setEnlargedPhoto({ url: selectedPhotoHotspot.samplePhotoUrl!, name: selectedPhotoHotspot.name })}
                            className="w-full h-32 overflow-hidden rounded-t-lg cursor-pointer"
                          >
                            <img
                              src={selectedPhotoHotspot.samplePhotoUrl}
                              alt={selectedPhotoHotspot.name}
                              className="w-full h-full object-cover hover:scale-105 transition-transform"
                            />
                          </button>
                        )}
                        <div className="p-2">
                          <h4 className="font-semibold text-gray-900 text-sm">
                            {selectedPhotoHotspot.name}
                          </h4>
                          <p className="text-gray-500 text-xs mt-0.5">
                            {selectedPhotoHotspot.photoCount.toLocaleString()} photos
                          </p>
                        </div>
                      </div>
                    </InfoWindow>
                  )}
                  {/* Info popup for selected public land */}
                  {selectedPublicLand && (
                    <InfoWindow
                      position={{ lat: selectedPublicLand.lat, lng: selectedPublicLand.lng }}
                      onCloseClick={() => setSelectedPublicLand(null)}
                    >
                      <div className="p-1 min-w-[220px]">
                        <h4 className="font-semibold text-gray-900 text-base mb-1">
                          {selectedPublicLand.name}
                        </h4>
                        <p className="text-xs text-green-700 mb-1">
                          {selectedPublicLand.managingAgency === 'BLM' ? 'Bureau of Land Management' : 'US Forest Service'}
                        </p>
                        <div className="flex items-center gap-3 text-gray-500 text-sm mb-2">
                          <span>{selectedPublicLand.distance.toFixed(1)} mi away</span>
                        </div>
                        <p className="text-xs bg-green-50 text-green-700 px-2 py-1.5 rounded mb-3">
                          Dispersed camping typically allowed - check local regulations
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              window.open(
                                `https://www.google.com/maps/dir/?api=1&destination=${selectedPublicLand.lat},${selectedPublicLand.lng}`,
                                '_blank'
                              );
                            }}
                            className="flex-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors"
                          >
                            Directions
                          </button>
                          <button
                            onClick={() => {
                              window.open(
                                `https://www.google.com/maps/search/?api=1&query=${selectedPublicLand.lat},${selectedPublicLand.lng}`,
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
                        {selectedPlace.source === 'ridb' && (
                          <p className="text-xs text-blue-600 mb-1">via Recreation.gov</p>
                        )}
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
                            className="flex-1 px-3 py-1.5 bg-primary text-primary-foreground text-sm rounded hover:bg-primary-hover transition-colors"
                          >
                            Directions
                          </button>
                          {selectedPlace.source === 'ridb' ? (
                            <button
                              onClick={() => {
                                const facilityId = selectedPlace.id.replace('ridb-', '');
                                window.open(
                                  `https://www.recreation.gov/camping/campgrounds/${facilityId}`,
                                  '_blank'
                                );
                              }}
                              className="px-3 py-1.5 border border-blue-300 text-blue-700 text-sm rounded hover:bg-blue-50 transition-colors"
                            >
                              Book
                            </button>
                          ) : (
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
                          )}
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
                            className="flex-1 px-3 py-1.5 bg-primary text-primary-foreground text-sm rounded hover:bg-primary-hover transition-colors"
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
                          <ArrowSquareOut className="w-4 h-4 mr-2" />
                          Open in Maps
                        </Button>
                        <Button variant="primary" size="sm" onClick={handleGetDirections}>
                          <NavigationArrow className="w-4 h-4 mr-2" />
                          Directions
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
          </div>

          {/* Info Panel */}
          <div className="order-1 lg:order-2 space-y-4 p-6 lg:h-[calc(100vh-73px)] lg:overflow-y-auto">
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
                      <Mountains className="w-4 h-4" />
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
                      {weatherLoading ? (
                        <SpinnerGap className="w-4 h-4 animate-spin" />
                      ) : weather ? (
                        (() => {
                          const WeatherIcon = getWeatherIcon(weather.shortForecast);
                          return <WeatherIcon className="w-4 h-4" />;
                        })()
                      ) : (
                        <Sun className="w-4 h-4" />
                      )}
                      <span className="text-sm">Weather</span>
                    </div>
                    {weatherLoading ? (
                      <>
                        <p className="text-xl font-bold text-foreground">--</p>
                        <p className="text-xs text-muted-foreground">Loading...</p>
                      </>
                    ) : weather ? (
                      <>
                        <p className="text-xl font-bold text-foreground">
                          {weather.temperature}°{weather.temperatureUnit}
                        </p>
                        <p className="text-xs text-muted-foreground truncate" title={weather.shortForecast}>
                          {weather.shortForecast}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-xl font-bold text-foreground">--</p>
                        <p className="text-xs text-muted-foreground">Unavailable</p>
                      </>
                    )}
                  </div>
                  <div className="p-4 bg-secondary/50 rounded-xl col-span-2">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <MapPin className="w-4 h-4" />
                      <span className="text-sm">Coordinates</span>
                    </div>
                    <p className="text-sm font-bold text-foreground">
                      {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Plan a Trip */}
            <Card className="bg-gradient-to-br from-primary/5 to-terracotta/5 border-primary/20">
              <CardContent className="p-6">
                <h3 className="text-lg font-display font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Compass className="w-5 h-5 text-primary" />
                  Plan a Trip Here
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Create an itinerary based around this location with nearby hikes and campsites.
                </p>

                <div className="space-y-6">
                  {/* Duration Slider */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-sm font-medium text-foreground flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        Duration
                      </label>
                      <span className="text-2xl font-bold text-foreground">
                        {tripDuration[0]} {tripDuration[0] === 1 ? 'day' : 'days'}
                      </span>
                    </div>
                    <Slider
                      value={tripDuration}
                      onValueChange={setTripDuration}
                      min={1}
                      max={14}
                      step={1}
                      className="w-full"
                    />
                    <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                      <span>1 day</span>
                      <span>14 days</span>
                    </div>
                  </div>

                  {/* Hikes per day Slider */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-sm font-medium text-foreground flex items-center gap-2">
                        <Sneaker className="w-4 h-4 text-muted-foreground" />
                        Hikes per day
                      </label>
                      <span className="text-2xl font-bold text-foreground">
                        {activitiesPerDay[0]} {activitiesPerDay[0] === 1 ? 'hike' : 'hikes'}
                      </span>
                    </div>
                    <Slider
                      value={activitiesPerDay}
                      onValueChange={setActivitiesPerDay}
                      min={1}
                      max={5}
                      step={1}
                      className="w-full"
                    />
                    <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                      <span>1 hike</span>
                      <span>5 hikes</span>
                    </div>
                  </div>

                  {/* Same campsite toggle */}
                  <div className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Tent className="w-4 h-4 text-amber-500" />
                      <div>
                        <p className="text-sm font-medium text-foreground">Base Camp Mode</p>
                        <p className="text-xs text-muted-foreground">Stay at the same campsite each night</p>
                      </div>
                    </div>
                    <Switch checked={sameCampsite} onCheckedChange={setSameCampsite} />
                  </div>

                  {tripError && (
                    <p className="text-sm text-destructive">{tripError}</p>
                  )}

                  <Button
                    variant="primary"
                    className="w-full"
                    onClick={handleGenerateTrip}
                    disabled={generating}
                  >
                    {generating ? (
                      <>
                        <SpinnerGap className="w-4 h-4 mr-2 animate-spin" />
                        Generating Trip...
                      </>
                    ) : (
                      <>
                        <Compass className="w-4 h-4 mr-2" />
                        Generate {tripDuration[0]}-Day Itinerary
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Nearby Camp Spots */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-display font-semibold text-foreground">
                    Nearby Camp Spots
                  </h3>
                  {nearbyPlaces.length > 0 && nearbyPlaces[0].source === 'ridb' && (
                    <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded">
                      via Recreation.gov
                    </span>
                  )}
                </div>
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
                          if (place.source === 'ridb') {
                            const facilityId = place.id.replace('ridb-', '');
                            window.open(
                              `https://www.recreation.gov/camping/campgrounds/${facilityId}`,
                              '_blank'
                            );
                          } else {
                            window.open(
                              `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`,
                              '_blank'
                            );
                          }
                        }}
                      >
                        <div className={`flex items-center justify-center w-10 h-10 rounded-lg flex-shrink-0 ${place.source === 'ridb' ? 'bg-[#213D5C]/10' : 'bg-primary/10'}`}>
                          <Tent className={`w-5 h-5 ${place.source === 'ridb' ? 'text-[#213D5C]' : 'text-primary'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate">
                            {place.name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {place.distance.toFixed(1)} miles away
                          </p>
                        </div>
                        <ArrowSquareOut className="w-4 h-4 text-muted-foreground flex-shrink-0" />
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
                        <div className="flex items-center justify-center w-10 h-10 bg-primary/10 rounded-lg flex-shrink-0">
                          <Sneaker className="w-5 h-5 text-primary" />
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
                        <ArrowSquareOut className="w-4 h-4 text-muted-foreground flex-shrink-0" />
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
                    <Sneaker className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p>No hikes found within 30 miles</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Photo Hotspots */}
            {photoHotspots.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <button
                    onClick={() => setPhotoHotspotsExpanded(!photoHotspotsExpanded)}
                    className="w-full flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Camera className="w-5 h-5 text-orange-500" />
                      <h3 className="font-semibold text-foreground">Photo Hotspots</h3>
                      <span className="text-xs text-muted-foreground">({photoHotspots.length})</span>
                    </div>
                    {photoHotspotsExpanded ? (
                      <CaretUp className="w-5 h-5 text-muted-foreground" />
                    ) : (
                      <CaretDown className="w-5 h-5 text-muted-foreground" />
                    )}
                  </button>

                  {photoHotspotsExpanded && (
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">via Flickr</span>
                        <div className="flex items-center gap-2">
                          <Label htmlFor="show-hotspots-loc" className="text-sm text-muted-foreground">
                            Show on map
                          </Label>
                          <Switch
                            id="show-hotspots-loc"
                            checked={showPhotoHotspots}
                            onCheckedChange={setShowPhotoHotspots}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        {photoHotspots.slice(0, 5).map((hotspot) => (
                          <div
                            key={hotspot.id}
                            className="flex items-center gap-3 p-2 rounded-lg hover:bg-orange-500/10 transition-colors"
                          >
                            {hotspot.samplePhotoUrl ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEnlargedPhoto({ url: hotspot.samplePhotoUrl!, name: hotspot.name });
                                }}
                                className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 hover:ring-2 hover:ring-orange-500 transition-all"
                              >
                                <img
                                  src={hotspot.samplePhotoUrl}
                                  alt={hotspot.name}
                                  className="w-full h-full object-cover"
                                />
                              </button>
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                                <Camera className="w-5 h-5 text-orange-500" />
                              </div>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedPlace(null);
                                setSelectedHike(null);
                                setSelectedPhotoHotspot(hotspot);
                                setShowPhotoHotspots(true);
                              }}
                              className="flex-1 min-w-0 text-left"
                            >
                              <p className="font-medium text-foreground text-sm truncate">
                                {hotspot.name}
                              </p>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Camera className="w-3 h-3" />
                                <span>{hotspot.photoCount.toLocaleString()} photos</span>
                              </div>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Public Lands for Dispersed Camping */}
            <Card>
                <CardContent className="p-4">
                  <button
                    onClick={() => setPublicLandsExpanded(!publicLandsExpanded)}
                    className="w-full flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <TreeEvergreen className="w-5 h-5 text-pinesoft" />
                      <h3 className="font-semibold text-foreground">Dispersed Camping Areas</h3>
                      {publicLands.length > 0 && (
                        <span className="text-xs text-muted-foreground">({publicLands.length})</span>
                      )}
                    </div>
                    {publicLandsExpanded ? (
                      <CaretUp className="w-5 h-5 text-muted-foreground" />
                    ) : (
                      <CaretDown className="w-5 h-5 text-muted-foreground" />
                    )}
                  </button>

                  {publicLandsExpanded && (
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">BLM & US Forest Service lands</span>
                        <div className="flex items-center gap-2">
                          <Label htmlFor="show-lands" className="text-sm text-muted-foreground">
                            Show on map
                          </Label>
                          <Switch
                            id="show-lands"
                            checked={showPublicLands}
                            onCheckedChange={setShowPublicLands}
                          />
                        </div>
                      </div>

                      {publicLandsLoading ? (
                        <div className="text-center py-4 text-muted-foreground">
                          <p>Finding nearby public lands...</p>
                        </div>
                      ) : publicLands.length > 0 ? (
                        <div className="space-y-2">
                          {publicLands.slice(0, 5).map((land) => (
                            <div
                              key={land.id}
                              className="flex items-center gap-3 p-2 rounded-lg hover:bg-pinesoft/10 transition-colors cursor-pointer"
                              onClick={() => {
                                setSelectedPublicLand(land);
                                setShowPublicLands(true);
                              }}
                            >
                              <div className="w-10 h-10 rounded-lg bg-pinesoft/10 flex items-center justify-center flex-shrink-0">
                                <TreeEvergreen className="w-5 h-5 text-pinesoft" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-foreground text-sm truncate">
                                  {land.name}
                                </p>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span>{land.managingAgency}</span>
                                  <span>•</span>
                                  <span>{land.distance.toFixed(1)} mi</span>
                                </div>
                              </div>
                            </div>
                          ))}
                          {publicLands.length > 5 && (
                            <p className="text-sm text-muted-foreground text-center pt-2">
                              +{publicLands.length - 5} more areas nearby
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="text-center py-4 text-muted-foreground">
                          <TreeEvergreen className="w-8 h-8 mx-auto mb-2 opacity-30" />
                          <p>No BLM or Forest Service lands within 50 miles</p>
                        </div>
                      )}

                      <p className="text-xs text-muted-foreground bg-secondary/50 p-2 rounded">
                        Dispersed camping is generally allowed on BLM and National Forest lands. Always check local regulations and fire restrictions.
                      </p>
                    </div>
                  )}
                </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex gap-3">
              <Button variant="primary" size="lg" className="flex-1" onClick={handleGetDirections}>
                <NavigationArrow className="w-4 h-4 mr-2" />
                Get Directions
              </Button>
              <Button variant="outline" size="lg" onClick={handleOpenInMaps}>
                <ArrowSquareOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </main>

      {/* Photo Lightbox */}
      {enlargedPhoto && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setEnlargedPhoto(null)}
        >
          <button
            className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors"
            onClick={() => setEnlargedPhoto(null)}
          >
            <X className="w-8 h-8" />
          </button>
          <div className="max-w-4xl max-h-[90vh] relative" onClick={(e) => e.stopPropagation()}>
            <img
              src={enlargedPhoto.url}
              alt={enlargedPhoto.name}
              className="max-w-full max-h-[85vh] object-contain rounded-lg"
            />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 rounded-b-lg">
              <p className="text-white font-medium">{enlargedPhoto.name}</p>
              <p className="text-white/70 text-sm flex items-center gap-1">
                <Camera className="w-3 h-3" />
                Photo Hotspot via Flickr
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LocationDetail;
