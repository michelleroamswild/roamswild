import { useState } from "react";
import { MapPin, X, Path, DotsSixVertical, Plus, Minus, MapTrifold } from "@phosphor-icons/react";
import { Slider } from "@/components/ui/slider";
import { DatePicker } from "@/components/ui/date-picker";
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
import { GeoBounds, DestinationActivity } from "@/types/trip";

interface LocationData {
  id: string;
  name: string;
  lat: number;
  lng: number;
  placeId: string;
  days?: number;
  isRegion?: boolean;
  bounds?: GeoBounds;
  aiActivities?: boolean;
  activities?: DestinationActivity[];
}

interface StepTripBasicsProps {
  tripName: string;
  setTripName: (name: string) => void;
  tripNameError: string | null;
  startLocation: LocationData | null;
  setStartLocation: (location: LocationData | null) => void;
  returnToStart: boolean;
  setReturnToStart: (value: boolean) => void;
  onStartLocationSelect: (place: google.maps.places.PlaceResult) => void;
  destinations: LocationData[];
  setDestinations: (destinations: LocationData[]) => void;
  onAddDestination: (place: google.maps.places.PlaceResult) => void;
  draggedIndex: number | null;
  setDraggedIndex: (index: number | null) => void;
  startDate: Date | undefined;
  setStartDate: (date: Date | undefined) => void;
  duration: number[];
  setDuration: (value: number[]) => void;
  maxDrivingHours: number;
  setMaxDrivingHours: (hours: number) => void;
}

