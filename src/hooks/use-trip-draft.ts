import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { TripStop, LodgingType, PacePreference, DestinationActivity, TravelStyle, GeoBounds } from '@/types/trip';
import { BuildMethod } from '@/components/wizard/steps/StepBuildMethod';

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

interface LocationData {
  id: string;
  name: string;
  lat: number;
  lng: number;
  placeId: string;
  days?: number;
  // Destination-only fields (start/end leave these undefined).
  isRegion?: boolean;
  bounds?: GeoBounds;
  aiActivities?: boolean;
  activities?: DestinationActivity[];
}

// Complete wizard state to be saved
export interface TripWizardState {
  // Basic info
  tripName: string;
  startLocation: LocationData | null;
  endLocation: LocationData | null;
  returnToStart: boolean;
  duration: number[];
  startDate: string | null; // ISO string for serialization

  // Build method
  buildMethod: BuildMethod | null;

  // AI flow state
  destinations: LocationData[];
  globalLodging: LodgingType;
  baseCampMode: boolean;
  activities: string[];
  offroadVehicle: '4wd-high' | 'awd-medium';
  pacePreference: PacePreference;
  travelStyle: TravelStyle;
  maxDrivingHours: number;
  activitiesMode: 'ai' | 'manual';

  // Manual flow state
  manualDays: ManualDayState[];
}

interface TripDraft {
  id: string;
  user_id: string;
  wizard_state: TripWizardState;
  current_step: number;
  created_at: string;
  updated_at: string;
}

const DEBOUNCE_MS = 2000; // Save 2 seconds after last change

export function useTripDraft() {
  const { user } = useAuth();
  const [draft, setDraft] = useState<TripDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load existing draft on mount
  useEffect(() => {
    if (user) {
      loadDraft();
    } else {
      setDraft(null);
      setLoading(false);
    }
  }, [user]);

  const loadDraft = useCallback(async () => {
    if (!user) return null;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('trip_drafts')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = no rows returned, which is fine
        console.error('Error loading draft:', error);
      }

      if (data) {
        setDraft(data as TripDraft);
        setLastSaved(new Date(data.updated_at));
        return data as TripDraft;
      }
      return null;
    } catch (err) {
      console.error('Error loading draft:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [user]);

  const saveDraft = useCallback(async (
    wizardState: TripWizardState,
    currentStep: number
  ) => {
    if (!user) return;

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('trip_drafts')
        .upsert({
          user_id: user.id,
          wizard_state: wizardState as any, // JSONB
          current_step: currentStep,
        }, {
          onConflict: 'user_id',
        })
        .select()
        .single();

      if (error) {
        console.error('Error saving draft:', error);
        return;
      }

      if (data) {
        setDraft(data as TripDraft);
        setLastSaved(new Date());
      }
    } catch (err) {
      console.error('Error saving draft:', err);
    } finally {
      setSaving(false);
    }
  }, [user]);

  // Debounced save - call this on state changes
  const debouncedSave = useCallback((
    wizardState: TripWizardState,
    currentStep: number
  ) => {
    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Schedule new save
    saveTimeoutRef.current = setTimeout(() => {
      saveDraft(wizardState, currentStep);
    }, DEBOUNCE_MS);
  }, [saveDraft]);

  const deleteDraft = useCallback(async () => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('trip_drafts')
        .delete()
        .eq('user_id', user.id);

      if (error) {
        console.error('Error deleting draft:', error);
        return;
      }

      setDraft(null);
      setLastSaved(null);
    } catch (err) {
      console.error('Error deleting draft:', err);
    }
  }, [user]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    draft,
    loading,
    saving,
    lastSaved,
    loadDraft,
    saveDraft,
    debouncedSave,
    deleteDraft,
    hasDraft: !!draft,
  };
}
