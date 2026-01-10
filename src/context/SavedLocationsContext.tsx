import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';

export interface SavedLocation {
  id: string;
  placeId: string;
  name: string;
  address: string;
  type: string;
  lat: number;
  lng: number;
  savedAt: string;
}

interface SavedLocationsContextType {
  locations: SavedLocation[];
  isLoading: boolean;
  addLocation: (location: Omit<SavedLocation, 'id' | 'savedAt'>) => Promise<boolean>;
  removeLocation: (id: string) => Promise<void>;
  isLocationSaved: (placeId: string) => boolean;
}

const SavedLocationsContext = createContext<SavedLocationsContextType | null>(null);

export function SavedLocationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load locations from Supabase when user changes
  const fetchLocations = useCallback(async () => {
    if (!user) {
      setLocations([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('saved_locations')
        .select('*')
        .eq('user_id', user.id)
        .order('saved_at', { ascending: false });

      if (error) {
        console.error('Failed to fetch saved locations:', error);
        return;
      }

      // Transform from database format to app format
      const transformed: SavedLocation[] = (data || []).map(row => ({
        id: row.id,
        placeId: row.place_id,
        name: row.name,
        address: row.address || '',
        type: row.type || '',
        lat: row.lat,
        lng: row.lng,
        savedAt: row.saved_at,
      }));

      setLocations(transformed);
    } catch (e) {
      console.error('Error fetching locations:', e);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  const addLocation = async (location: Omit<SavedLocation, 'id' | 'savedAt'>): Promise<boolean> => {
    if (!user) return false;

    // Check if already saved
    if (locations.some(l => l.placeId === location.placeId)) {
      return false;
    }

    try {
      const { data, error } = await supabase
        .from('saved_locations')
        .insert({
          user_id: user.id,
          place_id: location.placeId,
          name: location.name,
          address: location.address,
          type: location.type,
          lat: location.lat,
          lng: location.lng,
        })
        .select()
        .single();

      if (error) {
        console.error('Failed to save location:', error);
        return false;
      }

      // Add to local state
      const newLocation: SavedLocation = {
        id: data.id,
        placeId: data.place_id,
        name: data.name,
        address: data.address || '',
        type: data.type || '',
        lat: data.lat,
        lng: data.lng,
        savedAt: data.saved_at,
      };

      setLocations(prev => [newLocation, ...prev]);
      return true;
    } catch (e) {
      console.error('Error adding location:', e);
      return false;
    }
  };

  const removeLocation = async (id: string): Promise<void> => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('saved_locations')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) {
        console.error('Failed to remove location:', error);
        return;
      }

      setLocations(prev => prev.filter(l => l.id !== id));
    } catch (e) {
      console.error('Error removing location:', e);
    }
  };

  const isLocationSaved = (placeId: string) => {
    return locations.some(l => l.placeId === placeId);
  };

  return (
    <SavedLocationsContext.Provider value={{ locations, isLoading, addLocation, removeLocation, isLocationSaved }}>
      {children}
    </SavedLocationsContext.Provider>
  );
}

export function useSavedLocations() {
  const context = useContext(SavedLocationsContext);
  if (!context) {
    throw new Error('useSavedLocations must be used within a SavedLocationsProvider');
  }
  return context;
}
