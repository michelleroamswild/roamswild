import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { MapPin, Tent, Mountain, Star, Loader2, Navigation, ChevronRight, Search, Flame, Camera } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { useNearbyPlaces, GoogleSavedPlace } from "@/hooks/use-nearby-places";
import { usePhotoHotspots, PhotoHotspot } from "@/hooks/use-photo-hotspots";
import { PlaceSearch } from "./PlaceSearch";

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
          .map((place) => ({
            id: place.place_id!,
            name: place.name || "Unknown Place",
            location: place.vicinity || "",
            rating: place.rating,
            reviewCount: place.user_ratings_total,
            lat: place.geometry!.location!.lat(),
            lng: place.geometry!.location!.lng(),
            placeId: place.place_id!,
            types: place.types,
          }));
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {topCampsites.map((campsite, index) => (
                  <CampsiteCard key={campsite.id} campsite={campsite} index={index} />
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
}

const CampsiteCard = ({ campsite, index }: CampsiteCardProps) => {
  return (
    <Card
      className="group hover:border-primary/30 hover:shadow-card transition-all duration-300 animate-fade-in"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex items-center justify-center w-10 h-10 bg-amber-500/10 rounded-lg flex-shrink-0">
            <Tent className="w-5 h-5 text-amber-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
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
        className="group hover:border-primary/30 hover:shadow-card transition-all duration-300 animate-fade-in h-full"
        style={{ animationDelay: `${index * 100}ms` }}
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex items-center justify-center w-10 h-10 bg-primary/10 rounded-lg flex-shrink-0">
              <Mountain className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                {spot.name}
              </h4>
              <p className="text-sm text-muted-foreground mt-0.5 truncate">
                {spot.location}
              </p>
              {spot.rating && (
                <div className="flex items-center gap-1 mt-1">
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  <span className="text-xs text-muted-foreground">
                    {spot.rating.toFixed(1)}
                    {spot.reviewCount && ` (${spot.reviewCount.toLocaleString()})`}
                  </span>
                </div>
              )}
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
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
      className="group hover:border-orange-500/30 hover:shadow-card transition-all duration-300 animate-fade-in"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex items-center justify-center w-10 h-10 bg-orange-500/10 rounded-lg flex-shrink-0">
            <Flame className="w-5 h-5 text-orange-500" />
          </div>
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
          <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </CardContent>
    </Card>
  );
};
