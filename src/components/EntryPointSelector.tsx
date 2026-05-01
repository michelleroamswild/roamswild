import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { MapPinArea, NavigationArrow, SpinnerGap, Warning, CaretRight } from '@phosphor-icons/react';
import { Mono, Pill } from '@/components/redesign';

interface EntryPoint {
  placeId: string;
  name: string;
  address: string;
  coordinates: { lat: number; lng: number };
}

interface EntryPointSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  parentPlace: {
    name: string;
    placeId: string;
    coordinates: { lat: number; lng: number };
  };
  onSelectEntryPoint: (entryPoint: EntryPoint) => void;
  onUseOriginal: () => void;
}

// Check if a location is drivable by testing if we can get directions to it
export async function checkIfDrivable(
  lat: number,
  lng: number,
  fromLat?: number,
  fromLng?: number
): Promise<boolean> {
  return new Promise((resolve) => {
    const directionsService = new google.maps.DirectionsService();

    // Use a default origin if none provided (use the destination itself offset slightly)
    const origin = fromLat && fromLng
      ? { lat: fromLat, lng: fromLng }
      : { lat: lat + 0.5, lng: lng + 0.5 }; // ~35 miles offset

    directionsService.route(
      {
        origin,
        destination: { lat, lng },
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === google.maps.DirectionsStatus.OK && result) {
          // Check if the route actually gets close to the destination
          // Sometimes Google routes to the nearest road which could be far away
          const legs = result.routes[0]?.legs;
          if (legs && legs.length > 0) {
            const endLocation = legs[legs.length - 1].end_location;
            const distance = getDistanceKm(
              lat, lng,
              endLocation.lat(), endLocation.lng()
            );
            // If the route ends more than 5km from the target, it's not really drivable
            resolve(distance < 5);
          } else {
            resolve(false);
          }
        } else {
          resolve(false);
        }
      }
    );
  });
}

