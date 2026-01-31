import { useState, useEffect, useCallback } from "react";
import { MapPin, MagnifyingGlass, Tent, Plus, X, DotsSixVertical, MapTrifold, Path, Camera, Compass, SpinnerGap, Mountains, Tree, Moon, Sun, Star } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { PlaceSearch } from "@/components/PlaceSearch";
import { TripStop } from "@/types/trip";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MapLocationPicker } from "@/components/MapLocationPicker";
import { useAreaRecommendations, AreaRecommendation } from "@/hooks/use-area-recommendations";
import { CampsiteSelectorPanel } from "../CampsiteSelectorPanel";
import { GoogleMap } from "@/components/GoogleMap";
import { Marker, InfoWindow } from "@react-google-maps/api";
import { createMarkerIcon } from "@/utils/mapMarkers";

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

  // Recommendations hook
  const { recommendations, loading: loadingRecs, fetchRecommendations, clearRecommendations } = useAreaRecommendations();

  // Fetch recommendations when area changes
  useEffect(() => {
    if (area) {
      fetchRecommendations(area.lat, area.lng);
    } else {
      clearRecommendations();
    }
  }, [area, fetchRecommendations, clearRecommendations]);

  // Fit map to show all markers
  useEffect(() => {
    if (map && area && recommendations.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      bounds.extend({ lat: area.lat, lng: area.lng });
      recommendations.forEach(rec => {
        bounds.extend({ lat: rec.lat, lng: rec.lng });
      });
      stops.forEach(stop => {
        bounds.extend(stop.coordinates);
      });
      if (campsite) {
        bounds.extend(campsite.coordinates);
      }
      map.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
    }
  }, [map, area, recommendations, stops, campsite]);

  const handleMapLoad = useCallback((mapInstance: google.maps.Map) => {
    setMap(mapInstance);
  }, []);

  const handleAreaSelect = (place: google.maps.places.PlaceResult) => {
    if (place.geometry?.location && place.place_id) {
      setArea({
        name: place.name || place.formatted_address || "Selected Area",
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

  const handleRemoveStop = (stopId: string) => {
    setStops(stops.filter(s => s.id !== stopId));
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

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

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  // Convert a recommendation to a TripStop and add it
  const handleAddRecommendation = (rec: AreaRecommendation) => {
    // Check if already added
    if (stops.some(s => s.name === rec.name)) {
      return;
    }

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

  // Get marker type based on recommendation type
  const getMarkerType = (type: AreaRecommendation['type']) => {
    switch (type) {
      case 'trail':
        return 'hike';
      case 'viewpoint':
        return 'photo';
      case 'campground':
        return 'camp';
      default:
        return 'default';
    }
  };

  // Get icon for stop type
  const getStopIcon = (type: string) => {
    switch (type) {
      case 'hike':
        return <Path className="w-4 h-4" />;
      case 'viewpoint':
        return <Camera className="w-4 h-4" />;
      default:
        return <MapPin className="w-4 h-4" />;
    }
  };

  // Check if a recommendation is already added
  const isAdded = (rec: AreaRecommendation) => stops.some(s => s.name === rec.name);

  // If no area selected, show area selection UI
  if (!area) {
    return (
      <div className="space-y-6 max-w-md mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-display font-bold text-foreground mb-2">
            Day {dayNumber} of {totalDays}
          </h2>
          <p className="text-muted-foreground">
            Where are you heading?
          </p>
        </div>

        {/* Area Search */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MagnifyingGlass className="w-4 h-4" />
            <span>Search for an area to explore</span>
          </div>
          <PlaceSearch
            onPlaceSelect={handleAreaSelect}
            placeholder="Search cities, parks, regions..."
          />
        </div>

        {/* Or browse map */}
        <div className="text-center">
          <span className="text-sm text-muted-foreground">or</span>
        </div>

        <Button
          variant="outline"
          className="w-full"
          onClick={() => setIsMapPickerOpen(true)}
        >
          <MapTrifold className="w-4 h-4 mr-2" />
          Browse the map
        </Button>

        {/* Map Picker Sheet */}
        <Sheet open={isMapPickerOpen} onOpenChange={setIsMapPickerOpen}>
          <SheetContent
            side="right"
            className="w-full sm:max-w-xl p-0"
            onInteractOutside={(e) => e.preventDefault()}
            onPointerDownOutside={(e) => e.preventDefault()}
          >
            <SheetHeader className="p-4 border-b border-border">
              <SheetTitle className="flex items-center gap-2">
                <MapTrifold className="w-5 h-5" />
                Pick Area on Map
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

  // Area selected - show map + itinerary layout
  return (
    <>
      <div className="h-full grid lg:grid-cols-2 overflow-hidden">
      {/* Left Column - Map */}
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
                mapTypeControlOptions: {
                  position: google.maps.ControlPosition?.TOP_RIGHT,
                },
              }}
            >
              {/* Area center marker */}
              <Marker
                position={{ lat: area.lat, lng: area.lng }}
                icon={createMarkerIcon('start', { size: 32 }) || undefined}
                title={area.name}
              />

              {/* Recommendation markers */}
              {recommendations.map(rec => (
                <Marker
                  key={rec.id}
                  position={{ lat: rec.lat, lng: rec.lng }}
                  icon={createMarkerIcon(getMarkerType(rec.type), {
                    size: 32,
                    isActive: selectedMarker?.id === rec.id,
                    customColor: isAdded(rec) ? '#9ca3af' : undefined
                  }) || undefined}
                  onClick={() => setSelectedMarker(rec)}
                  opacity={isAdded(rec) ? 0.5 : 1}
                />
              ))}

              {/* Stops already added */}
              {stops.map((stop, index) => (
                <Marker
                  key={stop.id}
                  position={stop.coordinates}
                  icon={createMarkerIcon(stop.type === 'hike' ? 'hike' : stop.type === 'viewpoint' ? 'photo' : 'default', {
                    size: 36,
                    isActive: true
                  }) || undefined}
                  label={{
                    text: String(index + 1),
                    color: '#ffffff',
                    fontSize: '12px',
                    fontWeight: 'bold'
                  }}
                />
              ))}

              {/* Campsite marker */}
              {campsite && (
                <Marker
                  position={campsite.coordinates}
                  icon={createMarkerIcon('camp', { size: 36, isActive: true }) || undefined}
                  title={campsite.name}
                />
              )}

              {/* InfoWindow for selected marker */}
              {selectedMarker && (
                <InfoWindow
                  position={{ lat: selectedMarker.lat, lng: selectedMarker.lng }}
                  onCloseClick={() => setSelectedMarker(null)}
                >
                  <div className="p-2 min-w-[200px]">
                    <p className="font-semibold text-gray-900 mb-1">{selectedMarker.name}</p>
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                      <span className="capitalize">{selectedMarker.type}</span>
                      {selectedMarker.rating && (
                        <span className="flex items-center gap-1 text-amber-600">
                          <Star className="w-3 h-3" weight="fill" />
                          {selectedMarker.rating.toFixed(1)}
                        </span>
                      )}
                    </div>
                    {isAdded(selectedMarker) ? (
                      <p className="text-sm text-green-600 font-medium">Added to itinerary</p>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleAddRecommendation(selectedMarker)}
                        className="w-full"
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Add to Itinerary
                      </Button>
                    )}
                  </div>
                </InfoWindow>
              )}
            </GoogleMap>

            {/* Loading overlay */}
            {loadingRecs && (
              <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
                <div className="bg-card rounded-lg p-4 shadow-lg flex items-center gap-3">
                  <SpinnerGap className="w-5 h-5 animate-spin text-primary" />
                  <span className="text-sm">Finding recommendations...</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Itinerary */}
        <div className="order-1 lg:order-2 p-4 md:p-6 space-y-4 lg:h-full lg:overflow-y-auto">
          {/* Day Header */}
          <div className="mb-2">
            <h2 className="text-2xl font-display font-bold text-foreground">
              Day {dayNumber} of {totalDays}
            </h2>
            <div className="flex items-center gap-2 text-muted-foreground mt-1">
              <MapPin className="w-4 h-4" />
              <span>{area.name}</span>
              <button
                onClick={() => setIsAreaChangeOpen(true)}
                className="text-xs text-primary hover:underline ml-2"
              >
                Change
              </button>
            </div>
          </div>

          <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Sun className="w-4 h-4" />
            Itinerary
          </h3>

          <div className="bg-card border border-border rounded-lg overflow-hidden">
            {/* Morning/Day Activities */}
            <div className="p-4 space-y-3">
              {stops.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm border-2 border-dashed border-border rounded-lg">
                  <MapPin className="w-6 h-6 mx-auto mb-2 opacity-50" />
                  <p>No stops added yet</p>
                  <p className="text-xs mt-1">Click pins on the map to add</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {stops.map((stop, index) => (
                    <div
                      key={stop.id}
                      draggable
                      onDragStart={() => handleDragStart(index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDragEnd={handleDragEnd}
                      className={`flex items-center gap-2 p-3 bg-muted/30 rounded-lg border border-border hover:border-primary/30 transition-all cursor-move ${
                        draggedIndex === index ? 'opacity-50 border-primary' : ''
                      }`}
                    >
                      <DotsSixVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex items-center justify-center w-6 h-6 bg-primary/10 rounded-full flex-shrink-0 text-primary">
                        {getStopIcon(stop.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium truncate block">{stop.name}</span>
                        {stop.duration && (
                          <span className="text-xs text-muted-foreground">{stop.duration}</span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveStop(stop.id)}
                        className="h-6 w-6 p-0 flex-shrink-0 hover:bg-destructive/10 hover:text-destructive"
                      >
                        <X className="w-4 h-4" weight="bold" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="border-t border-border" />

            {/* Evening - Campsite */}
            <div className="p-4 bg-muted/20">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-3">
                <Moon className="w-3 h-3" />
                Tonight's Camp
              </div>

              {campsite ? (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Tent className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{campsite.name}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsCampsiteSelectorOpen(true)}
                    className="text-xs"
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setIsCampsiteSelectorOpen(true)}
                >
                  <Tent className="w-4 h-4 mr-2" />
                  Select Campsite
                </Button>
              )}
            </div>
          </div>

          {/* Quick add section */}
          {recommendations.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                <Compass className="w-3 h-3" />
                Quick Add
              </h4>
              <div className="flex flex-wrap gap-2">
                {recommendations.slice(0, 6).map(rec => (
                  <button
                    key={rec.id}
                    onClick={() => handleAddRecommendation(rec)}
                    disabled={isAdded(rec)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      isAdded(rec)
                        ? 'bg-primary/10 text-primary/50 cursor-not-allowed'
                        : 'bg-muted hover:bg-primary/10 hover:text-primary'
                    }`}
                  >
                    {rec.type === 'trail' && <Path className="w-3 h-3" />}
                    {rec.type === 'viewpoint' && <Camera className="w-3 h-3" />}
                    {rec.type === 'poi' && <Mountains className="w-3 h-3" />}
                    <span className="truncate max-w-[120px]">{rec.name}</span>
                    {!isAdded(rec) && <Plus className="w-3 h-3" />}
                  </button>
                ))}
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

      {/* Map Picker Sheet for adding custom stops */}
      <Sheet open={isMapPickerOpen} onOpenChange={setIsMapPickerOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-xl p-0"
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <SheetHeader className="p-4 border-b border-border">
            <SheetTitle className="flex items-center gap-2">
              <MapTrifold className="w-5 h-5" />
              Add a Stop
            </SheetTitle>
          </SheetHeader>
          <div className="h-[calc(100vh-80px)]">
            <MapLocationPicker
              onSelectLocation={(location) => {
                const newStop: TripStop = {
                  id: `stop-${Date.now()}`,
                  name: location.name,
                  type: "viewpoint",
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              Change Location
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">
                Search for a new area
              </label>
              <PlaceSearch
                onPlaceSelect={(place) => {
                  if (place.geometry?.location && place.place_id) {
                    setArea({
                      name: place.name || place.formatted_address || "Selected Area",
                      lat: place.geometry.location.lat(),
                      lng: place.geometry.location.lng(),
                      placeId: place.place_id,
                    });
                    setIsAreaChangeOpen(false);
                  }
                }}
                placeholder="Search cities, parks, regions..."
              />
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">or</span>
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setIsAreaChangeOpen(false);
                setIsAreaMapPickerOpen(true);
              }}
            >
              <MapTrifold className="w-4 h-4 mr-2" />
              Browse the map
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Area Map Picker Sheet */}
      <Sheet open={isAreaMapPickerOpen} onOpenChange={setIsAreaMapPickerOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-xl p-0"
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <SheetHeader className="p-4 border-b border-border">
            <SheetTitle className="flex items-center gap-2">
              <MapTrifold className="w-5 h-5" />
              Pick Area on Map
            </SheetTitle>
          </SheetHeader>
          <div className="h-[calc(100vh-80px)]">
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
