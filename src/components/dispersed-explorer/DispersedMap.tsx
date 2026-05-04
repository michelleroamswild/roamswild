import { useMemo } from 'react';
import { X } from '@phosphor-icons/react';
import { InfoWindow, Polygon, Polyline } from '@react-google-maps/api';
import { AdvancedMarker } from '@/components/AdvancedMarker';
import { GoogleMap } from '@/components/GoogleMap';
import { SpotClusterer } from '@/components/SpotClusterer';
import { MVUMRoad, OSMTrack, PotentialSpot, EstablishedCampground } from '@/hooks/use-dispersed-roads';
import type { Campsite } from '@/types/campsite';
import type { SelectedLocation } from '@/components/LocationSelector';
import { LAND_OVERLAY_COLORS, bucketForAgency } from '@/lib/land-colors';
import { typeLabel } from './SpotDetailPanel';

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

// Temporary: render every OSM track in black while we work on filtering
// out tracks that aren't on public land. Tracktype-based color ramp will
// come back once the data side is sorted.
const getOSMColor = (_track: OSMTrack) => '#000000';

// Builds a circle pin as an HTMLElement for AdvancedMarkerElement.content.
// scale follows the same convention as the old SymbolPath.CIRCLE icons —
// 9 → 18px diameter (default), 12 → 24px (active).
const buildCirclePin = (
  fillColor: string,
  scale: number,
  isActive: boolean,
): HTMLElement => {
  const diameter = scale * 2;
  const strokeWidth = isActive ? 2.5 : 2;
  const strokeColor = isActive ? '#3f3e2c' : 'hsl(36 23% 97%)';
  const div = document.createElement('div');
  div.style.width = `${diameter}px`;
  div.style.height = `${diameter}px`;
  div.style.borderRadius = '50%';
  div.style.backgroundColor = fillColor;
  div.style.border = `${strokeWidth}px solid ${strokeColor}`;
  div.style.cursor = 'pointer';
  return div;
};

// Default Google "red pin" replacement for the search-location marker.
// Plain SVG so it renders with the standard pin look without needing
// google.maps.Marker. Anchored at the bottom tip.
const buildSearchPin = (): HTMLElement => {
  const div = document.createElement('div');
  div.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="27" height="43" viewBox="0 0 27 43">
    <path d="M13.5 0C6.0442 0 0 6.0442 0 13.5C0 24.0938 13.5 43 13.5 43C13.5 43 27 24.0938 27 13.5C27 6.0442 20.9558 0 13.5 0Z" fill="#EA4335" stroke="#B31412" stroke-width="1"/>
    <circle cx="13.5" cy="13.5" r="5" fill="#B31412"/>
  </svg>`;
  div.style.transform = 'translateY(-50%)'; // bottom-tip anchor
  return div;
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
  /** Map base imagery — controlled by the parent's MapControls toggle. */
  mapTypeId?: google.maps.MapTypeId | string;
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
  getSpotMarkerIcon: (spot: PotentialSpot, isSelected: boolean) => HTMLElement;

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
  mapTypeId = 'hybrid',
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
  // Stable DOM element for the search-location pin (no state, never changes
  // appearance). Prevents AdvancedMarker from re-running its content effect.
  const searchPinContent = useMemo(() => buildSearchPin(), []);

  return (
    <GoogleMap
      center={mapCenter}
      zoom={mapZoom}
      className="w-full h-full"
      onLoad={onMapLoad}
      onClick={onMapClick}
      mapControls={false}
      options={{
        mapTypeId,
      }}
    >
      {/* Search location marker */}
      {searchLocation && (
        <AdvancedMarker
          map={mapRef.current}
          position={{ lat: searchLocation.lat, lng: searchLocation.lng }}
          title={searchLocation.name}
          content={searchPinContent}
        />
      )}

      {/* Public Lands Overlay — only render agencies whose toggle is on */}
      {publicLands.map((land) => {
        if (!land.polygon) return null;
        if (!land.renderOnMap) return null;
        const agencyKey = bucketForAgency(land.managingAgency);
        if (!visibleLandAgencies.has(agencyKey)) return null;
        const { fill: fillColor, stroke: strokeColor } = LAND_OVERLAY_COLORS[agencyKey];
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
        .map((cg) => {
          const isActive = selectedCampground === cg;
          return (
            <AdvancedMarker
              key={cg.id}
              map={mapRef.current}
              position={{ lat: cg.lat, lng: cg.lng }}
              title={cg.name}
              content={buildCirclePin(
                'hsl(206 38% 46%)', // --pin-campground
                isActive ? 12 : 9,
                isActive,
              )}
              zIndex={isActive ? 1001 : 500}
              onClick={() => onSelectCampground(cg)}
            />
          );
        })}

      {/* User's Saved Campsites */}
      {showMyCampsites && showMyCampsitesFiltered && campsites
        .filter((cs) => isFinite(cs.lat) && isFinite(cs.lng))
        .map((cs) => {
          const isActive = selectedCampsite?.id === cs.id;
          return (
            <AdvancedMarker
              key={`my-${cs.id}`}
              map={mapRef.current}
              position={{ lat: cs.lat, lng: cs.lng }}
              title={cs.name}
              content={buildCirclePin(
                'hsl(295 32% 42%)', // --pin-mine (deep plum)
                isActive ? 12 : 9,
                isActive,
              )}
              zIndex={isActive ? 1002 : 600}
              onClick={() => onSelectCampsite(cs)}
            />
          );
        })}

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
              {typeLabel(selectedSpot)}
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
                className="flex-1 px-2.5 py-1 rounded-full bg-pine-6 text-cream dark:text-ink-pine text-[11px] font-sans font-semibold tracking-[0.01em] hover:bg-pine-5 transition-colors"
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
                className="flex-1 px-2.5 py-1 rounded-full bg-white text-ink-2 border border-line text-[11px] font-sans font-semibold tracking-[0.01em] hover:border-ink-3/50 hover:bg-cream dark:hover:bg-paper-2 transition-colors"
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
