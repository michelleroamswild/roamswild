import { useState, useMemo } from "react";
import { DotsSixVertical, Plus, Minus, X, MapPin, MapTrifold, Sparkle, PencilSimple, Lightning } from "@phosphor-icons/react";
import { PlaceSearch } from "@/components/PlaceSearch";
import { MapLocationPicker } from "@/components/MapLocationPicker";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Mono, Pill } from "@/components/redesign";
import { cn } from "@/lib/utils";
import { TravelStyle, GeoBounds, DestinationActivity } from "@/types/trip";

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

interface StepDestinationsProps {
  destinations: LocationData[];
  setDestinations: (destinations: LocationData[]) => void;
  duration: number;
  returnToStart: boolean;
  startLocation: LocationData | null;
  endLocation: LocationData | null;
  onAddDestination: (place: google.maps.places.PlaceResult) => void;
  draggedIndex: number | null;
  setDraggedIndex: (index: number | null) => void;
  travelStyle: TravelStyle;
  setTravelStyle: (style: TravelStyle) => void;
  maxDrivingHours: number;
  setMaxDrivingHours: (hours: number) => void;
}

// Rough drive-time estimate (haversine, ~85 km/h average). Good enough as a
// gate for whether to surface long-drive prefs — not for actual ETAs.
const ESTIMATED_KMH = 85;
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const LONG_DRIVE_THRESHOLD_HOURS = 6;

export function StepDestinations({
  destinations,
  setDestinations,
  duration,
  returnToStart,
  startLocation,
  endLocation,
  onAddDestination,
  draggedIndex,
  setDraggedIndex,
  travelStyle,
  setTravelStyle,
  maxDrivingHours,
  setMaxDrivingHours,
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

  // Estimate total drive time so we know whether to surface route prefs.
  const estimatedDriveHours = useMemo(() => {
    const points: Array<{ lat: number; lng: number }> = [];
    if (startLocation) points.push(startLocation);
    destinations.forEach((d) => points.push(d));
    if (returnToStart && startLocation) points.push(startLocation);
    else if (endLocation) points.push(endLocation);

    if (points.length < 2) return 0;
    let km = 0;
    for (let i = 1; i < points.length; i++) {
      km += haversineKm(points[i - 1], points[i]);
    }
    return km / ESTIMATED_KMH;
  }, [startLocation, endLocation, destinations, returnToStart]);

  const showRoutePrefs = estimatedDriveHours >= LONG_DRIVE_THRESHOLD_HOURS;

  const handleRemoveDestination = (id: string) => {
    setDestinations(destinations.filter((d) => d.id !== id));
  };

  const handleDestinationDaysChange = (id: string, days: number) => {
    setDestinations(destinations.map((d) => (d.id === id ? { ...d, days } : d)));
  };

  const handleToggleAiActivities = (id: string, aiActivities: boolean) => {
    setDestinations(destinations.map((d) => (d.id === id ? { ...d, aiActivities } : d)));
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
      { id: `dest-manual-${Date.now()}`, name, lat, lng, placeId: `manual-${Date.now()}`, aiActivities: true },
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
        aiActivities: true,
      },
    ]);
    setIsMapPickerOpen(false);
  };

  return (
    <div className="space-y-7">
      <div className="text-center">
        <Mono className="text-pine-6">Destinations</Mono>
        <h2 className="font-sans font-bold tracking-[-0.025em] text-ink text-[28px] md:text-[34px] leading-[1.1] mt-2">
          Where are you headed?
        </h2>
        <p className="text-[15px] text-ink-3 mt-2">
          Add cities, parks, or whole regions — we'll plan the route. Drag to reorder.
        </p>
      </div>

      {/* Add destination */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <Mono className="text-ink-2">Add a destination</Mono>
        </div>
        <PlaceSearch
          onPlaceSelect={onAddDestination}
          placeholder="Search a city, park, or region — Moab, Joshua Tree, Oregon Coast…"
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
              const aiActivities = dest.aiActivities ?? true;
              return (
                <div
                  key={dest.id}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    'bg-white dark:bg-paper-2 border rounded-[12px] transition-all',
                    dragging ? 'opacity-50 border-pine-6' : 'border-line hover:border-ink-3/40',
                  )}
                >
                  {/* Top row */}
                  <div className="flex items-center gap-3 p-3 cursor-move">
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
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-water/10 text-water text-[10px] font-mono uppercase tracking-[0.08em] font-semibold flex-shrink-0">
                            Region
                          </span>
                        )}
                      </div>
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

                  {/* Activities source toggle */}
                  <div className="px-3 pb-3 -mt-1">
                    <div className="ml-7 flex items-center gap-1.5 p-1 rounded-[10px] bg-paper-2 dark:bg-paper-3 border border-line/60 w-fit">
                      <ToggleSeg
                        active={aiActivities}
                        onClick={() => handleToggleAiActivities(dest.id, true)}
                        icon={Sparkle}
                        label="AI fills activities"
                        accent="water"
                      />
                      <ToggleSeg
                        active={!aiActivities}
                        onClick={() => handleToggleAiActivities(dest.id, false)}
                        icon={PencilSimple}
                        label="I'll choose"
                        accent="clay"
                      />
                    </div>
                  </div>
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

      {/* Route preferences — surfaced when total estimated drive is long */}
      {showRoutePrefs && (
        <div className="space-y-5 pt-2 border-t border-line animate-fade-in">
          <div className="pt-5">
            <Mono className="text-ink-2 block">Route preferences</Mono>
            <p className="text-[13px] text-ink-3 mt-1">
              That's roughly {Math.round(estimatedDriveHours)} hrs of driving total — let us know how you'd like to handle it.
            </p>
          </div>

          {/* Travel style */}
          <fieldset className="space-y-3">
            <Mono className="text-ink-3 block">Travel style</Mono>
            <div className="grid sm:grid-cols-2 gap-3">
              <TravelStyleCard
                selected={travelStyle === 'direct'}
                onClick={() => setTravelStyle('direct')}
                icon={Lightning}
                title="Drive direct"
                description="Take the fastest route — minimal detours, more time at destinations."
                accent="water"
              />
              <TravelStyleCard
                selected={travelStyle === 'scenic'}
                onClick={() => setTravelStyle('scenic')}
                icon={MapTrifold}
                title="Find spots along the way"
                description="Add cool stops between destinations — viewpoints, towns, hot springs."
                accent="sage"
              />
            </div>
          </fieldset>

          {/* Max driving hours per day */}
          <fieldset>
            <div className="border border-line bg-white dark:bg-paper-2 rounded-[14px] p-5">
              <div className="flex items-end justify-between mb-4">
                <div>
                  <Mono className="text-ink-2">Max driving per day</Mono>
                  <p className="text-[12px] text-ink-3 mt-1">We'll keep daily drives under this.</p>
                </div>
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
          </fieldset>
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

// Compact two-state segmented toggle for the per-destination activity source.
const ToggleSeg = ({
  active,
  onClick,
  icon: Icon,
  label,
  accent,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Sparkle;
  label: string;
  accent: 'water' | 'clay';
}) => {
  const accentBg = accent === 'water' ? 'bg-water/10 text-water' : 'bg-clay/10 text-clay';
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] text-[12px] font-mono uppercase tracking-[0.06em] font-semibold transition-colors',
        active ? accentBg : 'text-ink-3 hover:text-ink',
      )}
    >
      <Icon className="w-3.5 h-3.5" weight="regular" />
      {label}
    </button>
  );
};