export function StepTripBasics({
  tripName,
  setTripName,
  tripNameError,
  startLocation,
  setStartLocation,
  returnToStart,
  setReturnToStart,
  onStartLocationSelect,
  destinations,
  setDestinations,
  onAddDestination,
  draggedIndex,
  setDraggedIndex,
  startDate,
  setStartDate,
  duration,
  setDuration,
  maxDrivingHours,
  setMaxDrivingHours,
}: StepTripBasicsProps) {
  const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);

  const travelDays = returnToStart ? 1 : 0;
  const totalSpecifiedDays = destinations.reduce((sum, d) => sum + (d.days || 0), 0);
  const availableDays = duration[0] - travelDays;
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

  const handleMapLocationSelect = (location: { lat: number; lng: number; name: string }) => {
    setDestinations([
      ...destinations,
      {
        id: `dest-map-${Date.now()}`,
        name: location.name,
        lat: location.lat,
        lng: location.lng,
        placeId: `map-${Date.now()}`,
        aiActivities: true,
      },
    ]);
    setIsMapPickerOpen(false);
  };

  return (
    <div className="space-y-7">
      <div className="text-center">
        <Mono className="text-pine-6">Trip details</Mono>
        <h2 className="font-sans font-bold tracking-[-0.025em] text-ink text-[28px] md:text-[34px] leading-[1.1] mt-2">
          Tell us about the trip.
        </h2>
        <p className="text-[15px] text-ink-3 mt-2">
          The basics — where, when, and how long you've got.
        </p>
      </div>

      {/* Trip name */}
      <Field label="Trip name" hint="Leave blank to auto-generate from your destinations.">
        <input
          id="trip-name"
          type="text"
          placeholder="e.g. Southwest Desert Adventure"
          value={tripName}
          onChange={(e) => setTripName(e.target.value)}
          className={cn(
            'w-full h-12 px-4 rounded-[14px] border bg-white dark:bg-paper-2 text-ink text-[15px] outline-none placeholder:text-ink-3 transition-colors',
            tripNameError ? 'border-ember focus:border-ember' : 'border-line focus:border-pine-6',
          )}
          autoFocus
        />
        {tripNameError && <p className="text-[13px] text-ember mt-1.5">{tripNameError}</p>}
      </Field>

      {/* Start location */}
      <Field label="Starting point" optional hint="Skip if you're already at your destination.">
        <PlaceSearch
          onPlaceSelect={onStartLocationSelect}
          placeholder="Search for a city or address…"
          defaultValue={startLocation?.name}
        />
        {startLocation && (
          <SelectedLocationChip
            icon={Path}
            name={startLocation.name}
            onClear={() => setStartLocation(null)}
          />
        )}
        {startLocation && (
          <label className="flex items-center gap-3 cursor-pointer select-none mt-3">
            <button
              type="button"
              role="switch"
              aria-checked={returnToStart}
              onClick={() => setReturnToStart(!returnToStart)}
              className={cn(
                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                returnToStart ? 'bg-pine-6' : 'bg-ink-3/30',
              )}
            >
              <span
                className={cn(
                  'inline-block h-5 w-5 rounded-full bg-cream dark:bg-paper-2 transform transition-transform shadow-sm',
                  returnToStart ? 'translate-x-5' : 'translate-x-0.5',
                )}
              />
            </button>
            <span className="text-[14px] text-ink">Return to start (round trip)</span>
          </label>
        )}
      </Field>

      {/* Destinations */}
      <Field
        label="Destinations"
        hint="Add cities, parks, or whole regions — we'll plan the route. Drag to reorder."
      >
        <PlaceSearch
          onPlaceSelect={onAddDestination}
          placeholder="Search a city, park, or region — Moab, Joshua Tree, Oregon Coast…"
          key={destinations.length}
        />
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => setIsMapPickerOpen(true)}
            className="inline-flex items-center gap-1.5 text-[12px] font-mono uppercase tracking-[0.10em] font-semibold text-pine-6 hover:text-pine-5 transition-colors"
          >
            <MapTrifold className="w-3.5 h-3.5" weight="regular" />
            Pick on map
          </button>
        </div>

        {destinations.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <Mono className="text-ink-3">
                {destinations.length} {destinations.length === 1 ? 'destination' : 'destinations'}
              </Mono>
              <Mono className="text-ink-3">
                {remainingDays > 0
                  ? `${remainingDays} ${remainingDays === 1 ? 'day' : 'days'} unassigned`
                  : 'All days assigned'}
              </Mono>
            </div>
            <div className="space-y-1.5">
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
                      'flex items-center gap-3 p-2.5 bg-white dark:bg-paper-2 border rounded-[12px] cursor-move transition-all',
                      dragging ? 'opacity-50 border-pine-6' : 'border-line hover:border-ink-3/40',
                    )}
                  >
                    <DotsSixVertical className="w-4 h-4 text-ink-3 flex-shrink-0" weight="bold" />
                    <div className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-pine-6/10 text-pine-6 flex-shrink-0">
                      <span className="text-[11px] font-mono font-bold">{index + 1}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[14px] font-sans font-semibold tracking-[-0.005em] text-ink truncate">
                          {dest.name}
                        </span>
                        {dest.isRegion && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-water/10 text-water text-[10px] font-mono uppercase tracking-[0.08em] font-semibold flex-shrink-0">
                            Region
                          </span>
                        )}
                      </div>
                    </div>

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
        )}
      </Field>

      {/* Start date */}
      <Field label="Start date" optional hint="Helps us pull weather + golden-hour data for your trip.">
        <DatePicker
          value={startDate}
          onChange={setStartDate}
          placeholder="Pick a date"
        />
      </Field>

      {/* Duration */}
      <Field label="Trip duration" hint="">
        <div className="border border-line bg-white dark:bg-paper-2 rounded-[14px] p-5">
          <div className="flex items-end justify-between mb-4">
            <Mono className="text-ink-2">Days</Mono>
            <div className="flex items-baseline gap-1.5">
              <span className="font-sans font-bold text-ink text-[36px] tracking-[-0.02em] leading-none">
                {duration[0]}
              </span>
              <span className="text-[13px] text-ink-3">{duration[0] === 1 ? 'day' : 'days'}</span>
            </div>
          </div>
          <Slider
            value={duration}
            onValueChange={setDuration}
            min={1}
            max={14}
            step={1}
            className="w-full"
          />
          <div className="flex justify-between mt-2.5 text-[11px] font-mono uppercase tracking-[0.10em] text-ink-3">
            <span>1 day</span>
            <span>14 days</span>
          </div>
        </div>
      </Field>

      {/* Max driving per day */}
      <Field label="Max driving per day" hint="We'll keep daily drives under this when planning the route.">
        <div className="border border-line bg-white dark:bg-paper-2 rounded-[14px] p-5">
          <div className="flex items-end justify-between mb-4">
            <Mono className="text-ink-2">Hours</Mono>
            <div className="flex items-baseline gap-1.5">
              <span className="font-sans font-bold text-ink text-[36px] tracking-[-0.02em] leading-none">
                {maxDrivingHours}
              </span>
              <span className="text-[13px] text-ink-3">{maxDrivingHours === 1 ? 'hr' : 'hrs'}</span>
            </div>
          </div>
          <Slider
            value={[maxDrivingHours]}
            onValueChange={(v) => setMaxDrivingHours(v[0])}
            min={2}
            max={12}
            step={1}
            className="w-full"
          />
          <div className="flex justify-between mt-2.5 text-[11px] font-mono uppercase tracking-[0.10em] text-ink-3">
            <span>2 hrs</span>
            <span>12 hrs</span>
          </div>
        </div>
      </Field>

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

const Field = ({
  label,
  optional,
  hint,
  children,
}: {
  label: string;
  optional?: boolean;
  hint?: string;
  children: React.ReactNode;
}) => (
  <div>
    <div className="flex items-center gap-2 mb-1.5">
      <Mono className="text-ink-2">{label}</Mono>
      {optional && <Mono className="text-ink-3">Optional</Mono>}
    </div>
    {children}
    {hint && <p className="text-[12px] text-ink-3 mt-1.5">{hint}</p>}
  </div>
);

const SelectedLocationChip = ({
  icon: Icon,
  name,
  onClear,
}: {
  icon: typeof MapPin;
  name: string;
  onClear: () => void;
}) => (
  <div className="mt-2 flex items-center justify-between gap-3 px-4 py-2.5 rounded-[12px] border bg-water/10 border-water/40 text-water">
    <div className="flex items-center gap-2 min-w-0">
      <Icon className="w-4 h-4 flex-shrink-0" weight="regular" />
      <span className="text-[14px] font-medium text-ink truncate">{name}</span>
    </div>
    <button
      type="button"
      onClick={onClear}
      className="inline-flex items-center justify-center w-6 h-6 rounded-full text-ink-3 hover:text-ink hover:bg-ink/5 transition-colors flex-shrink-0"
      aria-label="Clear location"
    >
      <X className="w-3.5 h-3.5" weight="bold" />
    </button>
  </div>
);
