import { Calendar, Clock, MapPin, NavigationArrow, Path, X } from '@phosphor-icons/react';
import { DirectionsRenderer, InfoWindow, Marker } from '@react-google-maps/api';
import { GoogleMap } from '@/components/GoogleMap';
import { GeneratedTrip, TripConfig, TripStop } from '@/types/trip';
import { createMarkerIcon, createSimpleMarkerIcon } from '@/utils/mapMarkers';
import { Mono, Pill } from '@/components/redesign';

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
  onExitDayMode: () => void;
  onNavigateDay: () => void;
  onStartNavigation: () => void;
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
  onExitDayMode,
  onNavigateDay,
  onStartNavigation,
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

        {/* Route info overlay */}
        <div className="absolute bottom-2 sm:bottom-4 left-2 sm:left-4 right-2 sm:right-4 z-10">
          <div className="bg-white/95 backdrop-blur-md border border-line rounded-[14px] shadow-[0_8px_22px_rgba(29,34,24,.10)] p-2.5 sm:p-3.5 font-sans">
            {activeDay ? (
              <div className="flex items-center justify-between flex-wrap gap-2 sm:gap-3">
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                  <div className="hidden sm:flex items-center justify-center w-10 h-10 bg-pine-6/12 rounded-[10px] flex-shrink-0">
                    <span className="text-[16px] font-sans font-bold tracking-[-0.01em] text-pine-6 leading-none">
                      {activeDay}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] sm:text-[14px] font-sans font-semibold tracking-[-0.005em] text-ink">
                      Day {activeDay}
                    </p>
                    <div className="flex items-center gap-2 sm:gap-3 mt-0.5">
                      <Mono className="text-ink-3 inline-flex items-center gap-1">
                        <Path className="w-3 h-3" weight="regular" />
                        {generatedTrip.days.find((d) => d.day === activeDay)?.drivingDistance}
                      </Mono>
                      <Mono className="text-ink-3 inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" weight="regular" />
                        {generatedTrip.days.find((d) => d.day === activeDay)?.drivingTime}
                      </Mono>
                      <Mono className="text-ink-3 hidden sm:inline-flex items-center gap-1">
                        <MapPin className="w-3 h-3" weight="regular" />
                        {generatedTrip.days.find((d) => d.day === activeDay)?.stops.length} stops
                      </Mono>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                  <Pill variant="ghost" sm mono={false} onClick={onExitDayMode}>
                    <X className="w-3.5 h-3.5" weight="regular" />
                    <span className="hidden sm:inline">Exit day</span>
                  </Pill>
                  <Pill variant="solid-pine" sm mono={false} onClick={onNavigateDay}>
                    <NavigationArrow className="w-3.5 h-3.5" weight="regular" />
                    <span className="hidden sm:inline">Navigate day {activeDay}</span>
                    <span className="sm:hidden">Navigate</span>
                  </Pill>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between flex-wrap gap-2 sm:gap-3">
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  <div className="inline-flex items-center gap-1">
                    <Path className="w-3.5 h-3.5 text-pine-6" weight="regular" />
                    <span className="text-[13px] sm:text-[14px] font-sans font-semibold tracking-[-0.005em] text-ink">
                      {generatedTrip.totalDistance}
                    </span>
                  </div>
                  <div className="inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-ink-3" weight="regular" />
                    <span className="text-[13px] sm:text-[14px] text-ink">{generatedTrip.totalDrivingTime}</span>
                  </div>
                  <div className="hidden sm:inline-flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-clay" weight="regular" />
                    <span className="text-[13px] sm:text-[14px] text-ink">
                      {generatedTrip.days.length} days
                    </span>
                  </div>
                </div>
                <Pill variant="solid-pine" sm mono={false} onClick={onStartNavigation}>
                  <NavigationArrow className="w-3.5 h-3.5" weight="regular" />
                  <span className="hidden sm:inline">Start navigation</span>
                  <span className="sm:hidden">Navigate</span>
                </Pill>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
