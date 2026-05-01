import { useState, useEffect } from 'react';
import {
  X,
  Star,
  MapPin,
  SpinnerGap,
  Boot,
  Check,
  Clock,
  Path,
  ArrowSquareOut,
} from '@phosphor-icons/react';
import { TripStop } from '@/types/trip';
import { getAllTrailsUrl } from '@/utils/hikeUtils';
import { Mono } from '@/components/redesign';
import { cn } from '@/lib/utils';

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
  distance?: number;
  drivingMinutes?: number;
}

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
  const R = 3959;
  const dLat = (destLat - originLat) * (Math.PI / 180);
  const dLng = (destLng - originLng) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(originLat * (Math.PI / 180)) *
      Math.cos(destLat * (Math.PI / 180)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const straightLineDistance = R * c;
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
            resolve({ distanceMiles: miles, durationMinutes: mins, isReachable: true });
          } else if (status === google.maps.DirectionsStatus.ZERO_RESULTS) {
            resolve({ ...fallback, isReachable: false });
          } else {
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

async function fetchNearbyHikes(
  lat: number,
  lng: number,
  excludePlaceIds: string[],
  maxDrivingMinutes: number = 60
): Promise<HikeOption[]> {
  if (!window.google?.maps?.places) return [];

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
        .filter((place) => place.geometry?.location && !excludePlaceIds.includes(place.place_id || ''))
        .slice(0, 15);
      const out: HikeOption[] = [];
      for (const place of candidates) {
        if (out.length >= 6) break;
        const di = await getDrivingInfo(
          lat,
          lng,
          place.geometry!.location!.lat(),
          place.geometry!.location!.lng(),
          place.name
        );
        if (!di.isReachable || di.durationMinutes > maxDrivingMinutes) continue;
        out.push({
          id: `hike-new-${place.place_id}`,
          name: place.name || 'Unknown Trail',
          location: place.vicinity || '',
          rating: place.rating,
          reviewCount: place.user_ratings_total,
          lat: place.geometry!.location!.lat(),
          lng: place.geometry!.location!.lng(),
          placeId: place.place_id,
          distance: di.distanceMiles,
          drivingMinutes: di.durationMinutes,
        });
      }
      out.sort((a, b) => (a.drivingMinutes || 0) - (b.drivingMinutes || 0));
      return out;
    };

    service.nearbySearch(request, async (results, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && results && results.length > 0) {
        resolve(await processResults(results));
      } else {
        const fallbackRequest: google.maps.places.PlaceSearchRequest = {
          location: new google.maps.LatLng(lat, lng),
          radius: 50000,
          type: 'park',
        };
        service.nearbySearch(fallbackRequest, async (fr, fs) => {
          if (fs === google.maps.places.PlacesServiceStatus.OK && fr) resolve(await processResults(fr));
          else resolve([]);
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
    const mins = Math.round(hike.drivingMinutes || 0);
    const drivingTimeStr =
      mins < 60 ? `${mins} min each way` : `${Math.floor(mins / 60)}h ${mins % 60}m each way`;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center font-sans">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-ink-pine/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal — same chrome as the redesign Dialogs */}
      <div className="relative bg-white dark:bg-paper-2 border border-line rounded-[18px] shadow-[0_18px_44px_rgba(29,34,24,.16),0_3px_8px_rgba(29,34,24,.08)] w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-line gap-3">
          <div>
            <Mono className="text-pine-6 flex items-center gap-1.5">
              <Boot className="w-3.5 h-3.5" weight="regular" />
              Add a hike
            </Mono>
            <h2 className="text-[20px] font-sans font-semibold tracking-[-0.015em] text-ink leading-[1.15] mt-1">
              Pick a trail for Day {dayNumber}.
            </h2>
            <p className="text-[13px] text-ink-3 mt-1">
              Nearby hikes ranked by driving time.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="inline-flex items-center justify-center w-9 h-9 rounded-full text-ink-3 hover:text-ink hover:bg-ink/5 transition-colors shrink-0"
          >
            <X className="w-4 h-4" weight="regular" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-14 gap-3">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-pine-6/10">
                <SpinnerGap className="w-5 h-5 text-pine-6 animate-spin" />
              </div>
              <p className="text-[14px] text-ink-3">Finding nearby hikes…</p>
            </div>
          ) : hikes.length === 0 ? (
            <div className="border border-dashed border-line bg-cream/40 dark:bg-paper-2/40 rounded-[14px] px-6 py-12 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-sage/15 text-sage mb-3">
                <Boot className="w-5 h-5" weight="regular" />
              </div>
              <p className="text-[14px] font-sans font-semibold text-ink">No hikes found nearby</p>
              <p className="text-[13px] text-ink-3 mt-1">Try adjusting the trip area.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {hikes.map((hike) => {
                const selected = selectedId === hike.id;
                return (
                  <button
                    key={hike.id}
                    onClick={() => handleSelect(hike)}
                    className={cn(
                      'w-full text-left p-4 rounded-[14px] border bg-white dark:bg-paper-2 transition-all',
                      selected
                        ? 'border-pine-6 ring-1 ring-pine-6/40 bg-pine-6/[0.04]'
                        : 'border-line hover:border-ink-3/40',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          'inline-flex items-center justify-center w-9 h-9 rounded-[10px] flex-shrink-0 transition-colors',
                          selected ? 'bg-pine-6 text-cream dark:text-ink-pine' : 'bg-sage/15 text-sage',
                        )}
                      >
                        {selected ? (
                          <Check className="w-4 h-4" weight="bold" />
                        ) : (
                          <Boot className="w-4 h-4" weight="regular" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-[14px] font-sans font-semibold tracking-[-0.005em] text-ink">
                          {hike.name}
                        </h3>
                        <div className="flex items-center gap-1.5 mt-1 text-[13px] text-ink-3">
                          <MapPin className="w-3.5 h-3.5 flex-shrink-0" weight="regular" />
                          <span className="truncate">{hike.location}</span>
                        </div>
                        <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] font-mono uppercase tracking-[0.10em] text-ink-3">
                          {hike.rating && (
                            <span className="inline-flex items-center gap-1">
                              <Star className="w-3 h-3 fill-clay text-clay" weight="fill" />
                              {hike.rating.toFixed(1)}
                              {hike.reviewCount && (
                                <span className="opacity-70">({hike.reviewCount.toLocaleString()})</span>
                              )}
                            </span>
                          )}
                          {hike.drivingMinutes && (
                            <span className="inline-flex items-center gap-1 text-pine-6">
                              <Clock className="w-3 h-3" weight="regular" />
                              {hike.drivingMinutes < 60
                                ? `${Math.round(hike.drivingMinutes)} min`
                                : `${Math.floor(hike.drivingMinutes / 60)}h ${Math.round(hike.drivingMinutes % 60)}m`}{' '}
                              drive
                            </span>
                          )}
                          {hike.distance && (
                            <span className="inline-flex items-center gap-1">
                              <Path className="w-3 h-3" weight="regular" />
                              {Math.round(hike.distance)} mi
                            </span>
                          )}
                          <a
                            href={getAllTrailsUrl(hike.name, hike.lat, hike.lng)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-sage hover:text-sage/80 transition-colors"
                          >
                            <ArrowSquareOut className="w-3 h-3" weight="regular" />
                            AllTrails
                          </a>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-line bg-cream dark:bg-paper-2">
          <Mono className="text-ink-3 block text-center">
            Tap a hike to add it to Day {dayNumber}
          </Mono>
        </div>
      </div>
    </div>
  );
}
