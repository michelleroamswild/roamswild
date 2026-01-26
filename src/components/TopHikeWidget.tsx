import { useState, useEffect } from 'react';
import { Mountains, Star, MapPin, SpinnerGap, ArrowRight } from '@phosphor-icons/react';
import { useNearbyHikes } from '@/hooks/use-nearby-hikes';
import { Link } from 'react-router-dom';

interface UserLocation {
  lat: number;
  lng: number;
}

export function TopHikeWidget() {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [gettingLocation, setGettingLocation] = useState(true);

  // Get user's location
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation not supported');
      setGettingLocation(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setGettingLocation(false);
      },
      (error) => {
        setLocationError('Location unavailable');
        setGettingLocation(false);
      },
      { timeout: 10000, enableHighAccuracy: false }
    );
  }, []);

  const { hikes, loading } = useNearbyHikes(
    location?.lat ?? 0,
    location?.lng ?? 0,
    30
  );

  // Get the top hike (highest rated)
  const topHike = hikes[0];

  // Don't render if we can't get location
  if (locationError || (!gettingLocation && !location)) {
    return null;
  }

  // Loading state
  if (gettingLocation || loading) {
    return (
      <div className="bg-white/95 dark:bg-card/95 backdrop-blur-sm rounded-2xl shadow-xl px-6 py-4 border border-border/50">
        <div className="flex items-center gap-2 text-muted-foreground">
          <SpinnerGap className="w-4 h-4 animate-spin" />
          <span className="text-sm">Finding hikes...</span>
        </div>
      </div>
    );
  }

  if (!topHike) {
    return null;
  }

  // Calculate distance (rough estimate)
  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 3959; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const distance = location
    ? Math.round(calculateDistance(location.lat, location.lng, topHike.lat, topHike.lng))
    : null;

  return (
    <Link
      to={`/location/google-${topHike.id.replace('google-', '')}`}
      state={{
        placeId: topHike.id.replace('google-', ''),
        name: topHike.name,
        lat: topHike.lat,
        lng: topHike.lng,
      }}
      className="block"
    >
      <div className="bg-white/95 dark:bg-card/95 backdrop-blur-sm rounded-2xl shadow-xl px-6 py-4 border border-border/50 hover:shadow-2xl transition-shadow cursor-pointer">
        <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground mb-3">
          <Mountains className="w-3.5 h-3.5" weight="fill" />
          <span className="font-medium">Top hike near you</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Mountains className="w-5 h-5 text-emerald-600 dark:text-emerald-400" weight="fill" />
            <div>
              <p className="text-xs text-muted-foreground">Trail</p>
              <p className="text-base font-bold text-foreground leading-tight truncate max-w-[180px]">{topHike.name}</p>
            </div>
          </div>

          {topHike.rating && (
            <div className="flex items-center gap-2">
              <Star className="w-5 h-5 text-amber-500" weight="fill" />
              <div>
                <p className="text-xs text-muted-foreground">Rating</p>
                <p className="text-lg font-bold text-foreground leading-tight">{topHike.rating.toFixed(1)}</p>
              </div>
            </div>
          )}

          {distance !== null && (
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-blue-600 dark:text-blue-400" weight="fill" />
              <div>
                <p className="text-xs text-muted-foreground">Distance</p>
                <p className="text-lg font-bold text-foreground leading-tight">{distance} mi</p>
              </div>
            </div>
          )}

          <ArrowRight className="w-4 h-4 text-muted-foreground ml-auto" weight="bold" />
        </div>
      </div>
    </Link>
  );
}
