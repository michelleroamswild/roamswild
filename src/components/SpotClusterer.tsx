import { useEffect, useRef, useCallback } from 'react';
import { MarkerClusterer, SuperClusterAlgorithm } from '@googlemaps/markerclusterer';
import type { PotentialSpot } from '@/hooks/use-dispersed-roads';

interface SpotClustererProps {
  map: google.maps.Map | null;
  spots: PotentialSpot[];
  onSpotClick: (spot: PotentialSpot) => void;
  selectedSpot: PotentialSpot | null;
  getMarkerIcon: (spot: PotentialSpot, isSelected: boolean) => google.maps.Symbol | google.maps.Icon;
}

// Custom renderer for cluster markers
const createClusterRenderer = () => ({
  render: ({ count, position }: { count: number; position: google.maps.LatLng }) => {
    // Color gradient based on count: yellow -> green -> blue -> purple
    const color = count > 50 ? '#7c3aed' : count > 20 ? '#3b82f6' : count > 10 ? '#10b981' : '#eab308';
    const size = Math.min(24 + Math.log2(count) * 8, 56);

    return new google.maps.Marker({
      position,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: color,
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
      title: `${count} camping spots - zoom in to see details`,
      zIndex: count + 100, // Clusters above individual markers
    });
  },
});

export function SpotClusterer({
  map,
  spots,
  onSpotClick,
  selectedSpot,
  getMarkerIcon
}: SpotClustererProps) {
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const spotsRef = useRef<string>('');

  // Stable click handler
  const handleSpotClick = useCallback((spot: PotentialSpot) => {
    onSpotClick(spot);
  }, [onSpotClick]);

  // Initialize or update clusterer when map or spots change
  useEffect(() => {
    if (!map) return;

    // Create a stable key for spots to detect changes
    const spotsKey = spots.map(s => s.id).sort().join(',');

    // Only recreate if spots actually changed
    if (spotsKey === spotsRef.current && clustererRef.current) {
      return;
    }
    spotsRef.current = spotsKey;

    // Clean up existing clusterer
    if (clustererRef.current) {
      clustererRef.current.clearMarkers();
      clustererRef.current.setMap(null);
    }
    markersRef.current.clear();

    // Create markers for all spots
    const markers: google.maps.Marker[] = [];

    spots
      .filter((spot) => isFinite(spot.lat) && isFinite(spot.lng))
      .forEach((spot) => {
        const isSelected = selectedSpot?.id === spot.id;
        const marker = new google.maps.Marker({
          position: { lat: spot.lat, lng: spot.lng },
          title: `${spot.name} (Score: ${spot.score})`,
          icon: getMarkerIcon(spot, isSelected),
          zIndex: isSelected ? 1000 : spot.score,
        });

        marker.addListener('click', () => handleSpotClick(spot));
        markers.push(marker);
        markersRef.current.set(spot.id, marker);
      });

    // Create clusterer with SuperCluster algorithm
    const clusterer = new MarkerClusterer({
      map,
      markers,
      renderer: createClusterRenderer(),
      algorithm: new SuperClusterAlgorithm({
        radius: 60,   // Cluster radius in pixels
        maxZoom: 13,  // Stop clustering at zoom 14+
        minPoints: 3, // Minimum points to form a cluster
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
  }, [map, spots, getMarkerIcon, handleSpotClick, selectedSpot?.id]);

  // Update selected marker appearance
  useEffect(() => {
    markersRef.current.forEach((marker, spotId) => {
      const spot = spots.find(s => s.id === spotId);
      if (!spot) return;

      const isSelected = selectedSpot?.id === spotId;
      marker.setIcon(getMarkerIcon(spot, isSelected));
      marker.setZIndex(isSelected ? 1000 : spot.score);
    });
  }, [selectedSpot?.id, spots, getMarkerIcon]);

  return null; // This component manages markers imperatively
}
