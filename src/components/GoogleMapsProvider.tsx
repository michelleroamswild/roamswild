import { createContext, useContext, ReactNode } from 'react';
import { useLoadScript } from '@react-google-maps/api';

// "marker" is required for google.maps.marker.AdvancedMarkerElement —
// the recommended replacement for the deprecated google.maps.Marker.
const libraries: ("places" | "geometry" | "drawing" | "marker")[] = ["places", "marker"];

interface GoogleMapsContextType {
  isLoaded: boolean;
  loadError: Error | undefined;
}

const GoogleMapsContext = createContext<GoogleMapsContextType>({
  isLoaded: false,
  loadError: undefined,
});

export function GoogleMapsProvider({ children }: { children: ReactNode }) {
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    libraries,
  });

  return (
    <GoogleMapsContext.Provider value={{ isLoaded, loadError }}>
      {children}
    </GoogleMapsContext.Provider>
  );
}

export function useGoogleMaps() {
  return useContext(GoogleMapsContext);
}
