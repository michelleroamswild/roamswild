import { Calendar, Clock, MapPin, NavigationArrow, Path, X } from '@phosphor-icons/react';
import { DirectionsRenderer, InfoWindow, Marker } from '@react-google-maps/api';
import { Button } from '@/components/ui/button';
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
          {/* Route directions - show day route if day selected, otherwise full trip */}
          {activeDay !== null && dayDirections ? (
            <DirectionsRenderer
              key={`day-${activeDay}-route`}
              directions={dayDirections}
              options={{
                suppressMarkers: true,
                polylineOptions: {
                  strokeColor: isDark ? '#d9d0c3' : '#2d5a3d',
                  strokeWeight: 5,
                  strokeOpacity: 1,
                },
              }}
            />
          ) : directions ? (
            <DirectionsRenderer
              key="full-trip-route"
              directions={directions}
              options={{
                suppressMarkers: true,
                polylineOptions: {
                  strokeColor: isDark ? '#d9d0c3' : '#2d5a3d',
                  strokeWeight: 5,
                  strokeOpacity: 1,
                },
              }}
            />
          ) : null}

          {/* Start/Base marker (only shown when viewing full trip) */}
          {!activeDay && (tripConfig.startLocation || tripConfig.baseLocation) && (
            <Marker
              position={(tripConfig.startLocation || tripConfig.baseLocation)!.coordinates}
              icon={createMarkerIcon('start', { size: 36 })}
              title={tripConfig.startLocation
                ? `Start: ${tripConfig.startLocation.name}`
                : `Base: ${tripConfig.baseLocation!.name}`
              }
            />
          )}

          {/* Show origin marker for day preview (previous night's camp or start location) */}
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
                const prevDay = generatedTrip.days.find(day => day.day === d);
                const campsite = prevDay?.stops.find(s => s.type === 'camp');
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

          {/* Show destination marker for last day preview when returning to start */}
          {activeDay && activeDay === generatedTrip.days.length && tripConfig.returnToStart && (tripConfig.startLocation || tripConfig.baseLocation) && (
            <Marker
              key="day-destination-end"
              position={(tripConfig.startLocation || tripConfig.baseLocation)!.coordinates}
              icon={createMarkerIcon('end', { isActive: true, size: 36 })}
              title={`End: ${(tripConfig.startLocation || tripConfig.baseLocation)!.name}`}
            />
          )}

          {/* Show end marker when trip doesn't return to start */}
          {!activeDay && !tripConfig.returnToStart && (() => {
            const endStop = allStops.find(s => s.type === 'end');
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

          {/* Show end marker for last day preview when NOT returning to start */}
          {activeDay && activeDay === generatedTrip.days.length && !tripConfig.returnToStart && (() => {
            const dayStops = generatedTrip.days.find(d => d.day === activeDay)?.stops || [];
            const endStop = dayStops.find(s => s.type === 'end');
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

          {/* Show only active day's stops when day is selected, otherwise all stops */}
          {(activeDay ? generatedTrip.days.find(d => d.day === activeDay)?.stops || [] : allStops)
            .filter(stop => stop.type !== 'end')
            .map((stop) => (
              <Marker
                key={stop.id}
                position={stop.coordinates}
                icon={createMarkerIcon(stop.type, { isActive: !!activeDay, size: 36 })}
                title={stop.name}
                onClick={() => onSelectStop(stop)}
              />
            ))}

          {/* Info window for selected stop */}
          {selectedStop && (
            <InfoWindow
              position={selectedStop.coordinates}
              onCloseClick={() => onSelectStop(null)}
            >
              <div className="p-1 min-w-[200px]">
                <h4 className="font-semibold text-gray-900 text-base mb-1">
                  {selectedStop.name}
                </h4>
                <p className="text-gray-600 text-sm mb-2">{selectedStop.description}</p>
                <div className="flex items-center gap-2 text-gray-500 text-sm mb-3">
                  <span>Day {selectedStop.day}</span>
                  <span>•</span>
                  <span>{selectedStop.duration}</span>
                </div>
                <button
                  onClick={() => {
                    window.open(
                      `https://www.google.com/maps/dir/?api=1&destination=${selectedStop.coordinates.lat},${selectedStop.coordinates.lng}`,
                      '_blank'
                    );
                  }}
                  className="w-full px-3 py-1.5 bg-emerald-600 text-white text-sm rounded hover:bg-emerald-700 transition-colors"
                >
                  Get Directions
                </button>
              </div>
            </InfoWindow>
          )}
        </GoogleMap>

        {/* Route info overlay */}
        <div className="absolute bottom-2 sm:bottom-4 left-2 sm:left-4 right-2 sm:right-4 z-10">
          <div className="bg-card/95 backdrop-blur-sm rounded-xl border border-border p-2.5 sm:p-4 shadow-lg">
            {activeDay ? (
              <div className="flex items-center justify-between flex-wrap gap-2 sm:gap-4">
                <div className="flex items-center gap-2 sm:gap-4">
                  <div className="hidden sm:flex items-center justify-center w-10 h-10 bg-emerald-500/10 rounded-full">
                    <span className="text-lg font-bold text-emerald-600">{activeDay}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground text-sm sm:text-base">Day {activeDay}</p>
                    <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Path className="w-3 h-3" />
                        {generatedTrip.days.find(d => d.day === activeDay)?.drivingDistance}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {generatedTrip.days.find(d => d.day === activeDay)?.drivingTime}
                      </span>
                      <span className="hidden sm:flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {generatedTrip.days.find(d => d.day === activeDay)?.stops.length} stops
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <Button variant="outline" size="sm" className="text-xs sm:text-sm h-8" onClick={onExitDayMode}>
                    <X className="w-3.5 h-3.5 sm:mr-1" />
                    <span className="hidden sm:inline">Exit Day</span>
                  </Button>
                  <Button variant="primary" size="sm" className="text-xs sm:text-sm h-8" onClick={onNavigateDay}>
                    <NavigationArrow className="w-3.5 h-3.5 sm:mr-2" />
                    <span className="hidden sm:inline">Navigate Day {activeDay}</span>
                    <span className="sm:hidden">Navigate</span>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between flex-wrap gap-2 sm:gap-4">
                <div className="flex items-center gap-3 sm:gap-6 text-xs sm:text-sm">
                  <div className="flex items-center gap-1.5">
                    <Path className="w-3.5 h-3.5 text-terracotta" />
                    <span className="font-semibold text-foreground">
                      {generatedTrip.totalDistance}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-foreground">{generatedTrip.totalDrivingTime}</span>
                  </div>
                  <div className="hidden sm:flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-primary" />
                    <span className="text-foreground">{generatedTrip.days.length} days</span>
                  </div>
                </div>
                <Button variant="primary" size="sm" className="text-xs sm:text-sm h-8" onClick={onStartNavigation}>
                  <NavigationArrow className="w-3.5 h-3.5 sm:mr-2" />
                  <span className="hidden sm:inline">Start Navigation</span>
                  <span className="sm:hidden">Navigate</span>
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
