import { useState } from "react";
import { DotsSixVertical, Plus, Minus, X, MapPin } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlaceSearch } from "@/components/PlaceSearch";

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

  // Calculate available days for destinations
  const travelDays = returnToStart ? 1 : 0;
  const totalSpecifiedDays = destinations.reduce((sum, d) => sum + (d.days || 0), 0);
  const availableDays = duration - travelDays;
  const remainingDays = availableDays - totalSpecifiedDays;

  const handleRemoveDestination = (id: string) => {
    setDestinations(destinations.filter(d => d.id !== id));
  };

  const handleDestinationDaysChange = (id: string, days: number) => {
    setDestinations(destinations.map(d =>
      d.id === id ? { ...d, days } : d
    ));
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newDestinations = [...destinations];
    const draggedItem = newDestinations[draggedIndex];
    newDestinations.splice(draggedIndex, 1);
    newDestinations.splice(index, 0, draggedItem);
    setDestinations(newDestinations);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleAddManualCoords = () => {
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);

    if (isNaN(lat) || isNaN(lng)) {
      return;
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return;
    }

    const name = manualName.trim() || `Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
    const newDest: LocationData = {
      id: `dest-manual-${Date.now()}`,
      name,
      lat,
      lng,
      placeId: `manual-${Date.now()}`,
    };

    setDestinations([...destinations, newDest]);
    setManualLat("");
    setManualLng("");
    setManualName("");
    setShowManualCoords(false);
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-display font-bold text-foreground mb-2">
          Choose Destinations
        </h2>
        <p className="text-muted-foreground">
          Add the places you want to visit
        </p>
      </div>

      {/* Add Destination */}
      <div className="space-y-2">
        <Label>Add places you want to visit</Label>
        <PlaceSearch
          onPlaceSelect={onAddDestination}
          placeholder="Search and add destinations..."
          key={destinations.length}
        />

        {/* Manual Coordinates Toggle */}
        <div className="text-center pt-1">
          <button
            type="button"
            onClick={() => setShowManualCoords(!showManualCoords)}
            className="text-xs text-primary hover:underline"
          >
            {showManualCoords ? "Hide" : "Or enter"} GPS coordinates
          </button>
        </div>

        {/* Manual Coordinates Input */}
        {showManualCoords && (
          <div className="space-y-3 p-3 bg-muted/50 rounded-lg border border-border animate-fade-in">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="w-4 h-4" />
              <span>Enter GPS coordinates</span>
            </div>
            <Input
              type="text"
              placeholder="Name (optional)"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
            />
            <div className="flex gap-2">
              <Input
                type="number"
                step="any"
                placeholder="Latitude (e.g., 36.8529)"
                value={manualLat}
                onChange={(e) => setManualLat(e.target.value)}
                className="flex-1"
              />
              <Input
                type="number"
                step="any"
                placeholder="Longitude (e.g., -111.3803)"
                value={manualLng}
                onChange={(e) => setManualLng(e.target.value)}
                className="flex-1"
              />
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleAddManualCoords}
              disabled={!manualLat || !manualLng}
              className="w-full"
            >
              Add Location
            </Button>
          </div>
        )}
      </div>

      {/* Destination List */}
      {destinations.length > 0 && (
        <div className="space-y-3">
          <Label className="text-muted-foreground text-xs">
            Drag to reorder - {destinations.length} destination{destinations.length !== 1 ? 's' : ''}
          </Label>
          <div className="space-y-2">
            {destinations.map((dest, index) => {
              const currentDays = dest.days || 0;
              const maxDays = currentDays + remainingDays;
              const canIncrease = maxDays > currentDays;
              const canDecrease = currentDays > 0;

              return (
                <div
                  key={dest.id}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center gap-2 p-3 bg-card rounded-lg border border-border hover:border-primary/30 transition-all cursor-move ${
                    draggedIndex === index ? 'opacity-50 border-primary' : ''
                  }`}
                >
                  <DotsSixVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex items-center justify-center w-6 h-6 bg-primary/10 rounded-full flex-shrink-0">
                    <span className="text-xs font-semibold text-primary">{index + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium truncate block">{dest.name}</span>
                  </div>

                  {/* Days Stepper */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (canDecrease) {
                          handleDestinationDaysChange(dest.id, currentDays - 1);
                        }
                      }}
                      disabled={!canDecrease}
                    >
                      <Minus className="w-3 h-3" />
                    </Button>
                    <span className="w-12 text-center text-sm font-medium">
                      {currentDays === 0 ? 'Auto' : `${currentDays}d`}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (canIncrease) {
                          handleDestinationDaysChange(dest.id, currentDays + 1);
                        }
                      }}
                      disabled={!canIncrease}
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveDestination(dest.id)}
                    className="h-6 w-6 p-0 flex-shrink-0 hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X className="w-4 h-4" weight="bold" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {destinations.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <p>No destinations added yet.</p>
          <p className="text-sm mt-1">Search above to add your first stop!</p>
        </div>
      )}
    </div>
  );
}
