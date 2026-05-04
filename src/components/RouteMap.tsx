import { useState, useCallback, useEffect } from 'react';
import { InfoWindow, DirectionsRenderer } from '@react-google-maps/api';
import { GoogleMap } from './GoogleMap';
import { AdvancedMarker } from '@/components/AdvancedMarker';
import { RouteStop, StopType } from '@/types/maps';
import { useTheme } from '@/hooks/use-theme';

// Marker colors by stop type
const markerColors: Record<StopType, string> = {
  hike: '#2d5a3d',    // forest green
  gas: '#c4704f',     // terracotta
  camp: '#4a7c59',    // forest-light
  viewpoint: '#8b7355', // earth brown
  water: '#6b9f8b',   // sage
  food: '#d4a574',    // sand
  service: '#7c6f64', // muted brown
  cell: '#5c6b5e',    // dark sage
};

interface RouteMapProps {
  stops: RouteStop[];
  className?: string;
  showDirections?: boolean;
  onStopClick?: (stop: RouteStop) => void;
}

export function RouteMap({ stops, className, showDirections = true, onStopClick }: RouteMapProps) {
  const [selectedStop, setSelectedStop] = useState<RouteStop | null>(null);
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  const { isDark } = useTheme();

  // Calculate center from stops
  const center = stops.length > 0
    ? {
        lat: stops.reduce((sum, s) => sum + s.coordinates.lat, 0) / stops.length,
        lng: stops.reduce((sum, s) => sum + s.coordinates.lng, 0) / stops.length,
      }
    : { lat: 36.6002, lng: -118.0627 }; // Default to Eastern Sierra

  // Fetch directions between stops
  useEffect(() => {
    if (!showDirections || stops.length < 2) {
      setDirections(null);
      return;
    }

    const directionsService = new google.maps.DirectionsService();

    const origin = stops[0].coordinates;
    const destination = stops[stops.length - 1].coordinates;
    const waypoints = stops.slice(1, -1).map(stop => ({
      location: stop.coordinates,
      stopover: true,
    }));

    directionsService.route(
      {
        origin,
        destination,
        waypoints,
        travelMode: google.maps.TravelMode.DRIVING,
        optimizeWaypoints: false,
      },
      (result, status) => {
        if (status === google.maps.DirectionsStatus.OK && result) {
          setDirections(result);
        }
      }
    );
  }, [stops, showDirections]);

  const handleMarkerClick = useCallback((stop: RouteStop) => {
    setSelectedStop(stop);
    onStopClick?.(stop);
  }, [onStopClick]);

  // Numbered circle pin — DOM element for AdvancedMarkerElement.content.
  const buildStopPin = (type: StopType, index: number): HTMLElement => {
    const div = document.createElement('div');
    div.style.width = '24px';
    div.style.height = '24px';
    div.style.borderRadius = '50%';
    div.style.backgroundColor = markerColors[type];
    div.style.border = '2px solid #ffffff';
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.justifyContent = 'center';
    div.style.color = '#ffffff';
    div.style.fontSize = '12px';
    div.style.fontWeight = '700';
    div.style.fontFamily = 'Manrope, sans-serif';
    div.style.cursor = 'pointer';
    div.textContent = String(index + 1);
    return div;
  };

  return (
    <GoogleMap center={center} zoom={9} className={className} onLoad={setMapInstance}>
      {/* Route directions line */}
      {directions && (
        <DirectionsRenderer
          directions={directions}
          options={{
            suppressMarkers: true, // We'll use custom markers
            polylineOptions: {
              strokeColor: isDark ? '#d9d0c3' : '#c4704f', // primary in dark, terracotta in light
              strokeWeight: 4,
              strokeOpacity: 0.8,
            },
          }}
        />
      )}

      {/* Stop markers */}
      {stops.map((stop, index) => (
        <AdvancedMarker
          key={stop.id}
          map={mapInstance}
          position={stop.coordinates}
          content={buildStopPin(stop.type, index)}
          onClick={() => handleMarkerClick(stop)}
        />
      ))}

      {/* Info window for selected stop */}
      {selectedStop && (
        <InfoWindow
          position={selectedStop.coordinates}
          onCloseClick={() => setSelectedStop(null)}
        >
          <div className="p-1 min-w-[200px] font-sans">
            <h3 className="text-[14px] font-semibold tracking-[-0.005em] text-ink">{selectedStop.name}</h3>
            <p className="text-[12px] text-ink-3 mt-1 leading-[1.5]">{selectedStop.description}</p>
            <div className="flex gap-3 mt-1.5 text-[11px] font-mono uppercase tracking-[0.10em] text-ink-3">
              <span>{selectedStop.duration}</span>
              <span>{selectedStop.elevation}</span>
            </div>
          </div>
        </InfoWindow>
      )}
    </GoogleMap>
  );
}
