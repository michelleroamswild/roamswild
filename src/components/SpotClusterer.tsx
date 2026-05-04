import { useEffect, useRef } from 'react';
import { MarkerClusterer, SuperClusterAlgorithm } from '@googlemaps/markerclusterer';
import type { Cluster } from '@googlemaps/markerclusterer';
import type { PotentialSpot } from '@/hooks/use-dispersed-roads';

// Migrated from deprecated google.maps.Marker → google.maps.marker.AdvancedMarkerElement
// per the Feb 2024 deprecation notice. Marker bug fixes will not be addressed
// going forward; AdvancedMarkerElement uses a DOM-based content model that
// renders cleaner without the icon-redraw flicker pattern.

interface SpotClustererProps {
  map: google.maps.Map | null;
  spots: PotentialSpot[];
  onSpotClick: (spot: PotentialSpot) => void;
  selectedSpot: PotentialSpot | null;
  /** Build the marker's DOM content. Returns an HTMLElement that gets
      assigned to `AdvancedMarkerElement.content`. */
  getMarkerIcon: (spot: PotentialSpot, isSelected: boolean) => HTMLElement;
}

// AdvancedMarkerElement doesn't carry an arbitrary props bag like the old
// Marker class; we stash kind on a known property name we own.
type SpotAdvancedMarker = google.maps.marker.AdvancedMarkerElement & { spotKind?: string };

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

// Build the DOM content for a cluster bubble — colored by dominant kind.
const buildClusterContent = (count: number, color: string): HTMLElement => {
  const size = Math.min(24 + Math.log2(count) * 8, 56);
  const div = document.createElement('div');
  div.style.width = `${size}px`;
  div.style.height = `${size}px`;
  div.style.borderRadius = '50%';
  div.style.backgroundColor = color;
  div.style.border = '2.5px solid hsl(36 23% 97%)';
  div.style.display = 'flex';
  div.style.alignItems = 'center';
  div.style.justifyContent = 'center';
  div.style.color = '#ffffff';
  div.style.fontFamily = 'Manrope, sans-serif';
  div.style.fontSize = size > 40 ? '14px' : '12px';
  div.style.fontWeight = '700';
  div.style.opacity = '0.9';
  div.style.cursor = 'pointer';
  div.textContent = String(count);
  return div;
};

const createClusterRenderer = () => ({
  render: ({ count, position, markers }: Cluster) => {
    // Tally kinds inside the cluster, pick the most common.
    const tally = new Map<string, number>();
    markers.forEach((m) => {
      const k = (m as SpotAdvancedMarker).spotKind ?? 'unknown';
      tally.set(k, (tally.get(k) ?? 0) + 1);
    });
    let dominant: string | undefined;
    let max = 0;
    tally.forEach((c, k) => { if (c > max) { max = c; dominant = k; } });
    const color = kindToColor(dominant);

    return new google.maps.marker.AdvancedMarkerElement({
      position,
      content: buildClusterContent(count, color),
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
  getMarkerIcon,
}: SpotClustererProps) {
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const markersRef = useRef<Map<string, SpotAdvancedMarker>>(new Map());
  const spotsRef = useRef<string>('');
  // Track which spot id is currently selected so the icon-update effect
  // only swaps content on markers whose selection state actually changed
  // (at most two: the previously-selected and the newly-selected). Without
  // this guard the effect fires `marker.content = newDom` on every marker
  // every render, which flashes the entire pin set on each parent re-render.
  const selectedIdRef = useRef<string | null>(null);

  // Pin the click handler in a ref so unstable inline-arrow callers from
  // the parent (e.g. `onSpotClusterClick={(spot) => { … }}`) don't cascade
  // a new reference into the cluster-build effect's deps. Without this,
  // every parent re-render rebuilt the entire cluster from scratch — the
  // dominant cause of pin flicker.
  const onSpotClickRef = useRef(onSpotClick);
  onSpotClickRef.current = onSpotClick;

  // Initialize or update clusterer when map or spots change
  useEffect(() => {
    if (!map) return;

    const spotsKey = spots.map((s) => s.id).sort().join(',');
    if (spotsKey === spotsRef.current && clustererRef.current) {
      return;
    }
    spotsRef.current = spotsKey;

    if (clustererRef.current) {
      clustererRef.current.clearMarkers();
      clustererRef.current.setMap(null);
    }
    markersRef.current.clear();

    const markers: SpotAdvancedMarker[] = [];

    spots
      .filter((spot) => isFinite(spot.lat) && isFinite(spot.lng))
      .forEach((spot) => {
        const isSelected = selectedSpot?.id === spot.id;
        const marker = new google.maps.marker.AdvancedMarkerElement({
          position: { lat: spot.lat, lng: spot.lng },
          title: `${spot.name} (Score: ${spot.score})`,
          content: getMarkerIcon(spot, isSelected),
          zIndex: isSelected ? 1000 : spot.score,
        }) as SpotAdvancedMarker;
        // Stash kind for the cluster renderer's dominant-kind tally.
        marker.spotKind = spot.kind;
        // AdvancedMarkerElement uses 'gmp-click' (vs 'click' on the old class).
        // Read through the ref so the listener picks up the latest handler
        // without needing the cluster-build effect to depend on it.
        marker.addListener('gmp-click', () => onSpotClickRef.current(spot));
        markers.push(marker);
        markersRef.current.set(spot.id, marker);
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

    // Seed the selection ref now that markers are freshly built.
    selectedIdRef.current = selectedSpot?.id ?? null;

    return () => {
      if (clustererRef.current) {
        clustererRef.current.clearMarkers();
        clustererRef.current.setMap(null);
        clustererRef.current = null;
      }
      markersRef.current.clear();
    };
    // Deps intentionally minimal: only the data and the map-rendering inputs.
    // selectedSpot?.id is handled by the icon-update effect below.
    // The click handler is pinned via onSpotClickRef so it's not in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, spots, getMarkerIcon]);

  // Update selected marker appearance — only touch the two markers whose
  // selection state actually flipped (previously-selected and newly-selected).
  // Reassigning `marker.content = …` triggers a DOM swap on the map, which
  // is what reads as flicker when done across all 200+ pins per render.
  useEffect(() => {
    const newId = selectedSpot?.id ?? null;
    const oldId = selectedIdRef.current;
    if (newId === oldId) return;

    if (oldId) {
      const prev = markersRef.current.get(oldId);
      const prevSpot = spots.find((s) => s.id === oldId);
      if (prev && prevSpot) {
        prev.content = getMarkerIcon(prevSpot, false);
        prev.zIndex = prevSpot.score;
      }
    }
    if (newId) {
      const next = markersRef.current.get(newId);
      const nextSpot = spots.find((s) => s.id === newId);
      if (next && nextSpot) {
        next.content = getMarkerIcon(nextSpot, true);
        next.zIndex = 1000;
      }
    }
    selectedIdRef.current = newId;
  }, [selectedSpot?.id, spots, getMarkerIcon]);

  return null; // This component manages markers imperatively
}
