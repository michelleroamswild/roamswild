import { DirectionsRenderer, InfoWindow, Marker } from '@react-google-maps/api';
import { GoogleMap } from '@/components/GoogleMap';
import { GeneratedTrip, TripConfig, TripStop } from '@/types/trip';
import { createMarkerIcon, createSimpleMarkerIcon } from '@/utils/mapMarkers';

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
  isDark,
  activeDay,
  directions,
  dayDirections,
  selectedStop,
  onMapLoad,
  onSelectStop,
}: TripMapViewProps) => {
  // Pine + Paper route stroke (cream on dark, pine on light satellite)
  const strokeColor = isDark ? '#d9d0c3' : '#3a4a2a';

  return (
    <div className="order-2 lg:order-1 h-[280px] sm:h-[400px] lg:h-[calc(100vh-120px)] lg:sticky lg:top-[120px]">
      <div className="relative w-full h-full">
        <GoogleMap
          center={mapCenter}
          zoom={8}
          className="w-full h-full"
          onLoad={onMapLoad}
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
            <Marker
              position={(tripConfig.startLocation || tripConfig.baseLocation)!.coordinates}
              icon={createMarkerIcon('start', { size: 36 })}
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
                  <Marker
                    key="day-origin-start"
                    position={startLoc.coordinates}
                    icon={createMarkerIcon('start', { isActive: true, size: 36 })}
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
                    <Marker
                      key="day-origin-camp"
                      position={campsite.coordinates}
                      icon={createSimpleMarkerIcon('camp', { isActive: true, size: 8 })}
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
              <Marker
                key="day-destination-end"
                position={(tripConfig.startLocation || tripConfig.baseLocation)!.coordinates}
                icon={createMarkerIcon('end', { isActive: true, size: 36 })}
                title={`End: ${(tripConfig.startLocation || tripConfig.baseLocation)!.name}`}
              />
            )}

          {!activeDay && !tripConfig.returnToStart && (() => {
            const endStop = allStops.find((s) => s.type === 'end');
            if (endStop) {
              return (
                <Marker
                  key="trip-end-marker"
                  position={endStop.coordinates}
                  icon={createMarkerIcon('end', { size: 36 })}
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
                <Marker
                  key="day-end-marker"
                  position={endStop.coordinates}
                  icon={createMarkerIcon('end', { isActive: true, size: 36 })}
                  title={`End: ${endStop.name}`}
                />
              );
            }
            return null;
          })()}

          {(activeDay ? generatedTrip.days.find((d) => d.day === activeDay)?.stops || [] : allStops)
            .filter((stop) => stop.type !== 'end')
            .map((stop) => (
              <Marker
                key={stop.id}
                position={stop.coordinates}
                icon={createMarkerIcon(stop.type, { isActive: !!activeDay, size: 36 })}
                title={stop.name}
                onClick={() => onSelectStop(stop)}
              />
            ))}

          {selectedStop && (
            <InfoWindow position={selectedStop.coordinates} onCloseClick={() => onSelectStop(null)}>
              <div className="p-1 min-w-[200px] font-sans">
                <h4 className="text-[14px] font-semibold tracking-[-0.005em] text-ink">
                  {selectedStop.name}
                </h4>
                {selectedStop.description && (
                  <p className="text-[12px] text-ink-3 mt-1 leading-[1.5]">{selectedStop.description}</p>
                )}
                <div className="flex items-center gap-2 mt-1.5 mb-2.5 text-[11px] font-mono uppercase tracking-[0.10em] text-ink-3">
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
                <button
                  onClick={() =>
                    window.open(
                      `https://www.google.com/maps/dir/?api=1&destination=${selectedStop.coordinates.lat},${selectedStop.coordinates.lng}`,
                      '_blank',
                    )
                  }
                  className="w-full px-3 py-1.5 rounded-full bg-pine-6 text-cream dark:text-ink-pine text-[12px] font-sans font-semibold tracking-[0.01em] hover:bg-pine-5 transition-colors"
                >
                  Get directions
                </button>
              </div>
            </InfoWindow>
          )}
        </GoogleMap>
      </div>
    </div>
  );
};
