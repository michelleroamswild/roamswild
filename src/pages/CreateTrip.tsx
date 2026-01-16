import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { EntryPointSelector, checkIfDrivable } from "@/components/EntryPointSelector";
import { useTripGenerator } from "@/hooks/use-trip-generator";
import { useTrip } from "@/context/TripContext";
import { useWizard, WizardStep } from "@/hooks/use-wizard";
import { TripConfig, TripDestination, LodgingType, PacePreference } from "@/types/trip";
import { getTripUrl } from "@/utils/slugify";
import {
  WizardProgress,
  WizardNavigation,
  StepTripBasics,
  StepDestinations,
  StepLodging,
  StepActivities,
} from "@/components/wizard";

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
  days?: number;
}

const WIZARD_STEPS: WizardStep[] = [
  { id: 'basics', title: 'Trip Details' },
  { id: 'destinations', title: 'Destinations' },
  { id: 'lodging', title: 'Lodging' },
  { id: 'activities', title: 'Activities', isOptional: true },
];

const CreateTrip = () => {
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const stateLocation = routerLocation.state as LocationState | null;
  const { generateTrip, generating, error: generatorError } = useTripGenerator();
  const { setGeneratedTrip, tripNameExists } = useTrip();

  // Wizard state
  const wizard = useWizard({ steps: WIZARD_STEPS });

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
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);

  // Lodging state
  const [globalLodging, setGlobalLodging] = useState<LodgingType>("dispersed");
  const [baseCampMode, setBaseCampMode] = useState(false); // Default to per-night selection for best availability

  // Activities state
  const [activities, setActivities] = useState<string[]>(["hiking"]);
  const [offroadVehicle, setOffroadVehicle] = useState<'4wd-high' | 'awd-medium'>('4wd-high');
  const [pacePreference, setPacePreference] = useState<PacePreference>('moderate');

  // Drag state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Entry point selector state
  const [entryPointModal, setEntryPointModal] = useState<{
    isOpen: boolean;
    place: google.maps.places.PlaceResult | null;
    targetType: 'destination' | 'start' | 'end';
  }>({ isOpen: false, place: null, targetType: 'destination' });

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

  // Step validation
  const canProceed = (): boolean => {
    switch (wizard.currentStep) {
      case 0: // Trip Details (Name, Locations, Dates)
        if (tripNameError) return false;
        if (duration[0] < 1) return false;
        // Start/end locations are optional
        return true;
      case 1: // Destinations
        return destinations.length > 0;
      case 2: // Lodging
        return true;
      case 3: // Activities
        return true;
      default:
        return true;
    }
  };

  // Location handlers
  const handleStartLocationSelect = async (place: google.maps.places.PlaceResult) => {
    if (place.geometry?.location && place.place_id) {
      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();

      // Start locations are typically cities, so skip large area check
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

  const handleEndLocationSelect = async (place: google.maps.places.PlaceResult) => {
    if (place.geometry?.location && place.place_id) {
      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();

      // End locations are typically cities, so skip large area check
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

  // Place types that indicate large areas requiring specific entry points
  const LARGE_AREA_TYPES = [
    'national_park',
    'state_park',
    'park',
    'natural_feature',
    'geological_feature',
  ];

  const isLargeAreaType = (types: string[] | undefined): boolean => {
    if (!types) return false;
    return types.some(t => LARGE_AREA_TYPES.includes(t));
  };

  const handleAddDestination = async (place: google.maps.places.PlaceResult) => {
    if (place.geometry?.location && place.place_id) {
      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();

      // Check if this is a large area type (like national park) that needs entry point selection
      const isLargeArea = isLargeAreaType(place.types);

      // For large areas, always prompt for entry point
      if (isLargeArea) {
        setEntryPointModal({ isOpen: true, place, targetType: 'destination' });
        return;
      }

      // For other places, check if drivable
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

  const handleCreateTrip = async () => {
    if (destinations.length === 0) {
      toast.error("Please add at least one destination");
      return;
    }

    // If no start location, use first destination as start
    const effectiveStart = startLocation || destinations[0];

    // Build start location as TripDestination
    const start: TripDestination = {
      id: effectiveStart.id,
      placeId: effectiveStart.placeId,
      name: effectiveStart.name,
      address: effectiveStart.name,
      coordinates: { lat: effectiveStart.lat, lng: effectiveStart.lng },
    };

    // Build destinations as TripDestination[]
    // All destinations are included (even if first one is also used as start)
    const tripDestinations: TripDestination[] = destinations.map(dest => ({
      id: dest.id,
      placeId: dest.placeId,
      name: dest.name,
      address: dest.name,
      coordinates: { lat: dest.lat, lng: dest.lng },
      daysAtDestination: dest.days || undefined,
    }));

    // Add end location as final destination if start location set and not returning to start
    if (startLocation && !returnToStart && endLocation) {
      tripDestinations.push({
        id: endLocation.id,
        placeId: endLocation.placeId,
        name: endLocation.name,
        address: endLocation.name,
        coordinates: { lat: endLocation.lat, lng: endLocation.lng },
      });
    }

    // Generate trip name if not provided
    const lastDest = destinations[destinations.length - 1];
    const generatedName = tripName.trim() ||
      (startLocation
        ? `${startLocation.name} to ${lastDest.name}`
        : `${lastDest.name} Trip`);

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
      returnToStart: startLocation ? returnToStart : false,
      sameCampsite: baseCampMode,
      activitiesPerDay: 1,
      vehicleType: activities.includes('offroading')
        ? (offroadVehicle === '4wd-high' ? '4wd' : 'suv')
        : 'sedan',
      lodgingPreference: globalLodging,
      activities: activities as any[],
      offroadVehicleType: activities.includes('offroading') ? offroadVehicle : undefined,
      hikingPreference: activities.includes('hiking') ? 'daily' : 'none',
      startDate: startDateStr,
      endDate: endDateStr,
      pacePreference: pacePreference,
    };

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

      if (trip) {
        setGeneratedTrip(trip);
        toast.success("Trip created!", {
          id: "generating",
          description: generatedName,
        });
        navigate(getTripUrl(trip.config.name));
      } else {
        toast.error("Failed to generate trip", {
          id: "generating",
          description: generatorError || "Please try again",
        });
      }
    } catch (err) {
      toast.error("Failed to generate trip", {
        id: "generating",
        description: err instanceof Error ? err.message : "Please try again",
      });
    }
  };

  // Render current step
  const renderStep = () => {
    switch (wizard.currentStep) {
      case 0:
        return (
          <StepTripBasics
            tripName={tripName}
            setTripName={setTripName}
            tripNameError={tripNameError}
            startLocation={startLocation}
            setStartLocation={setStartLocation}
            endLocation={endLocation}
            setEndLocation={setEndLocation}
            returnToStart={returnToStart}
            setReturnToStart={setReturnToStart}
            onStartLocationSelect={handleStartLocationSelect}
            onEndLocationSelect={handleEndLocationSelect}
            startDate={startDate}
            setStartDate={setStartDate}
            duration={duration}
            setDuration={setDuration}
          />
        );
      case 1:
        return (
          <StepDestinations
            destinations={destinations}
            setDestinations={setDestinations}
            duration={duration[0]}
            returnToStart={returnToStart}
            onAddDestination={handleAddDestination}
            draggedIndex={draggedIndex}
            setDraggedIndex={setDraggedIndex}
          />
        );
      case 2:
        return (
          <StepLodging
            globalLodging={globalLodging}
            setGlobalLodging={setGlobalLodging}
            baseCampMode={baseCampMode}
            setBaseCampMode={setBaseCampMode}
          />
        );
      case 3:
        return (
          <StepActivities
            activities={activities}
            setActivities={setActivities}
            offroadVehicle={offroadVehicle}
            setOffroadVehicle={setOffroadVehicle}
            pacePreference={pacePreference}
            setPacePreference={setPacePreference}
          />
        );
      default:
        return null;
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
                <ArrowLeft className="w-5 h-5" weight="bold" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-display font-bold text-foreground">Create Trip</h1>
              <p className="text-sm text-muted-foreground">Step {wizard.currentStep + 1} of {WIZARD_STEPS.length}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container px-4 md:px-6 py-6 max-w-2xl">
        {/* Progress */}
        <WizardProgress steps={WIZARD_STEPS} currentStep={wizard.currentStep} />

        {/* Current Step Content */}
        <div className="min-h-[400px]">
          {renderStep()}
        </div>

        {/* Navigation */}
        <WizardNavigation
          onBack={wizard.goBack}
          onNext={wizard.goNext}
          onSubmit={handleCreateTrip}
          isFirstStep={wizard.isFirstStep}
          isLastStep={wizard.isLastStep}
          canProceed={canProceed()}
          isSubmitting={generating}
        />
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