// Haversine distance in km
function getDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export function EntryPointSelector({
  isOpen,
  onClose,
  parentPlace,
  onSelectEntryPoint,
  onUseOriginal,
}: EntryPointSelectorProps) {
  const [entryPoints, setEntryPoints] = useState<EntryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const placesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && parentPlace && placesContainerRef.current) {
      searchEntryPoints();
    } else if (!isOpen) {
      setEntryPoints([]);
      setError(null);
      setLoading(false);
    }
  }, [isOpen, parentPlace.placeId]);

  const searchEntryPoints = async () => {
    if (!placesContainerRef.current) return;

    setLoading(true);
    setError(null);
    setEntryPoints([]);

    try {
      const service = new google.maps.places.PlacesService(placesContainerRef.current);

      // Search for visitor centers with the place name
      const results = await new Promise<google.maps.places.PlaceResult[]>((resolve) => {
        service.textSearch(
          {
            query: `${parentPlace.name} visitor center`,
            location: new google.maps.LatLng(
              parentPlace.coordinates.lat,
              parentPlace.coordinates.lng
            ),
            radius: 100000, // 100km
          },
          (results, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK && results) {
              resolve(results);
            } else {
              resolve([]);
            }
          }
        );
      });

      // Filter to only include results that mention the park in their address
      // This ensures they're actually INSIDE the park
      const parkNameLower = parentPlace.name.toLowerCase();
      const parkKeywords = parkNameLower
        .replace(/national park|state park|national monument|national recreation area/gi, '')
        .trim()
        .split(/\s+/)
        .filter(w => w.length > 2);

      const filtered: EntryPoint[] = [];
      const seenIds = new Set<string>();

      for (const result of results) {
        if (!result.place_id || !result.geometry?.location || seenIds.has(result.place_id)) {
          continue;
        }

        const name = result.name || '';
        const address = result.formatted_address || result.vicinity || '';
        const combined = `${name} ${address}`.toLowerCase();

        // Must contain at least one keyword from the park name
        const isRelated = parkKeywords.some(keyword => combined.includes(keyword));

        if (isRelated && result.place_id !== parentPlace.placeId) {
          seenIds.add(result.place_id);
          filtered.push({
            placeId: result.place_id,
            name: name,
            address: address,
            coordinates: {
              lat: result.geometry.location.lat(),
              lng: result.geometry.location.lng(),
            },
          });
        }
      }

      // Sort: visitor centers first
      filtered.sort((a, b) => {
        const aIsVC = a.name.toLowerCase().includes('visitor');
        const bIsVC = b.name.toLowerCase().includes('visitor');
        if (aIsVC && !bIsVC) return -1;
        if (!aIsVC && bIsVC) return 1;
        return 0;
      });

      setEntryPoints(filtered.slice(0, 6));

      if (filtered.length === 0) {
        setError('No specific entry points found. You can use the general location.');
      }
    } catch (e) {
      console.error('Entry point search error:', e);
      setError('Failed to search for entry points.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (entryPoint: EntryPoint) => {
    onSelectEntryPoint(entryPoint);
    onClose();
  };

  const handleUseOriginal = () => {
    onUseOriginal();
    onClose();
  };

  return (
    <>
      <div ref={placesContainerRef} style={{ position: 'absolute', visibility: 'hidden', width: 0, height: 0 }} />

      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-hidden flex flex-col border-line bg-white dark:bg-paper-2 rounded-[18px]">
          <DialogHeader>
            <Mono className="text-pine-6 flex items-center gap-1.5">
              <NavigationArrow className="w-3.5 h-3.5" weight="regular" />
              Pick an entry point
            </Mono>
            <DialogTitle className="font-sans font-semibold tracking-[-0.015em] text-ink text-[22px] leading-[1.15] mt-1">
              Choose a specific spot.
            </DialogTitle>
            <DialogDescription className="text-[14px] text-ink-3 leading-[1.55]">
              <span className="font-semibold text-ink">{parentPlace.name}</span> is a large area without
              a single drivable destination. Pick an entry point inside it.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-2">
            {loading && (
              <div className="flex items-center justify-center py-10 gap-2 text-ink-3">
                <SpinnerGap className="w-5 h-5 text-pine-6 animate-spin" />
                <span className="text-[14px]">Finding entry points…</span>
              </div>
            )}

            {error && !loading && (
              <div className="flex items-start gap-2 px-3 py-2.5 bg-clay/10 border border-clay/30 rounded-[12px] text-clay text-[13px]">
                <Warning className="w-4 h-4 flex-shrink-0 mt-0.5" weight="regular" />
                <span>{error}</span>
              </div>
            )}

            {!loading && entryPoints.length > 0 && (
              <div className="space-y-2">
                {entryPoints.map((entryPoint) => {
                  const isVC = entryPoint.name.toLowerCase().includes('visitor');
                  return (
                    <button
                      key={entryPoint.placeId}
                      type="button"
                      onClick={() => handleSelect(entryPoint)}
                      className="group w-full flex items-start gap-3 p-3 rounded-[12px] border border-line bg-white dark:bg-paper-2 text-left transition-all hover:border-pine-6 hover:bg-pine-6/[0.04]"
                    >
                      <div className={
                        isVC
                          ? 'inline-flex items-center justify-center w-9 h-9 rounded-[10px] bg-water/15 text-water flex-shrink-0'
                          : 'inline-flex items-center justify-center w-9 h-9 rounded-[10px] bg-clay/15 text-clay flex-shrink-0'
                      }>
                        <MapPinArea className="w-4 h-4" weight="regular" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-[14px] font-sans font-semibold tracking-[-0.005em] text-ink truncate">
                            {entryPoint.name}
                          </p>
                          {isVC && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-water/12 text-water border border-water/40 text-[10px] font-mono font-semibold uppercase tracking-[0.10em]">
                              Visitor center
                            </span>
                          )}
                        </div>
                        <p className="text-[13px] text-ink-3 truncate mt-0.5">{entryPoint.address}</p>
                      </div>
                      <CaretRight className="w-4 h-4 text-ink-3 group-hover:text-pine-6 group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-2.5" weight="bold" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-line">
            <Pill
              variant="ghost"
              mono={false}
              onClick={handleUseOriginal}
              className="w-full justify-center"
            >
              <MapPinArea className="w-3.5 h-3.5" weight="regular" />
              Use general location anyway
            </Pill>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
