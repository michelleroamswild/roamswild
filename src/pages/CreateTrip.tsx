import { useState, useEffect, useMemo, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { X, CloudCheck, SpinnerGap } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Mono, Pill } from "@/components/redesign";
import { WizardProgress } from "@/components/wizard/WizardProgress";
import { EntryPointSelector, checkIfDrivable } from "@/components/EntryPointSelector";
import { useTripGenerator } from "@/hooks/use-trip-generator";
import { useTrip } from "@/context/TripContext";
import { useWizard, WizardStep } from "@/hooks/use-wizard";
import { useTripDraft, TripWizardState } from "@/hooks/use-trip-draft";
import { TripConfig, TripDestination, LodgingType, PacePreference } from "@/types/trip";
import { getTripUrl } from "@/utils/slugify";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  WizardNavigation,
  StepTripBasics,
  StepBuildMethod,
  StepDestinations,
  StepLodging,
  StepActivities,
  StepDayBuilder,
} from "@/components/wizard";
import { BuildMethod } from "@/components/wizard/steps/StepBuildMethod";
import { TripStop } from "@/types/trip";

// State for a single day in manual trip building
interface ManualDayState {
  area: {
    name: string;
    lat: number;
    lng: number;
    placeId: string;
  } | null;
  campsite: TripStop | null;
  stops: TripStop[];
}

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

// Base steps before build method choice
const BASE_STEPS: WizardStep[] = [
  { id: 'basics', title: 'Trip Details' },
  { id: 'build-method', title: 'Build Method' },
];

// AI flow steps (after choosing "Plan My Route")
const AI_FLOW_STEPS: WizardStep[] = [
  { id: 'destinations', title: 'Destinations' },
  { id: 'lodging', title: 'Lodging' },
  { id: 'activities', title: 'Activities', isOptional: true },
];

// Manual flow steps will be dynamic based on duration
const getManualFlowSteps = (duration: number): WizardStep[] => {
  const daySteps: WizardStep[] = [];
  for (let i = 1; i <= duration; i++) {
    daySteps.push({ id: `day-${i}`, title: `Day ${i}` });
  }
  return daySteps;
};

