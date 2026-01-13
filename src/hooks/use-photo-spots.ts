import { useState, useEffect, useMemo } from 'react';
import { usePhotoHotspots, useRoutePhotoHotspots, PhotoHotspot } from './use-photo-hotspots';
import { useScenicViewpoints, useRouteScenicViewpoints, ScenicViewpoint } from './use-scenic-viewpoints';

export interface PhotoSpot {
  id: string;
  name: string;
  lat: number;
  lng: number;
  photoCount?: number;
  rating?: number;
  reviewCount?: number;
  samplePhotoUrl?: string;
  source: 'flickr' | 'google' | 'merged';
  types?: string[];
}

// Haversine formula for distance in km
function getDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

// Merge and deduplicate spots from both sources
function mergeSpots(
  flickrHotspots: PhotoHotspot[],
  googleViewpoints: ScenicViewpoint[]
): PhotoSpot[] {
  const mergedSpots: PhotoSpot[] = [];
  const usedFlickrIds = new Set<string>();

  // Process Google viewpoints first (higher quality metadata)
  for (const viewpoint of googleViewpoints) {
    // Check if there's a nearby Flickr hotspot to merge with
    let matchingFlickr: PhotoHotspot | null = null;

    for (const hotspot of flickrHotspots) {
      if (usedFlickrIds.has(hotspot.id)) continue;

      const distance = getDistanceKm(
        viewpoint.lat,
        viewpoint.lng,
        hotspot.lat,
        hotspot.lng
      );

      // Merge if within 500m
      if (distance <= 0.5) {
        matchingFlickr = hotspot;
        usedFlickrIds.add(hotspot.id);
        break;
      }
    }

    if (matchingFlickr) {
      // Merged spot - use Google metadata with Flickr photo data
      mergedSpots.push({
        id: viewpoint.id,
        name: viewpoint.name,
        lat: viewpoint.lat,
        lng: viewpoint.lng,
        photoCount: matchingFlickr.photoCount,
        rating: viewpoint.rating,
        reviewCount: viewpoint.reviewCount,
        samplePhotoUrl: matchingFlickr.samplePhotoUrl || viewpoint.photoUrl,
        source: 'merged',
        types: viewpoint.types,
      });
    } else {
      // Google-only spot
      mergedSpots.push({
        id: viewpoint.id,
        name: viewpoint.name,
        lat: viewpoint.lat,
        lng: viewpoint.lng,
        rating: viewpoint.rating,
        reviewCount: viewpoint.reviewCount,
        samplePhotoUrl: viewpoint.photoUrl,
        source: 'google',
        types: viewpoint.types,
      });
    }
  }

  // Add remaining Flickr hotspots that weren't merged
  for (const hotspot of flickrHotspots) {
    if (usedFlickrIds.has(hotspot.id)) continue;

    mergedSpots.push({
      id: hotspot.id,
      name: hotspot.name,
      lat: hotspot.lat,
      lng: hotspot.lng,
      photoCount: hotspot.photoCount,
      samplePhotoUrl: hotspot.samplePhotoUrl,
      source: 'flickr',
    });
  }

  // Sort by a combined score (rating * 20 + photoCount/10)
  // This balances Google ratings with Flickr popularity
  return mergedSpots.sort((a, b) => {
    const scoreA = (a.rating || 0) * 20 + (a.photoCount || 0) / 10;
    const scoreB = (b.rating || 0) * 20 + (b.photoCount || 0) / 10;
    return scoreB - scoreA;
  });
}

export function usePhotoSpots(lat: number, lng: number, radiusKm: number = 50) {
  const {
    hotspots: flickrHotspots,
    loading: flickrLoading,
    error: flickrError,
  } = usePhotoHotspots(lat, lng, radiusKm);

  const {
    viewpoints: googleViewpoints,
    loading: googleLoading,
    error: googleError,
  } = useScenicViewpoints(lat, lng, radiusKm);

  const spots = useMemo(
    () => mergeSpots(flickrHotspots, googleViewpoints),
    [flickrHotspots, googleViewpoints]
  );

  const loading = flickrLoading || googleLoading;
  const error = flickrError || googleError;

  return { spots, loading, error };
}

// Search at multiple points along a route
export function useRoutePhotoSpots(
  searchPoints: Array<{ lat: number; lng: number }>,
  radiusKm: number = 32
) {
  const {
    hotspots: flickrHotspots,
    loading: flickrLoading,
    error: flickrError,
  } = useRoutePhotoHotspots(searchPoints, radiusKm);

  const {
    viewpoints: googleViewpoints,
    loading: googleLoading,
    error: googleError,
  } = useRouteScenicViewpoints(searchPoints, radiusKm);

  const spots = useMemo(
    () => mergeSpots(flickrHotspots, googleViewpoints),
    [flickrHotspots, googleViewpoints]
  );

  const loading = flickrLoading || googleLoading;
  const error = flickrError || googleError;

  return { spots, loading, error };
}
