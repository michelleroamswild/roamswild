import { useEffect, useRef } from 'react';

interface AdvancedMarkerProps {
  /** Google Maps instance — pass via ref from a parent that captures it
      onLoad. The marker mounts itself on this map and tears down on unmount. */
  map: google.maps.Map | null;
  position: { lat: number; lng: number };
  /** DOM element to render as the marker's visual. Recreate this each
      render if you want to change the appearance — the wrapper assigns
      it to `marker.content` whenever it changes. */
  content: HTMLElement;
  title?: string;
  zIndex?: number;
  onClick?: () => void;
}

/**
 * Thin React wrapper around `google.maps.marker.AdvancedMarkerElement`
 * — the recommended replacement for the deprecated `google.maps.Marker`.
 *
 * Use this instead of `<Marker>` from `@react-google-maps/api` (which
 * still uses the deprecated class internally) for one-off pins on the
 * map. Cluster-managed markers go through `SpotClusterer` directly.
 *
 * Renders nothing in the React tree — markers live on the map imperatively.
 */
export function AdvancedMarker({
  map,
  position,
  content,
  title,
  zIndex,
  onClick,
}: AdvancedMarkerProps) {
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

  // Create / destroy the marker on map mount.
  useEffect(() => {
    if (!map) return;
    const marker = new google.maps.marker.AdvancedMarkerElement({
      map,
      position,
      content,
      title,
      zIndex,
    });
    markerRef.current = marker;
    const listener = marker.addListener('gmp-click', () => {
      onClickRef.current?.();
    });
    return () => {
      listener.remove();
      marker.map = null;
      markerRef.current = null;
    };
    // We intentionally only run this on map change — position / content /
    // title / zIndex updates flow through the effects below to avoid
    // tearing down + recreating the marker on every prop change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  // Push prop updates onto the existing marker so we don't recreate it.
  useEffect(() => {
    if (markerRef.current) markerRef.current.position = position;
  }, [position.lat, position.lng]);

  useEffect(() => {
    if (markerRef.current) markerRef.current.content = content;
  }, [content]);

  useEffect(() => {
    if (markerRef.current) markerRef.current.title = title ?? '';
  }, [title]);

  useEffect(() => {
    if (markerRef.current) markerRef.current.zIndex = zIndex ?? null;
  }, [zIndex]);

  return null;
}
