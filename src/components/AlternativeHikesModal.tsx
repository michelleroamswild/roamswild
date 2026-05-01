import { useState, useEffect } from 'react';
import { X, Star, MapPin, SpinnerGap, Boot, Check, ArrowSquareOut } from '@phosphor-icons/react';
import { TripStop } from '@/types/trip';
import { getAllTrailsUrl } from '@/utils/hikeUtils';
import { Mono } from '@/components/redesign';
import { cn } from '@/lib/utils';

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

async function isReachableByDriving(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
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
      (_, status) => resolve(status === google.maps.DirectionsStatus.OK),
    );
  });
}

async function fetchAlternativeHikes(
  lat: number,
  lng: number,
  excludePlaceId?: string,
): Promise<HikeOption[]> {
  if (!window.google?.maps?.places) return [];
  return new Promise((resolve) => {
    const service = new google.maps.places.PlacesService(document.createElement('div'));
    const request: google.maps.places.PlaceSearchRequest = {
      location: new google.maps.LatLng(lat, lng),
      radius: 40000,
      keyword: 'hiking trail',
      type: 'tourist_attraction',
    };

    service.nearbySearch(request, async (results, status) => {
      if (status !== google.maps.places.PlacesServiceStatus.OK || !results) {
        resolve([]);
        return;
      }
      const candidates = results
        .filter((place) => place.geometry?.location && place.place_id !== excludePlaceId)
        .slice(0, 10)
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

      const out: HikeOption[] = [];
      for (const hike of candidates) {
        if (out.length >= 5) break;
        const reachable = await isReachableByDriving(lat, lng, hike.lat, hike.lng);
        if (reachable) out.push(hike);
      }
      resolve(out);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center font-sans">
      <div className="absolute inset-0 bg-ink-pine/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white dark:bg-paper-2 border border-line rounded-[18px] shadow-[0_18px_44px_rgba(29,34,24,.16),0_3px_8px_rgba(29,34,24,.08)] w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-line gap-3">
          <div>
            <Mono className="text-pine-6 flex items-center gap-1.5">
              <Boot className="w-3.5 h-3.5" weight="regular" />
              Swap hike
            </Mono>
            <h2 className="text-[20px] font-sans font-semibold tracking-[-0.015em] text-ink leading-[1.15] mt-1">
              Pick a different trail.
            </h2>
            <p className="text-[13px] text-ink-3 mt-1 truncate">
              Replacing <span className="font-sans font-semibold text-ink">{currentHike.name}</span>
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

        {/* Body */}
        <div className="p-5 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-pine-6/10">
                <SpinnerGap className="w-5 h-5 text-pine-6 animate-spin" />
              </div>
              <Mono className="text-pine-6">Finding nearby hikes…</Mono>
            </div>
          ) : alternatives.length === 0 ? (
            <div className="border border-dashed border-line bg-cream/40 dark:bg-paper-2/40 rounded-[14px] px-6 py-12 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-sage/15 text-sage mb-3">
                <Boot className="w-5 h-5" weight="regular" />
              </div>
              <p className="text-[14px] font-sans font-semibold text-ink">No alternative hikes nearby</p>
              <p className="text-[13px] text-ink-3 mt-1">Try expanding the trip area.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {alternatives.map((hike) => {
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
                      <div className={cn(
                        'inline-flex items-center justify-center w-9 h-9 rounded-[10px] flex-shrink-0 transition-colors',
                        selected ? 'bg-pine-6 text-cream dark:text-ink-pine' : 'bg-sage/15 text-sage',
                      )}>
                        {selected ? <Check className="w-4 h-4" weight="bold" /> : <Boot className="w-4 h-4" weight="regular" />}
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
          <Mono className="text-ink-3 block text-center">Tap a hike to swap it in</Mono>
        </div>
      </div>
    </div>
  );
}
