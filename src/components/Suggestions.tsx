import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { MapPin, Tent, Mountain, Star, Loader2, Navigation, ChevronRight, Flame, Camera } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { useNearbyPlaces, GoogleSavedPlace } from "@/hooks/use-nearby-places";
import { usePhotoHotspots, PhotoHotspot } from "@/hooks/use-photo-hotspots";
import { PlaceSearch } from "./PlaceSearch";
import { GoogleMap } from "./GoogleMap";
import { Marker, InfoWindow } from "@react-google-maps/api";

interface HotSpot {
  id: string;
  name: string;
  location: string;
  rating?: number;
  reviewCount?: number;
  lat: number;
  lng: number;
  placeId: string;
  types?: string[];
  photoUrl?: string;
  priceLevel?: number;
  openNow?: boolean;
}

// Format place types for display
function formatPlaceType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Get a friendly category from types
function getCategory(types?: string[]): string {
  if (!types || types.length === 0) return 'Point of Interest';

  const categoryMap: Record<string, string> = {
    'natural_feature': 'Natural Feature',
    'park': 'Park',
    'tourist_attraction': 'Attraction',
    'campground': 'Campground',
    'rv_park': 'RV Park',
    'hiking_area': 'Hiking',
    'museum': 'Museum',
    'amusement_park': 'Amusement Park',
    'aquarium': 'Aquarium',
    'art_gallery': 'Art Gallery',
    'zoo': 'Zoo',
    'stadium': 'Stadium',
    'point_of_interest': 'Point of Interest',
  };

  for (const type of types) {
    if (categoryMap[type]) {
      return categoryMap[type];
    }
  }

  return formatPlaceType(types[0]);
}

// Fetch hot spots (tourist attractions, parks, points of interest) from Google Places
async function fetchHotSpots(lat: number, lng: number): Promise<HotSpot[]> {
  if (!window.google?.maps?.places) return [];

  return new Promise((resolve) => {
    const service = new google.maps.places.PlacesService(
      document.createElement("div")
    );

    const request: google.maps.places.PlaceSearchRequest = {
      location: new google.maps.LatLng(lat, lng),
      radius: 80467, // ~50 miles in meters
      type: "tourist_attraction",
    };

    service.nearbySearch(request, (results, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && results) {
        const spots: HotSpot[] = results
          .filter((place) => place.geometry?.location && place.place_id)
          .slice(0, 6)
          .map((place) => {
            // Get photo URL if available
            let photoUrl: string | undefined;
            if (place.photos && place.photos.length > 0) {
              photoUrl = place.photos[0].getUrl({ maxWidth: 400, maxHeight: 300 });
            }

            return {
              id: place.place_id!,
              name: place.name || "Unknown Place",
              location: place.vicinity || "",
              rating: place.rating,
              reviewCount: place.user_ratings_total,
              lat: place.geometry!.location!.lat(),
              lng: place.geometry!.location!.lng(),
              placeId: place.place_id!,
              types: place.types,
              photoUrl,
              priceLevel: place.price_level,
              openNow: place.opening_hours?.isOpen?.(),
            };
          });
        resolve(spots);
      } else {
        resolve([]);
      }
    });
  });
}

