import { useState, useEffect, useCallback } from 'react';
import {
  MapPin,
  MagnifyingGlass,
  Tent,
  Plus,
  X,
  DotsSixVertical,
  MapTrifold,
  Path,
  Camera,
  Compass,
  SpinnerGap,
  Mountains,
  Moon,
  Sun,
  Star,
} from '@phosphor-icons/react';
import { PlaceSearch } from '@/components/PlaceSearch';
import { TripStop } from '@/types/trip';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MapLocationPicker } from '@/components/MapLocationPicker';
import { useAreaRecommendations, AreaRecommendation } from '@/hooks/use-area-recommendations';
import { CampsiteSelectorPanel } from '../CampsiteSelectorPanel';
import { GoogleMap } from '@/components/GoogleMap';
import { Marker, InfoWindow } from '@react-google-maps/api';
import { createMarkerIcon, createSimpleMarkerIcon } from '@/utils/mapMarkers';
import { Mono, Pill } from '@/components/redesign';
import { cn } from '@/lib/utils';

interface AreaData {
  name: string;
  lat: number;
  lng: number;
  placeId: string;
}

interface StepDayBuilderProps {
  dayNumber: number;
  totalDays: number;
  area: AreaData | null;
  setArea: (area: AreaData | null) => void;
  campsite: TripStop | null;
  setCampsite: (campsite: TripStop | null) => void;
  stops: TripStop[];
  setStops: (stops: TripStop[]) => void;
}

const STOP_TONES: Record<string, { bg: string; text: string; Icon: typeof Path }> = {
  hike:      { bg: 'bg-sage/15',  text: 'text-sage',  Icon: Path },
  viewpoint: { bg: 'bg-ember/15', text: 'text-ember', Icon: Camera },
  attraction:{ bg: 'bg-water/15', text: 'text-water', Icon: MapPin },
  default:   { bg: 'bg-pine-6/12', text: 'text-pine-6', Icon: MapPin },
};

const REC_TONES: Record<AreaRecommendation['type'], { bg: string; text: string; Icon: typeof Path }> = {
  trail:      { bg: 'bg-sage/15',  text: 'text-sage',  Icon: Path },
  viewpoint:  { bg: 'bg-ember/15', text: 'text-ember', Icon: Camera },
  campground: { bg: 'bg-clay/15',  text: 'text-clay',  Icon: Tent },
  poi:        { bg: 'bg-water/15', text: 'text-water', Icon: Mountains },
};

