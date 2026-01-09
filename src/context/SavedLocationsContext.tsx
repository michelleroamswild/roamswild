import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

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
  addLocation: (location: Omit<SavedLocation, 'id' | 'savedAt'>) => boolean;
  removeLocation: (id: string) => void;
  isLocationSaved: (placeId: string) => boolean;
}

const SavedLocationsContext = createContext<SavedLocationsContextType | null>(null);

const STORAGE_KEY = 'trailbound-saved-locations';

export function SavedLocationsProvider({ children }: { children: ReactNode }) {
  const [locations, setLocations] = useState<SavedLocation[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setLocations(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse saved locations', e);
      }
    }
  }, []);

  // Save to localStorage whenever locations change
  const saveToStorage = (newLocations: SavedLocation[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newLocations));
    setLocations(newLocations);
  };

  const addLocation = (location: Omit<SavedLocation, 'id' | 'savedAt'>) => {
    // Check if already saved
    if (locations.some(l => l.placeId === location.placeId)) {
      return false;
    }

    const newLocation: SavedLocation = {
      ...location,
      id: crypto.randomUUID(),
      savedAt: new Date().toISOString(),
    };

    saveToStorage([newLocation, ...locations]);
    return true;
  };

  const removeLocation = (id: string) => {
    saveToStorage(locations.filter(l => l.id !== id));
  };

  const isLocationSaved = (placeId: string) => {
    return locations.some(l => l.placeId === placeId);
  };

  return (
    <SavedLocationsContext.Provider value={{ locations, addLocation, removeLocation, isLocationSaved }}>
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
