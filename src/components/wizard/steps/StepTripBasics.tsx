import { MapPin, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { DatePicker } from "@/components/ui/date-picker";
import { PlaceSearch } from "@/components/PlaceSearch";

interface LocationData {
  id: string;
  name: string;
  lat: number;
  lng: number;
  placeId: string;
}

interface StepTripBasicsProps {
  // Trip name
  tripName: string;
  setTripName: (name: string) => void;
  tripNameError: string | null;
  // Locations
  startLocation: LocationData | null;
  setStartLocation: (location: LocationData | null) => void;
  endLocation: LocationData | null;
  setEndLocation: (location: LocationData | null) => void;
  returnToStart: boolean;
  setReturnToStart: (value: boolean) => void;
  onStartLocationSelect: (place: google.maps.places.PlaceResult) => void;
  onEndLocationSelect: (place: google.maps.places.PlaceResult) => void;
  // Dates
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
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-display font-bold text-foreground mb-2">
          Trip Details
        </h2>
        <p className="text-muted-foreground">
          Name your trip and set the basics
        </p>
      </div>

      {/* Trip Name */}
      <div className="space-y-2">
        <Label htmlFor="trip-name">Trip Name</Label>
        <Input
          id="trip-name"
          placeholder="e.g., Southwest Desert Adventure"
          value={tripName}
          onChange={(e) => setTripName(e.target.value)}
          className={tripNameError ? "border-red-500 focus-visible:ring-red-500" : ""}
          autoFocus
        />
        {tripNameError && (
          <p className="text-sm text-red-500">{tripNameError}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Leave blank to auto-generate based on destinations
        </p>
      </div>

      {/* Start Location */}
      <div className="space-y-2">
        <Label>Starting Point <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <PlaceSearch
          onPlaceSelect={onStartLocationSelect}
          placeholder="Search for starting point..."
          defaultValue={startLocation?.name}
        />
        {startLocation && (
          <div className="flex items-center justify-between p-3 bg-aquateal/20 rounded-lg border border-aquateal/30">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-aquateal" />
              <span className="text-sm font-medium">{startLocation.name}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStartLocation(null)}
              className="h-6 w-6 p-0"
            >
              <X className="w-4 h-4" weight="bold" />
            </Button>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Leave blank if you're already at your destination
        </p>
      </div>

      {/* Return to Start - only show if start location is set */}
      {startLocation && (
        <div className="flex items-center space-x-2 animate-fade-in">
          <Checkbox
            id="return-to-start"
            checked={returnToStart}
            onCheckedChange={(checked) => setReturnToStart(checked === true)}
          />
          <label htmlFor="return-to-start" className="cursor-pointer text-sm">
            Return to start location (round trip)
          </label>
        </div>
      )}

      {/* End Location (only if start location set and not returning to start) */}
      {startLocation && !returnToStart && (
        <div className="space-y-2 animate-fade-in">
          <Label>End Point <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <PlaceSearch
            onPlaceSelect={onEndLocationSelect}
            placeholder="Search for end point..."
          />
          {endLocation && (
            <div className="flex items-center justify-between p-3 bg-aquateal/20 rounded-lg border border-aquateal/30">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-aquateal" />
                <span className="text-sm font-medium">{endLocation.name}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEndLocation(null)}
                className="h-6 w-6 p-0"
              >
                <X className="w-4 h-4" weight="bold" />
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Leave blank to end at your last destination
          </p>
        </div>
      )}

      {/* Start Date */}
      <div className="space-y-2 pt-2 border-t border-border">
        <Label>Start Date</Label>
        <DatePicker
          value={startDate}
          onChange={setStartDate}
          placeholder="Select start date (optional)"
        />
        <p className="text-xs text-muted-foreground">
          Optional - helps with weather forecasts
        </p>
      </div>

      {/* Duration */}
      <div className="space-y-3">
        <Label>Trip Duration</Label>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Days</span>
          <span className="text-2xl font-bold text-foreground">{duration[0]}</span>
        </div>
        <Slider
          value={duration}
          onValueChange={setDuration}
          min={1}
          max={14}
          step={1}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>1 day</span>
          <span>14 days</span>
        </div>
      </div>
    </div>
  );
}
