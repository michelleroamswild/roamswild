import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MapPin, NavigationArrow, SpinnerGap, Warning, CaretRight } from '@phosphor-icons/react';

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
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <NavigationArrow className="w-5 h-5 text-primary" />
              Choose a Specific Location
            </DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{parentPlace.name}</span> is a large area
              without a single drivable destination. Choose a specific entry point:
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-3 py-2">
            {loading && (
              <div className="flex items-center justify-center py-8">
                <SpinnerGap className="w-6 h-6 text-primary animate-spin" />
                <span className="ml-2 text-muted-foreground">Finding entry points...</span>
              </div>
            )}

            {error && !loading && (
              <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <Warning className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <span className="text-sm text-amber-700 dark:text-amber-400">{error}</span>
              </div>
            )}

            {!loading && entryPoints.length > 0 && (
              <div className="space-y-2">
                {entryPoints.map((entryPoint) => (
                  <Card
                    key={entryPoint.placeId}
                    className="p-3 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all group"
                    onClick={() => handleSelect(entryPoint)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary flex-shrink-0">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground group-hover:text-primary transition-colors">
                          {entryPoint.name}
                        </p>
                        <p className="text-sm text-muted-foreground truncate">
                          {entryPoint.address}
                        </p>
                      </div>
                      <CaretRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 pt-4 border-t">
            <Button
              variant="outline"
              onClick={handleUseOriginal}
              className="w-full"
            >
              <MapPin className="w-4 h-4 mr-2" />
              Use general location anyway
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
