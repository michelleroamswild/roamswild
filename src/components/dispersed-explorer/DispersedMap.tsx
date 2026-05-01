import { X } from '@phosphor-icons/react';
import { InfoWindow, Marker, Polygon, Polyline } from '@react-google-maps/api';
import { GoogleMap } from '@/components/GoogleMap';
import { SpotClusterer } from '@/components/SpotClusterer';
import { MVUMRoad, OSMTrack, PotentialSpot, EstablishedCampground } from '@/hooks/use-dispersed-roads';
import { createSimpleMarkerIcon } from '@/utils/mapMarkers';
import type { Campsite } from '@/types/campsite';
import type { SelectedLocation } from '@/components/LocationSelector';

type PublicLand = {
  id: string;
  name?: string;
  unitName?: string;
  managingAgency: string;
  polygon?: { lat: number; lng: number }[];
  renderOnMap?: boolean;
};

const getMVUMColor = (road: MVUMRoad) => {
  if (road.highClearanceVehicle && !road.passengerVehicle) return '#f97316';
  if (road.atv || road.motorcycle) return '#eab308';
  return '#22c55e';
};

const getOSMColor = (track: OSMTrack) => {
  if (track.fourWdOnly) return '#ef4444';
  if (track.tracktype === 'grade5' || track.tracktype === 'grade4') return '#ef4444';
  if (track.tracktype === 'grade3') return '#f97316';
  if (track.tracktype === 'grade2') return '#f97316';
  if (track.tracktype === 'grade1') return '#3b82f6';
  if (track.highway === 'track') return '#f97316';
  return '#eab308';
};

const toLatLngPath = (coordinates: any[]): google.maps.LatLngLiteral[] => {
  if (!Array.isArray(coordinates)) return [];
  return coordinates
    .map((coord) => {
      if (Array.isArray(coord) && typeof coord[0] === 'number' && typeof coord[1] === 'number') {
        return { lat: coord[1], lng: coord[0] };
      }
      if (coord && typeof coord.lat === 'number') {
        const lng = typeof coord.lng === 'number' ? coord.lng : coord.lon;
        if (typeof lng === 'number') {
          return { lat: coord.lat, lng };
        }
      }
      return null;
    })
    .filter((p): p is google.maps.LatLngLiteral => p !== null && isFinite(p.lat) && isFinite(p.lng));
};

interface DispersedMapProps {
  mapRef: React.MutableRefObject<google.maps.Map | null>;
  mapCenter: { lat: number; lng: number };
  mapZoom: number;
  onMapLoad: (map: google.maps.Map) => void;
  onMapClick: (e: google.maps.MapMouseEvent) => void;

  searchLocation: SelectedLocation | null;

  visibleLandAgencies: Set<string>;
  publicLands: PublicLand[];

  filteredMvumRoads: MVUMRoad[];
  filteredOsmTracks: OSMTrack[];
  selectedRoad: MVUMRoad | OSMTrack | null;
  onSelectRoad: (road: MVUMRoad | OSMTrack | null) => void;

  filteredPotentialSpots: PotentialSpot[];
  selectedSpot: PotentialSpot | null;
  onSpotClusterClick: (spot: PotentialSpot) => void;
  getSpotMarkerIcon: (spot: PotentialSpot, isSelected: boolean) => google.maps.Icon | google.maps.Symbol;

  showCampgroundsFiltered: boolean;
  allEstablishedCampgrounds: EstablishedCampground[];
  selectedCampground: EstablishedCampground | null;
  onSelectCampground: (cg: EstablishedCampground) => void;

  showMyCampsites: boolean;
  showMyCampsitesFiltered: boolean;
  campsites: Campsite[];
  selectedCampsite: Campsite | null;
  onSelectCampsite: (cs: Campsite) => void;
  onCloseSelection: () => void;

  mapTapPoint: { lat: number; lng: number } | null;
  onDismissMapTap: () => void;
  onOpenSaveFromMap: () => void;
}

