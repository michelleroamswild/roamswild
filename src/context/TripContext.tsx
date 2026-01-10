import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { TripConfig, GeneratedTrip, TripDestination, TripStop } from '@/types/trip';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';
import type { Tables, TablesInsert, TablesUpdate, Json } from '@/integrations/supabase/types';

interface TripContextType {
  tripConfig: TripConfig | null;
  generatedTrip: GeneratedTrip | null;
  savedTrips: GeneratedTrip[];
  isLoading: boolean;
  setTripConfig: (config: TripConfig | null) => void;
  setGeneratedTrip: (trip: GeneratedTrip | null) => void;
  updateTripName: (name: string) => void;
  updateDuration: (days: number) => void;
  setStartLocation: (location: TripDestination) => void;
  addDestination: (destination: TripDestination) => void;
  removeDestination: (id: string) => void;
  reorderDestinations: (destinations: TripDestination[]) => void;
  setReturnToStart: (returnToStart: boolean) => void;
  clearTrip: () => void;
  saveTrip: (trip: GeneratedTrip) => Promise<void>;
  deleteSavedTrip: (tripId: string) => Promise<void>;
  loadSavedTrip: (tripId: string) => GeneratedTrip | null;
  isTripSaved: (tripId: string) => boolean;
  updateTripStop: (dayNumber: number, oldStopId: string, newStop: TripStop) => void;
  removeTripStop: (dayNumber: number, stopId: string) => void;
  addTripStop: (dayNumber: number, stop: TripStop) => void;
}

const TripContext = createContext<TripContextType | undefined>(undefined);

const defaultConfig: TripConfig = {
  name: '',
  duration: 3,
  startLocation: {
    id: '',
    placeId: '',
    name: '',
    address: '',
    coordinates: { lat: 0, lng: 0 },
  },
  destinations: [],
  returnToStart: false,
};

