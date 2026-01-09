import { createContext, useContext, useState, ReactNode } from 'react';
import { TripConfig, GeneratedTrip, TripDestination } from '@/types/trip';

interface TripContextType {
  tripConfig: TripConfig | null;
  generatedTrip: GeneratedTrip | null;
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
  const [tripConfig, setTripConfig] = useState<TripConfig | null>(null);
  const [generatedTrip, setGeneratedTrip] = useState<GeneratedTrip | null>(null);

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

  return (
    <TripContext.Provider
      value={{
        tripConfig,
        generatedTrip,
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