export const DispersedMap = ({
  mapCenter,
  mapZoom,
  onMapLoad,
  onMapClick,
  searchLocation,
  visibleLandAgencies,
  publicLands,
  filteredMvumRoads,
  filteredOsmTracks,
  selectedRoad,
  onSelectRoad,
  filteredPotentialSpots,
  selectedSpot,
  onSpotClusterClick,
  getSpotMarkerIcon,
  mapRef,
  showCampgroundsFiltered,
  allEstablishedCampgrounds,
  selectedCampground,
  onSelectCampground,
  showMyCampsites,
  showMyCampsitesFiltered,
  campsites,
  selectedCampsite,
  onSelectCampsite,
  onCloseSelection,
  mapTapPoint,
  onDismissMapTap,
  onOpenSaveFromMap,
}: DispersedMapProps) => {
  return (
    <GoogleMap
      center={mapCenter}
      zoom={mapZoom}
      className="w-full h-full"
      onLoad={onMapLoad}
      onClick={onMapClick}
      options={{
        mapTypeId: 'hybrid',
        mapTypeControl: true,
        mapTypeControlOptions: {
          position: typeof google !== 'undefined' ? google.maps.ControlPosition?.TOP_RIGHT : undefined,
        },
      }}
    >
      {/* Search location marker */}
      {searchLocation && (
        <Marker
          position={{ lat: searchLocation.lat, lng: searchLocation.lng }}
          title={searchLocation.name}
        />
      )}

      {/* Public Lands Overlay — only render agencies whose toggle is on */}
      {publicLands.map((land) => {
        if (!land.polygon) return null;
        if (!land.renderOnMap) return null;

        const isBLM = land.managingAgency === 'BLM';
        const isNPS = land.managingAgency === 'NPS';
        const isState = land.managingAgency === 'STATE';
        const isStateTrust = ['SDOL', 'SFW', 'SPR', 'SDNR'].includes(land.managingAgency);
        const isLandTrust = land.managingAgency === 'NGO';

        const agencyKey = isBLM ? 'BLM'
          : isNPS ? 'NPS'
          : isState ? 'STATE_PARK'
          : isStateTrust ? 'STATE_TRUST'
          : isLandTrust ? 'LAND_TRUST'
          : 'USFS';
        if (!visibleLandAgencies.has(agencyKey)) return null;

        const fillColor = isBLM ? '#d97706' : isNPS ? '#7c3aed' : isState ? '#3b82f6' : isStateTrust ? '#06b6d4' : isLandTrust ? '#ec4899' : '#10b981';
        const strokeColor = isBLM ? '#b45309' : isNPS ? '#6d28d9' : isState ? '#2563eb' : isStateTrust ? '#0891b2' : isLandTrust ? '#db2777' : '#059669';

        return (
          <Polygon
            key={land.id}
            paths={land.polygon}
            options={{
              fillColor,
              fillOpacity: 0.25,
              strokeColor,
              strokeOpacity: 0.7,
              strokeWeight: 2,
              clickable: false,
              zIndex: 1,
            }}
          />
        );
      })}

      {/* MVUM Roads */}
      {filteredMvumRoads.map((road) => {
        const path = toLatLngPath(road.geometry?.coordinates);
        if (path.length < 2) return null;
        return (
          <Polyline
            key={`mvum-${road.id}`}
            path={path}
            options={{
              strokeColor: getMVUMColor(road),
              strokeOpacity: selectedRoad === road ? 1 : 0.7,
              strokeWeight: selectedRoad === road ? 4 : 2,
              clickable: true,
              zIndex: selectedRoad === road ? 100 : 10,
            }}
            onClick={() => onSelectRoad(road)}
          />
        );
      })}

      {/* OSM Tracks */}
      {filteredOsmTracks.map((track, index) => {
        const path = toLatLngPath(track.geometry?.coordinates);
        if (path.length < 2) return null;
        return (
          <Polyline
            key={`osm-${track.id}-${index}`}
            path={path}
            options={{
              strokeColor: getOSMColor(track),
              strokeOpacity: selectedRoad === track ? 1 : 0.7,
              strokeWeight: selectedRoad === track ? 4 : 2,
              clickable: true,
              zIndex: selectedRoad === track ? 100 : 10,
            }}
            onClick={() => onSelectRoad(track)}
          />
        );
      })}

      {/* Road Info Window — slim popover; full details live in the sidebar panel */}
      {selectedRoad && (() => {
        const path = toLatLngPath(selectedRoad.geometry?.coordinates);
        if (path.length === 0) return null;
        const centerIndex = Math.floor(path.length / 2);
        const centerPoint = path[centerIndex];
        const isMVUM = 'highClearanceVehicle' in selectedRoad;
        const sourceLabel = isMVUM ? 'USFS MVUM' : 'OSM Track';
        const displayName =
          selectedRoad.name || (isMVUM ? 'Unnamed road' : 'Unnamed track');

        return (
          <InfoWindow
            position={centerPoint}
            onCloseClick={() => onSelectRoad(null)}
            options={{ pixelOffset: new google.maps.Size(0, -28), disableAutoPan: true }}
          >
            <div className="compact-info-window min-w-[200px]">
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-semibold text-gray-900 text-sm leading-tight flex-1 min-w-0">
                  {displayName}
                </h4>
                <button
                  onClick={() => onSelectRoad(null)}
                  className="shrink-0 p-0.5 -mr-0.5 -mt-0.5 text-gray-400 hover:text-gray-700 transition-colors"
                  aria-label="Close"
                >
                  <X className="w-3.5 h-3.5" weight="bold" />
                </button>
              </div>
              <p className="text-gray-500 text-xs mt-0.5">{sourceLabel}</p>
            </div>
          </InfoWindow>
        );
      })()}

      {/* Potential Camp Spots with Clustering */}
      <SpotClusterer
        map={mapRef.current}
        spots={filteredPotentialSpots}
        onSpotClick={onSpotClusterClick}
        selectedSpot={selectedSpot}
        getMarkerIcon={getSpotMarkerIcon}
      />

      {/* Established Campgrounds */}
      {showCampgroundsFiltered && allEstablishedCampgrounds
        .filter((cg) => isFinite(cg.lat) && isFinite(cg.lng))
        .map((cg) => (
          <Marker
            key={cg.id}
            position={{ lat: cg.lat, lng: cg.lng }}
            title={cg.name}
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              fillColor: '#3b82f6',
              fillOpacity: 1,
              strokeColor: selectedCampground === cg ? '#1e3a8a' : '#ffffff',
              strokeWeight: selectedCampground === cg ? 2 : 1,
              scale: selectedCampground === cg ? 10 : 8,
            }}
            onClick={() => onSelectCampground(cg)}
            zIndex={selectedCampground === cg ? 1001 : 500}
          />
        ))}

      {/* User's Saved Campsites */}
      {showMyCampsites && showMyCampsitesFiltered && campsites
        .filter((cs) => isFinite(cs.lat) && isFinite(cs.lng))
        .map((cs) => (
          <Marker
            key={`my-${cs.id}`}
            position={{ lat: cs.lat, lng: cs.lng }}
            title={cs.name}
            icon={createSimpleMarkerIcon('camp', {
              isActive: selectedCampsite?.id === cs.id,
              size: selectedCampsite?.id === cs.id ? 10 : 8
            })}
            onClick={() => onSelectCampsite(cs)}
            zIndex={selectedCampsite?.id === cs.id ? 1002 : 600}
          />
        ))}

      {/* Info window for selected potential spot */}
      {selectedSpot && (
        <InfoWindow
          position={{ lat: selectedSpot.lat, lng: selectedSpot.lng }}
          onCloseClick={onCloseSelection}
          options={{ pixelOffset: new google.maps.Size(0, -28), disableAutoPan: true }}
        >
          <div className="compact-info-window min-w-[200px]">
            <div className="flex items-start justify-between gap-2">
              <h4 className="font-semibold text-gray-900 text-sm leading-tight flex-1 min-w-0">
                {selectedSpot.name || 'Unnamed Spot'}
              </h4>
              <button
                onClick={onCloseSelection}
                className="shrink-0 p-0.5 -mr-0.5 -mt-0.5 text-gray-400 hover:text-gray-700 transition-colors"
                aria-label="Close"
              >
                <X className="w-3.5 h-3.5" weight="bold" />
              </button>
            </div>
            <p className="text-gray-500 text-xs mt-0.5">
              {selectedSpot.type === 'camp-site' ? 'Known Campsite' : selectedSpot.type === 'dead-end' ? 'Road Terminus' : 'Road Junction'}
            </p>
          </div>
        </InfoWindow>
      )}

      {/* Info window for selected campground */}
      {selectedCampground && (
        <InfoWindow
          position={{ lat: selectedCampground.lat, lng: selectedCampground.lng }}
          onCloseClick={onCloseSelection}
          options={{ pixelOffset: new google.maps.Size(0, -28), disableAutoPan: true }}
        >
          <div className="compact-info-window min-w-[200px]">
            <div className="flex items-start justify-between gap-2">
              <h4 className="font-semibold text-gray-900 text-sm leading-tight flex-1 min-w-0">
                {selectedCampground.name}
              </h4>
              <button
                onClick={onCloseSelection}
                className="shrink-0 p-0.5 -mr-0.5 -mt-0.5 text-gray-400 hover:text-gray-700 transition-colors"
                aria-label="Close"
              >
                <X className="w-3.5 h-3.5" weight="bold" />
              </button>
            </div>
            <p className="text-gray-500 text-xs mt-0.5">
              {selectedCampground.facilityType}
              {selectedCampground.agencyName && (
                <>
                  <span className="mx-1">•</span>
                  {selectedCampground.agencyName}
                </>
              )}
            </p>
          </div>
        </InfoWindow>
      )}

      {/* Info window for selected user campsite */}
      {selectedCampsite && (
        <InfoWindow
          position={{ lat: selectedCampsite.lat, lng: selectedCampsite.lng }}
          onCloseClick={onCloseSelection}
          options={{ pixelOffset: new google.maps.Size(0, -28), disableAutoPan: true }}
        >
          <div className="compact-info-window min-w-[200px]">
            <div className="flex items-start justify-between gap-2">
              <h4 className="font-semibold text-gray-900 text-sm leading-tight flex-1 min-w-0">
                {selectedCampsite.name}
              </h4>
              <button
                onClick={onCloseSelection}
                className="shrink-0 p-0.5 -mr-0.5 -mt-0.5 text-gray-400 hover:text-gray-700 transition-colors"
                aria-label="Close"
              >
                <X className="w-3.5 h-3.5" weight="bold" />
              </button>
            </div>
            <p className="text-gray-500 text-xs mt-0.5">My Spot</p>
          </div>
        </InfoWindow>
      )}

      {/* Info window for map tap - save any location */}
      {mapTapPoint && !selectedSpot && !selectedRoad && !selectedCampground && !selectedCampsite && (
        <InfoWindow
          position={mapTapPoint}
          onCloseClick={onDismissMapTap}
        >
          <div className="min-w-[180px] font-sans">
            <p className="text-[11px] text-ink-3 mb-2 font-mono uppercase tracking-[0.10em] font-semibold">
              {mapTapPoint.lat.toFixed(5)}, {mapTapPoint.lng.toFixed(5)}
            </p>
            <div className="flex gap-1.5">
              <button
                onClick={onOpenSaveFromMap}
                className="flex-1 px-2.5 py-1 rounded-full bg-pine-6 text-cream text-[11px] font-sans font-semibold tracking-[0.01em] hover:bg-pine-5 transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => {
                  window.open(
                    `https://www.google.com/maps/search/?api=1&query=${mapTapPoint.lat},${mapTapPoint.lng}`,
                    '_blank'
                  );
                }}
                className="flex-1 px-2.5 py-1 rounded-full bg-white text-ink-2 border border-line text-[11px] font-sans font-semibold tracking-[0.01em] hover:border-ink-3/50 hover:bg-cream transition-colors"
              >
                Open map
              </button>
            </div>
          </div>
        </InfoWindow>
      )}
    </GoogleMap>
  );
};