const CreateTrip = () => {
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const stateLocation = routerLocation.state as LocationState | null;
  const { generateTrip, generating, error: generatorError } = useTripGenerator();
  const { setGeneratedTrip, tripNameExists } = useTrip();

  // Draft auto-save
  const { draft, loading: draftLoading, saving: draftSaving, lastSaved, debouncedSave, deleteDraft, hasDraft } = useTripDraft();
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [draftChecked, setDraftChecked] = useState(false);
  const [pendingRestoreStep, setPendingRestoreStep] = useState<number | null>(null);

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

  // Build method state
  const [buildMethod, setBuildMethod] = useState<BuildMethod | null>(null);

  // Manual trip building state - one entry per day
  const [manualDays, setManualDays] = useState<ManualDayState[]>([]);

  // Initialize manual days when duration changes
  useEffect(() => {
    if (buildMethod === 'manual') {
      // Ensure we have the right number of days
      setManualDays(prev => {
        const newDays: ManualDayState[] = [];
        for (let i = 0; i < duration[0]; i++) {
          newDays.push(prev[i] || { area: null, campsite: null, stops: [] });
        }
        return newDays;
      });
    }
  }, [duration, buildMethod]);

  // Drag state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Compute wizard steps based on build method
  const wizardSteps = useMemo(() => {
    if (buildMethod === 'ai') {
      return [...BASE_STEPS, ...AI_FLOW_STEPS];
    } else if (buildMethod === 'manual') {
      return [...BASE_STEPS, ...getManualFlowSteps(duration[0])];
    }
    // Before build method is chosen, just show base steps
    return BASE_STEPS;
  }, [buildMethod, duration]);

  // Wizard state
  const wizard = useWizard({ steps: wizardSteps });

  // Get current wizard state for saving
  const getWizardState = useCallback((): TripWizardState => ({
    tripName,
    startLocation,
    endLocation,
    returnToStart,
    duration,
    startDate: startDate?.toISOString() || null,
    buildMethod,
    destinations,
    globalLodging,
    baseCampMode,
    activities,
    offroadVehicle,
    pacePreference,
    manualDays,
  }), [tripName, startLocation, endLocation, returnToStart, duration, startDate, buildMethod, destinations, globalLodging, baseCampMode, activities, offroadVehicle, pacePreference, manualDays]);

  // Restore state from draft
  const restoreFromDraft = useCallback((draftData: typeof draft) => {
    if (!draftData?.wizard_state) return;
    const state = draftData.wizard_state;

    setTripName(state.tripName || '');
    setStartLocation(state.startLocation);
    setEndLocation(state.endLocation);
    setReturnToStart(state.returnToStart ?? true);
    setDuration(state.duration || [3]);
    setStartDate(state.startDate ? new Date(state.startDate) : undefined);
    setBuildMethod(state.buildMethod);
    setDestinations(state.destinations || []);
    setGlobalLodging(state.globalLodging || 'dispersed');
    setBaseCampMode(state.baseCampMode ?? false);
    setActivities(state.activities || ['hiking']);
    setOffroadVehicle(state.offroadVehicle || '4wd-high');
    setPacePreference(state.pacePreference || 'moderate');
    setManualDays(state.manualDays || []);

    // Set pending step to navigate after wizard steps update
    if (draftData.current_step > 0) {
      setPendingRestoreStep(draftData.current_step);
    }
  }, []);

  // Check for existing draft on mount
  useEffect(() => {
    if (!draftLoading && !draftChecked) {
      setDraftChecked(true);
      if (hasDraft && draft) {
        setShowRestoreDialog(true);
      }
    }
  }, [draftLoading, draftChecked, hasDraft, draft]);

  // Navigate to restored step after wizard steps update
  useEffect(() => {
    if (pendingRestoreStep !== null && pendingRestoreStep < wizardSteps.length) {
      wizard.goToStep(pendingRestoreStep);
      setPendingRestoreStep(null);
    }
  }, [pendingRestoreStep, wizardSteps.length, wizard]);

  // Auto-save on state changes (after initial load)
  useEffect(() => {
    if (draftChecked && !showRestoreDialog) {
      const state = getWizardState();
      // Only save if there's meaningful data
      if (state.tripName || state.startLocation || state.destinations.length > 0 || state.buildMethod || state.manualDays.some(d => d.area || d.campsite || d.stops.length > 0)) {
        debouncedSave(state, wizard.currentStep);
      }
    }
  }, [draftChecked, showRestoreDialog, getWizardState, wizard.currentStep, debouncedSave]);

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
    const currentStepId = wizardSteps[wizard.currentStep]?.id;

    switch (currentStepId) {
      case 'basics': // Trip Details (Name, Locations, Dates)
        if (tripNameError) return false;
        if (duration[0] < 1) return false;
        return true;
      case 'build-method': // Build Method Choice
        return buildMethod !== null;
      case 'destinations': // Destinations (AI flow)
        return destinations.length > 0;
      case 'lodging': // Lodging (AI flow)
        return true;
      case 'activities': // Activities (AI flow)
        return true;
      default:
        // Day builder steps (manual flow)
        if (currentStepId?.startsWith('day-')) {
          // For now, always allow proceeding on day steps
          // TODO: Validate that campsite is selected for each day
          return true;
        }
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
        // Delete the draft since trip was created successfully
        deleteDraft();
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
    const currentStepId = wizardSteps[wizard.currentStep]?.id;

    switch (currentStepId) {
      case 'basics':
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
      case 'build-method':
        return (
          <StepBuildMethod
            buildMethod={buildMethod}
            setBuildMethod={setBuildMethod}
          />
        );
      case 'destinations':
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
      case 'lodging':
        return (
          <StepLodging
            globalLodging={globalLodging}
            setGlobalLodging={setGlobalLodging}
            baseCampMode={baseCampMode}
            setBaseCampMode={setBaseCampMode}
          />
        );
      case 'activities':
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
        // Day builder steps (manual flow)
        if (currentStepId?.startsWith('day-')) {
          const dayNumber = parseInt(currentStepId.replace('day-', ''), 10);
          const dayIndex = dayNumber - 1;
          const dayState = manualDays[dayIndex] || { area: null, campsite: null, stops: [] };

          return (
            <StepDayBuilder
              dayNumber={dayNumber}
              totalDays={duration[0]}
              area={dayState.area}
              setArea={(area) => {
                setManualDays(prev => {
                  const newDays = [...prev];
                  newDays[dayIndex] = { ...newDays[dayIndex], area };
                  return newDays;
                });
              }}
              campsite={dayState.campsite}
              setCampsite={(campsite) => {
                setManualDays(prev => {
                  const newDays = [...prev];
                  newDays[dayIndex] = { ...newDays[dayIndex], campsite };
                  return newDays;
                });
              }}
              stops={dayState.stops}
              setStops={(stops) => {
                setManualDays(prev => {
                  const newDays = [...prev];
                  newDays[dayIndex] = { ...newDays[dayIndex], stops };
                  return newDays;
                });
              }}
            />
          );
        }
        return null;
    }
  };

  const currentStepId = wizardSteps[wizard.currentStep]?.id;
  const isDayBuilderStep = currentStepId?.startsWith('day-');

  return (
    <div className={isDayBuilderStep ? "h-screen bg-cream dark:bg-paper text-ink font-sans flex flex-col overflow-hidden" : "min-h-screen bg-cream text-ink font-sans"}>
      {/* Header — cream surface, mono meta + sans title, close pill on the right */}
      <header className={`${isDayBuilderStep ? '' : 'sticky top-0'} z-50 bg-cream/95 dark:bg-paper-2/95 backdrop-blur-md border-b border-line`}>
        <div className="max-w-[1440px] mx-auto px-4 md:px-14 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <Link
                to="/"
                aria-label="Close"
                className="inline-flex items-center justify-center w-9 h-9 rounded-full text-ink-3 hover:text-ink hover:bg-ink/5 transition-colors shrink-0"
              >
                <X className="w-4 h-4" weight="regular" />
              </Link>
              <div className="min-w-0">
                <Mono className="text-pine-6">
                  Step {wizard.currentStep + 1} of {wizardSteps.length}
                </Mono>
                <h1 className="text-[18px] md:text-[20px] font-sans font-bold tracking-[-0.01em] text-ink mt-0.5">
                  Create a trip
                </h1>
              </div>
            </div>

            {/* Draft save indicator */}
            {draftSaving ? (
              <div className="flex items-center gap-1.5 text-ink-3">
                <SpinnerGap className="w-3.5 h-3.5 animate-spin" />
                <Mono className="hidden sm:inline">Saving</Mono>
              </div>
            ) : lastSaved ? (
              <div className="flex items-center gap-1.5 text-pine-6">
                <CloudCheck className="w-3.5 h-3.5" weight="regular" />
                <Mono className="hidden sm:inline text-pine-6">Draft saved</Mono>
              </div>
            ) : null}
          </div>

          {/* Progress bar — hide on the day-builder full-screen layout */}
          {!isDayBuilderStep && (
            <div className="mt-5">
              <WizardProgress steps={wizardSteps} currentStep={wizard.currentStep} />
            </div>
          )}
        </div>
      </header>

      {isDayBuilderStep ? (
        /* Day builder uses full-height flex layout like DispersedExplorer */
        <div className="flex-1 overflow-hidden">
          {renderStep()}
        </div>
      ) : (
        <main className="max-w-[1440px] mx-auto px-4 md:px-14 py-10 pb-28">
          <div className={`min-h-[400px] ${
            currentStepId === 'basics' || currentStepId === 'build-method'
              ? 'max-w-2xl mx-auto'
              : 'max-w-3xl mx-auto'
          }`}>
            {renderStep()}
          </div>
        </main>
      )}

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

      {/* Restore Draft Dialog */}
      <Dialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
        <DialogContent className="border-line bg-white dark:bg-paper-2 rounded-[18px]">
          <DialogHeader>
            <Mono className="text-pine-6">Draft found</Mono>
            <DialogTitle className="font-sans font-semibold tracking-[-0.015em] text-ink text-[22px] leading-[1.15] mt-1">
              Pick up where you left off?
            </DialogTitle>
            <DialogDescription className="text-[14px] text-ink-3 leading-[1.55]">
              You have a saved draft from{' '}
              {draft?.updated_at
                ? new Date(draft.updated_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })
                : 'earlier'}
              . Continue editing it, or start fresh?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2 mt-2">
            <Pill
              variant="ghost"
              mono={false}
              onClick={() => {
                deleteDraft();
                setShowRestoreDialog(false);
              }}
            >
              Start fresh
            </Pill>
            <Pill
              variant="solid-pine"
              mono={false}
              onClick={() => {
                restoreFromDraft(draft);
                setShowRestoreDialog(false);
              }}
            >
              Continue draft
            </Pill>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
