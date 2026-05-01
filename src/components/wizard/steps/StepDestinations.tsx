import { useState } from "react";
import { DotsSixVertical, Plus, Minus, X, MapPin, MapTrifold } from "@phosphor-icons/react";
import { PlaceSearch } from "@/components/PlaceSearch";
import { MapLocationPicker } from "@/components/MapLocationPicker";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Mono, Pill } from "@/components/redesign";
import { cn } from "@/lib/utils";

interface LocationData {
  id: string;
  name: string;
  lat: number;
  lng: number;
  placeId: string;
  days?: number;
}

interface StepDestinationsProps {
  destinations: LocationData[];
  setDestinations: (destinations: LocationData[]) => void;
  duration: number;
  returnToStart: boolean;
  onAddDestination: (place: google.maps.places.PlaceResult) => void;
  draggedIndex: number | null;
  setDraggedIndex: (index: number | null) => void;
}

export function StepDestinations({
  destinations,
  setDestinations,
  duration,
  returnToStart,
  onAddDestination,
  draggedIndex,
  setDraggedIndex,
}: StepDestinationsProps) {
  const [showManualCoords, setShowManualCoords] = useState(false);
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  const [manualName, setManualName] = useState("");
  const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);

  // Day-budget math so the Plus button disables when there are no days left.
  const travelDays = returnToStart ? 1 : 0;
  const totalSpecifiedDays = destinations.reduce((sum, d) => sum + (d.days || 0), 0);
  const availableDays = duration - travelDays;
  const remainingDays = availableDays - totalSpecifiedDays;

  const handleRemoveDestination = (id: string) => {
    setDestinations(destinations.filter((d) => d.id !== id));
  };

  const handleDestinationDaysChange = (id: string, days: number) => {
    setDestinations(destinations.map((d) => (d.id === id ? { ...d, days } : d)));
  };

  const handleDragStart = (index: number) => setDraggedIndex(index);
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    const next = [...destinations];
    const [moved] = next.splice(draggedIndex, 1);
    next.splice(index, 0, moved);
    setDestinations(next);
    setDraggedIndex(index);
  };
  const handleDragEnd = () => setDraggedIndex(null);

  const handleAddManualCoords = () => {
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (isNaN(lat) || isNaN(lng)) return;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
    const name = manualName.trim() || `Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
    setDestinations([
      ...destinations,
      { id: `dest-manual-${Date.now()}`, name, lat, lng, placeId: `manual-${Date.now()}` },
    ]);
    setManualLat('');
    setManualLng('');
    setManualName('');
    setShowManualCoords(false);
  };

  const handleMapLocationSelect = (location: { lat: number; lng: number; name: string }) => {
    setDestinations([
      ...destinations,
      {
        id: `dest-map-${Date.now()}`,
        name: location.name,
        lat: location.lat,
        lng: location.lng,
        placeId: `map-${Date.now()}`,
      },
    ]);
    setIsMapPickerOpen(false);
  };

  return (
    <div className="space-y-7">
      <div className="text-center">
        <Mono className="text-pine-6">Step 03 · Destinations</Mono>
        <h2 className="font-sans font-bold tracking-[-0.025em] text-ink text-[28px] md:text-[34px] leading-[1.1] mt-2">
          Where are you headed?
        </h2>
        <p className="text-[15px] text-ink-3 mt-2">
          Add the places you want to visit. Drag to reorder.
        </p>
      </div>

      {/* Add destination */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <Mono className="text-ink-2">Add a destination</Mono>
        </div>
        <PlaceSearch
          onPlaceSelect={onAddDestination}
          placeholder="Search a region — Moab, Joshua Tree, Olympic Peninsula…"
          key={destinations.length}
        />

        {/* Alternative input methods */}
        <div className="flex items-center justify-center gap-3 pt-3">
          <button
            type="button"
            onClick={() => setIsMapPickerOpen(true)}
            className="inline-flex items-center gap-1.5 text-[12px] font-mono uppercase tracking-[0.10em] font-semibold text-pine-6 hover:text-pine-5 transition-colors"
          >
            <MapTrifold className="w-3.5 h-3.5" weight="regular" />
            Pick on map
          </button>
          <span className="text-[11px] text-ink-3">·</span>
          <button
            type="button"
            onClick={() => setShowManualCoords(!showManualCoords)}
            className="inline-flex items-center gap-1.5 text-[12px] font-mono uppercase tracking-[0.10em] font-semibold text-pine-6 hover:text-pine-5 transition-colors"
          >
            <MapPin className="w-3.5 h-3.5" weight="regular" />
            {showManualCoords ? 'Hide GPS coords' : 'Enter GPS coords'}
          </button>
        </div>

        {/* Manual coordinates input */}
        {showManualCoords && (
          <div className="mt-4 p-4 bg-paper-2 rounded-[14px] border border-line space-y-3 animate-fade-in">
            <Mono className="text-ink-2 block">GPS coordinates</Mono>
            <input
              type="text"
              placeholder="Name (optional)"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              className="w-full h-11 px-4 rounded-[12px] border border-line bg-white dark:bg-paper-2 text-ink text-[14px] outline-none placeholder:text-ink-3 focus:border-pine-6 transition-colors"
            />
            <div className="flex gap-2">
              <input
                type="number"
                step="any"
                placeholder="Lat (e.g. 36.8529)"
                value={manualLat}
                onChange={(e) => setManualLat(e.target.value)}
                className="flex-1 h-11 px-4 rounded-[12px] border border-line bg-white dark:bg-paper-2 text-ink text-[14px] outline-none placeholder:text-ink-3 focus:border-pine-6 transition-colors"
              />
              <input
                type="number"
                step="any"
                placeholder="Lng (e.g. -111.3803)"
                value={manualLng}
                onChange={(e) => setManualLng(e.target.value)}
                className="flex-1 h-11 px-4 rounded-[12px] border border-line bg-white dark:bg-paper-2 text-ink text-[14px] outline-none placeholder:text-ink-3 focus:border-pine-6 transition-colors"
              />
            </div>
            <Pill
              variant="solid-pine"
              mono={false}
              onClick={handleAddManualCoords}
              className={cn('w-full justify-center', (!manualLat || !manualLng) && 'opacity-50 pointer-events-none')}
            >
              <Plus className="w-3.5 h-3.5" weight="bold" />
              Add location
            </Pill>
          </div>
        )}
      </div>

      {/* Destination list */}
      {destinations.length > 0 ? (
        <div>
          <div className="flex items-center justify-between mb-3">
            <Mono className="text-ink-2">
              {destinations.length} {destinations.length === 1 ? 'destination' : 'destinations'}
            </Mono>
            <Mono className="text-ink-3">
              {remainingDays > 0 ? `${remainingDays} ${remainingDays === 1 ? 'day' : 'days'} unassigned` : 'All days assigned'}
            </Mono>
          </div>
          <div className="space-y-2">
            {destinations.map((dest, index) => {
              const currentDays = dest.days || 0;
              const canIncrease = remainingDays > 0;
              const canDecrease = currentDays > 0;
              const dragging = draggedIndex === index;
              return (
                <div
                  key={dest.id}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    'flex items-center gap-3 p-3 bg-white dark:bg-paper-2 border rounded-[12px] cursor-move transition-all',
                    dragging ? 'opacity-50 border-pine-6' : 'border-line hover:border-ink-3/40',
                  )}
                >
                  <DotsSixVertical className="w-4 h-4 text-ink-3 flex-shrink-0" weight="bold" />
                  <div className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-pine-6/10 text-pine-6 flex-shrink-0">
                    <span className="text-[11px] font-mono font-bold">{index + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[14px] font-sans font-semibold tracking-[-0.005em] text-ink truncate block">
                      {dest.name}
                    </span>
                  </div>

                  {/* Days stepper */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); if (canDecrease) handleDestinationDaysChange(dest.id, currentDays - 1); }}
                      disabled={!canDecrease}
                      className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-line bg-white dark:bg-paper-2 text-ink hover:border-ink-3 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      aria-label="Decrease days"
                    >
                      <Minus className="w-3 h-3" weight="bold" />
                    </button>
                    <span className="w-12 text-center text-[12px] font-mono uppercase tracking-[0.05em] font-semibold text-ink">
                      {currentDays === 0 ? 'Auto' : `${currentDays}d`}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); if (canIncrease) handleDestinationDaysChange(dest.id, currentDays + 1); }}
                      disabled={!canIncrease}
                      className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-line bg-white dark:bg-paper-2 text-ink hover:border-ink-3 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      aria-label="Increase days"
                    >
                      <Plus className="w-3 h-3" weight="bold" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveDestination(dest.id)}
                    className="inline-flex items-center justify-center w-7 h-7 rounded-full text-ink-3 hover:text-ember hover:bg-ember/10 transition-colors flex-shrink-0"
                    aria-label="Remove destination"
                  >
                    <X className="w-3.5 h-3.5" weight="bold" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="border border-dashed border-line bg-white/50 rounded-[14px] px-6 py-10 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-pine-6/10 text-pine-6 mb-3">
            <MapPin className="w-5 h-5" weight="regular" />
          </div>
          <p className="text-[14px] font-sans font-semibold text-ink">No destinations yet</p>
          <p className="text-[13px] text-ink-3 mt-1">Search above to add your first stop.</p>
        </div>
      )}

      {/* Map location picker */}
      <Sheet open={isMapPickerOpen} onOpenChange={setIsMapPickerOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-xl p-0 bg-cream dark:bg-paper-2 border-line"
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <SheetHeader className="p-4 border-b border-line">
            <SheetTitle className="flex items-center gap-2 text-ink font-sans font-semibold tracking-[-0.01em]">
              <MapTrifold className="w-5 h-5 text-pine-6" weight="regular" />
              Pick a location on the map
            </SheetTitle>
          </SheetHeader>
          <div className="h-[calc(100vh-80px)]">
            <MapLocationPicker
              onSelectLocation={handleMapLocationSelect}
              onCancel={() => setIsMapPickerOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