// Two-card chooser for travel style.
const TravelStyleCard = ({
  selected,
  onClick,
  icon: Icon,
  title,
  description,
  accent,
}: {
  selected: boolean;
  onClick: () => void;
  icon: typeof Lightning;
  title: string;
  description: string;
  accent: 'water' | 'sage';
}) => {
  const accentMap = {
    water: { iconBg: 'bg-water/15', iconText: 'text-water', selectedBorder: 'border-water', selectedBg: 'bg-water/[0.06]' },
    sage:  { iconBg: 'bg-sage/15',  iconText: 'text-sage',  selectedBorder: 'border-sage',  selectedBg: 'bg-sage/[0.06]' },
  };
  const a = accentMap[accent];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-start text-left p-4 rounded-[14px] border bg-white dark:bg-paper-2 transition-all',
        'hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(29,34,24,.06),0_2px_6px_rgba(29,34,24,.03)]',
        selected ? `${a.selectedBorder} ${a.selectedBg}` : 'border-line',
      )}
    >
      <div className={cn('w-10 h-10 rounded-[10px] flex items-center justify-center mb-3', a.iconBg, a.iconText)}>
        <Icon className="w-5 h-5" weight="regular" />
      </div>
      <h4 className="text-[15px] font-sans font-semibold tracking-[-0.005em] text-ink mb-1">
        {title}
      </h4>
      <p className="text-[13px] text-ink-3 leading-[1.5]">{description}</p>
    </button>
  );
};
