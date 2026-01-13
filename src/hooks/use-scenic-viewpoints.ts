import { useState, useEffect } from 'react';

export interface ScenicViewpoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  rating?: number;
  reviewCount?: number;
  photoUrl?: string;
  types?: string[];
}

// Place types to include (scenic/natural locations)
const SCENIC_TYPES = new Set([
  'natural_feature',
  'park',
  'campground',
  'tourist_attraction',
  'point_of_interest',
]);

// Place types to exclude (commercial/indoor locations)
const EXCLUDED_TYPES = new Set([
  'restaurant',
  'food',
  'lodging',
  'store',
  'shopping_mall',
  'shopping_center',
  'gas_station',
  'cafe',
  'bar',
  'night_club',
  'gym',
  'hospital',
  'school',
  'bank',
  'atm',
]);

// Keywords that indicate scenic viewpoints
const SCENIC_KEYWORDS = [
  'viewpoint',
  'overlook',
  'vista',
  'scenic',
  'lookout',
  'panorama',
  'view point',
  'observation',
  'trail',
  'peak',
  'summit',
  'falls',
  'canyon',
];

// Names to exclude (not photo-worthy destinations)
const EXCLUDED_NAME_PATTERNS = [
  'trailhead',
  'parking',
  'restroom',
  'visitor center',
  'ranger station',
];

// Check if a place is likely scenic based on name
function hasScenicKeyword(name: string): boolean {
  const lowerName = name.toLowerCase();
  return SCENIC_KEYWORDS.some(keyword => lowerName.includes(keyword));
}

// Check if a place name should be excluded
function shouldExcludeName(name: string): boolean {
  const lowerName = name.toLowerCase();
  return EXCLUDED_NAME_PATTERNS.some(pattern => lowerName.includes(pattern));
}

// Check if place types include excluded commercial types
function hasExcludedType(types: string[]): boolean {
  return types.some(type => EXCLUDED_TYPES.has(type));
}

// Check if place types include scenic types
function hasScenicType(types: string[]): boolean {
  return types.some(type => SCENIC_TYPES.has(type));
}

// Search for scenic viewpoints using Google Places API
async function searchScenicViewpoints(
  lat: number,
  lng: number,
  radiusKm: number = 50
): Promise<ScenicViewpoint[]> {
  // Check if Google Places API is available
  if (!window.google?.maps?.places) {
    console.warn('Google Places API not loaded');
    return [];
  }

  const service = new google.maps.places.PlacesService(
    document.createElement('div')
  );

  const viewpoints: ScenicViewpoint[] = [];
  const seenIds = new Set<string>();

  // Search with multiple keywords for better coverage
  const searchKeywords = [
    'viewpoint overlook',
    'scenic vista',
    'hiking trail',
    'national park',
    'state park',
  ];

  for (const keyword of searchKeywords) {
    try {
      const results = await new Promise<google.maps.places.PlaceResult[]>(
        (resolve, reject) => {
          service.nearbySearch(
            {
              location: new google.maps.LatLng(lat, lng),
              radius: Math.min(radiusKm, 50) * 1000, // Convert to meters, max 50km
              keyword,
            },
            (results, status) => {
              if (
                status === google.maps.places.PlacesServiceStatus.OK &&
                results
              ) {
                resolve(results);
              } else if (
                status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS
              ) {
                resolve([]);
              } else {
                reject(new Error(`Places search failed: ${status}`));
              }
            }
          );
        }
      );

      for (const place of results) {
        if (!place.place_id || seenIds.has(place.place_id)) continue;
        if (!place.geometry?.location) continue;

        const types = place.types || [];
        const name = place.name || '';

        // Skip if it has excluded commercial types
        if (hasExcludedType(types)) continue;

        // Skip trailheads, parking lots, etc.
        if (shouldExcludeName(name)) continue;

        // Include if it has scenic types OR has scenic keywords in name
        if (!hasScenicType(types) && !hasScenicKeyword(name)) continue;

        seenIds.add(place.place_id);

        viewpoints.push({
          id: place.place_id,
          name,
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
          rating: place.rating,
          reviewCount: place.user_ratings_total,
          photoUrl: place.photos?.[0]?.getUrl({ maxWidth: 400 }),
          types,
        });
      }

      // Small delay between searches to avoid rate limiting
      await new Promise(r => setTimeout(r, 200));
    } catch (error) {
      console.error(`Places search error for "${keyword}":`, error);
    }
  }

  // Sort by rating (with review count as tiebreaker) and return top results
  return viewpoints
    .sort((a, b) => {
      const ratingA = a.rating || 0;
      const ratingB = b.rating || 0;
      if (ratingB !== ratingA) return ratingB - ratingA;
      return (b.reviewCount || 0) - (a.reviewCount || 0);
    })
    .slice(0, 20);
}

export function useScenicViewpoints(
  lat: number,
  lng: number,
  radiusKm: number = 50
) {
  const [viewpoints, setViewpoints] = useState<ScenicViewpoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check for valid coordinates
    if (lat === 0 && lng === 0) return;
    if (typeof lat !== 'number' || typeof lng !== 'number') return;
    if (isNaN(lat) || isNaN(lng)) return;

    const fetchViewpoints = async () => {
      setLoading(true);
      setError(null);

      try {
        console.log('Fetching scenic viewpoints for:', { lat, lng, radiusKm });
        const results = await searchScenicViewpoints(lat, lng, radiusKm);
        console.log('Scenic viewpoints found:', results.length);
        setViewpoints(results);
      } catch (err) {
        setError('Failed to fetch scenic viewpoints');
        console.error('Scenic viewpoints error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchViewpoints();
  }, [lat, lng, radiusKm]);

  return { viewpoints, loading, error };
}

// Search at multiple points along a route for better coverage
export function useRouteScenicViewpoints(
  searchPoints: Array<{ lat: number; lng: number }>,
  radiusKm: number = 32
) {
  const [viewpoints, setViewpoints] = useState<ScenicViewpoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!searchPoints || searchPoints.length === 0) return;

    const fetchAllViewpoints = async () => {
      setLoading(true);
      setError(null);

      try {
        console.log(
          'Fetching scenic viewpoints for route with',
          searchPoints.length,
          'search points'
        );

        const allResults: ScenicViewpoint[] = [];
        const seenIds = new Set<string>();

        for (const point of searchPoints) {
          if (point.lat === 0 && point.lng === 0) continue;

          const results = await searchScenicViewpoints(
            point.lat,
            point.lng,
            radiusKm
          );

          for (const viewpoint of results) {
            if (!seenIds.has(viewpoint.id)) {
              seenIds.add(viewpoint.id);
              allResults.push(viewpoint);
            }
          }

          // Delay between search points
          if (searchPoints.indexOf(point) < searchPoints.length - 1) {
            await new Promise(r => setTimeout(r, 300));
          }
        }

        // Sort by rating and return top results
        const sortedResults = allResults
          .sort((a, b) => {
            const ratingA = a.rating || 0;
            const ratingB = b.rating || 0;
            if (ratingB !== ratingA) return ratingB - ratingA;
            return (b.reviewCount || 0) - (a.reviewCount || 0);
          })
          .slice(0, 30);

        console.log('Route scenic viewpoints found:', sortedResults.length);
        setViewpoints(sortedResults);
      } catch (err) {
        setError('Failed to fetch scenic viewpoints');
        console.error('Route scenic viewpoints error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAllViewpoints();
  }, [JSON.stringify(searchPoints), radiusKm]);

  return { viewpoints, loading, error };
}
