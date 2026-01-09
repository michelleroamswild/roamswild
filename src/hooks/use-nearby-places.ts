import { useState, useEffect, useMemo } from 'react';

export interface GoogleSavedPlace {
  id: string;
  name: string;
  note?: string;
  lat: number;
  lng: number;
  url?: string;
  savedAt: string;
}

// Haversine formula to calculate distance between two points in miles
function getDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959; // Earth's radius in miles
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

export function useNearbyPlaces(centerLat: number, centerLng: number, radiusMiles: number = 50) {
  const [allPlaces, setAllPlaces] = useState<GoogleSavedPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/google-saved-places.json')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load saved places');
        return res.json();
      })
      .then((data: GoogleSavedPlace[]) => {
        setAllPlaces(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const nearbyPlaces = useMemo(() => {
    if (!centerLat || !centerLng || allPlaces.length === 0) return [];

    return allPlaces
      .map((place) => ({
        ...place,
        distance: getDistanceMiles(centerLat, centerLng, place.lat, place.lng),
      }))
      .filter((place) => place.distance <= radiusMiles)
      .sort((a, b) => a.distance - b.distance);
  }, [allPlaces, centerLat, centerLng, radiusMiles]);

  return { nearbyPlaces, loading, error, totalPlaces: allPlaces.length };
}
