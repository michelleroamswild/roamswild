import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { TripConfig, GeneratedTrip, TripDestination, TripStop } from '@/types/trip';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';
import type { Tables, TablesInsert, TablesUpdate, Json } from '@/integrations/supabase/types';
import type { RealtimeChannel } from '@supabase/supabase-js';

// Collaborator type
export interface Collaborator {
  id: string;
  userId: string;
  email: string;
  name?: string;
  permission: 'view' | 'edit' | 'owner';
  invitedAt: string;
}

// Share link type
export interface ShareLink {
  id: string;
  token: string;
  permission: 'view' | 'edit';
  createdAt: string;
  expiresAt?: string;
  isActive: boolean;
}

interface TripContextType {
  tripConfig: TripConfig | null;
  generatedTrip: GeneratedTrip | null;
  savedTrips: GeneratedTrip[];
  sharedTrips: GeneratedTrip[];
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
  // Sharing methods
  shareTrip: (tripId: string, email: string, permission: 'view' | 'edit') => Promise<{ error?: string }>;
  createShareLink: (tripId: string, permission: 'view' | 'edit') => Promise<{ link?: string; error?: string }>;
  revokeShareLink: (linkId: string) => Promise<void>;
  removeCollaborator: (tripId: string, userId: string) => Promise<void>;
  updateCollaboratorPermission: (tripId: string, userId: string, permission: 'view' | 'edit') => Promise<void>;
  fetchCollaborators: (tripId: string) => Promise<Collaborator[]>;
  fetchShareLinks: (tripId: string) => Promise<ShareLink[]>;
  joinTripByLink: (token: string) => Promise<{ tripId?: string; error?: string }>;
  canEdit: (tripId: string) => boolean;
  isOwner: (tripId: string) => boolean;
  subscribeToTrip: (tripId: string) => void;
  unsubscribeFromTrip: (tripId: string) => void;
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
  const [sharedTrips, setSharedTrips] = useState<GeneratedTrip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const subscriptionRef = useRef<RealtimeChannel | null>(null);

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
      // RLS policies handle access control - just fetch all accessible trips
      const { data, error } = await supabase
        .from('saved_trips')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Failed to fetch saved trips:', error);
        return;
      }

      // Transform from database format to app format
      const rows = data as Tables<'saved_trips'>[] | null;
      const allTrips: GeneratedTrip[] = (rows || []).map(row => ({
        id: row.id,
        config: row.config as unknown as TripConfig,
        days: row.days as unknown as GeneratedTrip['days'],
        totalDistance: row.total_distance || '',
        totalDrivingTime: row.total_driving_time || '',
        createdAt: row.created_at || new Date().toISOString(),
        ownerId: row.user_id,
      }));

      // Separate owned trips from shared trips
      const owned = allTrips.filter(t => t.ownerId === user.id);
      const shared = allTrips.filter(t => t.ownerId !== user.id);

      // Fetch collaborator counts for owned trips
      if (owned.length > 0) {
        const ownedIds = owned.map(t => t.id);
        const { data: collabData } = await supabase
          .from('trip_collaborators')
          .select('trip_id')
          .in('trip_id', ownedIds);

        if (collabData) {
          // Count collaborators per trip
          const countMap = new Map<string, number>();
          collabData.forEach(c => {
            countMap.set(c.trip_id, (countMap.get(c.trip_id) || 0) + 1);
          });

          // Add collaborator counts to owned trips
          owned.forEach(trip => {
            trip.collaboratorCount = countMap.get(trip.id) || 0;
          });
        }
      }

      setSavedTrips(owned);
      setSharedTrips(shared);
    } catch (err) {
      console.error('Error fetching trips:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchSavedTrips();
  }, [fetchSavedTrips]);

  
  // Share a trip with another user by email
  const shareTrip = async (tripId: string, email: string, permission: 'view' | 'edit'): Promise<{ error?: string }> => {
    if (!user) return { error: 'Not authenticated' };

    try {
      // Find user by email
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, email, name')
        .eq('email', email)
        .single();

      if (profileError || !profiles) {
        return { error: 'User not found with that email' };
      }

      if (profiles.id === user.id) {
        return { error: 'Cannot share with yourself' };
      }

      // Add as collaborator
      const { error } = await supabase
        .from('trip_collaborators')
        .insert({
          trip_id: tripId,
          user_id: profiles.id,
          permission,
          invited_by: user.id,
        });

      if (error) {
        if (error.code === '23505') {
          return { error: 'User already has access to this trip' };
        }
        return { error: error.message };
      }

      return {};
    } catch (err) {
      return { error: 'Failed to share trip' };
    }
  };

  // Create a shareable link for a trip
  const createShareLink = async (tripId: string, permission: 'view' | 'edit'): Promise<{ link?: string; error?: string }> => {
    if (!user) return { error: 'Not authenticated' };

    try {
      const { data, error } = await supabase
        .from('trip_share_links')
        .insert({
          trip_id: tripId,
          permission,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) {
        return { error: error.message };
      }

      const link = `${window.location.origin}/join/${data.token}`;
      return { link };
    } catch (err) {
      return { error: 'Failed to create share link' };
    }
  };

  // Revoke a share link
  const revokeShareLink = async (linkId: string): Promise<void> => {
    if (!user) return;

    await supabase
      .from('trip_share_links')
      .update({ is_active: false })
      .eq('id', linkId);
  };

  // Remove a collaborator from a trip
  const removeCollaborator = async (tripId: string, oderId: string): Promise<void> => {
    if (!user) return;

    await supabase
      .from('trip_collaborators')
      .delete()
      .eq('trip_id', tripId)
      .eq('user_id', oderId);
  };

  // Update a collaborator's permission
  const updateCollaboratorPermission = async (tripId: string, oderId: string, permission: 'view' | 'edit'): Promise<void> => {
    if (!user) return;

    await supabase
      .from('trip_collaborators')
      .update({ permission })
      .eq('trip_id', tripId)
      .eq('user_id', oderId);
  };

  // Fetch collaborators for a trip
  const fetchCollaborators = async (tripId: string): Promise<Collaborator[]> => {
    // Use security definer function to get all members (owner + collaborators)
    const { data, error } = await supabase
      .rpc('get_trip_members', { p_trip_id: tripId });

    if (error || !data) {
      console.error('Error fetching trip members:', error);
      return [];
    }

    return data.map((row: any, index: number) => ({
      id: row.permission === 'owner' ? `owner-${row.user_id}` : `collab-${row.user_id}-${index}`,
      userId: row.user_id,
      email: row.email || '',
      name: row.name || undefined,
      permission: row.permission as 'view' | 'edit' | 'owner',
      invitedAt: '',
    }));
  };

  // Fetch share links for a trip
  const fetchShareLinks = async (tripId: string): Promise<ShareLink[]> => {
    const { data, error } = await supabase
      .from('trip_share_links')
      .select('*')
      .eq('trip_id', tripId)
      .eq('is_active', true);

    if (error || !data) return [];

    return data.map(row => ({
      id: row.id,
      token: row.token,
      permission: row.permission as 'view' | 'edit',
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      isActive: row.is_active,
    }));
  };

  // Join a trip using a share link token
  const joinTripByLink = async (token: string): Promise<{ tripId?: string; error?: string }> => {
    if (!user) {
      return { error: 'Not authenticated' };
    }

    try {
      // Use the security definer function to join
      const { data, error } = await supabase
        .rpc('join_trip_by_share_link', { share_token: token });

      console.log('joinTripByLink result:', { data, error });

      if (error) {
        console.error('joinTripByLink error:', error);
        return { error: 'Failed to join trip' };
      }

      if (data?.error) {
        return { error: data.error };
      }

      if (data?.trip_id) {
        // Refresh all trips to include the newly shared one and wait for it
        await fetchSavedTrips();
        return { tripId: data.trip_id };
      }

      return { error: 'Failed to join trip' };
    } catch (err) {
      console.error('joinTripByLink exception:', err);
      return { error: 'Failed to join trip' };
    }
  };

  // Check if current user can edit a trip
  const canEdit = (tripId: string): boolean => {
    if (!user) return false;

    // Check if owner
    const ownedTrip = savedTrips.find(t => t.id === tripId);
    if (ownedTrip) return true;

    // Check shared trips - we'd need to store permission info
    // For now, return true if it's in sharedTrips (assume edit access)
    const sharedTrip = sharedTrips.find(t => t.id === tripId);
    return !!sharedTrip;
  };

  // Check if current user owns a trip
  const isOwner = (tripId: string): boolean => {
    if (!user) return false;
    return savedTrips.some(t => t.id === tripId);
  };

  // Subscribe to real-time updates for a trip
  const subscribeToTrip = (tripId: string) => {
    if (subscriptionRef.current) {
      subscriptionRef.current.unsubscribe();
    }

    const channel = supabase
      .channel(`trip-${tripId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'saved_trips',
          filter: `id=eq.${tripId}`,
        },
        (payload) => {
          console.log('Trip updated:', payload);
          const row = payload.new as Tables<'saved_trips'>;
          const updatedTrip: GeneratedTrip = {
            id: row.id,
            config: row.config as unknown as TripConfig,
            days: row.days as unknown as GeneratedTrip['days'],
            totalDistance: row.total_distance || '',
            totalDrivingTime: row.total_driving_time || '',
            createdAt: row.created_at || new Date().toISOString(),
          };

          // Update in savedTrips or sharedTrips
          setSavedTrips(prev => prev.map(t => t.id === tripId ? updatedTrip : t));
          setSharedTrips(prev => prev.map(t => t.id === tripId ? updatedTrip : t));

          // Update current trip if it's the one being viewed
          if (generatedTrip?.id === tripId) {
            setGeneratedTrip(updatedTrip);
          }
        }
      )
      .subscribe();

    subscriptionRef.current = channel;
  };

  // Unsubscribe from trip updates
  const unsubscribeFromTrip = () => {
    if (subscriptionRef.current) {
      subscriptionRef.current.unsubscribe();
      subscriptionRef.current = null;
    }
  };

  const updateTripName = (name: string) => {
    setTripConfigState(prev => prev ? { ...prev, name } : { ...defaultConfig, name });
  };

  const updateDuration = (duration: number) => {
    setTripConfigState(prev => prev ? { ...prev, duration } : { ...defaultConfig, duration });
  };

  const setStartLocation = (location: TripDestination) => {
    setTripConfigState(prev => prev ? { ...prev, startLocation: location } : { ...defaultConfig, startLocation: location });
  };

  const addDestination = (destination: TripDestination) => {
    setTripConfigState(prev => {
      if (!prev) {
        return { ...defaultConfig, destinations: [destination] };
      }
      return { ...prev, destinations: [...prev.destinations, destination] };
    });
  };

  const removeDestination = (id: string) => {
    setTripConfigState(prev => {
      if (!prev) return null;
      return { ...prev, destinations: prev.destinations.filter(d => d.id !== id) };
    });
  };

  const reorderDestinations = (destinations: TripDestination[]) => {
    setTripConfigState(prev => prev ? { ...prev, destinations } : null);
  };

  const setReturnToStart = (returnToStart: boolean) => {
    setTripConfigState(prev => prev ? { ...prev, returnToStart } : { ...defaultConfig, returnToStart });
  };

  const clearTrip = () => {
    setTripConfig(null);
    setGeneratedTrip(null);
  };

  const saveTrip = async (trip: GeneratedTrip): Promise<void> => {
    if (!user) throw new Error('Not authenticated');

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
        .eq('id', trip.id);

      if (error) {
        console.error('Failed to update trip:', error);
        throw new Error(error.message);
      }

      setSavedTrips(prev => prev.map(t => t.id === trip.id ? trip : t));
    } else {
      // Insert new trip - let Supabase generate the UUID
      const insertData = {
        user_id: user.id,
        name: trip.config.name,
        config: trip.config as unknown as Json,
        days: trip.days as unknown as Json,
        total_distance: trip.totalDistance,
        total_driving_time: trip.totalDrivingTime,
      };

      console.log('Inserting trip with data:', insertData);

      const { data, error } = await supabase
        .from('saved_trips')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error('Failed to save trip:', error);
        throw new Error(error.message);
      }

      if (!data) {
        console.error('No data returned from insert');
        throw new Error('No data returned from insert');
      }

      console.log('Trip saved successfully:', data);

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
  };

  const deleteSavedTrip = async (tripId: string): Promise<void> => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('saved_trips')
        .delete()
        .eq('id', tripId);

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
    // Check owned trips first
    let trip = savedTrips.find(t => t.id === tripId);
    // Then check shared trips
    if (!trip) {
      trip = sharedTrips.find(t => t.id === tripId);
    }
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
    setGeneratedTripState(prev => {
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
    setGeneratedTripState(prev => {
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
    setGeneratedTripState(prev => {
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
        sharedTrips,
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
        // Sharing methods
        shareTrip,
        createShareLink,
        revokeShareLink,
        removeCollaborator,
        updateCollaboratorPermission,
        fetchCollaborators,
        fetchShareLinks,
        joinTripByLink,
        canEdit,
        isOwner,
        subscribeToTrip,
        unsubscribeFromTrip,
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
