import { useState } from "react";
import { useParams, Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, MapPin, Car, Tent, Camera, Mountain, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { PlaceSearch } from "@/components/PlaceSearch";

interface LocationState {
  startLocation?: {
    name: string;
    lat: number;
    lng: number;
    placeId: string;
  };
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

  // Form state
  const [startLocation, setStartLocation] = useState<{ name: string; lat: number; lng: number; placeId: string } | null>(
    stateLocation?.startLocation || null
  );
  const [endLocation, setEndLocation] = useState<{ name: string; lat: number; lng: number; placeId: string } | null>(null);
  const [duration, setDuration] = useState<number[]>([3]);
  const [useDuration, setUseDuration] = useState(false);
  const [carCapabilities, setCarCapabilities] = useState<string[]>([]);
  const [lodging, setLodging] = useState<string>("dispersed");
  const [activities, setActivities] = useState<string[]>([]);

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
        name: place.name || place.formatted_address || "Selected Location",
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
        placeId: place.place_id,
      });
    }
  };

  const handleEndLocationSelect = (place: google.maps.places.PlaceResult) => {
    if (place.geometry?.location && place.place_id) {
      setEndLocation({
        name: place.name || place.formatted_address || "Selected Location",
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
        placeId: place.place_id,
      });
    }
  };

  const handleCreateTrip = () => {
    if (!startLocation) {
      toast.error("Please select a start location");
      return;
    }
    if (!endLocation) {
      toast.error("Please select an end location");
      return;
    }

    const tripData = {
      startLocation,
      endLocation,
      duration: useDuration ? duration[0] : null,
      carCapabilities,
      lodging,
      activities,
    };

    console.log("Trip data:", tripData);
    toast.success("Trip created!", {
      description: `${startLocation.name} → ${endLocation.name}`,
    });

    // TODO: Save trip data and navigate to trip detail page
    navigate("/");
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
          {/* Start & End Locations */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Compass className="w-5 h-5 text-primary" />
                Route
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="start-location">Start Location</Label>
                <PlaceSearch
                  onPlaceSelect={handleStartLocationSelect}
                  placeholder="Search for start location..."
                  defaultValue={startLocation?.name}
                />
                {startLocation && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {startLocation.name}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-location">End Location</Label>
                <PlaceSearch
                  onPlaceSelect={handleEndLocationSelect}
                  placeholder="Search for destination..."
                />
                {endLocation && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {endLocation.name}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Duration Slider */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                <span>Trip Duration</span>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="use-duration"
                    checked={useDuration}
                    onCheckedChange={(checked) => setUseDuration(checked as boolean)}
                  />
                  <Label htmlFor="use-duration" className="text-sm font-normal cursor-pointer">
                    Set duration
                  </Label>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={useDuration ? "" : "opacity-50 pointer-events-none"}>
                <div className="flex items-center justify-between mb-4">
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
                <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                  <span>1 day</span>
                  <span>14 days</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Car Capabilities */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Car className="w-5 h-5 text-primary" />
                Vehicle Capabilities
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                {CAR_CAPABILITIES.map((capability) => (
                  <div
                    key={capability.id}
                    className="flex items-start space-x-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                  >
                    <Checkbox
                      id={capability.id}
                      checked={carCapabilities.includes(capability.id)}
                      onCheckedChange={(checked) => handleCarCapabilityChange(capability.id, checked as boolean)}
                    />
                    <div className="space-y-0.5">
                      <Label htmlFor={capability.id} className="cursor-pointer font-medium">
                        {capability.label}
                      </Label>
                      <p className="text-xs text-muted-foreground">{capability.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Lodging Options */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Tent className="w-5 h-5 text-primary" />
                Lodging Preference
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RadioGroup value={lodging} onValueChange={setLodging} className="grid gap-3">
                {LODGING_OPTIONS.map((option) => (
                  <div
                    key={option.id}
                    className="flex items-start space-x-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                  >
                    <RadioGroupItem value={option.id} id={option.id} className="mt-0.5" />
                    <div className="space-y-0.5">
                      <Label htmlFor={option.id} className="cursor-pointer font-medium">
                        {option.label}
                      </Label>
                      <p className="text-xs text-muted-foreground">{option.description}</p>
                    </div>
                  </div>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>

          {/* Activities */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Camera className="w-5 h-5 text-primary" />
                Activities
              </CardTitle>
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

              <div className="border-t border-border pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Tent className="w-5 h-5 text-amber-500" />
                    <div>
                      <Label>Base Camp Mode</Label>
                      <p className="text-sm text-muted-foreground">
                        {destinations.length > 1
                          ? 'Stay at one campsite per destination area'
                          : 'Stay at the same campsite each night'}
                      </p>
                    </div>
                  </div>
                  <Switch checked={baseCampMode} onCheckedChange={setBaseCampMode} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Vehicle Type */}
          <Card>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Car className="w-5 h-5 text-primary" />
                  <Label>Vehicle Type</Label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { value: 'sedan', label: 'Sedan', desc: 'Paved roads only' },
                    { value: 'suv', label: 'SUV/Crossover', desc: 'Light dirt roads' },
                    { value: '4wd', label: '4WD/Off-road', desc: 'Rough terrain' },
                    { value: 'rv', label: 'RV/Camper', desc: 'Large vehicle access' },
                  ] as const).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setVehicleType(option.value)}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        vehicleType === option.value
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <p className="font-medium text-foreground text-sm">{option.label}</p>
                      <p className="text-xs text-muted-foreground">{option.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Lodging Preference */}
          <Card>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Home className="w-5 h-5 text-primary" />
                  <Label>Lodging Preference</Label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { value: 'dispersed', label: 'Dispersed Camping', desc: 'Free, remote sites' },
                    { value: 'campground', label: 'Campground', desc: 'Paid sites with amenities' },
                    { value: 'cabin', label: 'Cabin/Glamping', desc: 'Rustic comfort' },
                    { value: 'hotel', label: 'Hotel/Motel', desc: 'Full amenities' },
                    { value: 'mixed', label: 'Mix It Up', desc: 'Variety of options' },
                  ] as const).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setLodgingPreference(option.value)}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        lodgingPreference === option.value
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-primary/50'
                      } ${option.value === 'mixed' ? 'col-span-2' : ''}`}
                    >
                      <p className="font-medium text-foreground text-sm">{option.label}</p>
                      <p className="text-xs text-muted-foreground">{option.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Activities */}
          <Card>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mountain className="w-5 h-5 text-primary" />
                    <Label>Activities</Label>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {activities.length} selected
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { value: 'hiking', label: 'Hiking', emoji: '🥾' },
                    { value: 'biking', label: 'Mountain Biking', emoji: '🚵' },
                    { value: 'climbing', label: 'Rock Climbing', emoji: '🧗' },
                    { value: 'fishing', label: 'Fishing', emoji: '🎣' },
                    { value: 'photography', label: 'Photography', emoji: '📷' },
                    { value: 'wildlife', label: 'Wildlife Viewing', emoji: '🦌' },
                  ] as const).map((option) => {
                    const isSelected = activities.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setActivities(activities.filter((a) => a !== option.value));
                          } else {
                            setActivities([...activities, option.value]);
                          }
                        }}
                        className={`p-3 rounded-lg border text-left transition-all flex items-center gap-2 ${
                          isSelected
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <span className="text-lg">{option.emoji}</span>
                        <p className="font-medium text-foreground text-sm flex-1">{option.label}</p>
                        {isSelected && <Check className="w-4 h-4 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Create Button */}
          <Button
            variant="hero"
            size="lg"
            className="w-full"
            onClick={handleCreateTrip}
          >
            Create Trip
          </Button>
        </div>
      </main>
    </div>
  );
};

export default CreateTrip;
