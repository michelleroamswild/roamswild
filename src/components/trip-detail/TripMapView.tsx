import { useState } from 'react';
import { DirectionsRenderer } from '@react-google-maps/api';
import { GoogleMap } from '@/components/GoogleMap';
import { AdvancedMarker } from '@/components/AdvancedMarker';
import { GeneratedTrip, TripConfig, TripStop } from '@/types/trip';
import { createMarkerIcon, createSimpleMarkerIcon } from '@/utils/mapMarkers';
import { MapStopInfoWindow } from '@/components/trip-detail/MapStopInfoWindow';

interface TripMapViewProps {
  tripConfig: TripConfig;
  generatedTrip: GeneratedTrip;
  allStops: TripStop[];
  mapCenter: google.maps.LatLngLiteral;
  isDark: boolean;
  activeDay: number | null;
  directions: google.maps.DirectionsResult | null;
  dayDirections: google.maps.DirectionsResult | null;
  selectedStop: TripStop | null;
  onMapLoad: (map: google.maps.Map) => void;
  onSelectStop: (stop: TripStop | null) => void;
}

export const TripMapView = ({
  tripConfig,
  generatedTrip,
  allStops,
  mapCenter,
  activeDay,
  directions,
  dayDirections,
  selectedStop,
  onMapLoad,
  onSelectStop,
}: TripMapViewProps) => {
  // Cream stroke for the route — readable against satellite imagery in both themes.
  const strokeColor = `hsl(${
    typeof window !== 'undefined'
      ? getComputedStyle(document.documentElement).getPropertyValue('--cream').trim() || '45 56% 95%'
      : '45 56% 95%'
  })`;
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  const handleLoad = (map: google.maps.Map) => {
    setMapInstance(map);
    onMapLoad(map);
  };

  return (
    <div className="order-2 lg:order-1 h-[280px] sm:h-[400px] lg:h-[calc(100vh-120px)] lg:sticky lg:top-[120px]">
      <div className="relative w-full h-full">
        <GoogleMap
          center={mapCenter}
          zoom={8}
          className="w-full h-full"
          onLoad={handleLoad}
          options={{ mapTypeId: 'satellite' }}
        >
          {activeDay !== null && dayDirections ? (
            <DirectionsRenderer
              key={`day-${activeDay}-route`}
              directions={dayDirections}
              options={{
                suppressMarkers: true,
                polylineOptions: { strokeColor, strokeWeight: 5, strokeOpacity: 1 },
              }}
            />
          ) : directions ? (
            <DirectionsRenderer
              key="full-trip-route"
              directions={directions}
              options={{
                suppressMarkers: true,
                polylineOptions: { strokeColor, strokeWeight: 5, strokeOpacity: 1 },
              }}
            />
          ) : null}

          {!activeDay && (tripConfig.startLocation || tripConfig.baseLocation) && (
            <AdvancedMarker
              map={mapInstance}
              position={(tripConfig.startLocation || tripConfig.baseLocation)!.coordinates}
              content={createMarkerIcon('start', { isActive: true })}
              title={
                tripConfig.startLocation
                  ? `Start: ${tripConfig.startLocation.name}`
                  : `Base: ${tripConfig.baseLocation!.name}`
              }
            />
          )}

          {activeDay && (() => {
            if (activeDay === 1) {
              const startLoc = tripConfig.startLocation || tripConfig.baseLocation;
              if (startLoc) {
                return (
                  <AdvancedMarker
                    key="day-origin-start"
                    map={mapInstance}
                    position={startLoc.coordinates}
                    content={createMarkerIcon('start', { isActive: true })}
                    title={`Start: ${startLoc.name}`}
                  />
                );
              }
            } else {
              for (let d = activeDay - 1; d >= 1; d--) {
                const prevDay = generatedTrip.days.find((day) => day.day === d);
                const campsite = prevDay?.stops.find((s) => s.type === 'camp');
                if (campsite) {
                  return (
                    <AdvancedMarker
                      key="day-origin-camp"
                      map={mapInstance}
                      position={campsite.coordinates}
                      content={createSimpleMarkerIcon('camp', { isActive: true, size: 8 })}
                      title={`From: ${campsite.name}`}
                    />
                  );
                }
              }
            }
            return null;
          })()}

          {activeDay &&
            activeDay === generatedTrip.days.length &&
            tripConfig.returnToStart &&
            (tripConfig.startLocation || tripConfig.baseLocation) && (
              <AdvancedMarker
                key="day-destination-end"
                map={mapInstance}
                position={(tripConfig.startLocation || tripConfig.baseLocation)!.coordinates}
                content={createMarkerIcon('end', { isActive: true })}
                title={`End: ${(tripConfig.startLocation || tripConfig.baseLocation)!.name}`}
              />
            )}

          {!activeDay && !tripConfig.returnToStart && (() => {
            const endStop = allStops.find((s) => s.type === 'end');
            if (endStop) {
              return (
                <AdvancedMarker
                  key="trip-end-marker"
                  map={mapInstance}
                  position={endStop.coordinates}
                  content={createMarkerIcon('end', { isActive: true })}
                  title={`End: ${endStop.name}`}
                />
              );
            }
            return null;
          })()}

          {activeDay && activeDay === generatedTrip.days.length && !tripConfig.returnToStart && (() => {
            const dayStops = generatedTrip.days.find((d) => d.day === activeDay)?.stops || [];
            const endStop = dayStops.find((s) => s.type === 'end');
            if (endStop) {
              return (
                <AdvancedMarker
                  key="day-end-marker"
                  map={mapInstance}
                  position={endStop.coordinates}
                  content={createMarkerIcon('end', { isActive: true })}
                  title={`End: ${endStop.name}`}
                />
              );
            }
            return null;
          })()}

          {(() => {
            // Dedupe stops by coordinate so destination viewpoints and same-
            // location follow-ups (the optional "Time in town" extra-day
            // marker, or stale "explore-*" stops on older saved trips) don't
            // stack two pins on the same point. First-seen wins, which keeps
            // the canonical destination pin from the arrival day.
            const stops = activeDay
              ? generatedTrip.days.find((d) => d.day === activeDay)?.stops || []
              : allStops;
            const seen = new Set<string>();
            return stops
              .filter((stop) => {
                if (stop.type === 'end') return false;
                const key = `${stop.coordinates.lat.toFixed(5)},${stop.coordinates.lng.toFixed(5)}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
              })
              .map((stop) => (
                <AdvancedMarker
                  key={stop.id}
                  map={mapInstance}
                  position={stop.coordinates}
                  content={createMarkerIcon(stop.type, { isActive: true })}
                  title={stop.name}
                  onClick={() => onSelectStop(stop)}
                />
              ));
          })()}

          {selectedStop && (
            <MapStopInfoWindow stop={selectedStop} onClose={() => onSelectStop(null)} />
          )}
        </GoogleMap>
      </div>
    </div>
  );
};
