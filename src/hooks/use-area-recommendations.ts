import { useState, useCallback } from 'react';
import { useGoogleMaps } from '@/components/GoogleMapsProvider';

export interface AreaRecommendation {
  id: string;
  name: string;
  type: 'trail' | 'viewpoint' | 'poi' | 'campground';
  category: string;
  lat: number;
  lng: number;
  rating?: number;
  userRatingsTotal?: number;
  photoUrl?: string;
  vicinity?: string;
}

interface UseAreaRecommendationsResult {
  recommendations: AreaRecommendation[];
  loading: boolean;
  error: string | null;
  fetchRecommendations: (lat: number, lng: number, radiusMiles?: number) => Promise<void>;
  clearRecommendations: () => void;
}

// Place types to search for
const TRAIL_TYPES = ['hiking_area', 'natural_feature'];
const VIEWPOINT_TYPES = ['tourist_attraction', 'point_of_interest'];
const CAMPGROUND_TYPES = ['campground', 'rv_park'];

// Keywords for better filtering
const TRAIL_KEYWORDS = ['trail', 'hike', 'hiking', 'path', 'trailhead'];
const VIEWPOINT_KEYWORDS = ['viewpoint', 'overlook', 'vista', 'scenic', 'lookout'];

/**
 * Hook to fetch area recommendations (trails, viewpoints, POIs) for a given location
 */
export function useAreaRecommendations(): UseAreaRecommendationsResult {
  const { isLoaded } = useGoogleMaps();
  const [recommendations, setRecommendations] = useState<AreaRecommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRecommendations = useCallback(
    async (lat: number, lng: number, radiusMiles: number = 25) => {
      if (!isLoaded || !window.google?.maps?.places) {
        setError('Google Maps not loaded');
        return;
      }

      setLoading(true);
      setError(null);

      const radiusMeters = radiusMiles * 1609.34;
      const location = new google.maps.LatLng(lat, lng);
      const service = new google.maps.places.PlacesService(
        document.createElement('div')
      );

      const allRecommendations: AreaRecommendation[] = [];

      try {
        // Search for trails/hiking areas
        const trailResults = await searchPlaces(service, {
          location,
          radius: radiusMeters,
          type: 'natural_feature',
          keyword: 'trail hiking',
        });

        for (const place of trailResults) {
          if (isTrailRelated(place.name || '')) {
            allRecommendations.push(placeToRecommendation(place, 'trail', 'Trail'));
          }
        }

        // Search for viewpoints/scenic spots
        const viewpointResults = await searchPlaces(service, {
          location,
          radius: radiusMeters,
          type: 'tourist_attraction',
          keyword: 'viewpoint overlook scenic',
        });

        for (const place of viewpointResults) {
          if (isViewpointRelated(place.name || '')) {
            allRecommendations.push(placeToRecommendation(place, 'viewpoint', 'Photo Spot'));
          }
        }

        // Search for general POIs (parks, natural features)
        const poiResults = await searchPlaces(service, {
          location,
          radius: radiusMeters,
          type: 'park',
        });

        for (const place of poiResults) {
          // Avoid duplicates
          if (!allRecommendations.some(r => r.id === place.place_id)) {
            allRecommendations.push(placeToRecommendation(place, 'poi', 'Point of Interest'));
          }
        }

        // Search for campgrounds
        const campgroundResults = await searchPlaces(service, {
          location,
          radius: radiusMeters,
          type: 'campground',
        });

        for (const place of campgroundResults) {
          allRecommendations.push(placeToRecommendation(place, 'campground', 'Campground'));
        }

        // Sort by rating (highest first), then by number of reviews
        allRecommendations.sort((a, b) => {
          const ratingDiff = (b.rating || 0) - (a.rating || 0);
          if (ratingDiff !== 0) return ratingDiff;
          return (b.userRatingsTotal || 0) - (a.userRatingsTotal || 0);
        });

        // Limit to top recommendations per category
        const grouped = groupByType(allRecommendations);
        const limited: AreaRecommendation[] = [];

        // Take top 3 from each category
        for (const type of ['trail', 'viewpoint', 'poi', 'campground'] as const) {
          limited.push(...(grouped[type] || []).slice(0, 3));
        }

        setRecommendations(limited);
      } catch (err) {
        console.error('Error fetching recommendations:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch recommendations');
      } finally {
        setLoading(false);
      }
    },
    [isLoaded]
  );

  const clearRecommendations = useCallback(() => {
    setRecommendations([]);
    setError(null);
  }, []);

  return {
    recommendations,
    loading,
    error,
    fetchRecommendations,
    clearRecommendations,
  };
}

// Helper to search places
function searchPlaces(
  service: google.maps.places.PlacesService,
  request: google.maps.places.PlaceSearchRequest
): Promise<google.maps.places.PlaceResult[]> {
  return new Promise((resolve) => {
    service.nearbySearch(request, (results, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && results) {
        resolve(results);
      } else {
        resolve([]);
      }
    });
  });
}

// Convert Google Place to our recommendation format
function placeToRecommendation(
  place: google.maps.places.PlaceResult,
  type: AreaRecommendation['type'],
  category: string
): AreaRecommendation {
  return {
    id: place.place_id || `place-${Date.now()}-${Math.random()}`,
    name: place.name || 'Unknown',
    type,
    category,
    lat: place.geometry?.location?.lat() || 0,
    lng: place.geometry?.location?.lng() || 0,
    rating: place.rating,
    userRatingsTotal: place.user_ratings_total,
    photoUrl: place.photos?.[0]?.getUrl({ maxWidth: 200, maxHeight: 150 }),
    vicinity: place.vicinity,
  };
}

// Check if a place name is trail-related
function isTrailRelated(name: string): boolean {
  const lowerName = name.toLowerCase();
  return TRAIL_KEYWORDS.some(keyword => lowerName.includes(keyword));
}

// Check if a place name is viewpoint-related
function isViewpointRelated(name: string): boolean {
  const lowerName = name.toLowerCase();
  return VIEWPOINT_KEYWORDS.some(keyword => lowerName.includes(keyword)) ||
    lowerName.includes('peak') ||
    lowerName.includes('summit') ||
    lowerName.includes('mountain');
}

// Group recommendations by type
function groupByType(recommendations: AreaRecommendation[]) {
  const grouped: Record<string, AreaRecommendation[]> = {};
  for (const rec of recommendations) {
    if (!grouped[rec.type]) {
      grouped[rec.type] = [];
    }
    grouped[rec.type].push(rec);
  }
  return grouped;
}
