import { useState, useEffect } from 'react';
import { X, Star, MapPin, SpinnerGap, Boot, Check, Clock, Path, ArrowSquareOut } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { TripStop } from '@/types/trip';
import { getAllTrailsUrl } from '@/utils/hikeUtils';

interface AddStopModalProps {
  isOpen: boolean;
  onClose: () => void;
  dayNumber: number;
  searchLat: number;
  searchLng: number;
  existingStopIds: string[];
  onAddStop: (stop: TripStop) => void;
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
  distance?: number; // driving distance in miles
  drivingMinutes?: number; // driving time in minutes
}

// Get actual driving distance and time between two points
interface DrivingInfo {
  distanceMiles: number;
  durationMinutes: number;
  isReachable: boolean;
}

async function getDrivingInfo(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  destName?: string
): Promise<DrivingInfo> {
  // Fallback using straight-line distance with mountain road multiplier
  const R = 3959;
  const dLat = (destLat - originLat) * (Math.PI / 180);
  const dLng = (destLng - originLng) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(originLat * (Math.PI / 180)) * Math.cos(destLat * (Math.PI / 180)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const straightLineDistance = R * c;
  // Mountain roads can be 2-4x longer than straight line
  const estimatedRoadDistance = straightLineDistance * 2.5;

  const fallback: DrivingInfo = {
    distanceMiles: estimatedRoadDistance,
    durationMinutes: Math.round((estimatedRoadDistance / 30) * 60),
    isReachable: true,
  };

  if (!window.google?.maps) {
    console.log(`[AddStopModal] Google Maps not loaded, using fallback for ${destName}`);
    return fallback;
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.log(`[AddStopModal] Timeout for ${destName}, using fallback: ${Math.round(estimatedRoadDistance)} mi`);
      resolve(fallback);
    }, 8000);

    try {
      const directionsService = new google.maps.DirectionsService();

      directionsService.route(
        {
          origin: { lat: originLat, lng: originLng },
          destination: { lat: destLat, lng: destLng },
          travelMode: google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          clearTimeout(timeout);
          if (status === google.maps.DirectionsStatus.OK && result?.routes[0]?.legs[0]) {
            const leg = result.routes[0].legs[0];
            const miles = (leg.distance?.value || 0) / 1609.34;
            const mins = (leg.duration?.value || 0) / 60;
            console.log(`[AddStopModal] SUCCESS for ${destName}: ${Math.round(miles)} mi, ${Math.round(mins)} min`);
            resolve({
              distanceMiles: miles,
              durationMinutes: mins,
              isReachable: true,
            });
          } else if (status === google.maps.DirectionsStatus.ZERO_RESULTS) {
            resolve({ ...fallback, isReachable: false });
          } else {
            console.log(`[AddStopModal] API status ${status} for ${destName}, using fallback`);
            resolve(fallback);
          }
        }
      );
    } catch {
      clearTimeout(timeout);
      resolve(fallback);
    }
  });
}

// Fetch hikes from Google Places API with actual driving distances
// maxDrivingMinutes: filter out hikes farther than this (default 60 min each way)
async function fetchNearbyHikes(
  lat: number,
  lng: number,
  excludePlaceIds: string[],
  maxDrivingMinutes: number = 60
): Promise<HikeOption[]> {
  console.log('Fetching hikes near:', { lat, lng, excludePlaceIds });

  if (!window.google?.maps?.places) {
    console.log('Google Places not available');
    return [];
  }

  return new Promise((resolve) => {
    const service = new google.maps.places.PlacesService(document.createElement('div'));

    const request: google.maps.places.PlaceSearchRequest = {
      location: new google.maps.LatLng(lat, lng),
      radius: 50000,
      keyword: 'hiking trail',
    };

    const processResults = async (results: google.maps.places.PlaceResult[] | null) => {
      if (!results || results.length === 0) return [];

      const candidates = results
        .filter((place) =>
          place.geometry?.location &&
          !excludePlaceIds.includes(place.place_id || '')
        )
        .slice(0, 15);

      console.log('Candidates to check:', candidates.length);

      // Get actual driving info for each candidate
      const hikesWithDrivingInfo: HikeOption[] = [];

      for (const place of candidates) {
        if (hikesWithDrivingInfo.length >= 6) break;

        const drivingInfo = await getDrivingInfo(
          lat, lng,
          place.geometry!.location!.lat(),
          place.geometry!.location!.lng(),
          place.name
        );

        if (!drivingInfo.isReachable) {
          console.log('Filtered unreachable:', place.name);
          continue;
        }

        if (drivingInfo.durationMinutes > maxDrivingMinutes) {
          console.log(`Filtered too far (${Math.round(drivingInfo.durationMinutes)} min):`, place.name);
          continue;
        }

        hikesWithDrivingInfo.push({
          id: `hike-new-${place.place_id}`,
          name: place.name || 'Unknown Trail',
          location: place.vicinity || '',
          rating: place.rating,
          reviewCount: place.user_ratings_total,
          lat: place.geometry!.location!.lat(),
          lng: place.geometry!.location!.lng(),
          placeId: place.place_id,
          distance: drivingInfo.distanceMiles,
          drivingMinutes: drivingInfo.durationMinutes,
        });
      }

      console.log('Hikes within driving limit:', hikesWithDrivingInfo.length);

      // Sort by driving time
      hikesWithDrivingInfo.sort((a, b) => (a.drivingMinutes || 0) - (b.drivingMinutes || 0));
      return hikesWithDrivingInfo;
    };

    service.nearbySearch(request, async (results, status) => {
      console.log('Places search status:', status, 'Results count:', results?.length || 0);

      if (status === google.maps.places.PlacesServiceStatus.OK && results && results.length > 0) {
        const hikes = await processResults(results);
        resolve(hikes);
      } else {
        console.log('First search failed, trying fallback...');
        const fallbackRequest: google.maps.places.PlaceSearchRequest = {
          location: new google.maps.LatLng(lat, lng),
          radius: 50000,
          type: 'park',
        };

        service.nearbySearch(fallbackRequest, async (fallbackResults, fallbackStatus) => {
          if (fallbackStatus === google.maps.places.PlacesServiceStatus.OK && fallbackResults) {
            const hikes = await processResults(fallbackResults);
            resolve(hikes);
          } else {
            console.log('Both searches failed');
            resolve([]);
          }
        });
      }
    });
  });
}

