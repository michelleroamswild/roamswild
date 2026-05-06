import { useEffect, useRef, useCallback } from 'react';
import { MarkerClusterer, SuperClusterAlgorithm } from '@googlemaps/markerclusterer';
import type { Campsite } from '@/types/campsite';

// Migrated from deprecated google.maps.Marker → google.maps.marker.AdvancedMarkerElement.

interface CampsiteClustererProps {
  map: google.maps.Map | null;
  campsites: Campsite[];
  onCampsiteClick: (campsite: Campsite) => void;
  selectedCampsiteId: string | null;
}

// Match the explorer's "my campsite" pin style (DispersedMap.buildCirclePin).
// Solid plum --pin-mine fill, cream stroke for normal, ink stroke for active.
const PIN_MINE = 'hsl(295 32% 42%)';

const buildPinContent = (isActive: boolean): HTMLElement => {
  const scale = isActive ? 12 : 9;
  const diameter = scale * 2;
  const strokeWidth = isActive ? 2.5 : 2;
  const strokeColor = isActive ? '#3f3e2c' : 'hsl(36 23% 97%)';
  const div = document.createElement('div');
  div.style.width = `${diameter}px`;
  div.style.height = `${diameter}px`;
  div.style.borderRadius = '50%';
  div.style.backgroundColor = PIN_MINE;
  div.style.border = `${strokeWidth}px solid ${strokeColor}`;
  div.style.cursor = 'pointer';
  return div;
};

const buildClusterContent = (count: number): HTMLElement => {
  const size = Math.min(24 + Math.log2(count) * 8, 56);
  const div = document.createElement('div');
  div.style.width = `${size}px`;
  div.style.height = `${size}px`;
  div.style.borderRadius = '50%';
  div.style.backgroundColor = PIN_MINE;
  div.style.border = '2px solid hsl(36 23% 97%)';
  div.style.display = 'flex';
  div.style.alignItems = 'center';
  div.style.justifyContent = 'center';
  div.style.color = '#ffffff';
  div.style.fontFamily = 'Manrope, sans-serif';
  div.style.fontSize = size > 40 ? '14px' : '12px';
  div.style.fontWeight = '700';
  div.style.cursor = 'pointer';
  div.textContent = String(count);
  return div;
};

const createClusterRenderer = () => ({
  render: ({ count, position }: { count: number; position: google.maps.LatLng }) => {
    return new google.maps.marker.AdvancedMarkerElement({
      position,
      content: buildClusterContent(count),
      title: `${count} campsites`,
      zIndex: count + 100,
    });
  },
});

export function CampsiteClusterer({
  map,
  campsites,
  onCampsiteClick,
  selectedCampsiteId,
}: CampsiteClustererProps) {
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const markersRef = useRef<Map<string, google.maps.marker.AdvancedMarkerElement>>(new Map());
  const campsitesKeyRef = useRef<string>('');

  const handleClick = useCallback((campsite: Campsite) => {
    onCampsiteClick(campsite);
  }, [onCampsiteClick]);

  useEffect(() => {
    if (!map) return;

    const key = campsites.map(c => c.id).sort().join(',');
    if (key === campsitesKeyRef.current && clustererRef.current) {
      return;
    }
    campsitesKeyRef.current = key;

    if (clustererRef.current) {
      clustererRef.current.clearMarkers();
      clustererRef.current.setMap(null);
    }
    markersRef.current.clear();

    const markers: google.maps.marker.AdvancedMarkerElement[] = [];

    campsites
      .filter(c => isFinite(c.lat) && isFinite(c.lng))
      .forEach(campsite => {
        const isSelected = selectedCampsiteId === campsite.id;
        const marker = new google.maps.marker.AdvancedMarkerElement({
          position: { lat: campsite.lat, lng: campsite.lng },
          title: campsite.name,
          content: buildPinContent(isSelected),
          zIndex: isSelected ? 1000 : 1,
        });

        marker.addListener('gmp-click', () => handleClick(campsite));
        markers.push(marker);
        markersRef.current.set(campsite.id, marker);
      });

    const clusterer = new MarkerClusterer({
      map,
      markers,
      renderer: createClusterRenderer(),
      algorithm: new SuperClusterAlgorithm({
        radius: 60,
        maxZoom: 13,
        minPoints: 3,
      }),
    });

    clustererRef.current = clusterer;

    return () => {
      if (clustererRef.current) {
        clustererRef.current.clearMarkers();
        clustererRef.current.setMap(null);
        clustererRef.current = null;
      }
      markersRef.current.clear();
    };
  }, [map, campsites, handleClick, selectedCampsiteId]);

  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      const isSelected = selectedCampsiteId === id;
      marker.content = buildPinContent(isSelected);
      marker.zIndex = isSelected ? 1000 : 1;
    });
  }, [selectedCampsiteId]);

  return null;
}
