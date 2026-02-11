import { useEffect, useRef, useCallback } from 'react';
import { MarkerClusterer, SuperClusterAlgorithm } from '@googlemaps/markerclusterer';
import type { Campsite } from '@/types/campsite';
import { createSimpleMarkerIcon } from '@/utils/mapMarkers';

interface CampsiteClustererProps {
  map: google.maps.Map | null;
  campsites: Campsite[];
  onCampsiteClick: (campsite: Campsite) => void;
  selectedCampsiteId: string | null;
}

const createClusterRenderer = () => ({
  render: ({ count, position }: { count: number; position: google.maps.LatLng }) => {
    const size = Math.min(24 + Math.log2(count) * 8, 56);

    return new google.maps.Marker({
      position,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: '#a855f7',
        fillOpacity: 0.9,
        strokeColor: '#ffffff',
        strokeWeight: 2,
        scale: size / 2,
      },
      label: {
        text: String(count),
        color: '#ffffff',
        fontSize: size > 40 ? '14px' : '12px',
        fontWeight: 'bold',
      },
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
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());
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

    const markers: google.maps.Marker[] = [];

    campsites
      .filter(c => isFinite(c.lat) && isFinite(c.lng))
      .forEach(campsite => {
        const isSelected = selectedCampsiteId === campsite.id;
        const marker = new google.maps.Marker({
          position: { lat: campsite.lat, lng: campsite.lng },
          title: campsite.name,
          icon: createSimpleMarkerIcon('camp', {
            isActive: isSelected,
            size: isSelected ? 10 : 8,
          }),
          zIndex: isSelected ? 1000 : 1,
        });

        marker.addListener('click', () => handleClick(campsite));
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
      marker.setIcon(createSimpleMarkerIcon('camp', {
        isActive: isSelected,
        size: isSelected ? 10 : 8,
      }));
      marker.setZIndex(isSelected ? 1000 : 1);
    });
  }, [selectedCampsiteId]);

  return null;
}
