import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, MapPin, Car, SpinnerGap, Plus, DotsSixVertical, X, CaretDown, Clock, Gauge, Minus } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { toast } from "sonner";
import { PlaceSearch } from "@/components/PlaceSearch";
import { EntryPointSelector, checkIfDrivable } from "@/components/EntryPointSelector";
import { useTripGenerator } from "@/hooks/use-trip-generator";
import { useTrip } from "@/context/TripContext";
import { TripConfig, TripDestination } from "@/types/trip";
import { getTripUrl } from "@/utils/slugify";

interface LocationState {
  startLocation?: {
    name: string;
    lat: number;
    lng: number;
    placeId: string;
  };
}

interface LocationData {
  id: string;
  name: string;
  lat: number;
  lng: number;
  placeId: string;
  days?: number; // Optional user-specified days at this destination
}

const CAR_CAPABILITIES = [
  { id: "4wd", label: "4WD", description: "Four-wheel drive capable" },
  { id: "2wd", label: "2WD", description: "Two-wheel drive only" },
  { id: "high-clearance", label: "High Clearance", description: "High ground clearance vehicle" },
];

const LODGING_OPTIONS = [
  { id: "dispersed", label: "Dispersed Camping", description: "Free camping on public lands" },
  { id: "established", label: "Established Camping", description: "Campgrounds with amenities" },
];

const ACTIVITIES = [
  { id: "photography", label: "Photography", description: "Find photo hotspots along your route" },
  { id: "offroading", label: "Offroading", description: "Find trails and off-highway routes" },
];

