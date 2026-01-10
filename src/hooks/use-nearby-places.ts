import { useState, useEffect } from 'react';

export interface GoogleSavedPlace {
  id: string;
  name: string;
  note?: string;
  lat: number;
  lng: number;
  url?: string;
  savedAt?: string;
  source?: 'saved' | 'ridb';
}

// RIDB API key
const RIDB_API_KEY = import.meta.env.VITE_RIDB_API_KEY || '';

interface RIDBFacility {
  FacilityID: string;
  FacilityName: string;
  FacilityDescription: string;
  FacilityLatitude: number;
  FacilityLongitude: number;
  FacilityTypeDescription: string;
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

// Search RIDB for campsites near a location
async function searchRIDBCampsites(
  lat: number,
  lng: number,
  radiusMiles: number
): Promise<(GoogleSavedPlace & { distance: number })[]> {
  if (!RIDB_API_KEY) {
    console.log('RIDB API key not configured');
    return [];
  }

  try {
    // Use proxy to avoid CORS issues
    const url = `/api/ridb/facilities?latitude=${lat}&longitude=${lng}&radius=${radiusMiles}&limit=100`;

    console.log('Fetching RIDB campsites for place page:', url);

    const response = await fetch(url, {
      headers: {
        'apikey': RIDB_API_KEY,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('RIDB API error:', response.status, await response.text());
      return [];
    }

    const data = await response.json();
    const facilities: RIDBFacility[] = data.RECDATA || [];

    console.log(`RIDB returned ${facilities.length} facilities for place page`);

    // Filter to only include campgrounds
    const campgroundTypes = ['campground', 'camping', 'camp'];
    const campgrounds = facilities.filter(f => {
      if (!f.FacilityLatitude || !f.FacilityLongitude) return false;
      const typeDesc = (f.FacilityTypeDescription || '').toLowerCase();
      const name = (f.FacilityName || '').toLowerCase();
      return campgroundTypes.some(type => typeDesc.includes(type) || name.includes(type));
    });

    console.log(`Found ${campgrounds.length} campgrounds from RIDB for place page`);

    return campgrounds
      .map((facility) => {
        const distance = getDistanceMiles(lat, lng, facility.FacilityLatitude, facility.FacilityLongitude);
        // Clean up the description - remove HTML tags
        const cleanDescription = facility.FacilityDescription
          ?.replace(/<[^>]*>/g, '')
          ?.slice(0, 200) || facility.FacilityTypeDescription;
        return {
          id: `ridb-${facility.FacilityID}`,
          name: facility.FacilityName,
          lat: facility.FacilityLatitude,
          lng: facility.FacilityLongitude,
          note: cleanDescription,
          distance,
          source: 'ridb' as const,
        };
      })
      .sort((a, b) => a.distance - b.distance);
  } catch (error) {
    console.error('RIDB search error:', error);
    return [];
  }
}

export function useNearbyPlaces(centerLat: number, centerLng: number, radiusMiles: number = 50) {
  const [nearbyPlaces, setNearbyPlaces] = useState<(GoogleSavedPlace & { distance: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalPlaces, setTotalPlaces] = useState(0);

  useEffect(() => {
    if (!centerLat || !centerLng) {
      setLoading(false);
      return;
    }

    async function fetchPlaces() {
      setLoading(true);

      try {
        // First try saved places
        const res = await fetch('/google-saved-places.json');
        let savedPlaces: GoogleSavedPlace[] = [];

        if (res.ok) {
          savedPlaces = await res.json();
          setTotalPlaces(savedPlaces.length);
        }

        // Filter to nearby saved places
        const nearbySaved = savedPlaces
          .map((place) => ({
            ...place,
            distance: getDistanceMiles(centerLat, centerLng, place.lat, place.lng),
            source: 'saved' as const,
          }))
          .filter((place) => place.distance <= radiusMiles)
          .sort((a, b) => a.distance - b.distance);

        console.log(`Found ${nearbySaved.length} saved places within ${radiusMiles} miles`);

        // If we have saved places, use them
        if (nearbySaved.length > 0) {
          setNearbyPlaces(nearbySaved);
          setLoading(false);
          return;
        }

        // Fallback to RIDB API with 100 mile radius for testing
        console.log('No saved places nearby, searching RIDB...');
        const ridbPlaces = await searchRIDBCampsites(centerLat, centerLng, 100);

        if (ridbPlaces.length > 0) {
          console.log(`Using ${ridbPlaces.length} RIDB campsites`);
          setNearbyPlaces(ridbPlaces);
        } else {
          setNearbyPlaces([]);
        }

        setLoading(false);
      } catch (err) {
        console.error('Error fetching places:', err);
        setError(err instanceof Error ? err.message : 'Failed to load places');
        setLoading(false);
      }
    }

    fetchPlaces();
  }, [centerLat, centerLng, radiusMiles]);

  return { nearbyPlaces, loading, error, totalPlaces };
}
