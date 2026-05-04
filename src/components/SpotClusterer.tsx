import { useEffect, useRef, useCallback } from 'react';
import { MarkerClusterer, SuperClusterAlgorithm } from '@googlemaps/markerclusterer';
import type { Cluster } from '@googlemaps/markerclusterer';
import type { PotentialSpot } from '@/hooks/use-dispersed-roads';

interface SpotClustererProps {
  map: google.maps.Map | null;
  spots: PotentialSpot[];
  onSpotClick: (spot: PotentialSpot) => void;
  selectedSpot: PotentialSpot | null;
  getMarkerIcon: (spot: PotentialSpot, isSelected: boolean) => google.maps.Symbol | google.maps.Icon;
}

// Map a kind → pin color (kept in sync with DispersedExplorer's
// getSpotMarkerIcon and the --pin-* tokens in src/index.css).
const kindToColor = (kind: string | undefined): string => {
  switch (kind) {
    case 'dispersed_camping':       return 'hsl(96 28% 38%)';   // --pin-dispersed
    case 'established_campground':  return 'hsl(206 38% 46%)';  // --pin-campground
    case 'informal_camping':        return 'hsl(45 62% 56%)';   // --pin-informal
    case 'water':                   return 'hsl(150 13% 65%)';  // --pin-water
    case 'shower':                  return 'hsl(250 22% 60%)';  // --pin-shower
    case 'laundromat':              return 'hsl(24 68% 52%)';   // --pin-laundromat
    default:                        return 'hsl(30 14% 50%)';   // unknown / no kind
  }
};

// Custom renderer for cluster markers — colored by the dominant kind in
// the cluster. A cluster of mostly dispersed pins reads as moss green,
// mostly water reads as grey-green, etc.
const createClusterRenderer = () => ({
  render: ({ count, position, markers }: Cluster) => {
    // Tally kinds inside the cluster, pick the most common
    const tally = new Map<string, number>();
    markers.forEach((m) => {
      const kind = (m as google.maps.Marker).get?.('spotKind') as string | undefined;
      const k = kind ?? 'unknown';
      tally.set(k, (tally.get(k) ?? 0) + 1);
    });
    let dominant: string | undefined;
    let max = 0;
    tally.forEach((c, k) => { if (c > max) { max = c; dominant = k; } });
    const color = kindToColor(dominant);
    const size = Math.min(24 + Math.log2(count) * 8, 56);

    return new google.maps.Marker({
      position,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: color,
        fillOpacity: 0.9,
        strokeColor: 'hsl(36 23% 97%)',  // cream
        strokeWeight: 2.5,
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
        // Stash kind on the marker so the cluster renderer can pick the
        // dominant-kind color when this marker rolls up into a cluster.
        marker.set('spotKind', spot.kind);

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