export function AddStopModal({
  isOpen,
  onClose,
  dayNumber,
  searchLat,
  searchLng,
  existingStopIds,
  onAddStop,
}: AddStopModalProps) {
  const [hikes, setHikes] = useState<HikeOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setSelectedId(null);
      fetchNearbyHikes(searchLat, searchLng, existingStopIds).then((results) => {
        setHikes(results);
        setLoading(false);
      });
    }
  }, [isOpen, searchLat, searchLng, existingStopIds]);

  const handleSelect = (hike: HikeOption) => {
    // Use actual driving time from API
    const mins = Math.round(hike.drivingMinutes || 0);
    const drivingTimeStr = mins < 60
      ? `${mins} min each way`
      : `${Math.floor(mins / 60)}h ${mins % 60}m each way`;

    const newStop: TripStop = {
      id: `hike-${dayNumber}-${Date.now()}`,
      name: hike.name,
      type: 'hike',
      coordinates: { lat: hike.lat, lng: hike.lng },
      duration: '2-4h hike',
      distance: `${Math.round(hike.distance || 0)} mi drive`,
      drivingTime: drivingTimeStr,
      description: hike.location,
      day: dayNumber,
      placeId: hike.placeId,
      rating: hike.rating,
      reviewCount: hike.reviewCount,
    };

    setSelectedId(hike.id);
    setTimeout(() => {
      onAddStop(newStop);
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
              Add a Hike
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Recommended hikes for Day {dayNumber}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="rounded-full" onClick={onClose}>
            <X className="w-5 h-5" weight="bold" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <SpinnerGap className="w-8 h-8 text-primary animate-spin mb-3" />
              <p className="text-muted-foreground">Finding nearby hikes...</p>
            </div>
          ) : hikes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Boot className="w-12 h-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No hikes found nearby</p>
            </div>
          ) : (
            <div className="space-y-3">
              {hikes.map((hike) => (
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
                          : 'bg-pinesoft/20 text-[#3c8a79]'
                      }`}
                    >
                      {selectedId === hike.id ? (
                        <Check className="w-5 h-5" weight="bold" />
                      ) : (
                        <Boot className="w-5 h-5" weight="bold" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-foreground">{hike.name}</h3>
                      <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                        <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate">{hike.location}</span>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-sm flex-wrap">
                        {hike.rating && (
                          <div className="flex items-center gap-1">
                            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                            <span className="font-medium text-foreground">
                              {hike.rating.toFixed(1)}
                            </span>
                            {hike.reviewCount && (
                              <span className="text-muted-foreground">
                                ({hike.reviewCount.toLocaleString()})
                              </span>
                            )}
                          </div>
                        )}
                        {hike.drivingMinutes && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="w-3.5 h-3.5" />
                            <span>
                              {hike.drivingMinutes < 60
                                ? `${Math.round(hike.drivingMinutes)} min`
                                : `${Math.floor(hike.drivingMinutes / 60)}h ${Math.round(hike.drivingMinutes % 60)}m`
                              } drive
                            </span>
                          </div>
                        )}
                        {hike.distance && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Path className="w-3.5 h-3.5" />
                            <span>{Math.round(hike.distance)} mi</span>
                          </div>
                        )}
                        <a
                          href={getAllTrailsUrl(hike.name, hike.lat, hike.lng)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 text-emerald-600 hover:text-emerald-700 hover:underline"
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
            Select a hike to add it to your day
          </p>
        </div>
      </div>
    </div>
  );
}
