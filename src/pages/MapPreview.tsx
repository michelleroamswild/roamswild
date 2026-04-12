import { useMemo } from 'react';
import { Polyline, Marker, Polygon } from '@react-google-maps/api';
import { GoogleMap } from '@/components/GoogleMap';
import { useDispersedRoads, MVUMRoad, OSMTrack } from '@/hooks/use-dispersed-roads';
import { usePublicLands } from '@/hooks/use-public-lands';
import { useCampsites } from '@/context/CampsitesContext';
import { createSimpleMarkerIcon } from '@/utils/mapMarkers';

const MOAB = { lat: 38.5733, lng: -109.5498 };
const RADIUS_MILES = 10;

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

const toLatLngPath = (coordinates: unknown): google.maps.LatLngLiteral[] => {
  if (!Array.isArray(coordinates)) return [];
  return coordinates
    .map((coord) => {
      if (Array.isArray(coord) && typeof coord[0] === 'number' && typeof coord[1] === 'number') {
        return { lat: coord[1], lng: coord[0] };
      }
      return null;
    })
    .filter((p): p is google.maps.LatLngLiteral => p !== null);
};

const MapPreview = () => {
  const { mvumRoads, osmTracks, potentialSpots, establishedCampgrounds } = useDispersedRoads(
    MOAB.lat,
    MOAB.lng,
    RADIUS_MILES
  );
  const { publicLands } = usePublicLands(MOAB.lat, MOAB.lng, RADIUS_MILES);
  const { campsites } = useCampsites();

  const displayableTracks = useMemo(() => osmTracks.filter((t) => !t.isPaved), [osmTracks]);

  return (
    <div className="w-screen h-screen">
      <GoogleMap
        center={MOAB}
        zoom={11}
        className="w-full h-full"
        options={{
          mapTypeId: 'hybrid',
          mapTypeControl: true,
          mapTypeControlOptions: {
            position: typeof google !== 'undefined' ? google.maps.ControlPosition?.TOP_RIGHT : undefined,
          },
        }}
      >
        <Marker position={MOAB} title="Moab, UT" />

        {publicLands.map((land) => {
          if (!land.polygon || !land.renderOnMap) return null;
          const isBLM = land.managingAgency === 'BLM';
          const isNPS = land.managingAgency === 'NPS';
          const isState = land.managingAgency === 'STATE';
          const isStateTrust = ['SDOL', 'SFW', 'SPR', 'SDNR'].includes(land.managingAgency);
          const isLandTrust = land.managingAgency === 'NGO';
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

        {mvumRoads.map((road) => {
          const path = toLatLngPath(road.geometry?.coordinates);
          if (path.length < 2) return null;
          return (
            <Polyline
              key={`mvum-${road.id}`}
              path={path}
              options={{
                strokeColor: getMVUMColor(road),
                strokeOpacity: 0.7,
                strokeWeight: 2,
                clickable: false,
                zIndex: 10,
              }}
            />
          );
        })}

        {displayableTracks.map((track, index) => {
          const path = toLatLngPath(track.geometry?.coordinates);
          if (path.length < 2) return null;
          return (
            <Polyline
              key={`osm-${track.id}-${index}`}
              path={path}
              options={{
                strokeColor: getOSMColor(track),
                strokeOpacity: 0.7,
                strokeWeight: 2,
                clickable: false,
                zIndex: 10,
              }}
            />
          );
        })}

        {potentialSpots
          .filter((s) => isFinite(s.lat) && isFinite(s.lng))
          .map((spot) => {
            let fillColor = '#e83a3a';
            if (spot.type === 'camp-site') fillColor = '#3d7a40';
            else if (spot.score >= 35) fillColor = '#eab308';
            else if (spot.score >= 25) fillColor = '#f97316';
            return (
              <Marker
                key={`spot-${spot.id}`}
                position={{ lat: spot.lat, lng: spot.lng }}
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  fillColor,
                  fillOpacity: 1,
                  strokeColor: '#ffffff',
                  strokeWeight: 1,
                  scale: 7,
                }}
                zIndex={400}
              />
            );
          })}

        {establishedCampgrounds
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
                strokeColor: '#ffffff',
                strokeWeight: 1,
                scale: 8,
              }}
              zIndex={500}
            />
          ))}

        {campsites
          .filter((cs) => isFinite(cs.lat) && isFinite(cs.lng))
          .map((cs) => (
            <Marker
              key={`my-${cs.id}`}
              position={{ lat: cs.lat, lng: cs.lng }}
              title={cs.name}
              icon={createSimpleMarkerIcon('camp', { isActive: false, size: 8 })}
              zIndex={600}
            />
          ))}
      </GoogleMap>
    </div>
  );
};

export default MapPreview;
