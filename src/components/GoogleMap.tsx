import { GoogleMap as GoogleMapComponent } from '@react-google-maps/api';
import { ReactNode } from 'react';
import { useGoogleMaps } from './GoogleMapsProvider';

// Earth-tone styled map to match the app theme
const mapStyles = [
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

interface GoogleMapProps {
  center: google.maps.LatLngLiteral;
  zoom?: number;
  children?: ReactNode;
  className?: string;
  onClick?: (e: google.maps.MapMouseEvent) => void;
  onLoad?: (map: google.maps.Map) => void;
}

export function GoogleMap({ center, zoom = 10, children, className, onClick, onLoad }: GoogleMapProps) {
  const { isLoaded, loadError } = useGoogleMaps();

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

  return (
    <GoogleMapComponent
      mapContainerClassName={className || "w-full h-full"}
      center={center}
      zoom={zoom}
      options={{
        styles: mapStyles,
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
      }}
      onClick={onClick}
      onLoad={onLoad}
    >
      {children}
    </GoogleMapComponent>
  );
}
