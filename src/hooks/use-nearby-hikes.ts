import { useState, useEffect } from 'react';

export interface HikeResult {
  id: string;
  name: string;
  location: string;
  rating?: number;
  reviewCount?: number;
  lat: number;
  lng: number;
}

// Fetch hikes from Google Places API
async function fetchGooglePlacesHikes(
  lat: number,
  lng: number,
  radiusMeters: number = 48280 // ~30 miles
): Promise<HikeResult[]> {
  if (!window.google?.maps?.places) return [];

  return new Promise((resolve) => {
    const service = new google.maps.places.PlacesService(
      document.createElement('div')
    );

    const request: google.maps.places.PlaceSearchRequest = {
      location: new google.maps.LatLng(lat, lng),
      radius: radiusMeters,
      keyword: 'hiking trail',
      type: 'tourist_attraction',
    };

    service.nearbySearch(request, (results, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && results) {
        const hikes: HikeResult[] = results
          .filter((place) => place.geometry?.location)
          .slice(0, 10)
          .map((place) => ({
            id: `google-${place.place_id}`,
            name: place.name || 'Unknown Trail',
            location: place.vicinity || '',
            rating: place.rating,
            reviewCount: place.user_ratings_total,
            lat: place.geometry!.location!.lat(),
            lng: place.geometry!.location!.lng(),
          }));
        resolve(hikes);
      } else {
        resolve([]);
      }
    });
  });
}

export function useNearbyHikes(lat: number, lng: number, radiusMiles: number = 30) {
  const [hikes, setHikes] = useState<HikeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!lat || !lng) return;

    const fetchHikes = async () => {
      setLoading(true);
      setError(null);

      try {
        const googleHikes = await fetchGooglePlacesHikes(lat, lng, radiusMiles * 1609.34);

        // Sort by rating
        const sortedHikes = googleHikes.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        setHikes(sortedHikes.slice(0, 10));
      } catch (err) {
        setError('Failed to fetch nearby hikes');
      } finally {
        setLoading(false);
      }
    };

    // Small delay to ensure Google Maps is loaded
    const timer = setTimeout(fetchHikes, 500);
    return () => clearTimeout(timer);
  }, [lat, lng, radiusMiles]);

  return { hikes, loading, error };
}
