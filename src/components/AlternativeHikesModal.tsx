import { useState, useEffect } from 'react';
import { X, Star, MapPin, SpinnerGap, Sneaker, Check, ArrowSquareOut } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { TripStop } from '@/types/trip';
import { getAllTrailsUrl } from '@/utils/hikeUtils';

interface AlternativeHikesModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentHike: TripStop;
  searchLat: number;
  searchLng: number;
  onSelectHike: (hike: TripStop) => void;
}

interface HikeOption {
  id: string;
  name: string;
  location: string;
  rating?: number;
  reviewCount?: number;
  lat: number;
  lng: number;
  placeId?: string;
}

// Check if a location is reachable by driving
async function isReachableByDriving(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number
): Promise<boolean> {
  if (!window.google?.maps) return true;

  return new Promise((resolve) => {
    const directionsService = new google.maps.DirectionsService();

    directionsService.route(
      {
        origin: { lat: originLat, lng: originLng },
        destination: { lat: destLat, lng: destLng },
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        resolve(status === google.maps.DirectionsStatus.OK);
      }
    );
  });
}

// Fetch hikes from Google Places API, filtered to only include drivable locations
async function fetchAlternativeHikes(
  lat: number,
  lng: number,
  excludePlaceId?: string
): Promise<HikeOption[]> {
  if (!window.google?.maps?.places) return [];

  return new Promise((resolve) => {
    const service = new google.maps.places.PlacesService(document.createElement('div'));

    const request: google.maps.places.PlaceSearchRequest = {
      location: new google.maps.LatLng(lat, lng),
      radius: 40000, // 40km radius
      keyword: 'hiking trail',
      type: 'tourist_attraction',
    };

    service.nearbySearch(request, async (results, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && results) {
        const potentialHikes = results
          .filter((place) => place.geometry?.location && place.place_id !== excludePlaceId)
          .slice(0, 10) // Get more candidates since some may be filtered out
          .map((place) => ({
            id: `hike-alt-${place.place_id}`,
            name: place.name || 'Unknown Trail',
            location: place.vicinity || '',
            rating: place.rating,
            reviewCount: place.user_ratings_total,
            lat: place.geometry!.location!.lat(),
            lng: place.geometry!.location!.lng(),
            placeId: place.place_id,
          }));

        // Filter to only include hikes reachable by driving
        const reachableHikes: HikeOption[] = [];
        for (const hike of potentialHikes) {
          if (reachableHikes.length >= 5) break;

          const isReachable = await isReachableByDriving(lat, lng, hike.lat, hike.lng);
          if (isReachable) {
            reachableHikes.push(hike);
          } else {
            console.log(`Filtered out unreachable hike: ${hike.name}`);
          }
        }

        resolve(reachableHikes);
      } else {
        resolve([]);
      }
    });
  });
}

export function AlternativeHikesModal({
  isOpen,
  onClose,
  currentHike,
  searchLat,
  searchLng,
  onSelectHike,
}: AlternativeHikesModalProps) {
  const [alternatives, setAlternatives] = useState<HikeOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setSelectedId(null);
      fetchAlternativeHikes(searchLat, searchLng, currentHike.placeId).then((hikes) => {
        setAlternatives(hikes);
        setLoading(false);
      });
    }
  }, [isOpen, searchLat, searchLng, currentHike.placeId]);

  const handleSelect = (hike: HikeOption) => {
    const newStop: TripStop = {
      id: hike.id,
      name: hike.name,
      type: 'hike',
      coordinates: { lat: hike.lat, lng: hike.lng },
      duration: '2-4h hike',
      distance: currentHike.distance,
      description: hike.location,
      day: currentHike.day,
      placeId: hike.placeId,
      rating: hike.rating,
      reviewCount: hike.reviewCount,
    };
    setSelectedId(hike.id);
    setTimeout(() => {
      onSelectHike(newStop);
      onClose();
    }, 300);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-card rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h2 className="text-lg font-display font-semibold text-foreground">
              Choose a Different Hike
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Replacing: {currentHike.name}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="rounded-full" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <SpinnerGap className="w-8 h-8 text-primary animate-spin mb-3" />
              <p className="text-muted-foreground">Finding nearby hikes...</p>
            </div>
          ) : alternatives.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Sneaker className="w-12 h-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No alternative hikes found nearby</p>
            </div>
          ) : (
            <div className="space-y-3">
              {alternatives.map((hike) => (
                <button
                  key={hike.id}
                  onClick={() => handleSelect(hike)}
                  className={`w-full text-left p-4 rounded-xl border transition-all duration-200 ${
                    selectedId === hike.id
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'border-border hover:border-primary/30 hover:bg-secondary/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex items-center justify-center w-10 h-10 rounded-lg ${
                        selectedId === hike.id
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-primary/10 text-primary'
                      }`}
                    >
                      {selectedId === hike.id ? (
                        <Check className="w-5 h-5" />
                      ) : (
                        <Sneaker className="w-5 h-5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-foreground">{hike.name}</h3>
                      <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                        <MapPin className="w-3.5 h-3.5" />
                        <span className="truncate">{hike.location}</span>
                      </div>
                      <div className="flex items-center gap-4 mt-2 flex-wrap">
                        {hike.rating && (
                          <div className="flex items-center gap-1.5">
                            <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                            <span className="text-sm font-medium text-foreground">
                              {hike.rating.toFixed(1)}
                            </span>
                            {hike.reviewCount && (
                              <span className="text-sm text-muted-foreground">
                                ({hike.reviewCount.toLocaleString()})
                              </span>
                            )}
                          </div>
                        )}
                        <a
                          href={getAllTrailsUrl(hike.name, hike.lat, hike.lng)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 text-sm text-emerald-600 hover:text-emerald-700 hover:underline"
                        >
                          <ArrowSquareOut className="w-3.5 h-3.5" />
                          AllTrails
                        </a>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-secondary/30">
          <p className="text-xs text-muted-foreground text-center">
            Click on a hike to select it as your new option
          </p>
        </div>
      </div>
    </div>
  );
}