export const Suggestions = () => {
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [hotSpots, setHotSpots] = useState<HotSpot[]>([]);
  const [loadingHotSpots, setLoadingHotSpots] = useState(false);
  const [selectedCampsite, setSelectedCampsite] = useState<(GoogleSavedPlace & { distance: number }) | null>(null);
  const [mapsLoaded, setMapsLoaded] = useState(false);

  // Get user's location
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser");
      setLoadingLocation(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        console.log("Got location:", position.coords.latitude, position.coords.longitude);
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setLoadingLocation(false);
      },
      (error) => {
        console.error("Geolocation error:", error.code, error.message);
        let errorMessage = "Unable to get your location.";
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = "Location permission denied. Please enable location access in your browser settings.";
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = "Location information is unavailable. Please try again.";
            break;
          case error.TIMEOUT:
            errorMessage = "Location request timed out. Please try again.";
            break;
        }
        setLocationError(errorMessage);
        setLoadingLocation(false);
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 }
    );
  }, []);

  // Fetch campsites using the existing hook
  const { nearbyPlaces: campsites, loading: loadingCampsites } = useNearbyPlaces(
    userLocation?.lat || 0,
    userLocation?.lng || 0,
    50
  );

  // Fetch photo hotspots from Flickr
  const { hotspots: photoHotspots, loading: loadingPhotoHotspots } = usePhotoHotspots(
    userLocation?.lat || 0,
    userLocation?.lng || 0,
    50
  );

  // Fetch hot spots when location is available
  useEffect(() => {
    if (!userLocation) return;

    const fetchSpots = async () => {
      setLoadingHotSpots(true);
      try {
        const spots = await fetchHotSpots(userLocation.lat, userLocation.lng);
        setHotSpots(spots);
      } catch (err) {
        console.error("Failed to fetch hot spots:", err);
      } finally {
        setLoadingHotSpots(false);
      }
    };

    // Delay to ensure Google Maps is loaded
    const timer = setTimeout(fetchSpots, 500);
    return () => clearTimeout(timer);
  }, [userLocation]);

  const retryLocation = () => {
    setLoadingLocation(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setLoadingLocation(false);
      },
      (error) => {
        console.error("Geolocation error:", error.code, error.message);
        let errorMessage = "Unable to get your location.";
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = "Location permission denied. Please enable location access in your browser settings.";
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = "Location information is unavailable. Try entering a location below.";
            break;
          case error.TIMEOUT:
            errorMessage = "Location request timed out. Please try again.";
            break;
        }
        setLocationError(errorMessage);
        setLoadingLocation(false);
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 }
    );
  };

  const handleManualLocationSelect = (place: google.maps.places.PlaceResult) => {
    if (place.geometry?.location) {
      setUserLocation({
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
      });
      setLocationError(null);
    }
  };

  // Don't render if still loading location
  if (loadingLocation) {
    return (
      <section className="w-full max-w-4xl mx-auto">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary mr-2" />
          <span className="text-muted-foreground">Finding places near you...</span>
        </div>
      </section>
    );
  }

  if (locationError || !userLocation) {
    return (
      <section className="w-full max-w-4xl mx-auto">
        <div className="text-center py-8">
          <Navigation className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
          <p className="text-muted-foreground text-sm mb-4">
            {locationError || "Enable location to see suggestions near you"}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto">
            <Button variant="outline" size="sm" onClick={retryLocation}>
              Try Again
            </Button>
            <span className="text-muted-foreground text-sm">or</span>
            <div className="w-full sm:w-64">
              <PlaceSearch
                onPlaceSelect={handleManualLocationSelect}
                placeholder="Enter a location..."
              />
            </div>
          </div>
        </div>
      </section>
    );
  }

  const topCampsites = campsites.slice(0, 4);
  const topHotSpots = hotSpots.slice(0, 4);
  const topPhotoHotspots = photoHotspots.slice(0, 4);
  const isLoading = loadingCampsites || loadingHotSpots || loadingPhotoHotspots;

  return (
    <section className="w-full max-w-4xl mx-auto space-y-10">
      {/* Section Header */}
      <div className="flex items-center gap-2">
        <Navigation className="w-5 h-5 text-primary" />
        <h2 className="text-2xl font-display font-bold text-foreground">Near You</h2>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary mr-2" />
          <span className="text-muted-foreground">Loading suggestions...</span>
        </div>
      ) : (
        <>
          {/* Top Campsites */}
          {topCampsites.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Tent className="w-5 h-5 text-amber-500" />
                  <h3 className="text-lg font-semibold text-foreground">Top Campsites</h3>
                </div>
              </div>

              {/* Map showing campsites */}
              <div className="mb-4 rounded-xl overflow-hidden border border-border">
                <GoogleMap
                  center={userLocation || { lat: 37.7749, lng: -122.4194 }}
                  zoom={9}
                  className="w-full h-[250px]"
                  onLoad={() => setMapsLoaded(true)}
                >
                  {mapsLoaded && (
                    <>
                      {/* User location marker */}
                      {userLocation && (
                        <Marker
                          position={userLocation}
                          icon={{
                            path: google.maps.SymbolPath.CIRCLE,
                            scale: 8,
                            fillColor: '#3b82f6',
                            fillOpacity: 1,
                            strokeColor: '#ffffff',
                            strokeWeight: 2,
                          }}
                          title="Your location"
                        />
                      )}

                      {/* Campsite markers */}
                      {topCampsites.map((campsite) => (
                        <Marker
                          key={campsite.id}
                          position={{ lat: campsite.lat, lng: campsite.lng }}
                          onClick={() => setSelectedCampsite(campsite)}
                          icon={{
                            url: `data:image/svg+xml,${encodeURIComponent(`
                              <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="11" fill="#f59e0b" stroke="#ffffff" stroke-width="2"/>
                                <path d="M12 6L6 16h12L12 6z" fill="#ffffff" stroke="none"/>
                                <path d="M12 6L6 16h12L12 6z M10 16l2-4 2 4" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-linejoin="round"/>
                              </svg>
                            `)}`,
                            scaledSize: new google.maps.Size(32, 32),
                            anchor: new google.maps.Point(16, 16),
                          }}
                        />
                      ))}

                      {/* Info window for selected campsite */}
                      {selectedCampsite && (
                        <InfoWindow
                          position={{ lat: selectedCampsite.lat, lng: selectedCampsite.lng }}
                          onCloseClick={() => setSelectedCampsite(null)}
                        >
                          <div className="p-1 max-w-[200px]">
                            <h4 className="font-semibold text-sm text-gray-900">{selectedCampsite.name}</h4>
                            <p className="text-xs text-gray-600 mt-1">
                              {selectedCampsite.distance.toFixed(1)} miles away
                            </p>
                            {selectedCampsite.note && (
                              <p className="text-xs text-gray-500 mt-1 line-clamp-2">{selectedCampsite.note}</p>
                            )}
                          </div>
                        </InfoWindow>
                      )}
                    </>
                  )}
                </GoogleMap>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {topCampsites.map((campsite, index) => (
                  <CampsiteCard
                    key={campsite.id}
                    campsite={campsite}
                    index={index}
                    isSelected={selectedCampsite?.id === campsite.id}
                    onClick={() => setSelectedCampsite(campsite)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Hot Spots */}
          {topHotSpots.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Mountain className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-semibold text-foreground">Hot Spots</h3>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {topHotSpots.map((spot, index) => (
                  <HotSpotCard key={spot.id} spot={spot} index={index} />
                ))}
              </div>
            </div>
          )}

          {/* Photo Hotspots - Popular photography locations */}
          {topPhotoHotspots.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Flame className="w-5 h-5 text-orange-500" />
                  <h3 className="text-lg font-semibold text-foreground">Popular Photo Spots</h3>
                </div>
                <span className="text-xs text-muted-foreground">via Flickr</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {topPhotoHotspots.map((hotspot, index) => (
                  <PhotoHotspotCard key={hotspot.id} hotspot={hotspot} index={index} />
                ))}
              </div>
            </div>
          )}

          {topCampsites.length === 0 && topHotSpots.length === 0 && topPhotoHotspots.length === 0 && (
            <div className="text-center py-8">
              <MapPin className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
              <p className="text-muted-foreground">No suggestions found near your location</p>
            </div>
          )}
        </>
      )}
    </section>
  );
};

