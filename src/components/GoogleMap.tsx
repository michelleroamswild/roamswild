import { GoogleMap as GoogleMapComponent } from '@react-google-maps/api';
import { ReactNode, useState } from 'react';
import { useGoogleMaps } from './GoogleMapsProvider';
import { useTheme } from '@/hooks/use-theme';
import { MapControls, type MapType } from './MapControls';

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
  /** Pine + Paper styled zoom + map-type controls. Default `auto` renders
   *  them top-right and disables Google's default chrome. Pass `false` to
   *  render no controls (consumer handles their own — e.g. DispersedExplorer
   *  positions its MapControls externally to clear the results panel). */
  mapControls?: 'auto' | false;
  /** When the wrapper renders auto controls, show the map-type toggle too. */
  showMapTypeControl?: boolean;
}

export function GoogleMap({
  center,
  zoom = 10,
  children,
  className,
  onClick,
  onLoad,
  options,
  mapControls = 'auto',
  showMapTypeControl = false,
}: GoogleMapProps) {
  const { isLoaded, loadError } = useGoogleMaps();
  const { isDark } = useTheme();
  // Mirror the loaded map in state so the auto MapControls overlay can
  // re-render once the map is ready (refs alone don't trigger updates).
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  // Track current mapType for the toggle. Initial seed comes from caller's
  // options or roadmap.
  const [mapTypeId, setMapTypeId] = useState<MapType>(
    (options?.mapTypeId as MapType) ?? 'roadmap',
  );

  if (loadError) {
    return (
      <div className="flex items-center justify-center h-full bg-cream dark:bg-paper-2 font-sans">
        <p className="text-[12px] font-mono font-semibold uppercase tracking-[0.12em] text-ember">Error loading maps</p>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-full bg-cream dark:bg-paper-2 animate-pulse font-sans">
        <p className="text-[12px] font-mono font-semibold uppercase tracking-[0.12em] text-pine-6">Loading map…</p>
      </div>
    );
  }

  // Don't apply custom styles for satellite/hybrid map types
  const effectiveType = (options?.mapTypeId as string) ?? mapTypeId;
  const isSatellite = effectiveType === 'satellite' || effectiveType === 'hybrid';

  const showAutoControls = mapControls === 'auto';

  const handleLoad = (map: google.maps.Map) => {
    setMapInstance(map);
    onLoad?.(map);
  };

  const handleMapTypeChange = (next: MapType) => {
    setMapTypeId(next);
    if (mapInstance) mapInstance.setMapTypeId(next);
  };

  return (
    <div className="relative w-full h-full">
      <GoogleMapComponent
        mapContainerClassName={className || "w-full h-full"}
        center={center}
        zoom={zoom}
        options={{
          styles: isSatellite ? undefined : (isDark ? darkMapStyles : lightMapStyles),
          // Always disable Google's default chrome — the pine MapControls
          // overlay (or the consumer, when mapControls={false}) covers it.
          // Consumers can re-enable any individual control via the `options`
          // spread when they specifically want Google's chrome.
          disableDefaultUI: true,
          zoomControl: false,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          rotateControl: false,
          scaleControl: false,
          ...options,
        }}
        onClick={onClick}
        onLoad={handleLoad}
      >
        {children}
      </GoogleMapComponent>
      {showAutoControls && (
        <div className="absolute top-3 right-3 z-10">
          <MapControls
            map={mapInstance}
            mapType={mapTypeId}
            onMapTypeChange={handleMapTypeChange}
            showZoom
            // Map type toggle is opt-in — most pages just need zoom.
            // Pages like LocationDetail / CampsiteDetail can pass it on.
            {...(showMapTypeControl ? {} : { mapType: null })}
          />
        </div>
      )}
    </div>
  );
}
