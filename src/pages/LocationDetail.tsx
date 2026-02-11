import { useState, useEffect } from "react";
import { useParams, Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, MapPin, Mountains, NavigationArrow, Star, ShareNetwork, ArrowSquareOut, Compass, Plus, Trash, Boot, Path, Calendar, Tent, SpinnerGap, Camera, CaretDown, CaretUp, X, Tree, TreeEvergreen, Sun, Cloud, CloudRain, Snowflake, Wind, Shuffle, Binoculars, Drop } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { PacePreference, LodgingType } from "@/types/trip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useSavedLocations } from "@/context/SavedLocationsContext";
import { GoogleMap } from "@/components/GoogleMap";
import { Marker, InfoWindow, Polygon } from "@react-google-maps/api";
import { useNearbyPlaces, GoogleSavedPlace } from "@/hooks/use-nearby-places";
import { useNearbyHikes, HikeResult } from "@/hooks/use-nearby-hikes";
import { usePhotoHotspots, PhotoHotspot } from "@/hooks/use-photo-hotspots";
import { usePublicLands, PublicLand } from "@/hooks/use-public-lands";
import { useNoaaWeather, getWeatherIcon } from "@/hooks/use-noaa-weather";
import { usePhotoWeather } from "@/hooks/use-photo-weather";
import { PhotoWeatherCard } from "@/components/PhotoWeatherCard";
import { FiveDayPhotoForecast } from "@/components/FiveDayPhotoForecast";
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
  // Surprise Me data (optional)
  surpriseMe?: {
    regionId: string;
    explanation: string;
    distanceMiles: number;
    driveTimeHours?: number;
    biome?: string;
    cautions?: string[];
    anchor?: {
      road: { name: string | null; ref: string | null; surface: string; highway: string };
      center: { lat: number; lng: number };
      lengthMiles: number;
    };
    highlights?: Array<{
      type: 'viewpoint' | 'trail' | 'water' | 'camp';
      name: string | null;
      lat: number;
      lon: number;
      distanceMiles: number;
    }>;
  };
}

// Helper to get weather message based on elevation in feet
function getElevationMessage(elevationFeet: number): string | null {
  if (elevationFeet >= 8000) return "This is covered in snow";
  if (elevationFeet >= 6000) return "Make sure you bring your puffy";
  if (elevationFeet >= 3000) return "It might be a bit chilly here";
  return null;
}

