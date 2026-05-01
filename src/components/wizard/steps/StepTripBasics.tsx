import { MapPin, X, Path, Flag } from "@phosphor-icons/react";
import { Slider } from "@/components/ui/slider";
import { DatePicker } from "@/components/ui/date-picker";
import { PlaceSearch } from "@/components/PlaceSearch";
import { Mono } from "@/components/redesign";
import { cn } from "@/lib/utils";

interface LocationData {
  id: string;
  name: string;
  lat: number;
  lng: number;
  placeId: string;
}

interface StepTripBasicsProps {
  tripName: string;
  setTripName: (name: string) => void;
  tripNameError: string | null;
  startLocation: LocationData | null;
  setStartLocation: (location: LocationData | null) => void;
  endLocation: LocationData | null;
  setEndLocation: (location: LocationData | null) => void;
  returnToStart: boolean;
  setReturnToStart: (value: boolean) => void;
  onStartLocationSelect: (place: google.maps.places.PlaceResult) => void;
  onEndLocationSelect: (place: google.maps.places.PlaceResult) => void;
  startDate: Date | undefined;
  setStartDate: (date: Date | undefined) => void;
  duration: number[];
  setDuration: (value: number[]) => void;
}

export function StepTripBasics({
  tripName,
  setTripName,
  tripNameError,
  startLocation,
  setStartLocation,
  endLocation,
  setEndLocation,
  returnToStart,
  setReturnToStart,
  onStartLocationSelect,
  onEndLocationSelect,
  startDate,
  setStartDate,
  duration,
  setDuration,
}: StepTripBasicsProps) {
  return (
    <div className="space-y-7">
      <div className="text-center">
        <Mono className="text-pine-6">Step 01 · Basics</Mono>
        <h2 className="font-sans font-bold tracking-[-0.025em] text-ink text-[28px] md:text-[34px] leading-[1.1] mt-2">
          Tell us about the trip.
        </h2>
        <p className="text-[15px] text-ink-3 mt-2">
          The basics — name, where you're starting, when, how long.
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
            accent="water"
            name={startLocation.name}
            onClear={() => setStartLocation(null)}
          />
        )}
      </Field>

      {/* Round trip + end location (conditional) */}
      {startLocation && (
        <div className="space-y-4 animate-fade-in">
          <label className="flex items-center gap-3 cursor-pointer select-none">
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

          {!returnToStart && (
            <Field label="End point" optional hint="Where you'll wrap up your trip.">
              <PlaceSearch
                onPlaceSelect={onEndLocationSelect}
                placeholder="Search for an end location…"
              />
              {endLocation && (
                <SelectedLocationChip
                  icon={Flag}
                  accent="ember"
                  name={endLocation.name}
                  onClear={() => setEndLocation(null)}
                />
              )}
            </Field>
          )}
        </div>
      )}

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
    </div>
  );
}

// Mono-cap label + optional hint, matches the auth form style.
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

// Selected location chip — accent color encodes role (water = start, ember = end).
const SelectedLocationChip = ({
  icon: Icon,
  accent,
  name,
  onClear,
}: {
  icon: typeof MapPin;
  accent: 'water' | 'ember';
  name: string;
  onClear: () => void;
}) => {
  const styles = accent === 'water'
    ? 'bg-water/10 border-water/40 text-water'
    : 'bg-ember/10 border-ember/40 text-ember';
  return (
    <div className={cn('mt-2 flex items-center justify-between gap-3 px-4 py-2.5 rounded-[12px] border', styles)}>
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
};