interface CampsiteCardProps {
  campsite: GoogleSavedPlace & { distance: number };
  index: number;
  isSelected?: boolean;
  onClick?: () => void;
}

const CampsiteCard = ({ campsite, index, isSelected, onClick }: CampsiteCardProps) => {
  return (
    <Card
      className={`group hover:border-amber-500/30 hover:shadow-card transition-all duration-300 animate-fade-in cursor-pointer ${
        isSelected ? 'border-amber-500 bg-amber-500/5' : ''
      }`}
      style={{ animationDelay: `${index * 100}ms` }}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`flex items-center justify-center w-10 h-10 rounded-lg flex-shrink-0 ${
            isSelected ? 'bg-amber-500/20' : 'bg-amber-500/10'
          }`}>
            <Tent className="w-5 h-5 text-amber-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className={`font-semibold truncate transition-colors ${
              isSelected ? 'text-amber-600' : 'text-foreground group-hover:text-amber-600'
            }`}>
              {campsite.name}
            </h4>
            <p className="text-sm text-muted-foreground mt-0.5">
              {campsite.distance.toFixed(1)} miles away
            </p>
            {campsite.note && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                {campsite.note}
              </p>
            )}
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </CardContent>
    </Card>
  );
};

interface HotSpotCardProps {
  spot: HotSpot;
  index: number;
}

const HotSpotCard = ({ spot, index }: HotSpotCardProps) => {
  const category = getCategory(spot.types);

  return (
    <Link
      to={`/location/${spot.placeId}`}
      state={{
        placeId: spot.placeId,
        name: spot.name,
        address: spot.location,
        lat: spot.lat,
        lng: spot.lng,
      }}
    >
      <Card
        className="group hover:border-primary/30 hover:shadow-card transition-all duration-300 animate-fade-in h-full overflow-hidden"
        style={{ animationDelay: `${index * 100}ms` }}
      >
        {/* Photo */}
        {spot.photoUrl ? (
          <div className="relative h-32 w-full overflow-hidden">
            <img
              src={spot.photoUrl}
              alt={spot.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            <span className="absolute bottom-2 left-2 text-xs font-medium text-white bg-black/30 backdrop-blur-sm px-2 py-0.5 rounded-full">
              {category}
            </span>
          </div>
        ) : (
          <div className="h-24 w-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
            <Mountain className="w-10 h-10 text-primary/40" />
          </div>
        )}

        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                {spot.name}
              </h4>
              <p className="text-sm text-muted-foreground mt-0.5 truncate">
                {spot.location}
              </p>

              <div className="flex items-center gap-3 mt-2">
                {spot.rating && (
                  <div className="flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    <span className="text-sm font-medium text-foreground">
                      {spot.rating.toFixed(1)}
                    </span>
                    {spot.reviewCount && (
                      <span className="text-xs text-muted-foreground">
                        ({spot.reviewCount.toLocaleString()})
                      </span>
                    )}
                  </div>
                )}
                {spot.openNow !== undefined && (
                  <span className={`text-xs font-medium ${spot.openNow ? 'text-emerald-600' : 'text-red-500'}`}>
                    {spot.openNow ? 'Open' : 'Closed'}
                  </span>
                )}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-1" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
};

interface PhotoHotspotCardProps {
  hotspot: PhotoHotspot;
  index: number;
}

const PhotoHotspotCard = ({ hotspot, index }: PhotoHotspotCardProps) => {
  return (
    <Card
      className="group hover:border-orange-500/30 hover:shadow-card transition-all duration-300 animate-fade-in h-full overflow-hidden"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      {/* Photo */}
      {hotspot.samplePhotoUrl ? (
        <div className="relative h-32 w-full overflow-hidden">
          <img
            src={hotspot.samplePhotoUrl}
            alt={hotspot.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-orange-400" />
            <span className="text-xs font-medium text-white">Photo Hotspot</span>
          </div>
        </div>
      ) : (
        <div className="h-24 w-full bg-gradient-to-br from-orange-500/20 to-orange-500/5 flex items-center justify-center">
          <Flame className="w-10 h-10 text-orange-500/40" />
        </div>
      )}

      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-foreground truncate group-hover:text-orange-500 transition-colors">
              {hotspot.name}
            </h4>
            <div className="flex items-center gap-1 mt-1">
              <Camera className="w-3 h-3 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {hotspot.photoCount.toLocaleString()} photos
              </span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-1" />
        </div>
      </CardContent>
    </Card>
  );
};