const CreateTrip = () => {
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const stateLocation = routerLocation.state as LocationState | null;
  const { generateTrip, generating, error: generatorError } = useTripGenerator();
  const { setGeneratedTrip, tripNameExists } = useTrip();

  // Form state
  const [tripName, setTripName] = useState("");
  const [tripNameError, setTripNameError] = useState<string | null>(null);
  const [startLocation, setStartLocation] = useState<LocationData | null>(
    stateLocation?.startLocation ? {
      id: `start-${stateLocation.startLocation.placeId}`,
      ...stateLocation.startLocation
    } : null
  );
  const [destinations, setDestinations] = useState<LocationData[]>([]);
  const [returnToStart, setReturnToStart] = useState(true);
  const [endLocation, setEndLocation] = useState<LocationData | null>(null);
  const [duration, setDuration] = useState<number[]>([3]);
  const [carCapabilities, setCarCapabilities] = useState<string[]>([]);
  const [lodging, setLodging] = useState<string>("dispersed");
  const [activities, setActivities] = useState<string[]>([]);
  const [offroadVehicle, setOffroadVehicle] = useState<'4wd-high' | 'awd-medium'>('4wd-high');
  const [baseCampMode, setBaseCampMode] = useState(true);
  const [includeHikes, setIncludeHikes] = useState(true);
  const [travelOnlyFinalDay, setTravelOnlyFinalDay] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Entry point selector state
  const [entryPointModal, setEntryPointModal] = useState<{
    isOpen: boolean;
    place: google.maps.places.PlaceResult | null;
    targetType: 'destination' | 'start' | 'end';
  }>({ isOpen: false, place: null, targetType: 'destination' });

  // Advanced options state
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [departureTime, setDepartureTime] = useState<string>('08:00');
  const [dailyStartTime, setDailyStartTime] = useState<string>('08:00');
  const [returnToCampTime, setReturnToCampTime] = useState<string>('18:00');
  const [pacePreference, setPacePreference] = useState<'relaxed' | 'moderate' | 'packed'>('moderate');
  const [maxDrivingHours, setMaxDrivingHours] = useState<number[]>([4]);

  // Check for duplicate trip name as user types
  useEffect(() => {
    if (tripName.trim()) {
      if (tripNameExists(tripName.trim())) {
        setTripNameError("A trip with this name already exists");
      } else {
        setTripNameError(null);
      }
    } else {
      setTripNameError(null);
    }
  }, [tripName, tripNameExists]);

  const handleCarCapabilityChange = (capabilityId: string, checked: boolean) => {
    if (checked) {
      setCarCapabilities([...carCapabilities, capabilityId]);
    } else {
      setCarCapabilities(carCapabilities.filter(id => id !== capabilityId));
    }
  };

  const handleActivityChange = (activityId: string, checked: boolean) => {
    if (checked) {
      setActivities([...activities, activityId]);
    } else {
      setActivities(activities.filter(id => id !== activityId));
    }
  };

  const handleStartLocationSelect = async (place: google.maps.places.PlaceResult) => {
    if (place.geometry?.location && place.place_id) {
      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();

      // Check if this location is drivable
      const isDrivable = await checkIfDrivable(lat, lng);
      if (!isDrivable) {
        setEntryPointModal({ isOpen: true, place, targetType: 'start' });
        return;
      }

      setStartLocation({
        id: `start-${place.place_id}`,
        name: place.name || place.formatted_address || "Selected Location",
        lat,
        lng,
        placeId: place.place_id,
      });
    }
  };

  const handleAddDestination = async (place: google.maps.places.PlaceResult) => {
    if (place.geometry?.location && place.place_id) {
      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();

      // Check if this location is drivable
      const isDrivable = await checkIfDrivable(lat, lng);
      if (!isDrivable) {
        setEntryPointModal({ isOpen: true, place, targetType: 'destination' });
        return;
      }

      addDestinationFromPlace(place);
    }
  };

  const addDestinationFromPlace = (place: google.maps.places.PlaceResult) => {
    if (place.geometry?.location && place.place_id) {
      const newDest: LocationData = {
        id: `dest-${place.place_id}-${Date.now()}`,
        name: place.name || place.formatted_address || "Selected Location",
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
        placeId: place.place_id,
      };
      setDestinations([...destinations, newDest]);
    }
  };

  const handleEntryPointSelect = (entryPoint: {
    placeId: string;
    name: string;
    coordinates: { lat: number; lng: number };
  }) => {
    const { targetType } = entryPointModal;

    if (targetType === 'destination') {
      const newDest: LocationData = {
        id: `dest-${entryPoint.placeId}-${Date.now()}`,
        name: entryPoint.name,
        lat: entryPoint.coordinates.lat,
        lng: entryPoint.coordinates.lng,
        placeId: entryPoint.placeId,
      };
      setDestinations([...destinations, newDest]);
    } else if (targetType === 'start') {
      setStartLocation({
        id: `start-${entryPoint.placeId}`,
        name: entryPoint.name,
        lat: entryPoint.coordinates.lat,
        lng: entryPoint.coordinates.lng,
        placeId: entryPoint.placeId,
      });
    } else if (targetType === 'end') {
      setEndLocation({
        id: `end-${entryPoint.placeId}`,
        name: entryPoint.name,
        lat: entryPoint.coordinates.lat,
        lng: entryPoint.coordinates.lng,
        placeId: entryPoint.placeId,
      });
    }
  };

  const handleUseOriginalPlace = () => {
    const { place, targetType } = entryPointModal;
    if (!place) return;

    if (targetType === 'destination') {
      addDestinationFromPlace(place);
    } else if (targetType === 'start' && place.geometry?.location && place.place_id) {
      setStartLocation({
        id: `start-${place.place_id}`,
        name: place.name || place.formatted_address || "Selected Location",
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
        placeId: place.place_id,
      });
    } else if (targetType === 'end' && place.geometry?.location && place.place_id) {
      setEndLocation({
        id: `end-${place.place_id}`,
        name: place.name || place.formatted_address || "Selected Location",
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
        placeId: place.place_id,
      });
    }
  };

  const handleRemoveDestination = (id: string) => {
    setDestinations(destinations.filter(d => d.id !== id));
  };

  const handleDestinationDaysChange = (id: string, days: number) => {
    setDestinations(destinations.map(d =>
      d.id === id ? { ...d, days } : d
    ));
  };

  // Calculate available days for destinations
  const travelDays = returnToStart ? 1 : 0;
  const totalSpecifiedDays = destinations.reduce((sum, d) => sum + (d.days || 0), 0);
  const availableDays = duration[0] - travelDays;
  const remainingDays = availableDays - totalSpecifiedDays;
  const unspecifiedDestinations = destinations.filter(d => !d.days).length;

  const handleEndLocationSelect = async (place: google.maps.places.PlaceResult) => {
    if (place.geometry?.location && place.place_id) {
      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();

      // Check if this location is drivable
      const isDrivable = await checkIfDrivable(lat, lng);
      if (!isDrivable) {
        setEntryPointModal({ isOpen: true, place, targetType: 'end' });
        return;
      }

      setEndLocation({
        id: `end-${place.place_id}`,
        name: place.name || place.formatted_address || "Selected Location",
        lat,
        lng,
        placeId: place.place_id,
      });
    }
  };

  // Drag and drop handlers
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

  const handleCreateTrip = async () => {
    if (!startLocation) {
      toast.error("Please select a start location");
      return;
    }

    if (destinations.length === 0) {
      toast.error("Please add at least one destination");
      return;
    }

    if (!returnToStart && !endLocation) {
      toast.error("Please select an end location or enable 'Return to start'");
      return;
    }

    // Build start location as TripDestination
    const start: TripDestination = {
      id: startLocation.id,
      placeId: startLocation.placeId,
      name: startLocation.name,
      address: startLocation.name,
      coordinates: { lat: startLocation.lat, lng: startLocation.lng },
    };

    // Build destinations as TripDestination[]
    const tripDestinations: TripDestination[] = destinations.map(dest => ({
      id: dest.id,
      placeId: dest.placeId,
      name: dest.name,
      address: dest.name,
      coordinates: { lat: dest.lat, lng: dest.lng },
      daysAtDestination: dest.days || undefined, // Include user-specified days
    }));

    // Add end location as final destination if not returning to start
    if (!returnToStart && endLocation) {
      tripDestinations.push({
        id: endLocation.id,
        placeId: endLocation.placeId,
        name: endLocation.name,
        address: endLocation.name,
        coordinates: { lat: endLocation.lat, lng: endLocation.lng },
      });
    }

    // Generate trip name if not provided
    const generatedName = tripName.trim() ||
      `${startLocation.name} to ${destinations[destinations.length - 1].name}`;

    // Convert Date to string format for config
    const startDateStr = startDate ? startDate.toISOString().split('T')[0] : undefined;

    // Calculate end date from start date and duration
    const endDateStr = startDate ? (() => {
      const end = new Date(startDate);
      end.setDate(end.getDate() + duration[0] - 1);
      return end.toISOString().split('T')[0];
    })() : undefined;

    // Build trip config
    const tripConfig: TripConfig = {
      name: generatedName,
      duration: duration[0],
      startLocation: start,
      destinations: tripDestinations,
      returnToStart: returnToStart,
      sameCampsite: baseCampMode,
      activitiesPerDay: 1,
      vehicleType: carCapabilities.includes("4wd") ? "4wd" : carCapabilities.includes("high-clearance") ? "suv" : "sedan",
      lodgingPreference: lodging as any,
      activities: activities as any[],
      hikingPreference: includeHikes ? 'daily' : 'none',
      // Advanced options
      startDate: startDateStr,
      endDate: endDateStr,
      departureTime: departureTime,
      dailyStartTime: dailyStartTime,
      returnToCampTime: returnToCampTime,
      pacePreference: pacePreference,
      maxDrivingHoursPerDay: maxDrivingHours[0],
      travelOnlyFinalDay: travelOnlyFinalDay,
    };

    console.log("Creating trip with config:", tripConfig);

    // Check for duplicate trip name
    if (tripNameExists(generatedName)) {
      toast.error("Trip name already exists", {
        description: "Please choose a different name for your trip",
      });
      return;
    }

    toast.loading("Generating your trip...", { id: "generating" });

    try {
      const trip = await generateTrip(tripConfig);
      console.log("Generated trip:", trip);

      if (trip) {
        setGeneratedTrip(trip);
        toast.success("Trip created!", {
          id: "generating",
          description: generatedName,
        });
        navigate(getTripUrl(trip.config.name));
      } else {
        console.error("Trip generation returned null, error:", generatorError);
        toast.error("Failed to generate trip", {
          id: "generating",
          description: generatorError || "Please try again",
        });
      }
    } catch (err) {
      console.error("Trip generation error:", err);
      toast.error("Failed to generate trip", {
        id: "generating",
        description: err instanceof Error ? err.message : "Please try again",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="container px-4 md:px-6 py-8">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" size="icon" className="rounded-full">
                <ArrowLeft className="w-5 h-5" weight="bold" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-display font-bold text-foreground">Create Trip</h1>
              <p className="text-sm text-muted-foreground">Plan your adventure</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container px-4 md:px-6 py-6 max-w-2xl">
        <div className="space-y-6">
          {/* Trip Name */}
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Trip Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="trip-name">Trip Name</Label>
                <Input
                  id="trip-name"
                  placeholder="e.g., Southwest Desert Adventure"
                  value={tripName}
                  onChange={(e) => setTripName(e.target.value)}
                  className={tripNameError ? "border-red-500 focus-visible:ring-red-500" : ""}
                />
                {tripNameError && (
                  <p className="text-sm text-red-500">{tripNameError}</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Start & End Location */}
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Start & End Location</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Where does your trip begin?</Label>
                <PlaceSearch
                  onPlaceSelect={handleStartLocationSelect}
                  placeholder="Search for starting point..."
                  defaultValue={startLocation?.name}
                />
                {startLocation && (
                  <div className="flex items-center justify-between p-3 bg-aquateal/20 rounded-lg border border-aquateal/30">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-[#34b5a5]" />
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
              </div>

              {/* Return to Start Checkbox */}
              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="return-to-start"
                  checked={returnToStart}
                  onChange={(e) => setReturnToStart(e.target.checked)}
                  className="h-4 w-4 cursor-pointer accent-[hsl(var(--forest))]"
                />
                <label htmlFor="return-to-start" className="cursor-pointer text-sm">
                  Return to start location
                </label>
              </div>

              {/* Travel Only Final Day Checkbox */}
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="travel-only-final"
                  checked={travelOnlyFinalDay}
                  onChange={(e) => setTravelOnlyFinalDay(e.target.checked)}
                  className="h-4 w-4 cursor-pointer accent-[hsl(var(--forest))]"
                />
                <label htmlFor="travel-only-final" className="cursor-pointer text-sm">
                  No activities on final day (travel only)
                </label>
              </div>

              {/* End Location (only if not returning to start) */}
              {!returnToStart && (
                <div className="space-y-2 pt-2 animate-fade-in">
                  <Label>Where does your trip end?</Label>
                  <PlaceSearch
                    onPlaceSelect={handleEndLocationSelect}
                    placeholder="Search for end point..."
                  />
                  {endLocation && (
                    <div className="flex items-center justify-between p-3 bg-aquateal/20 rounded-lg border border-aquateal/30">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-[#34b5a5]" />
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
                </div>
              )}

              {/* Start Date */}
              <div className="space-y-2 pt-2">
                <Label>When does your trip start? (optional)</Label>
                <DatePicker
                  value={startDate}
                  onChange={setStartDate}
                  placeholder="Select start date"
                />
              </div>
            </CardContent>
          </Card>

          {/* Duration */}
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Trip Duration</CardTitle>
            </CardHeader>
            <CardContent>
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm text-muted-foreground">Days</span>
                  <span className="text-lg font-semibold text-foreground">{duration[0]}</span>
                </div>
                <Slider
                  value={duration}
                  onValueChange={setDuration}
                  min={1}
                  max={14}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                  <span>1 day</span>
                  <span>14 days</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Destinations */}
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Destinations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Add places you want to visit</Label>
                <PlaceSearch
                  onPlaceSelect={handleAddDestination}
                  placeholder="Search and add destinations..."
                  key={destinations.length} // Reset input after adding
                />
              </div>

              {/* Destination List */}
              {destinations.length > 0 && (
                <div className="space-y-3">
                  <Label className="text-muted-foreground text-xs">
                    Drag to reorder • {destinations.length} destination{destinations.length !== 1 ? 's' : ''}
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

              {/* Campsite Preference */}
              <div className="space-y-2 pt-2">
                <label htmlFor="camp-same" className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    id="camp-same"
                    name="campsite-preference"
                    checked={baseCampMode}
                    onChange={() => setBaseCampMode(true)}
                    className="h-4 w-4 cursor-pointer accent-[hsl(var(--forest))]"
                  />
                  <span className="text-sm">Setup basecamp for each destination</span>
                </label>
                <label htmlFor="camp-new" className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    id="camp-new"
                    name="campsite-preference"
                    checked={!baseCampMode}
                    onChange={() => setBaseCampMode(false)}
                    className="h-4 w-4 cursor-pointer accent-[hsl(var(--forest))]"
                  />
                  <span className="text-sm">Find a new campsite each night</span>
                </label>
              </div>
            </CardContent>
          </Card>

          {/* Camping Options */}
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Camping</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                {LODGING_OPTIONS.map((option) => (
                  <label
                    key={option.id}
                    htmlFor={`lodging-${option.id}`}
                    className={`flex items-start space-x-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                      lodging === option.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                    }`}
                  >
                    <input
                      type="radio"
                      id={`lodging-${option.id}`}
                      name="lodging"
                      value={option.id}
                      checked={lodging === option.id}
                      onChange={(e) => setLodging(e.target.value)}
                      className="h-4 w-4 mt-0.5 cursor-pointer accent-[hsl(var(--forest))]"
                    />
                    <div className="space-y-0.5">
                      <span className="font-medium text-sm">
                        {option.label}
                      </span>
                      <p className="text-xs text-muted-foreground">{option.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Activities */}
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Activities</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Hiking */}
              <label
                htmlFor="include-hikes"
                className={`flex items-start space-x-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                  includeHikes ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                }`}
              >
                <input
                  type="checkbox"
                  id="include-hikes"
                  checked={includeHikes}
                  onChange={(e) => setIncludeHikes(e.target.checked)}
                  className="h-4 w-4 mt-0.5 cursor-pointer accent-[hsl(var(--forest))]"
                />
                <div className="flex-1 space-y-0.5">
                  <span className="font-medium text-sm">Hiking</span>
                  <p className="text-xs text-muted-foreground">
                    Frequency based on trip pace
                  </p>
                </div>
              </label>

              {/* Other Activities */}
              {ACTIVITIES.map((activity) => {
                const isSelected = activities.includes(activity.id);
                return (
                  <div
                    key={activity.id}
                    className={`rounded-lg border transition-colors ${
                      isSelected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                    }`}
                  >
                    <label
                      htmlFor={`activity-${activity.id}`}
                      className="flex items-start space-x-3 p-3 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        id={`activity-${activity.id}`}
                        checked={isSelected}
                        onChange={(e) => handleActivityChange(activity.id, e.target.checked)}
                        className="h-4 w-4 mt-0.5 cursor-pointer accent-[hsl(var(--forest))]"
                      />
                      <div className="flex-1 space-y-0.5">
                        <span className="font-medium text-sm">{activity.label}</span>
                        <p className="text-xs text-muted-foreground">
                          {activity.description}
                        </p>
                      </div>
                    </label>

                    {/* Conditional vehicle selection for offroading */}
                    {activity.id === 'offroading' && isSelected && (
                      <div className="px-3 pb-3 pt-1 ml-7 space-y-2 animate-fade-in">
                        <p className="text-xs text-muted-foreground mb-2">What's your vehicle?</p>
                        <label htmlFor="offroad-4wd" className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            id="offroad-4wd"
                            name="offroad-vehicle"
                            value="4wd-high"
                            checked={offroadVehicle === '4wd-high'}
                            onChange={(e) => setOffroadVehicle(e.target.value as '4wd-high' | 'awd-medium')}
                            className="h-4 w-4 cursor-pointer accent-[hsl(var(--forest))]"
                          />
                          <span className="text-sm">4WD high clearance</span>
                        </label>
                        <label htmlFor="offroad-awd" className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            id="offroad-awd"
                            name="offroad-vehicle"
                            value="awd-medium"
                            checked={offroadVehicle === 'awd-medium'}
                            onChange={(e) => setOffroadVehicle(e.target.value as '4wd-high' | 'awd-medium')}
                            className="h-4 w-4 cursor-pointer accent-[hsl(var(--forest))]"
                          />
                          <span className="text-sm">AWD medium clearance</span>
                        </label>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Trip Pace */}
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Trip Pace</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                <label
                  htmlFor="pace-relaxed"
                  className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                    pacePreference === 'relaxed' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <input
                    type="radio"
                    id="pace-relaxed"
                    name="pace-preference"
                    value="relaxed"
                    checked={pacePreference === 'relaxed'}
                    onChange={(e) => setPacePreference(e.target.value as 'relaxed' | 'moderate' | 'packed')}
                    className="h-4 w-4 cursor-pointer accent-[hsl(var(--forest))]"
                  />
                  <div className="space-y-0.5">
                    <span className="font-medium text-sm">Relaxed</span>
                    <p className="text-xs text-muted-foreground">Fewer activities, more downtime</p>
                  </div>
                </label>
                <label
                  htmlFor="pace-moderate"
                  className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                    pacePreference === 'moderate' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <input
                    type="radio"
                    id="pace-moderate"
                    name="pace-preference"
                    value="moderate"
                    checked={pacePreference === 'moderate'}
                    onChange={(e) => setPacePreference(e.target.value as 'relaxed' | 'moderate' | 'packed')}
                    className="h-4 w-4 cursor-pointer accent-[hsl(var(--forest))]"
                  />
                  <div className="space-y-0.5">
                    <span className="font-medium text-sm">Moderate</span>
                    <p className="text-xs text-muted-foreground">Balanced activity and rest</p>
                  </div>
                </label>
                <label
                  htmlFor="pace-packed"
                  className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                    pacePreference === 'packed' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <input
                    type="radio"
                    id="pace-packed"
                    name="pace-preference"
                    value="packed"
                    checked={pacePreference === 'packed'}
                    onChange={(e) => setPacePreference(e.target.value as 'relaxed' | 'moderate' | 'packed')}
                    className="h-4 w-4 cursor-pointer accent-[hsl(var(--forest))]"
                  />
                  <div className="space-y-0.5">
                    <span className="font-medium text-sm">Packed</span>
                    <p className="text-xs text-muted-foreground">Maximum activities each day</p>
                  </div>
                </label>
              </div>
            </CardContent>
          </Card>

          {/* Advanced Options */}
          <Card>
            <CardHeader
              className="cursor-pointer"
              onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
            >
              <div className="flex items-center justify-between">
                <CardTitle className="text-2xl">Advanced Options</CardTitle>
                <CaretDown
                  className={`w-5 h-5 text-muted-foreground transition-transform ${
                    showAdvancedOptions ? 'rotate-180' : ''
                  }`}
                />
              </div>
            </CardHeader>
            {showAdvancedOptions && (
              <CardContent className="space-y-6 animate-fade-in">
                {/* Departure Time */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary" />
                    <Label className="font-medium">Departure Time</Label>
                  </div>
                  <p className="text-sm text-muted-foreground">What time do you want to leave your starting location?</p>
                  <TimePicker
                    value={departureTime}
                    onChange={setDepartureTime}
                    placeholder="Select time"
                  />
                </div>

                {/* Daily Start Time */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-500" />
                    <Label className="font-medium">Daily Activity Start Time</Label>
                  </div>
                  <p className="text-sm text-muted-foreground">What time do you typically start your day on the road?</p>
                  <TimePicker
                    value={dailyStartTime}
                    onChange={setDailyStartTime}
                    placeholder="Select time"
                  />
                </div>

                {/* Return to Camp Time */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-orange-500" />
                    <Label className="font-medium">Return to Camp Time</Label>
                  </div>
                  <p className="text-sm text-muted-foreground">What time do you want to be back at camp each day?</p>
                  <TimePicker
                    value={returnToCampTime}
                    onChange={setReturnToCampTime}
                    placeholder="Select time"
                  />
                </div>

                {/* Max Driving Hours */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Car className="w-4 h-4 text-primary" />
                    <Label className="font-medium">Max Driving Per Day</Label>
                  </div>
                  <p className="text-sm text-muted-foreground">Limit daily driving time to prevent fatigue</p>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Hours</span>
                    <span className="text-lg font-bold text-foreground">{maxDrivingHours[0]}</span>
                  </div>
                  <Slider
                    value={maxDrivingHours}
                    onValueChange={setMaxDrivingHours}
                    min={2}
                    max={10}
                    step={1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>2 hours</span>
                    <span>10 hours</span>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Create Button */}
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={handleCreateTrip}
            disabled={generating || !!tripNameError}
          >
            {generating ? (
              <>
                <SpinnerGap className="w-4 h-4 mr-2 animate-spin" />
                Generating Trip...
              </>
            ) : (
              "Create Trip"
            )}
          </Button>
        </div>
      </main>

      {/* Entry Point Selector Modal */}
      {entryPointModal.place && (
        <EntryPointSelector
          isOpen={entryPointModal.isOpen}
          onClose={() => setEntryPointModal({ isOpen: false, place: null, targetType: 'destination' })}
          parentPlace={{
            name: entryPointModal.place.name || '',
            placeId: entryPointModal.place.place_id || '',
            coordinates: {
              lat: entryPointModal.place.geometry?.location?.lat() || 0,
              lng: entryPointModal.place.geometry?.location?.lng() || 0,
            },
          }}
          onSelectEntryPoint={handleEntryPointSelect}
          onUseOriginal={handleUseOriginalPlace}
        />
      )}
    </div>
  );
};

export default CreateTrip;
