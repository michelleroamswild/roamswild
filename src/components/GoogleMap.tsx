import { GoogleMap as GoogleMapComponent } from '@react-google-maps/api';
import { ReactNode } from 'react';
import { useGoogleMaps } from './GoogleMapsProvider';
import { useTheme } from '@/hooks/use-theme';

// Earth-tone styled map to match the app theme (light mode)
const lightMapStyles = [
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#a3c1ad" }]
  },
  {
    featureType: "landscape",
    elementType: "geometry",
    stylers: [{ color: "#f5f2e9" }]
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#d4cfc4" }]
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#c5dac6" }]
  },
  {
    featureType: "transit",
    elementType: "geometry",
    stylers: [{ color: "#e8e4db" }]
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#6b7c6e" }]
  },
  {
    featureType: "administrative",
    elementType: "labels.text.fill",
    stylers: [{ color: "#5c6b5e" }]
  }
];

// Dark mode map styles
const darkMapStyles = [
  {
    elementType: "geometry",
    stylers: [{ color: "#1a1a18" }]
  },
  {
    elementType: "labels.text.stroke",
    stylers: [{ color: "#1a1a18" }]
  },
  {
    elementType: "labels.text.fill",
    stylers: [{ color: "#8a8a7a" }]
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#2d3a35" }]
  },
  {
    featureType: "landscape",
    elementType: "geometry",
    stylers: [{ color: "#252521" }]
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#3a3a35" }]
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#2a2a25" }]
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#2a3530" }]
  },
  {
    featureType: "transit",
    elementType: "geometry",
    stylers: [{ color: "#2a2a25" }]
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#6b7c6e" }]
  },
  {
    featureType: "administrative",
    elementType: "labels.text.fill",
    stylers: [{ color: "#7a8a7e" }]
  },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#9a9a8a" }]
  }
];

interface GoogleMapProps {
  center: google.maps.LatLngLiteral;
  zoom?: number;
  children?: ReactNode;
  className?: string;
  onClick?: (e: google.maps.MapMouseEvent) => void;
  onLoad?: (map: google.maps.Map) => void;
  options?: google.maps.MapOptions;
}

export function GoogleMap({ center, zoom = 10, children, className, onClick, onLoad, options }: GoogleMapProps) {
  const { isLoaded, loadError } = useGoogleMaps();
  const { isDark } = useTheme();

  if (loadError) {
    return (
      <div className="flex items-center justify-center h-full bg-sand">
        <p className="text-muted-foreground">Error loading maps</p>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-full bg-sand animate-pulse">
        <p className="text-muted-foreground">Loading map...</p>
      </div>
    );
  }

  // Don't apply custom styles for satellite/hybrid map types
  const isSatellite = options?.mapTypeId === 'satellite' || options?.mapTypeId === 'hybrid';

  return (
    <GoogleMapComponent
      mapContainerClassName={className || "w-full h-full"}
      center={center}
      zoom={zoom}
      options={{
        styles: isSatellite ? undefined : (isDark ? darkMapStyles : lightMapStyles),
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        ...options,
      }}
      onClick={onClick}
      onLoad={onLoad}
    >
      {children}
    </GoogleMapComponent>
  );
}
