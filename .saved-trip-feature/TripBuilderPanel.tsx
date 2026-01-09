import { useState, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Autocomplete } from '@react-google-maps/api';
import { useGoogleMaps } from '@/components/GoogleMapsProvider';
import { MapPin, Plus, X, Loader2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TripStopItem } from './TripStopItem';
import { AmenityPicker } from './AmenityPicker';
import { useCreateTrip, useAddStop, useRemoveStop, useReorderStops } from '@/hooks/use-trip-store';
import { TripStop, StopType } from '@/types/trip';
import { toast } from 'sonner';

interface TripBuilderPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TripBuilderPanel({ open, onOpenChange }: TripBuilderPanelProps) {
  const [tripName, setTripName] = useState('');
  const [stops, setStops] = useState<TripStop[]>([]);
  const [tripId, setTripId] = useState<string | null>(null);
  const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);
  const [searchingAmenity, setSearchingAmenity] = useState<{ type: StopType; query: string } | null>(null);

  const { isLoaded } = useGoogleMaps();

  const createTrip = useCreateTrip();
  const addStop = useAddStop();
  const removeStop = useRemoveStop();
  const reorderStops = useReorderStops();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Reset state when panel closes
  useEffect(() => {
    if (!open) {
      setTripName('');
      setStops([]);
      setTripId(null);
      setSearchingAmenity(null);
    }
  }, [open]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setStops((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        const newItems = arrayMove(items, oldIndex, newIndex).map((item, index) => ({
          ...item,
          position: index,
        }));

        // If we have a trip ID, sync to database
        if (tripId) {
          reorderStops.mutate({
            tripId,
            stops: newItems.map((s) => ({ id: s.id, position: s.position })),
          });
        }

        return newItems;
      });
    }
  };

  const onAutocompleteLoad = (autocompleteInstance: google.maps.places.Autocomplete) => {
    setAutocomplete(autocompleteInstance);
  };

  const onPlaceChanged = () => {
    if (autocomplete) {
      const place = autocomplete.getPlace();

      if (place.geometry?.location && place.place_id) {
        const stopType = searchingAmenity?.type || 'destination';
        const newStop: TripStop = {
          id: crypto.randomUUID(),
          tripId: tripId || '',
          placeId: place.place_id,
          name: place.name || '',
          address: place.formatted_address || '',
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
          stopType,
          position: stops.length,
        };

        // Add to local state immediately
        setStops((prev) => [...prev, newStop]);

        // If trip exists in DB, also add there
        if (tripId) {
          addStop.mutate({ tripId, stop: newStop });
        }

        toast.success(`Added ${place.name}`);
        setSearchingAmenity(null);

        // Clear the input
        const input = document.querySelector('.trip-search-input') as HTMLInputElement;
        if (input) input.value = '';
      }
    }
  };

  const handleRemoveStop = (stopId: string) => {
    setStops((prev) => prev.filter((s) => s.id !== stopId));
    if (tripId) {
      removeStop.mutate({ stopId, tripId });
    }
  };

  const handleAmenitySelect = (type: StopType, searchQuery: string) => {
    setSearchingAmenity({ type, query: searchQuery });
    // Focus the search input
    setTimeout(() => {
      const input = document.querySelector('.trip-search-input') as HTMLInputElement;
      if (input) {
        input.value = searchQuery;
        input.focus();
        input.select();
      }
    }, 100);
  };

  const handleSave = async () => {
    if (!tripName.trim()) {
      toast.error('Please enter a trip name');
      return;
    }

    if (stops.length === 0) {
      toast.error('Please add at least one destination');
      return;
    }

    try {
      // Create trip if not already created
      let currentTripId = tripId;
      if (!currentTripId) {
        const trip = await createTrip.mutateAsync(tripName);
        currentTripId = trip.id;
        setTripId(trip.id);

        // Add all stops to the new trip
        for (const stop of stops) {
          await addStop.mutateAsync({
            tripId: currentTripId,
            stop: { ...stop, tripId: currentTripId },
          });
        }
      }

      toast.success('Trip saved successfully!');
      onOpenChange(false);
    } catch (error) {
      toast.error('Failed to save trip');
      console.error(error);
    }
  };

  const isSaving = createTrip.isPending || addStop.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
        <SheetHeader className="p-6 pb-4 border-b border-border">
          <SheetTitle className="text-xl font-display">Create New Trip</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Trip Name */}
          <div className="p-6 pb-4 space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Trip Name
              </label>
              <Input
                value={tripName}
                onChange={(e) => setTripName(e.target.value)}
                placeholder="e.g., Weekend Sierra Adventure"
                className="h-12"
              />
            </div>

            {/* Add Destination Search */}
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                {searchingAmenity ? `Add ${searchingAmenity.type}` : 'Add Destination'}
              </label>
              {isLoaded ? (
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground z-10" />
                  <Autocomplete
                    onLoad={onAutocompleteLoad}
                    onPlaceChanged={onPlaceChanged}
                    options={{
                      types: searchingAmenity ? ['establishment'] : ['establishment', 'geocode'],
                      fields: ['place_id', 'name', 'formatted_address', 'geometry'],
                    }}
                  >
                    <input
                      type="text"
                      placeholder={searchingAmenity ? `Search for ${searchingAmenity.query}...` : 'Search for a place...'}
                      className="trip-search-input w-full h-12 pl-10 pr-4 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </Autocomplete>
                  {searchingAmenity && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
                      onClick={() => setSearchingAmenity(null)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ) : (
                <div className="h-12 flex items-center justify-center text-muted-foreground">
                  Loading search...
                </div>
              )}
            </div>

            {/* Quick Add Amenities */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Quick add:</span>
              <AmenityPicker onSelect={handleAmenitySelect} />
            </div>
          </div>

          {/* Stops List */}
          <div className="flex-1 overflow-hidden border-t border-border">
            <div className="p-4 pb-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                Stops ({stops.length})
              </h3>
            </div>
            <ScrollArea className="h-[calc(100%-40px)] px-4 pb-4">
              {stops.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <MapPin className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No stops added yet</p>
                  <p className="text-sm mt-1">Search for a destination above</p>
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={stops.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {stops.map((stop) => (
                        <TripStopItem
                          key={stop.id}
                          stop={stop}
                          onRemove={() => handleRemoveStop(stop.id)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </ScrollArea>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 pt-4 border-t border-border flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            variant="hero"
            className="flex-1"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Trip'
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
