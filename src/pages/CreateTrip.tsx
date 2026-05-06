import { useState, useEffect, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { X, CloudCheck, SpinnerGap } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Mono, Pill } from "@/components/redesign";
import { WizardProgress } from "@/components/wizard/WizardProgress";
import { CreateTripLoader } from "@/components/CreateTripLoader";
import { EntryPointSelector, checkIfDrivable } from "@/components/EntryPointSelector";
import { useTripGenerator } from "@/hooks/use-trip-generator";
import { useTrip } from "@/context/TripContext";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWizard, WizardStep } from "@/hooks/use-wizard";
import { useTripDraft, TripWizardState } from "@/hooks/use-trip-draft";
import { TripConfig, TripDestination, LodgingType, PacePreference, TravelStyle, GeoBounds, DestinationActivity } from "@/types/trip";
import { getTripUrl } from "@/utils/slugify";
import { optimizePath } from "@/utils/optimize-path";
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
  StepLodging,
  StepActivities,
} from "@/components/wizard";
import { ActivitiesMode } from "@/components/wizard/steps/StepActivities";

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
  // Destination-only — start/end leave these undefined.
  isRegion?: boolean;
  bounds?: GeoBounds;
  aiActivities?: boolean;
  activities?: DestinationActivity[];
  exploreTown?: boolean;
}

// Wireframe flow — flat 3-step list. Build-method + manual day-by-day live
// in dormant files for now and will be reintroduced once the new flow is
// fleshed out.
const WIZARD_STEPS: WizardStep[] = [
  { id: 'basics', title: 'Details' },
  { id: 'activities', title: 'Activities' },
  { id: 'lodging', title: 'Lodging' },
];