// Clean up duplicated suffixes like "San Juan National Forest National Forest"
function cleanRegionName(name: string): string {
  const suffixes = ['National Forest', 'National Park', 'Wilderness', 'State Park', 'Recreation Area'];
  for (const suffix of suffixes) {
    const duplicated = `${suffix} ${suffix}`;
    if (name.includes(duplicated)) {
      return name.replace(duplicated, suffix);
    }
  }
  return name;
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

// Highlight type icons and colors
const HIGHLIGHT_ICONS: Record<string, React.ReactNode> = {
  viewpoint: <Binoculars className="w-3.5 h-3.5" weight="fill" />,
  trail: <Path className="w-3.5 h-3.5" weight="fill" />,
  water: <Drop className="w-3.5 h-3.5" weight="fill" />,
  camp: <Tent className="w-3.5 h-3.5" weight="fill" />,
};

// Colors with better contrast ratios (darker text, lighter bg for accessibility)
const HIGHLIGHT_COLORS: Record<string, string> = {
  viewpoint: 'text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/40',
  trail: 'text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/40',
  water: 'text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40',
  camp: 'text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40',
};

// Surprise Me Banner Component
function SurpriseMeBanner({ surpriseMe }: { surpriseMe: NonNullable<LocationState['surpriseMe']> }) {
  return (
    <Card className="bg-gradient-to-br from-terracotta/15 via-primary/10 to-terracotta/5 border-terracotta/40 shadow-md">
      <CardContent className="p-5">
        {/* Header - More prominent */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-terracotta/20 flex items-center justify-center">
            <Shuffle className="w-5 h-5 text-terracotta" weight="bold" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Surprise Me Discovery</p>
            <p className="text-sm text-foreground/70">
              {Math.round(surpriseMe.distanceMiles)} mi away
              {surpriseMe.driveTimeHours && ` · ~${surpriseMe.driveTimeHours.toFixed(1)} hr drive`}
            </p>
          </div>
        </div>

        {/* Explanation - Better contrast */}
        <p className="text-sm text-foreground/90 leading-relaxed mb-4">
          {cleanRegionName(surpriseMe.explanation)}
        </p>

        {/* Scenic Drive Anchor - More prominent */}
        {surpriseMe.anchor && (
          <button
            onClick={() => {
              window.open(
                `https://www.google.com/maps/dir/?api=1&destination=${surpriseMe.anchor!.center.lat},${surpriseMe.anchor!.center.lng}`,
                '_blank'
              );
            }}
            className="w-full p-4 rounded-xl bg-card border border-border shadow-sm mb-4 hover:shadow-md hover:border-primary/30 transition-all text-left"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <NavigationArrow className="w-5 h-5 text-primary" weight="fill" />
                <p className="text-sm font-semibold text-foreground">Scenic Drive</p>
              </div>
              <ArrowSquareOut className="w-4 h-4 text-foreground/60" />
            </div>
            <p className="text-sm text-foreground/80">
              {surpriseMe.anchor.road.name || surpriseMe.anchor.road.ref || 'Unnamed road'}
              {surpriseMe.anchor.lengthMiles > 0 && (
                <span className="text-sm ml-2 text-foreground/60">({surpriseMe.anchor.lengthMiles.toFixed(1)} mi)</span>
              )}
            </p>
            {surpriseMe.anchor.road.surface !== 'unknown' && (
              <p className="text-xs text-foreground/60 mt-1 capitalize">
                {surpriseMe.anchor.road.surface} surface
              </p>
            )}
          </button>
        )}

        {/* Nearby Highlights - Better labeled */}
        {surpriseMe.highlights && surpriseMe.highlights.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-foreground/70 uppercase tracking-wide mb-2">Nearby Highlights</p>
            <div className="flex flex-wrap gap-2">
              {surpriseMe.highlights.slice(0, 4).map((highlight, i) => (
                <button
                  key={i}
                  onClick={() => {
                    window.open(
                      `https://www.google.com/maps/search/?api=1&query=${highlight.lat},${highlight.lon}`,
                      '_blank'
                    );
                  }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg hover:opacity-80 transition-opacity ${HIGHLIGHT_COLORS[highlight.type] || 'bg-muted text-foreground/70'}`}
                >
                  {HIGHLIGHT_ICONS[highlight.type] || <MapPin className="w-3.5 h-3.5" />}
                  <span className="text-xs font-medium truncate max-w-[100px]">
                    {highlight.name || highlight.type.charAt(0).toUpperCase() + highlight.type.slice(1)}
                  </span>
                  <ArrowSquareOut className="w-3 h-3 opacity-70 flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Cautions - Better contrast with amber-700 */}
        {surpriseMe.cautions && surpriseMe.cautions.length > 0 && (
          <div className="p-3 rounded-lg bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700/50">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-200 mb-1">Heads up</p>
            <ul className="text-xs text-amber-700 dark:text-amber-300 space-y-0.5">
              {surpriseMe.cautions.slice(0, 2).map((caution, i) => (
                <li key={i}>• {caution}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

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
  const [activities, setActivities] = useState<string[]>(['hiking']);
  const [pacePreference, setPacePreference] = useState<PacePreference>('moderate');
  const [globalLodging, setGlobalLodging] = useState<LodgingType>('dispersed');
  const [sameCampsite, setSameCampsite] = useState(false);
  const [itineraryModalOpen, setItineraryModalOpen] = useState(false);

  // Get location from router state (search) or from saved locations
  const stateLocation = routerLocation.state as LocationState | null;

  // Preserve surprise me data in state so it persists after saving
  const [surpriseMeData, setSurpriseMeData] = useState<LocationState['surpriseMe'] | null>(null);

  // Capture surprise me data on initial load from router state
  useEffect(() => {
    if (stateLocation?.surpriseMe && !surpriseMeData) {
      setSurpriseMeData(stateLocation.surpriseMe);
    }
  }, [stateLocation?.surpriseMe]);
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

  // Get photography weather conditions
  const { forecast: photoWeather, loading: photoWeatherLoading, error: photoWeatherError, fetchedAt: photoWeatherFetchedAt, refetch: refetchPhotoWeather } = usePhotoWeather(
    location?.lat ?? 0,
    location?.lng ?? 0,
    elevation ?? 0
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

  // Fetch elevation using USGS API
  useEffect(() => {
    if (!location) return;

    const controller = new AbortController();
    fetch(`https://epqs.nationalmap.gov/v1/json?x=${location.lng}&y=${location.lat}&units=Meters&output=json`, {
      signal: controller.signal
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.value !== undefined) {
          setElevation(Number(data.value));
        }
      })
      .catch(() => {});

    return () => controller.abort();
  }, [location]);

  // Fetch elevation for selected camp spot using USGS API
  useEffect(() => {
    if (!selectedPlace) {
      setSelectedPlaceElevation(null);
      return;
    }

    const controller = new AbortController();
    fetch(`https://epqs.nationalmap.gov/v1/json?x=${selectedPlace.lng}&y=${selectedPlace.lat}&units=Meters&output=json`, {
      signal: controller.signal
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.value !== undefined) {
          setSelectedPlaceElevation(Number(data.value));
        }
      })
      .catch(() => {});

    return () => controller.abort();
  }, [selectedPlace]);

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
        description: "Added to your favorites",
      });
    }
  };

  const handleRemoveLocation = () => {
    if (!savedLocation) return;

    removeLocation(savedLocation.id);
    toast.success(`Removed ${location.name}`, {
      description: "Removed from favorites",
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

    // Map pace preference to activities per day
    const paceToActivities: Record<PacePreference, number> = {
      relaxed: 1,
      moderate: 2,
      packed: 3,
    };

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
      activities: activities,
      pacePreference: pacePreference,
      activitiesPerDay: paceToActivities[pacePreference],
      globalLodging: globalLodging,
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
              <h1 className="text-xl font-display font-bold text-foreground truncate">{cleanRegionName(location.name)}</h1>
            </div>
            <div className="flex items-center gap-2">
              {isSaved ? (
                <Button
                  variant="tertiary"
                  size="sm"
                  onClick={handleRemoveLocation}
                >
                  <Star className="w-4 h-4 mr-2" weight="fill" />
                  Saved
                </Button>
              ) : (
                <Button
                  variant="tertiary"
                  size="sm"
                  onClick={handleSaveLocation}
                >
                  <Star className="w-4 h-4 mr-2" />
                  Save
                </Button>
              )}
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
                  {/* ARCHIVED: Nearby camp spots markers (tent icon) - will be replaced with explore page content
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
                  */}
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
                  {/* ARCHIVED: Public lands polygon overlays - will be replaced with explore page content
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
                  */}
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
                  {/* ARCHIVED: Info popup for selected public land
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
                  */}
                  {/* ARCHIVED: Info popup for selected place
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
                  */}
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
          <div className="order-1 lg:order-2 space-y-5 p-6 lg:h-[calc(100vh-73px)] lg:overflow-y-auto">
            {/* Location Info Card with integrated stats - Always at top */}
            <Card className="bg-gradient-card overflow-hidden">
              <CardContent className="p-5">
                {/* Header */}
                <div className="flex items-start gap-4 mb-5">
                  <div className="flex items-center justify-center w-12 h-12 bg-primary/10 rounded-xl flex-shrink-0">
                    <MapPin className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-display font-bold text-foreground leading-tight">{cleanRegionName(location.name)}</h2>
                    <p className="text-sm text-foreground/70 mt-1 line-clamp-2">{location.address}</p>
                  </div>
                </div>

                {/* Stats Row */}
                <div className="grid grid-cols-3 gap-3">
                  {/* Elevation */}
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-full bg-lavenderslate/20 flex items-center justify-center flex-shrink-0">
                      <Mountains className="w-4 h-4 text-lavenderslate" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-foreground/60">Elevation</p>
                      {elevation !== null ? (
                        <p className="text-sm font-bold text-foreground truncate">
                          {Math.round(elevation * 3.28084).toLocaleString()} ft
                        </p>
                      ) : (
                        <p className="text-sm font-bold text-foreground/30">--</p>
                      )}
                    </div>
                  </div>

                  {/* Weather */}
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-full bg-skyblue/20 flex items-center justify-center flex-shrink-0">
                      {weatherLoading ? (
                        <SpinnerGap className="w-4 h-4 text-skyblue animate-spin" />
                      ) : weather ? (
                        (() => {
                          const WeatherIcon = getWeatherIcon(weather.shortForecast);
                          return <WeatherIcon className="w-4 h-4 text-skyblue" />;
                        })()
                      ) : (
                        <Sun className="w-4 h-4 text-skyblue" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-foreground/60">Weather</p>
                      {weather ? (
                        <p className="text-sm font-bold text-foreground truncate">
                          {weather.temperature}°{weather.temperatureUnit}
                        </p>
                      ) : (
                        <p className="text-sm font-bold text-foreground/30">--</p>
                      )}
                    </div>
                  </div>

                  {/* Coordinates */}
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-full bg-softamber/20 flex items-center justify-center flex-shrink-0">
                      <Compass className="w-4 h-4 text-softamber" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-foreground/60">Coords</p>
                      <p className="text-sm font-bold text-foreground truncate">
                        {location.lat.toFixed(2)}°, {location.lng.toFixed(2)}°
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Surprise Me Banner */}
            {surpriseMeData && (
              <SurpriseMeBanner surpriseMe={surpriseMeData} />
            )}

            {/* ARCHIVED: 5-Day Photo Forecast - keeping code for reference
            <FiveDayPhotoForecast
              forecast={photoWeather}
              loading={photoWeatherLoading}
              compact
            />
            */}

            {/* ARCHIVED: Photography Weather Conditions - keeping code for reference
            <PhotoWeatherCard
              forecast={photoWeather}
              loading={photoWeatherLoading}
              error={photoWeatherError}
              fetchedAt={photoWeatherFetchedAt}
              onRefresh={refetchPhotoWeather}
            />
            */}


            {/* ARCHIVED: Nearby Camp Spots - will be replaced with explore page content
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
                        <div className={`flex items-center justify-center w-10 h-10 rounded-lg flex-shrink-0 ${place.source === 'ridb' ? 'bg-[#213D5C]/10' : 'bg-wildviolet/20'}`}>
                          <Tent className={`w-5 h-5 ${place.source === 'ridb' ? 'text-[#213D5C]' : 'text-wildviolet'}`} />
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
            */}

            {/* Section Divider - Explore */}
            <div className="flex items-center gap-3 pt-2">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs font-semibold text-foreground/50 uppercase tracking-wider">Things To Do</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Three Column Layout for Hikes, Camping, Photos */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Nearby Hikes */}
              <Card id="hikes-section" className="flex flex-col">
                <CardContent className="p-4 flex-1">
                  <div className="flex items-center gap-2 mb-3">
                    <Boot className="w-5 h-5 text-pinesoft" />
                    <h3 className="text-sm font-display font-semibold text-foreground">
                      Hikes
                    </h3>
                    {hikes.length > 0 && (
                      <span className="text-xs text-foreground/50 ml-auto">{hikes.length}</span>
                    )}
                  </div>
                  {hikesLoading ? (
                    <div className="text-center py-4 text-foreground/60">
                      <SpinnerGap className="w-5 h-5 mx-auto mb-2 animate-spin" />
                      <p className="text-xs">Finding trails...</p>
                    </div>
                  ) : hikes.length > 0 ? (
                    <div className="space-y-2">
                      {hikes.slice(0, 4).map((hike) => (
                        <div
                          key={hike.id}
                          className="flex items-center gap-2 p-2 bg-secondary/50 rounded-lg hover:bg-secondary transition-colors cursor-pointer"
                          onClick={() => {
                            window.open(
                              `https://www.google.com/maps/search/?api=1&query=${hike.lat},${hike.lng}`,
                              '_blank'
                            );
                          }}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground text-xs truncate">
                              {hike.name}
                            </p>
                            {hike.rating && (
                              <div className="flex items-center gap-1 text-xs text-foreground/60">
                                <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                                <span>{hike.rating.toFixed(1)}</span>
                              </div>
                            )}
                          </div>
                          <ArrowSquareOut className="w-3 h-3 text-foreground/40 flex-shrink-0" />
                        </div>
                      ))}
                      {hikes.length > 4 && (
                        <p className="text-xs text-foreground/50 text-center pt-1">
                          +{hikes.length - 4} more
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-foreground/50">
                      <Boot className="w-6 h-6 mx-auto mb-1 opacity-40" />
                      <p className="text-xs">No hikes found</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Camping Section */}
              <Card id="camp-section" className="flex flex-col">
                <CardContent className="p-4 flex-1">
                  <div className="flex items-center gap-2 mb-3">
                    <Tent className="w-5 h-5 text-wildviolet" />
                    <h3 className="text-sm font-display font-semibold text-foreground">
                      Camping
                    </h3>
                    {nearbyPlaces.length > 0 && (
                      <span className="text-xs text-foreground/50 ml-auto">{nearbyPlaces.length}</span>
                    )}
                  </div>
                  {nearbyLoading ? (
                    <div className="text-center py-4 text-foreground/60">
                      <SpinnerGap className="w-5 h-5 mx-auto mb-2 animate-spin" />
                      <p className="text-xs">Finding campsites...</p>
                    </div>
                  ) : nearbyPlaces.length > 0 ? (
                    <div className="space-y-2">
                      {nearbyPlaces.slice(0, 4).map((place) => (
                        <div
                          key={place.id}
                          className="flex items-center gap-2 p-2 bg-secondary/50 rounded-lg hover:bg-secondary transition-colors cursor-pointer"
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
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground text-xs truncate">
                              {place.name}
                            </p>
                            <p className="text-xs text-foreground/60">
                              {place.distance.toFixed(1)} mi
                              {place.source === 'ridb' && <span className="text-blue-600 ml-1">• Rec.gov</span>}
                            </p>
                          </div>
                          <ArrowSquareOut className="w-3 h-3 text-foreground/40 flex-shrink-0" />
                        </div>
                      ))}
                      {nearbyPlaces.length > 4 && (
                        <p className="text-xs text-foreground/50 text-center pt-1">
                          +{nearbyPlaces.length - 4} more
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-foreground/50">
                      <Tent className="w-6 h-6 mx-auto mb-1 opacity-40" />
                      <p className="text-xs">No campsites found</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Photo Hotspots */}
              <Card id="photo-section" className="flex flex-col">
                <CardContent className="p-4 flex-1">
                  <div className="flex items-center gap-2 mb-3">
                    <Camera className="w-5 h-5 text-blushorchid" />
                    <h3 className="text-sm font-display font-semibold text-foreground">
                      Photos
                    </h3>
                    {photoHotspots.length > 0 && (
                      <span className="text-xs text-foreground/50 ml-auto">{photoHotspots.length}</span>
                    )}
                  </div>
                  {photoHotspotsLoading ? (
                    <div className="text-center py-4 text-foreground/60">
                      <SpinnerGap className="w-5 h-5 mx-auto mb-2 animate-spin" />
                      <p className="text-xs">Finding spots...</p>
                    </div>
                  ) : photoHotspots.length > 0 ? (
                    <div className="space-y-2">
                      {photoHotspots.slice(0, 4).map((hotspot) => (
                        <div
                          key={hotspot.id}
                          className="flex items-center gap-2 p-2 bg-secondary/50 rounded-lg hover:bg-secondary transition-colors cursor-pointer"
                          onClick={() => {
                            if (hotspot.samplePhotoUrl) {
                              setEnlargedPhoto({ url: hotspot.samplePhotoUrl, name: hotspot.name });
                            } else {
                              setSelectedPhotoHotspot(hotspot);
                              setShowPhotoHotspots(true);
                            }
                          }}
                        >
                          {hotspot.samplePhotoUrl ? (
                            <img
                              src={hotspot.samplePhotoUrl}
                              alt={hotspot.name}
                              className="w-8 h-8 rounded object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded bg-blushorchid/15 flex items-center justify-center flex-shrink-0">
                              <Camera className="w-4 h-4 text-blushorchid" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground text-xs truncate">
                              {hotspot.name}
                            </p>
                            <p className="text-xs text-foreground/60">
                              {hotspot.photoCount.toLocaleString()} photos
                            </p>
                          </div>
                        </div>
                      ))}
                      {photoHotspots.length > 4 && (
                        <p className="text-xs text-foreground/50 text-center pt-1">
                          +{photoHotspots.length - 4} more
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-foreground/50">
                      <Camera className="w-6 h-6 mx-auto mb-1 opacity-40" />
                      <p className="text-xs">No photo spots found</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>{/* End three column grid */}

            {/* ARCHIVED: Public Lands for Dispersed Camping - will be replaced with explore page content
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
                        <span className="text-xs text-foreground/60">({publicLands.length})</span>
                      )}
                    </div>
                    {publicLandsExpanded ? (
                      <CaretUp className="w-5 h-5 text-foreground/60" />
                    ) : (
                      <CaretDown className="w-5 h-5 text-foreground/60" />
                    )}
                  </button>

                  {publicLandsExpanded && (
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-foreground/60">BLM & US Forest Service lands</span>
                        <div className="flex items-center gap-2">
                          <Label htmlFor="show-lands" className="text-sm text-foreground/60">
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
                        <div className="text-center py-4 text-foreground/60">
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
                                <div className="flex items-center gap-2 text-xs text-foreground/60">
                                  <span>{land.managingAgency}</span>
                                  <span>•</span>
                                  <span>{land.distance.toFixed(1)} mi</span>
                                </div>
                              </div>
                            </div>
                          ))}
                          {publicLands.length > 5 && (
                            <p className="text-sm text-foreground/60 text-center pt-2">
                              +{publicLands.length - 5} more areas nearby
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="text-center py-4 text-foreground/60">
                          <TreeEvergreen className="w-8 h-8 mx-auto mb-2 opacity-30" />
                          <p>No BLM or Forest Service lands within 50 miles</p>
                        </div>
                      )}

                      <p className="text-xs text-foreground/70 bg-secondary/50 p-2 rounded">
                        Dispersed camping is generally allowed on BLM and National Forest lands. Always check local regulations and fire restrictions.
                      </p>
                    </div>
                  )}
                </CardContent>
            </Card>
            */}

            {/* Create Itinerary Button */}
            <div className="pt-4">
              <Button
                variant="primary"
                size="sm"
                className="w-full"
                onClick={() => setItineraryModalOpen(true)}
              >
                <Calendar className="w-4 h-4 mr-2" />
                Create Itinerary
              </Button>
            </div>
          </div>
        </div>
      </main>

      {/* Create Itinerary Modal */}
      <Dialog open={itineraryModalOpen} onOpenChange={setItineraryModalOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              Create Itinerary
            </DialogTitle>
            <DialogDescription>
              Plan a trip to {cleanRegionName(location.name)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Duration Slider */}
            <div className="space-y-3">
              <Label>Trip Duration</Label>
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground/60">Days</span>
                <span className="text-2xl font-bold text-foreground">{tripDuration[0]}</span>
              </div>
              <Slider
                value={tripDuration}
                onValueChange={setTripDuration}
                min={1}
                max={14}
                step={1}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-foreground/50">
                <span>1 day</span>
                <span>14 days</span>
              </div>
            </div>

            {/* Activities Selection */}
            <div className="space-y-3 pt-2 border-t border-border">
              <Label>Activities</Label>
              {[
                { id: "hiking", label: "Hiking", description: "Find trails and hikes along your route" },
                { id: "photography", label: "Photography", description: "Find photo hotspots and scenic viewpoints" },
                { id: "offroading", label: "Offroading", description: "Find trails and off-highway routes" },
              ].map((activity) => {
                const isSelected = activities.includes(activity.id);
                return (
                  <div
                    key={activity.id}
                    className={`rounded-lg border transition-colors ${
                      isSelected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                    }`}
                  >
                    <label
                      htmlFor={`activity-${activity.id}`}
                      className="flex items-start space-x-3 p-3 cursor-pointer"
                    >
                      <Checkbox
                        id={`activity-${activity.id}`}
                        checked={isSelected}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setActivities([...activities, activity.id]);
                          } else {
                            setActivities(activities.filter(id => id !== activity.id));
                          }
                        }}
                        className="mt-0.5"
                      />
                      <div className="flex-1 space-y-0.5">
                        <span className="font-medium text-sm">{activity.label}</span>
                        <p className="text-xs text-foreground/60">{activity.description}</p>
                      </div>
                    </label>
                  </div>
                );
              })}
            </div>

            {/* Trip Pace */}
            <div className="space-y-3 pt-2 border-t border-border">
              <Label>Trip Pace</Label>
              <p className="text-xs text-foreground/60 -mt-1">How packed do you want each day to be?</p>
              <div className="grid gap-2">
                {[
                  { id: 'relaxed', label: 'Relaxed', description: 'Fewer activities, more downtime' },
                  { id: 'moderate', label: 'Moderate', description: 'Balanced activity and rest' },
                  { id: 'packed', label: 'Packed', description: 'Maximum activities each day' },
                ].map((option) => (
                  <label
                    key={option.id}
                    htmlFor={`pace-${option.id}`}
                    className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                      pacePreference === option.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                    }`}
                  >
                    <input
                      type="radio"
                      id={`pace-${option.id}`}
                      name="pace-preference"
                      value={option.id}
                      checked={pacePreference === option.id}
                      onChange={(e) => setPacePreference(e.target.value as PacePreference)}
                      className="h-4 w-4 cursor-pointer accent-[hsl(var(--forest))]"
                    />
                    <div className="space-y-0.5">
                      <span className="font-medium text-sm">{option.label}</span>
                      <p className="text-xs text-foreground/60">{option.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Lodging Type */}
            <div className="space-y-3 pt-2 border-t border-border">
              <Label>Lodging Type</Label>
              <div className="grid gap-2">
                {[
                  { id: 'dispersed', label: 'Dispersed Camping', description: 'Free camping on public lands' },
                  { id: 'campground', label: 'Established Camping', description: 'Campgrounds with amenities' },
                ].map((option) => (
                  <label
                    key={option.id}
                    htmlFor={`lodging-${option.id}`}
                    className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                      globalLodging === option.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                    }`}
                  >
                    <input
                      type="radio"
                      id={`lodging-${option.id}`}
                      name="lodging-type"
                      value={option.id}
                      checked={globalLodging === option.id}
                      onChange={(e) => setGlobalLodging(e.target.value as LodgingType)}
                      className="h-4 w-4 cursor-pointer accent-[hsl(var(--forest))]"
                    />
                    <div className="space-y-0.5">
                      <span className="font-medium text-sm">{option.label}</span>
                      <p className="text-xs text-foreground/60">{option.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Campsite Selection */}
            <div className="space-y-3 pt-2 border-t border-border">
              <Label>Campsite Selection</Label>
              <div className="grid gap-2">
                {[
                  { id: 'best-each-night', label: 'Best campsite each night', description: 'Pick the best option for each night of your trip', baseCamp: false },
                  { id: 'basecamp', label: 'Setup basecamp', description: 'Stay at the same campsite every night', baseCamp: true },
                ].map((option) => (
                  <label
                    key={option.id}
                    htmlFor={`campsite-${option.id}`}
                    className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                      sameCampsite === option.baseCamp ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                    }`}
                  >
                    <input
                      type="radio"
                      id={`campsite-${option.id}`}
                      name="campsite-selection"
                      checked={sameCampsite === option.baseCamp}
                      onChange={() => setSameCampsite(option.baseCamp)}
                      className="h-4 w-4 cursor-pointer accent-[hsl(var(--forest))]"
                    />
                    <div className="space-y-0.5">
                      <span className="font-medium text-sm">{option.label}</span>
                      <p className="text-xs text-foreground/60">{option.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setItineraryModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setItineraryModalOpen(false);
                handleGenerateTrip();
              }}
              disabled={generating}
            >
              {generating ? (
                <>
                  <SpinnerGap className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  Generate Trip
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