export function StepDayBuilder({
  dayNumber,
  totalDays,
  area,
  setArea,
  campsite,
  setCampsite,
  stops,
  setStops,
}: StepDayBuilderProps) {
  const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);
  const [isCampsiteSelectorOpen, setIsCampsiteSelectorOpen] = useState(false);
  const [isAreaChangeOpen, setIsAreaChangeOpen] = useState(false);
  const [isAreaMapPickerOpen, setIsAreaMapPickerOpen] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<AreaRecommendation | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);

  const { recommendations, loading: loadingRecs, fetchRecommendations, clearRecommendations } = useAreaRecommendations();

  useEffect(() => {
    if (area) fetchRecommendations(area.lat, area.lng);
    else clearRecommendations();
  }, [area, fetchRecommendations, clearRecommendations]);

  useEffect(() => {
    if (map && area && recommendations.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      bounds.extend({ lat: area.lat, lng: area.lng });
      recommendations.forEach((rec) => bounds.extend({ lat: rec.lat, lng: rec.lng }));
      stops.forEach((stop) => bounds.extend(stop.coordinates));
      if (campsite) bounds.extend(campsite.coordinates);
      map.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
    }
  }, [map, area, recommendations, stops, campsite]);

  const handleMapLoad = useCallback((mapInstance: google.maps.Map) => {
    setMap(mapInstance);
  }, []);

  const handleAreaSelect = (place: google.maps.places.PlaceResult) => {
    if (place.geometry?.location && place.place_id) {
      setArea({
        name: place.name || place.formatted_address || 'Selected Area',
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
        placeId: place.place_id,
      });
    }
  };

  const handleMapLocationSelect = (location: { lat: number; lng: number; name: string }) => {
    setArea({
      name: location.name,
      lat: location.lat,
      lng: location.lng,
      placeId: `map-${Date.now()}`,
    });
    setIsMapPickerOpen(false);
  };

  const handleRemoveStop = (stopId: string) => setStops(stops.filter((s) => s.id !== stopId));

  const handleDragStart = (index: number) => setDraggedIndex(index);

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newStops = [...stops];
    const draggedItem = newStops[draggedIndex];
    newStops.splice(draggedIndex, 1);
    newStops.splice(index, 0, draggedItem);
    setStops(newStops);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => setDraggedIndex(null);

  const handleAddRecommendation = (rec: AreaRecommendation) => {
    if (stops.some((s) => s.name === rec.name)) return;

    const newStop: TripStop = {
      id: `stop-${Date.now()}-${rec.id}`,
      name: rec.name,
      type: rec.type === 'trail' ? 'hike' : rec.type === 'viewpoint' ? 'viewpoint' : 'attraction',
      coordinates: { lat: rec.lat, lng: rec.lng },
      duration: rec.type === 'trail' ? '2-3 hours' : rec.type === 'viewpoint' ? '30 min' : '1 hour',
      day: dayNumber,
    };
    setStops([...stops, newStop]);
    setSelectedMarker(null);
  };

  const getMarkerType = (type: AreaRecommendation['type']) => {
    switch (type) {
      case 'trail': return 'hike';
      case 'viewpoint': return 'photo';
      case 'campground': return 'camp';
      default: return 'default';
    }
  };

  const isAdded = (rec: AreaRecommendation) => stops.some((s) => s.name === rec.name);

  // No area selected — empty state
  if (!area) {
    return (
      <div className="space-y-5 max-w-md mx-auto font-sans">
        <div className="text-center mb-6">
          <Mono className="text-pine-6">Day {dayNumber} of {totalDays}</Mono>
          <h2 className="text-[24px] font-sans font-bold tracking-[-0.02em] text-ink mt-1.5">
            Where are you heading?
          </h2>
          <p className="text-[14px] text-ink-3 mt-1.5">
            Pick the area you want to explore on this day.
          </p>
        </div>

        <div className="space-y-2.5">
          <Mono className="text-ink-2 inline-flex items-center gap-1.5">
            <MagnifyingGlass className="w-3 h-3" weight="regular" />
            Search for an area
          </Mono>
          <PlaceSearch onPlaceSelect={handleAreaSelect} placeholder="Cities, parks, regions…" />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 border-t border-line" />
          <Mono className="text-ink-3">Or</Mono>
          <div className="flex-1 border-t border-line" />
        </div>

        <Pill
          variant="ghost"
          mono={false}
          onClick={() => setIsMapPickerOpen(true)}
          className="!w-full !justify-center"
        >
          <MapTrifold className="w-3.5 h-3.5" weight="regular" />
          Browse the map
        </Pill>

        <Sheet open={isMapPickerOpen} onOpenChange={setIsMapPickerOpen}>
          <SheetContent
            side="right"
            className="w-full sm:max-w-xl p-0 bg-paper border-line font-sans"
            onInteractOutside={(e) => e.preventDefault()}
            onPointerDownOutside={(e) => e.preventDefault()}
          >
            <SheetHeader className="p-4 border-b border-line bg-cream">
              <Mono className="text-pine-6 inline-flex items-center gap-1.5">
                <MapTrifold className="w-3.5 h-3.5" weight="regular" />
                Pick area on map
              </Mono>
              <SheetTitle className="text-[18px] font-sans font-bold tracking-[-0.015em] text-ink mt-1">
                Drop a pin to start.
              </SheetTitle>
            </SheetHeader>
            <div className="h-[calc(100vh-92px)]">
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

  // Area selected
  return (
    <>
      <div className="h-full grid lg:grid-cols-2 overflow-hidden bg-paper text-ink font-sans">
        {/* Map */}
        <div className="order-2 lg:order-1 h-[400px] lg:h-full relative">
          <div className="relative w-full h-full">
            <GoogleMap
              center={{ lat: area.lat, lng: area.lng }}
              zoom={10}
              className="w-full h-full"
              onLoad={handleMapLoad}
              options={{
                mapTypeId: 'hybrid',
                mapTypeControl: true,
                mapTypeControlOptions: { position: google.maps.ControlPosition?.TOP_RIGHT },
              }}
            >
              <Marker
                position={{ lat: area.lat, lng: area.lng }}
                icon={createMarkerIcon('start', { size: 32 }) || undefined}
                title={area.name}
              />

              {recommendations.map((rec) => (
                <Marker
                  key={rec.id}
                  position={{ lat: rec.lat, lng: rec.lng }}
                  icon={
                    createMarkerIcon(getMarkerType(rec.type), {
                      size: 32,
                      isActive: selectedMarker?.id === rec.id,
                      customColor: isAdded(rec) ? '#9ca3af' : undefined,
                    }) || undefined
                  }
                  onClick={() => setSelectedMarker(rec)}
                  opacity={isAdded(rec) ? 0.5 : 1}
                />
              ))}

              {stops.map((stop, index) => (
                <Marker
                  key={stop.id}
                  position={stop.coordinates}
                  icon={
                    createMarkerIcon(stop.type === 'hike' ? 'hike' : stop.type === 'viewpoint' ? 'photo' : 'default', {
                      size: 36,
                      isActive: true,
                    }) || undefined
                  }
                  label={{
                    text: String(index + 1),
                    color: '#ffffff',
                    fontSize: '12px',
                    fontWeight: 'bold',
                  }}
                />
              ))}

              {campsite && (
                <Marker
                  position={campsite.coordinates}
                  icon={createSimpleMarkerIcon('camp', { size: 8, isActive: true }) || undefined}
                  title={campsite.name}
                />
              )}

              {selectedMarker && (
                <InfoWindow
                  position={{ lat: selectedMarker.lat, lng: selectedMarker.lng }}
                  onCloseClick={() => setSelectedMarker(null)}
                >
                  <div className="p-1 min-w-[200px] font-sans">
                    <p className="text-[14px] font-semibold tracking-[-0.005em] text-ink">
                      {selectedMarker.name}
                    </p>
                    <div className="flex items-center gap-2 text-[12px] text-ink-3 mt-1 mb-2.5">
                      <span className="capitalize">{selectedMarker.type}</span>
                      {selectedMarker.rating && (
                        <span className="inline-flex items-center gap-0.5 text-clay">
                          <Star className="w-3 h-3 fill-clay" weight="fill" />
                          {selectedMarker.rating.toFixed(1)}
                        </span>
                      )}
                    </div>
                    {isAdded(selectedMarker) ? (
                      <p className="text-[12px] font-mono uppercase tracking-[0.10em] font-semibold text-pine-6">
                        Added to itinerary
                      </p>
                    ) : (
                      <button
                        onClick={() => handleAddRecommendation(selectedMarker)}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full bg-pine-6 text-cream text-[12px] font-semibold tracking-[0.01em] hover:bg-pine-5 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" weight="regular" />
                        Add to itinerary
                      </button>
                    )}
                  </div>
                </InfoWindow>
              )}
            </GoogleMap>

            {loadingRecs && (
              <div className="absolute inset-0 bg-paper/40 flex items-center justify-center">
                <div className="bg-white border border-line rounded-[14px] p-3.5 shadow-[0_8px_22px_rgba(29,34,24,.10)] flex items-center gap-2.5">
                  <SpinnerGap className="w-4 h-4 animate-spin text-pine-6" />
                  <Mono className="text-pine-6">Finding recommendations…</Mono>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="order-1 lg:order-2 p-4 md:p-6 space-y-4 lg:h-full lg:overflow-y-auto bg-paper">
          {/* Day header */}
          <div>
            <Mono className="text-pine-6">Day {dayNumber} of {totalDays}</Mono>
            <h2 className="text-[22px] font-sans font-bold tracking-[-0.02em] text-ink mt-1 leading-[1.15]">
              {area.name}
            </h2>
            <button
              onClick={() => setIsAreaChangeOpen(true)}
              className="mt-1 inline-flex items-center gap-1 text-[12px] font-mono uppercase tracking-[0.10em] font-semibold text-pine-6 hover:underline"
            >
              <MapPin className="w-3 h-3" weight="regular" />
              Change location
            </button>
          </div>

          {/* Itinerary card */}
          <div className="bg-white border border-line rounded-[14px] overflow-hidden">
            <div className="px-4 py-3 border-b border-line bg-cream">
              <Mono className="text-clay inline-flex items-center gap-1.5">
                <Sun className="w-3 h-3" weight="regular" />
                Day stops
              </Mono>
            </div>

            <div className="p-4 space-y-3">
              {stops.length === 0 ? (
                <div className="text-center py-6 px-4 border border-dashed border-line rounded-[12px]">
                  <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-sage/15 text-sage mb-2">
                    <MapPin className="w-4 h-4" weight="regular" />
                  </div>
                  <p className="text-[13px] font-sans font-semibold text-ink">No stops yet</p>
                  <Mono className="text-ink-3 mt-1 block">Tap pins on the map to add</Mono>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {stops.map((stop, index) => {
                    const tone = STOP_TONES[stop.type] || STOP_TONES.default;
                    const Icon = tone.Icon;
                    return (
                      <div
                        key={stop.id}
                        draggable
                        onDragStart={() => handleDragStart(index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragEnd={handleDragEnd}
                        className={cn(
                          'flex items-center gap-2 p-2.5 bg-cream rounded-[10px] border border-line transition-all cursor-move',
                          draggedIndex === index ? 'opacity-50 border-pine-6' : 'hover:border-ink-3/40',
                        )}
                      >
                        <DotsSixVertical className="w-4 h-4 text-ink-3 flex-shrink-0" weight="regular" />
                        <div className={cn('inline-flex items-center justify-center w-7 h-7 rounded-[8px] flex-shrink-0', tone.bg, tone.text)}>
                          <Icon className="w-4 h-4" weight="regular" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-sans font-semibold tracking-[-0.005em] text-ink truncate">
                            {stop.name}
                          </p>
                          {stop.duration && <Mono className="text-ink-3 mt-0.5 block">{stop.duration}</Mono>}
                        </div>
                        <button
                          onClick={() => handleRemoveStop(stop.id)}
                          aria-label="Remove stop"
                          className="inline-flex items-center justify-center w-7 h-7 rounded-full text-ink-3 hover:text-ember hover:bg-ember/10 transition-colors flex-shrink-0"
                        >
                          <X className="w-3.5 h-3.5" weight="regular" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-line" />

            {/* Tonight's Camp */}
            <div className="p-4 bg-cream/40">
              <Mono className="text-water inline-flex items-center gap-1.5 mb-2.5">
                <Moon className="w-3 h-3" weight="regular" />
                Tonight's camp
              </Mono>

              {campsite ? (
                <div className="flex items-center gap-2.5 p-2.5 bg-white rounded-[10px] border border-line">
                  <div className="w-9 h-9 rounded-[8px] bg-clay/15 text-clay flex items-center justify-center flex-shrink-0">
                    <Tent className="w-4 h-4" weight="regular" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-sans font-semibold tracking-[-0.005em] text-ink truncate">
                      {campsite.name}
                    </p>
                  </div>
                  <Pill variant="ghost" sm mono={false} onClick={() => setIsCampsiteSelectorOpen(true)}>
                    Change
                  </Pill>
                </div>
              ) : (
                <Pill
                  variant="ghost"
                  mono={false}
                  onClick={() => setIsCampsiteSelectorOpen(true)}
                  className="!w-full !justify-center"
                >
                  <Tent className="w-3.5 h-3.5" weight="regular" />
                  Select campsite
                </Pill>
              )}
            </div>
          </div>

          {/* Quick add */}
          {recommendations.length > 0 && (
            <div className="space-y-2.5">
              <Mono className="text-ink-2 inline-flex items-center gap-1.5">
                <Compass className="w-3 h-3" weight="regular" />
                Quick add
              </Mono>
              <div className="flex flex-wrap gap-1.5">
                {recommendations.slice(0, 6).map((rec) => {
                  const tone = REC_TONES[rec.type] || REC_TONES.poi;
                  const Icon = tone.Icon;
                  const added = isAdded(rec);
                  return (
                    <button
                      key={rec.id}
                      onClick={() => handleAddRecommendation(rec)}
                      disabled={added}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-sans font-semibold tracking-[0.01em] transition-all border',
                        added
                          ? 'bg-pine-6/10 border-pine-6/30 text-pine-6 cursor-not-allowed'
                          : `${tone.bg} ${tone.text} border-transparent hover:opacity-85`,
                      )}
                    >
                      <Icon className="w-3 h-3" weight="regular" />
                      <span className="truncate max-w-[120px]">{rec.name}</span>
                      {!added && <Plus className="w-3 h-3" weight="regular" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Campsite Selector Panel */}
      <CampsiteSelectorPanel
        isOpen={isCampsiteSelectorOpen}
        onClose={() => setIsCampsiteSelectorOpen(false)}
        onSelectCampsite={setCampsite}
        areaCenter={area ? { lat: area.lat, lng: area.lng } : undefined}
        areaName={area?.name}
        dayNumber={dayNumber}
      />

      {/* Map picker for adding stops */}
      <Sheet open={isMapPickerOpen} onOpenChange={setIsMapPickerOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-xl p-0 bg-paper border-line font-sans"
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <SheetHeader className="p-4 border-b border-line bg-cream">
            <Mono className="text-pine-6 inline-flex items-center gap-1.5">
              <MapTrifold className="w-3.5 h-3.5" weight="regular" />
              Add a stop
            </Mono>
            <SheetTitle className="text-[18px] font-sans font-bold tracking-[-0.015em] text-ink mt-1">
              Drop a pin on the map.
            </SheetTitle>
          </SheetHeader>
          <div className="h-[calc(100vh-92px)]">
            <MapLocationPicker
              onSelectLocation={(location) => {
                const newStop: TripStop = {
                  id: `stop-${Date.now()}`,
                  name: location.name,
                  type: 'viewpoint',
                  coordinates: { lat: location.lat, lng: location.lng },
                  day: dayNumber,
                };
                setStops([...stops, newStop]);
                setIsMapPickerOpen(false);
              }}
              onCancel={() => setIsMapPickerOpen(false)}
              initialCenter={area ? { lat: area.lat, lng: area.lng } : undefined}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Change Area Dialog */}
      <Dialog open={isAreaChangeOpen} onOpenChange={setIsAreaChangeOpen}>
        <DialogContent className="sm:max-w-md border-line bg-white rounded-[18px]">
          <DialogHeader>
            <Mono className="text-pine-6 inline-flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" weight="regular" />
              Change location
            </Mono>
            <DialogTitle className="text-[20px] font-sans font-bold tracking-[-0.015em] text-ink mt-1 leading-[1.15]">
              Pick a new area for this day.
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Mono className="text-ink-2 block">Search for a new area</Mono>
              <PlaceSearch
                onPlaceSelect={(place) => {
                  if (place.geometry?.location && place.place_id) {
                    setArea({
                      name: place.name || place.formatted_address || 'Selected Area',
                      lat: place.geometry.location.lat(),
                      lng: place.geometry.location.lng(),
                      placeId: place.place_id,
                    });
                    setIsAreaChangeOpen(false);
                  }
                }}
                placeholder="Cities, parks, regions…"
              />
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 border-t border-line" />
              <Mono className="text-ink-3">Or</Mono>
              <div className="flex-1 border-t border-line" />
            </div>

            <Pill
              variant="ghost"
              mono={false}
              onClick={() => {
                setIsAreaChangeOpen(false);
                setIsAreaMapPickerOpen(true);
              }}
              className="!w-full !justify-center"
            >
              <MapTrifold className="w-3.5 h-3.5" weight="regular" />
              Browse the map
            </Pill>
          </div>
        </DialogContent>
      </Dialog>

      {/* Area Map Picker */}
      <Sheet open={isAreaMapPickerOpen} onOpenChange={setIsAreaMapPickerOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-xl p-0 bg-paper border-line font-sans"
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <SheetHeader className="p-4 border-b border-line bg-cream">
            <Mono className="text-pine-6 inline-flex items-center gap-1.5">
              <MapTrifold className="w-3.5 h-3.5" weight="regular" />
              Pick area on map
            </Mono>
            <SheetTitle className="text-[18px] font-sans font-bold tracking-[-0.015em] text-ink mt-1">
              Drop a pin to switch.
            </SheetTitle>
          </SheetHeader>
          <div className="h-[calc(100vh-92px)]">
            <MapLocationPicker
              onSelectLocation={(location) => {
                setArea({
                  name: location.name,
                  lat: location.lat,
                  lng: location.lng,
                  placeId: `map-${Date.now()}`,
                });
                setIsAreaMapPickerOpen(false);
              }}
              onCancel={() => setIsAreaMapPickerOpen(false)}
              initialCenter={area ? { lat: area.lat, lng: area.lng } : undefined}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
