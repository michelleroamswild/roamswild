import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, MapPin, Car, Camera, Mountain, Compass, Loader2, Plus, GripVertical, X, Sparkles, Footprints, Ban, ChevronDown, Clock, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { PlaceSearch } from "@/components/PlaceSearch";
import { useTripGenerator } from "@/hooks/use-trip-generator";
import { useTrip } from "@/context/TripContext";
import { TripConfig, TripDestination } from "@/types/trip";

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
  { id: "photography", label: "Photography", icon: Camera },
  { id: "hiking", label: "Hiking", icon: Mountain },
  { id: "offroading", label: "Offroading", icon: Car },
];

const CreateTrip = () => {
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const stateLocation = routerLocation.state as LocationState | null;
  const { generateTrip, generating, error: generatorError } = useTripGenerator();
  const { setGeneratedTrip } = useTrip();

  // Form state
  const [tripName, setTripName] = useState("");
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
  const [baseCampMode, setBaseCampMode] = useState(false);
  const [hikingPreference, setHikingPreference] = useState<'none' | 'surprise' | 'daily'>('daily');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Advanced options state
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [startDate, setStartDate] = useState<string>('');
  const [departureTime, setDepartureTime] = useState<string>('08:00');
  const [dailyStartTime, setDailyStartTime] = useState<string>('08:00');
  const [pacePreference, setPacePreference] = useState<'relaxed' | 'moderate' | 'packed'>('moderate');
  const [maxDrivingHours, setMaxDrivingHours] = useState<number[]>([4]);

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

  const handleStartLocationSelect = (place: google.maps.places.PlaceResult) => {
    if (place.geometry?.location && place.place_id) {
      setStartLocation({
        id: `start-${place.place_id}`,
        name: place.name || place.formatted_address || "Selected Location",
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
        placeId: place.place_id,
      });
    }
  };

  const handleAddDestination = (place: google.maps.places.PlaceResult) => {
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

  const handleRemoveDestination = (id: string) => {
    setDestinations(destinations.filter(d => d.id !== id));
  };

  const handleEndLocationSelect = (place: google.maps.places.PlaceResult) => {
    if (place.geometry?.location && place.place_id) {
      setEndLocation({
        id: `end-${place.place_id}`,
        name: place.name || place.formatted_address || "Selected Location",
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
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

    // Calculate end date from start date and duration
    const endDate = startDate ? (() => {
      const start = new Date(startDate);
      start.setDate(start.getDate() + duration[0] - 1);
      return start.toISOString().split('T')[0];
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
      hikingPreference: hikingPreference,
      // Advanced options
      startDate: startDate || undefined,
      endDate: endDate,
      departureTime: departureTime,
      dailyStartTime: dailyStartTime,
      pacePreference: pacePreference,
      maxDrivingHoursPerDay: maxDrivingHours[0],
    };

    console.log("Creating trip with config:", tripConfig);
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
        navigate(`/trip/${trip.id}`);
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
        <div className="container px-4 md:px-6 py-4">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" size="icon" className="rounded-full">
                <ArrowLeft className="w-5 h-5" />
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
                />
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
                  <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg border border-primary/20">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium">{startLocation.name}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setStartLocation(null)}
                      className="h-6 w-6 p-0"
                    >
                      <X className="w-4 h-4" />
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

              {/* End Location (only if not returning to start) */}
              {!returnToStart && (
                <div className="space-y-2 pt-2 animate-fade-in">
                  <Label>Where does your trip end?</Label>
                  <PlaceSearch
                    onPlaceSelect={handleEndLocationSelect}
                    placeholder="Search for end point..."
                  />
                  {endLocation && (
                    <div className="flex items-center justify-between p-3 bg-terracotta/10 rounded-lg border border-terracotta/20">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-terracotta" />
                        <span className="text-sm font-medium">{endLocation.name}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEndLocation(null)}
                        className="h-6 w-6 p-0"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              )}
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
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs">
                    Drag to reorder • {destinations.length} destination{destinations.length !== 1 ? 's' : ''}
                  </Label>
                  <div className="space-y-2">
                    {destinations.map((dest, index) => (
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
                        <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <div className="flex items-center justify-center w-6 h-6 bg-primary/10 rounded-full flex-shrink-0">
                          <span className="text-xs font-semibold text-primary">{index + 1}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium truncate block">{dest.name}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveDestination(dest.id)}
                          className="h-6 w-6 p-0 flex-shrink-0 hover:bg-destructive/10 hover:text-destructive"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Same Campsite Option */}
              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="base-camp-mode"
                  checked={baseCampMode}
                  onChange={(e) => setBaseCampMode(e.target.checked)}
                  className="h-4 w-4 cursor-pointer accent-[hsl(var(--forest))]"
                />
                <label htmlFor="base-camp-mode" className="cursor-pointer text-sm">
                  Stay at the same campsite at each destination
                </label>
              </div>
            </CardContent>
          </Card>

          {/* Duration & Date */}
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Trip Duration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
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

              {/* Start Date */}
              <div className="space-y-3 pt-2 border-t border-border">
                <Label className="text-sm font-medium">Start Date</Label>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="flexible-date"
                    checked={!startDate}
                    onChange={(e) => setStartDate(e.target.checked ? '' : new Date().toISOString().split('T')[0])}
                    className="h-4 w-4 cursor-pointer accent-[hsl(var(--forest))]"
                  />
                  <label htmlFor="flexible-date" className="cursor-pointer text-sm">
                    I'm flexible
                  </label>
                </div>
                {startDate && (
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full max-w-[200px]"
                  />
                )}
              </div>
            </CardContent>
          </Card>

          {/* Car Capabilities */}
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Vehicle Capabilities</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                {CAR_CAPABILITIES.map((capability) => (
                  <label
                    key={capability.id}
                    htmlFor={capability.id}
                    className={`flex items-start space-x-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                      carCapabilities.includes(capability.id) ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      id={capability.id}
                      checked={carCapabilities.includes(capability.id)}
                      onChange={(e) => handleCarCapabilityChange(capability.id, e.target.checked)}
                      className="h-4 w-4 mt-0.5 cursor-pointer accent-[hsl(var(--forest))]"
                    />
                    <div className="space-y-0.5">
                      <span className="font-medium text-sm">
                        {capability.label}
                      </span>
                      <p className="text-xs text-muted-foreground">{capability.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Lodging Options */}
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Lodging Preference</CardTitle>
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
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {ACTIVITIES.map((activity) => {
                  const Icon = activity.icon;
                  const isSelected = activities.includes(activity.id);
                  return (
                    <button
                      key={activity.id}
                      type="button"
                      onClick={() => handleActivityChange(activity.id, !isSelected)}
                      className={`flex flex-col items-center gap-2 p-4 rounded-lg border transition-all ${
                        isSelected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:bg-muted/50 text-foreground"
                      }`}
                    >
                      <Icon className="w-6 h-6" />
                      <span className="text-sm font-medium">{activity.label}</span>
                    </button>
                  );
                })}
              </div>

            </CardContent>
          </Card>

          {/* Hiking Preferences */}
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Hiking Preferences</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                <label
                  htmlFor="hiking-daily"
                  className={`flex items-start space-x-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                    hikingPreference === 'daily' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <input
                    type="radio"
                    id="hiking-daily"
                    name="hiking-preference"
                    value="daily"
                    checked={hikingPreference === 'daily'}
                    onChange={(e) => setHikingPreference(e.target.value as 'none' | 'surprise' | 'daily')}
                    className="h-4 w-4 mt-0.5 cursor-pointer accent-[hsl(var(--forest))]"
                  />
                  <div className="flex-1 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Footprints className="w-4 h-4 text-emerald-500" />
                      <span className="font-medium text-sm">Daily Hikes</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Include a hike every day of the trip</p>
                  </div>
                </label>

                <label
                  htmlFor="hiking-surprise"
                  className={`flex items-start space-x-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                    hikingPreference === 'surprise' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <input
                    type="radio"
                    id="hiking-surprise"
                    name="hiking-preference"
                    value="surprise"
                    checked={hikingPreference === 'surprise'}
                    onChange={(e) => setHikingPreference(e.target.value as 'none' | 'surprise' | 'daily')}
                    className="h-4 w-4 mt-0.5 cursor-pointer accent-[hsl(var(--forest))]"
                  />
                  <div className="flex-1 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-500" />
                      <span className="font-medium text-sm">Surprise Me</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Let us pick the best hiking days with top-rated trails</p>
                  </div>
                </label>

                <label
                  htmlFor="hiking-none"
                  className={`flex items-start space-x-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                    hikingPreference === 'none' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <input
                    type="radio"
                    id="hiking-none"
                    name="hiking-preference"
                    value="none"
                    checked={hikingPreference === 'none'}
                    onChange={(e) => setHikingPreference(e.target.value as 'none' | 'surprise' | 'daily')}
                    className="h-4 w-4 mt-0.5 cursor-pointer accent-[hsl(var(--forest))]"
                  />
                  <div className="flex-1 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Ban className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium text-sm">No Hikes</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Skip hiking, focus on scenic drives and viewpoints</p>
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
                <ChevronDown
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
                  <Input
                    type="time"
                    value={departureTime}
                    onChange={(e) => setDepartureTime(e.target.value)}
                    className="w-full max-w-[150px]"
                  />
                </div>

                {/* Daily Start Time */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-500" />
                    <Label className="font-medium">Daily Activity Start Time</Label>
                  </div>
                  <p className="text-sm text-muted-foreground">What time do you typically start your day on the road?</p>
                  <Input
                    type="time"
                    value={dailyStartTime}
                    onChange={(e) => setDailyStartTime(e.target.value)}
                    className="w-full max-w-[150px]"
                  />
                </div>

                {/* Pace Preference */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Gauge className="w-4 h-4 text-primary" />
                    <Label className="font-medium">Trip Pace</Label>
                  </div>
                  <div className="grid gap-2">
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
            variant="hero"
            size="lg"
            className="w-full"
            onClick={handleCreateTrip}
            disabled={generating}
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating Trip...
              </>
            ) : (
              "Create Trip"
            )}
          </Button>
        </div>
      </main>
    </div>
  );
};

export default CreateTrip;
