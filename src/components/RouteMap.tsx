import { useState, useCallback, useEffect } from 'react';
import { Marker, InfoWindow, DirectionsRenderer } from '@react-google-maps/api';
import { GoogleMap } from './GoogleMap';
import { RouteStop, StopType } from '@/types/maps';

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

  const getMarkerIcon = (type: StopType, index: number) => ({
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: markerColors[type],
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeWeight: 2,
    scale: 12,
  });

  return (
    <GoogleMap center={center} zoom={9} className={className}>
      {/* Route directions line */}
      {directions && (
        <DirectionsRenderer
          directions={directions}
          options={{
            suppressMarkers: true, // We'll use custom markers
            polylineOptions: {
              strokeColor: '#c4704f', // terracotta
              strokeWeight: 4,
              strokeOpacity: 0.8,
            },
          }}
        />
      )}

      {/* Stop markers */}
      {stops.map((stop, index) => (
        <Marker
          key={stop.id}
          position={stop.coordinates}
          icon={getMarkerIcon(stop.type, index)}
          label={{
            text: String(index + 1),
            color: '#ffffff',
            fontSize: '12px',
            fontWeight: 'bold',
          }}
          onClick={() => handleMarkerClick(stop)}
        />
      ))}

      {/* Info window for selected stop */}
      {selectedStop && (
        <InfoWindow
          position={selectedStop.coordinates}
          onCloseClick={() => setSelectedStop(null)}
        >
          <div className="p-2 min-w-[200px]">
            <h3 className="font-semibold text-foreground">{selectedStop.name}</h3>
            <p className="text-sm text-muted-foreground mt-1">{selectedStop.description}</p>
            <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
              <span>{selectedStop.duration}</span>
              <span>{selectedStop.elevation}</span>
            </div>
          </div>
        </InfoWindow>
      )}
    </GoogleMap>
  );
}