export function TripProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [tripConfig, setTripConfigState] = useState<TripConfig | null>(null);
  const [generatedTrip, setGeneratedTripState] = useState<GeneratedTrip | null>(null);
  const [savedTrips, setSavedTrips] = useState<GeneratedTrip[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Wrapper to update both generatedTrip and tripConfig together
  const setGeneratedTrip = useCallback((trip: GeneratedTrip | null) => {
    console.log('Setting generated trip:', trip?.id);
    setGeneratedTripState(trip);
    if (trip) {
      setTripConfigState(trip.config);
    }
  }, []);

  const setTripConfig = useCallback((config: TripConfig | null) => {
    setTripConfigState(config);
  }, []);

  // Fetch saved trips from Supabase when user changes
  const fetchSavedTrips = useCallback(async () => {
    if (!user) {
      setSavedTrips([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('saved_trips')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Failed to fetch saved trips:', error);
        return;
      }

      // Transform from database format to app format
      const rows = data as Tables<'saved_trips'>[] | null;
      const transformed: GeneratedTrip[] = (rows || []).map(row => ({
        id: row.id,
        config: row.config as unknown as TripConfig,
        days: row.days as unknown as GeneratedTrip['days'],
        totalDistance: row.total_distance || '',
        totalDrivingTime: row.total_driving_time || '',
        createdAt: row.created_at || new Date().toISOString(),
      }));

      setSavedTrips(transformed);
    } catch (err) {
      console.error('Error fetching trips:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchSavedTrips();
  }, [fetchSavedTrips]);

  const updateTripName = (name: string) => {
    setTripConfig(prev => prev ? { ...prev, name } : { ...defaultConfig, name });
  };

  const updateDuration = (duration: number) => {
    setTripConfig(prev => prev ? { ...prev, duration } : { ...defaultConfig, duration });
  };

  const setStartLocation = (location: TripDestination) => {
    setTripConfig(prev => prev ? { ...prev, startLocation: location } : { ...defaultConfig, startLocation: location });
  };

  const addDestination = (destination: TripDestination) => {
    setTripConfig(prev => {
      if (!prev) {
        return { ...defaultConfig, destinations: [destination] };
      }
      return { ...prev, destinations: [...prev.destinations, destination] };
    });
  };

  const removeDestination = (id: string) => {
    setTripConfig(prev => {
      if (!prev) return null;
      return { ...prev, destinations: prev.destinations.filter(d => d.id !== id) };
    });
  };

  const reorderDestinations = (destinations: TripDestination[]) => {
    setTripConfig(prev => prev ? { ...prev, destinations } : null);
  };

  const setReturnToStart = (returnToStart: boolean) => {
    setTripConfig(prev => prev ? { ...prev, returnToStart } : { ...defaultConfig, returnToStart });
  };

  const clearTrip = () => {
    setTripConfig(null);
    setGeneratedTrip(null);
  };

  const saveTrip = async (trip: GeneratedTrip): Promise<void> => {
    if (!user) return;

    try {
      const exists = savedTrips.some(t => t.id === trip.id);

      if (exists) {
        // Update existing trip
        const updateData: TablesUpdate<'saved_trips'> = {
          name: trip.config.name,
          config: trip.config as unknown as Json,
          days: trip.days as unknown as Json,
          total_distance: trip.totalDistance,
          total_driving_time: trip.totalDrivingTime,
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from('saved_trips')
          .update(updateData)
          .eq('id', trip.id)
          .eq('user_id', user.id);

        if (error) {
          console.error('Failed to update trip:', error);
          return;
        }

        setSavedTrips(prev => prev.map(t => t.id === trip.id ? trip : t));
      } else {
        // Insert new trip - let Supabase generate the UUID
        const insertData: TablesInsert<'saved_trips'> = {
          user_id: user.id,
          name: trip.config.name,
          config: trip.config as unknown as Json,
          days: trip.days as unknown as Json,
          total_distance: trip.totalDistance,
          total_driving_time: trip.totalDrivingTime,
        };

        const { data, error } = await supabase
          .from('saved_trips')
          .insert(insertData)
          .select()
          .single();

        if (error) {
          console.error('Failed to save trip:', error);
          return;
        }

        if (!data) {
          console.error('No data returned from insert');
          return;
        }

        // Update the trip with the Supabase-generated ID
        const row = data as Tables<'saved_trips'>;
        const savedTrip: GeneratedTrip = {
          ...trip,
          id: row.id,
        };

        setSavedTrips(prev => [savedTrip, ...prev]);

        // Also update the current generated trip with the new ID
        setGeneratedTrip(savedTrip);
      }
    } catch (err) {
      console.error('Error saving trip:', err);
    }
  };

  const deleteSavedTrip = async (tripId: string): Promise<void> => {
    if (!user) return;

    try {
      const { error } = await (supabase
        .from('saved_trips') as ReturnType<typeof supabase.from>)
        .delete()
        .eq('id', tripId)
        .eq('user_id', user.id);

      if (error) {
        console.error('Failed to delete trip:', error);
        return;
      }

      setSavedTrips(prev => prev.filter(t => t.id !== tripId));
    } catch (err) {
      console.error('Error deleting trip:', err);
    }
  };

  const loadSavedTrip = (tripId: string): GeneratedTrip | null => {
    const trip = savedTrips.find(t => t.id === tripId);
    if (trip) {
      setGeneratedTrip(trip); // This also sets tripConfig
      return trip;
    }
    return null;
  };

  const isTripSaved = (tripId: string): boolean => {
    return savedTrips.some(t => t.id === tripId);
  };

  const updateTripStop = (dayNumber: number, oldStopId: string, newStop: TripStop) => {
    setGeneratedTrip(prev => {
      if (!prev) return null;

      const updatedDays = prev.days.map(day => {
        if (day.day !== dayNumber) return day;

        const updatedStops = day.stops.map(stop =>
          stop.id === oldStopId ? { ...newStop, day: dayNumber } : stop
        );

        // Update hike reference if this was a hike
        const updatedHike = day.hike?.id === oldStopId && newStop.type === 'hike'
          ? { ...newStop, day: dayNumber }
          : day.hike;

        // Update campsite reference if this was a campsite
        const updatedCampsite = day.campsite?.id === oldStopId && newStop.type === 'camp'
          ? { ...newStop, day: dayNumber }
          : day.campsite;

        return {
          ...day,
          stops: updatedStops,
          hike: updatedHike,
          campsite: updatedCampsite,
        };
      });

      return { ...prev, days: updatedDays };
    });
  };

  const removeTripStop = (dayNumber: number, stopId: string) => {
    setGeneratedTrip(prev => {
      if (!prev) return null;

      const updatedDays = prev.days.map(day => {
        if (day.day !== dayNumber) return day;

        const updatedStops = day.stops.filter(stop => stop.id !== stopId);

        // Clear hike reference if this was the hike
        const updatedHike = day.hike?.id === stopId ? undefined : day.hike;

        // Clear campsite reference if this was the campsite
        const updatedCampsite = day.campsite?.id === stopId ? undefined : day.campsite;

        return {
          ...day,
          stops: updatedStops,
          hike: updatedHike,
          campsite: updatedCampsite,
        };
      });

      return { ...prev, days: updatedDays };
    });
  };

  const addTripStop = (dayNumber: number, stop: TripStop) => {
    setGeneratedTrip(prev => {
      if (!prev) return null;

      const updatedDays = prev.days.map(day => {
        if (day.day !== dayNumber) return day;

        const newStop = { ...stop, day: dayNumber };

        // Insert before campsite if it exists, otherwise at end
        const campsiteIndex = day.stops.findIndex(s => s.type === 'camp');
        const updatedStops = campsiteIndex >= 0
          ? [...day.stops.slice(0, campsiteIndex), newStop, ...day.stops.slice(campsiteIndex)]
          : [...day.stops, newStop];

        // Update hike reference if this is a hike
        const updatedHike = stop.type === 'hike' ? newStop : day.hike;

        // Update campsite reference if this is a campsite
        const updatedCampsite = stop.type === 'camp' ? newStop : day.campsite;

        return {
          ...day,
          stops: updatedStops,
          hike: updatedHike,
          campsite: updatedCampsite,
        };
      });

      return { ...prev, days: updatedDays };
    });
  };

  return (
    <TripContext.Provider
      value={{
        tripConfig,
        generatedTrip,
        savedTrips,
        isLoading,
        setTripConfig,
        setGeneratedTrip,
        updateTripName,
        updateDuration,
        setStartLocation,
        addDestination,
        removeDestination,
        reorderDestinations,
        setReturnToStart,
        clearTrip,
        saveTrip,
        deleteSavedTrip,
        loadSavedTrip,
        isTripSaved,
        updateTripStop,
        removeTripStop,
        addTripStop,
      }}
    >
      {children}
    </TripContext.Provider>
  );
}

export function useTrip() {
  const context = useContext(TripContext);
  if (context === undefined) {
    throw new Error('useTrip must be used within a TripProvider');
  }
  return context;
}