const CreateTrip = () => {
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const stateLocation = routerLocation.state as LocationState | null;
  const { generateTrip, generating, error: generatorError } = useTripGenerator();
  const { setGeneratedTrip, tripNameExists, saveTrip } = useTrip();
  const { user } = useAuth();
  const [profileVehicleLabel, setProfileVehicleLabel] = useState<string | null>(null);

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

  // Activity-type prefs (still tracked under the hood for the generator;
  // surfaced UI for these is dormant until the wireframe is fleshed out).
  const [activities, setActivities] = useState<string[]>(["hiking"]);
  const [offroadVehicle, setOffroadVehicle] = useState<'4wd-high' | 'awd-medium'>('4wd-high');
  const [pacePreference, setPacePreference] = useState<PacePreference>('moderate');

  // Route prefs
  const [travelStyle] = useState<TravelStyle>('direct');
  const [maxDrivingHours, setMaxDrivingHours] = useState<number>(6);

  // Activities mode — wireframe choice between "AI surprise" and "I'll choose".
  // For now this drives every destination's aiActivities field globally.
  const [activitiesMode, setActivitiesMode] = useState<ActivitiesMode>('ai');

  // Drag state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const wizardSteps = WIZARD_STEPS;

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
    buildMethod: 'ai' as const,
    destinations,
    globalLodging,
    baseCampMode,
    activities,
    offroadVehicle,
    pacePreference,
    travelStyle,
    maxDrivingHours,
    activitiesMode,
    manualDays: [],
  }), [tripName, startLocation, endLocation, returnToStart, duration, startDate, destinations, globalLodging, baseCampMode, activities, offroadVehicle, pacePreference, travelStyle, maxDrivingHours, activitiesMode]);

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
    setDestinations(state.destinations || []);
    setGlobalLodging(state.globalLodging || 'dispersed');
    setBaseCampMode(state.baseCampMode ?? false);
    setActivities(state.activities || ['hiking']);
    setOffroadVehicle(state.offroadVehicle || '4wd-high');
    setPacePreference(state.pacePreference || 'moderate');
    setMaxDrivingHours(state.maxDrivingHours || 6);
    setActivitiesMode(state.activitiesMode || 'ai');

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

  // Pull the user's saved vehicle prefs once and pre-fill the offroad
  // selection. Skip the override when restoring from a draft (the draft is
  // authoritative for that session). The label always renders when a profile
  // rig exists so the user sees where the value came from.
  useEffect(() => {
    if (!user || !draftChecked) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('vehicle_type, drivetrain, clearance')
        .eq('id', user.id)
        .maybeSingle();
      if (cancelled) return;
      const row = data as
        | { vehicle_type: string | null; drivetrain: string | null; clearance: string | null }
        | null;
      if (!row || (!row.vehicle_type && !row.drivetrain && !row.clearance)) return;

      const isFourWdRig =
        row.drivetrain?.startsWith('4wd_') ||
        row.vehicle_type === '4wd' ||
        row.clearance === 'extra_high' ||
        (row.vehicle_type === 'truck' && row.clearance === 'high');
      const mapped: '4wd-high' | 'awd-medium' = isFourWdRig ? '4wd-high' : 'awd-medium';

      // Build a short human label from whatever fields are set.
      const VEHICLE_LABEL: Record<string, string> = {
        sedan: 'Sedan', suv: 'SUV', truck: 'Truck', '4wd': '4WD rig', rv: 'RV',
      };
      const DRIVETRAIN_LABEL: Record<string, string> = {
        fwd: 'FWD', awd: 'AWD', '4wd_part_time': '4WD part-time', '4wd_full_time': '4WD full-time',
      };
      const CLEARANCE_LABEL: Record<string, string> = {
        standard: 'standard clearance', high: 'high clearance', extra_high: 'extra-high clearance',
      };
      const parts = [
        row.vehicle_type ? VEHICLE_LABEL[row.vehicle_type] ?? row.vehicle_type : null,
        row.drivetrain ? DRIVETRAIN_LABEL[row.drivetrain] ?? row.drivetrain : null,
        row.clearance ? CLEARANCE_LABEL[row.clearance] ?? row.clearance : null,
      ].filter(Boolean);
      setProfileVehicleLabel(parts.join(' · ') || null);

      // Only override the wizard default when there's no draft to restore.
      if (!hasDraft) setOffroadVehicle(mapped);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, draftChecked, hasDraft]);

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
      if (state.tripName || state.startLocation || state.destinations.length > 0) {
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
      case 'basics':
        if (tripNameError) return false;
        if (duration[0] < 1) return false;
        if (destinations.length === 0) return false;
        return true;
      case 'lodging':
        return true;
      case 'activities':
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

  // Park-like places (single park, single feature) need an entry point — the
  // pin is often inside untraversable terrain. Regions like "Oregon Coast"
  // skip this and are added directly with their viewport bounds.
  const PARK_TYPES = ['national_park', 'state_park', 'park'];

  const isParkType = (types: string[] | undefined): boolean => {
    if (!types) return false;
    return types.some(t => PARK_TYPES.includes(t));
  };

  // Pull viewport bounds from a place result, if present.
  const getPlaceBounds = (place: google.maps.places.PlaceResult): GeoBounds | null => {
    const vp = place.geometry?.viewport;
    if (!vp) return null;
    const ne = vp.getNorthEast();
    const sw = vp.getSouthWest();
    return {
      ne: { lat: ne.lat(), lng: ne.lng() },
      sw: { lat: sw.lat(), lng: sw.lng() },
    };
  };

  // Region detection: large viewport + non-park = a region the AI should
  // expand into specific stops (e.g. "Oregon Coast", "Sierra Nevada").
  const isRegionPlace = (place: google.maps.places.PlaceResult): boolean => {
    if (isParkType(place.types)) return false;
    const bounds = getPlaceBounds(place);
    if (!bounds) return false;
    // Crude diagonal in km via haversine — anything 30+ km across counts.
    const R = 6371;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(bounds.ne.lat - bounds.sw.lat);
    const dLng = toRad(bounds.ne.lng - bounds.sw.lng);
    const lat1 = toRad(bounds.sw.lat);
    const lat2 = toRad(bounds.ne.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    const diag = 2 * R * Math.asin(Math.sqrt(h));
    return diag >= 30;
  };

  const handleAddDestination = async (place: google.maps.places.PlaceResult) => {
    if (place.geometry?.location && place.place_id) {
      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();

      // Park-like places force entry-point selection.
      if (isParkType(place.types)) {
        setEntryPointModal({ isOpen: true, place, targetType: 'destination' });
        return;
      }

      // Regions (e.g. "Oregon Coast") get added directly as a region.
      if (isRegionPlace(place)) {
        addDestinationFromPlace(place);
        return;
      }

      // Otherwise check drivability.
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
      const isRegion = isRegionPlace(place);
      const bounds = getPlaceBounds(place);
      const newDest: LocationData = {
        id: `dest-${place.place_id}-${Date.now()}`,
        name: place.name || place.formatted_address || "Selected Location",
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
        placeId: place.place_id,
        aiActivities: true,
        ...(isRegion && { isRegion: true }),
        ...(bounds && { bounds }),
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
        aiActivities: true,
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

    // Reorder the user's destinations along the shortest path so a
    // Crater Lake → Cannon Beach → Bend entry doesn't zig-zag. The start
    // location is always the anchor; the end is whatever the trip terminates
    // at (start for round trips, endLocation if set, else open-ended). The
    // user-set endLocation is appended below and is NOT permuted.
    const originalDestinations = destinations;
    const optimizationEnd = returnToStart
      ? { lat: effectiveStart.lat, lng: effectiveStart.lng }
      : endLocation
        ? { lat: endLocation.lat, lng: endLocation.lng }
        : undefined;
    const { ordered: optimizedDestinations, reordered: didReorder } = optimizePath({
      start: { lat: effectiveStart.lat, lng: effectiveStart.lng },
      destinations: originalDestinations,
      end: optimizationEnd,
    });

    // Auto-distribute remaining days across destinations the user didn't
    // explicitly assign (days = 0 / undefined). Round-trip costs 1 travel
    // day; the remainder is the activity budget.
    const travelDays = returnToStart && startLocation ? 1 : 0;
    const totalSpecified = optimizedDestinations.reduce((sum, d) => sum + (d.days || 0), 0);
    const unsetCount = optimizedDestinations.filter(d => !d.days).length;
    const remaining = Math.max(0, duration[0] - travelDays - totalSpecified);
    const baseDistribution = unsetCount > 0 ? Math.floor(remaining / unsetCount) : 0;
    let leftover = unsetCount > 0 ? remaining - baseDistribution * unsetCount : 0;

    // Build destinations as TripDestination[]
    // All destinations are included (even if first one is also used as start)
    const tripDestinations: TripDestination[] = optimizedDestinations.map(dest => {
      const explicitDays = dest.days && dest.days > 0 ? dest.days : undefined;
      const distributedDays = explicitDays ?? (baseDistribution + (leftover-- > 0 ? 1 : 0));
      return {
        id: dest.id,
        placeId: dest.placeId,
        name: dest.name,
        address: dest.name,
        coordinates: { lat: dest.lat, lng: dest.lng },
        daysAtDestination: distributedDays > 0 ? distributedDays : undefined,
        ...(dest.isRegion && { isRegion: true }),
        ...(dest.bounds && { bounds: dest.bounds }),
        // Wireframe: every destination inherits the global activities mode.
        aiActivities: activitiesMode === 'ai',
        ...(dest.activities && dest.activities.length > 0 && { activities: dest.activities }),
        ...(dest.exploreTown && { exploreTown: true }),
      };
    });

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

    // Generate trip name if not provided. Use the optimized order so the
    // generated name reflects the actual end of the route.
    const lastDest = optimizedDestinations[optimizedDestinations.length - 1];
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
      travelStyle: travelStyle,
      maxDrivingHoursPerDay: maxDrivingHours,
    };

    // Check for duplicate trip name
    if (tripNameExists(generatedName)) {
      toast.error("Trip name already exists", {
        description: "Please choose a different name for your trip",
      });
      return;
    }

    try {
      const trip = await generateTrip(tripConfig);

      if (trip) {
        if (didReorder) {
          trip.reorderedDestinations = {
            original: originalDestinations.map(d => d.name),
            optimized: optimizedDestinations.map(d => d.name),
          };
        }
        setGeneratedTrip(trip);
        // Persist to Supabase so /trip/<slug> survives a reload. saveTrip
        // updates generatedTrip with the DB-generated id when it inserts.
        try {
          await saveTrip(trip);
        } catch (saveErr) {
          // Non-fatal — the trip is still in memory, but reload won't restore it.
          console.warn('Failed to persist new trip:', saveErr);
        }
        deleteDraft();
        toast.success("Trip created!", {
          description: generatedName,
        });
        navigate(getTripUrl(trip.config.name));
      } else {
        toast.error("Failed to generate trip", {
          description: generatorError || "Please try again",
        });
      }
    } catch (err) {
      toast.error("Failed to generate trip", {
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
            returnToStart={returnToStart}
            setReturnToStart={setReturnToStart}
            onStartLocationSelect={handleStartLocationSelect}
            destinations={destinations}
            setDestinations={setDestinations}
            onAddDestination={handleAddDestination}
            draggedIndex={draggedIndex}
            setDraggedIndex={setDraggedIndex}
            startDate={startDate}
            setStartDate={setStartDate}
            duration={duration}
            setDuration={setDuration}
            maxDrivingHours={maxDrivingHours}
            setMaxDrivingHours={setMaxDrivingHours}
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
            mode={activitiesMode}
            setMode={setActivitiesMode}
            activities={activities}
            setActivities={setActivities}
          />
        );
      default:
        return null;
    }
  };

  const currentStepId = wizardSteps[wizard.currentStep]?.id;

  return (
    <div className="min-h-screen bg-cream text-ink font-sans">
      <header className="sticky top-0 z-50 bg-cream/95 dark:bg-paper-2/95 backdrop-blur-md border-b border-line">
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

          <div className="mt-5">
            <WizardProgress steps={wizardSteps} currentStep={wizard.currentStep} />
          </div>
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto px-4 md:px-14 py-10 pb-28">
        <div className={`min-h-[400px] ${
          currentStepId === 'basics' || currentStepId === 'activities'
            ? 'max-w-2xl mx-auto'
            : 'max-w-3xl mx-auto'
        }`}>
          {renderStep()}
        </div>
      </main>

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

      {/* Trip-generation loading screen — replaces the "Creating…" pill state */}
      {generating && (
        <CreateTripLoader
          tripName={tripName.trim() || (destinations[destinations.length - 1]?.name ? `${destinations[destinations.length - 1].name} Trip` : undefined)}
          destinations={destinations}
        />
      )}

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
