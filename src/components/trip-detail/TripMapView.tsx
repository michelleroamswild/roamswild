import { useState } from 'react';
import { DirectionsRenderer, InfoWindow } from '@react-google-maps/api';
import { X } from '@phosphor-icons/react';
import { GoogleMap } from '@/components/GoogleMap';
import { AdvancedMarker } from '@/components/AdvancedMarker';
import { GeneratedTrip, TripConfig, TripStop } from '@/types/trip';
import { createMarkerIcon, createSimpleMarkerIcon } from '@/utils/mapMarkers';

// Resolve the data origin for a stop based on its id prefix. Returns null
// for trip-generated anchors (start/end/destination/town/travel) where
// "source" doesn't apply.
const getStopSource = (stop: TripStop): string | null => {
  const id = stop.id;
  if (id.startsWith('ridb-')) return 'Recreation.gov';
  if (id.startsWith('usfs-')) return 'US Forest Service';
  if (id.startsWith('osm-dispersed-')) return 'OpenStreetMap (dispersed)';
  if (id.startsWith('osm-')) return 'OpenStreetMap';
  if (id.startsWith('hike-')) return 'Google Places';
  // Trip-generated anchors carry no external data source.
  if (/^(start-|end-|dest-|town-|travel-|explore-|return-)/.test(id)) return null;
  // Camps left over after the prefix checks come from the community spots DB
  // (raw Supabase UUIDs, no prefix).
  if (stop.type === 'camp') return 'Community spots';
  return null;
};

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
              content={createMarkerIcon('start')}
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
                  content={createMarkerIcon('end')}
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

          {(activeDay ? generatedTrip.days.find((d) => d.day === activeDay)?.stops || [] : allStops)
            .filter((stop) => stop.type !== 'end')
            .map((stop) => (
              <AdvancedMarker
                key={stop.id}
                map={mapInstance}
                position={stop.coordinates}
                content={createMarkerIcon(stop.type, { isActive: !!activeDay })}
                title={stop.name}
                onClick={() => onSelectStop(stop)}
              />
            ))}

          {selectedStop && (() => {
            const source = getStopSource(selectedStop);
            return (
              <InfoWindow
                position={selectedStop.coordinates}
                onCloseClick={() => onSelectStop(null)}
                options={{ pixelOffset: new google.maps.Size(0, -32), disableAutoPan: true }}
              >
                <div className="compact-info-window min-w-[220px] font-sans">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-[14px] font-semibold tracking-[-0.005em] text-ink leading-tight flex-1 min-w-0">
                      {selectedStop.name}
                    </h4>
                    <button
                      onClick={() => onSelectStop(null)}
                      className="shrink-0 p-0.5 -mr-0.5 -mt-0.5 text-ink-3 hover:text-ink transition-colors"
                      aria-label="Close"
                    >
                      <X className="w-3.5 h-3.5" weight="bold" />
                    </button>
                  </div>
                  {selectedStop.description && (
                    <p className="text-[12px] text-ink-3 mt-1 leading-[1.5]">{selectedStop.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5 text-[11px] font-mono uppercase tracking-[0.10em] text-ink-3">
                    <span>Day {selectedStop.day}</span>
                    {selectedStop.duration && (
                      <>
                        <span>·</span>
                        <span className="normal-case font-sans tracking-normal text-[12px]">
                          {selectedStop.duration}
                        </span>
                      </>
                    )}
                  </div>
                  {source && (
                    <p className="mt-1 text-[11px] font-mono uppercase tracking-[0.10em] text-ink-3">
                      Source · <span className="text-ink-2">{source}</span>
                    </p>
                  )}
                  <button
                    onClick={() =>
                      window.open(
                        `https://www.google.com/maps/dir/?api=1&destination=${selectedStop.coordinates.lat},${selectedStop.coordinates.lng}`,
                        '_blank',
                      )
                    }
                    className="mt-2.5 w-full px-3 py-1.5 rounded-full bg-pine-6 text-cream dark:text-ink-pine text-[12px] font-sans font-semibold tracking-[0.01em] hover:bg-pine-5 transition-colors"
                  >
                    Get directions
                  </button>
                </div>
              </InfoWindow>
            );
          })()}
        </GoogleMap>
      </div>
    </div>
  );
};
