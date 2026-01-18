/**
 * Google Places Photo Spots
 *
 * Searches for scenic viewpoints, overlooks, and photography-relevant
 * locations using Google Places API.
 */

export interface GooglePhotoSpot {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  rating: number | null;
  userRatingsTotal: number;
  types: string[];
  vicinity: string;
  distanceKm: number;
  bearing: number;
  bearingLabel: string;
  photoUrl: string | null;
  score: number;
  category: 'viewpoint' | 'park' | 'landmark' | 'nature' | 'attraction';
}

// Search queries for photography locations
const PHOTO_SPOT_QUERIES = [
  'scenic viewpoint',
  'overlook',
  'vista point',
  'lookout point',
  'observation point',
];

// Place types that are good for photography
const GOOD_PHOTO_TYPES = [
  'natural_feature',
  'park',
  'point_of_interest',
  'tourist_attraction',
  'establishment',
];

function toRad(deg: number): number {
  return deg * Math.PI / 180;
}

function toDeg(rad: number): number {
  return rad * 180 / Math.PI;
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calculateBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = toRad(lng2 - lng1);
  const x = Math.sin(dLng) * Math.cos(toRad(lat2));
  const y = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return (toDeg(Math.atan2(x, y)) + 360) % 360;
}

function bearingToCardinal(bearing: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return directions[Math.round(bearing / 22.5) % 16];
}

function categorizePlace(types: string[], name: string): GooglePhotoSpot['category'] {
  const nameLower = name.toLowerCase();

  if (nameLower.includes('viewpoint') || nameLower.includes('overlook') ||
      nameLower.includes('vista') || nameLower.includes('lookout')) {
    return 'viewpoint';
  }

  if (types.includes('park') || types.includes('national_park') ||
      nameLower.includes('park') || nameLower.includes('preserve')) {
    return 'park';
  }

  if (types.includes('natural_feature') || nameLower.includes('beach') ||
      nameLower.includes('mountain') || nameLower.includes('lake') ||
      nameLower.includes('falls') || nameLower.includes('canyon')) {
    return 'nature';
  }

  if (types.includes('tourist_attraction')) {
    return 'attraction';
  }

  return 'landmark';
}

function scorePlaceForPhotography(
  place: google.maps.places.PlaceResult,
  distanceKm: number,
  types: string[],
  category: string
): number {
  let score = 50; // Base score

  // Rating bonus (highly rated places are usually scenic)
  if (place.rating) {
    if (place.rating >= 4.5) score += 25;
    else if (place.rating >= 4.0) score += 15;
    else if (place.rating >= 3.5) score += 5;
  }

  // Popular places are often worth visiting
  if (place.user_ratings_total) {
    if (place.user_ratings_total > 1000) score += 15;
    else if (place.user_ratings_total > 500) score += 10;
    else if (place.user_ratings_total > 100) score += 5;
  }

  // Category bonuses
  if (category === 'viewpoint') score += 20;
  else if (category === 'nature') score += 15;
  else if (category === 'park') score += 10;

  // Type bonuses
  if (types.includes('natural_feature')) score += 10;
  if (types.includes('park')) score += 5;

  // Distance penalty
  if (distanceKm > 20) score -= 15;
  else if (distanceKm > 10) score -= 5;

  // Has photos is a good sign
  if (place.photos && place.photos.length > 0) score += 5;

  return Math.min(100, Math.max(0, score));
}

/**
 * Search for photo spots using Google Places API
 */
export async function searchGooglePhotoSpots(
  userLat: number,
  userLng: number,
  radiusKm: number = 15
): Promise<GooglePhotoSpot[]> {
  // Check if Google Maps is loaded
  if (typeof google === 'undefined' || !google.maps || !google.maps.places) {
    console.warn('Google Places API not loaded');
    return [];
  }

  const service = new google.maps.places.PlacesService(
    document.createElement('div')
  );

  const location = new google.maps.LatLng(userLat, userLng);
  const radiusM = radiusKm * 1000;

  const allResults: google.maps.places.PlaceResult[] = [];

  // Search with each query
  for (const query of PHOTO_SPOT_QUERIES) {
    try {
      const results = await new Promise<google.maps.places.PlaceResult[]>((resolve, reject) => {
        service.textSearch(
          {
            query: query,
            location: location,
            radius: radiusM,
          },
          (results, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK && results) {
              resolve(results);
            } else if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
              resolve([]);
            } else {
              reject(new Error(`Places API error: ${status}`));
            }
          }
        );
      });

      allResults.push(...results);
    } catch (err) {
      console.warn(`Search for "${query}" failed:`, err);
    }
  }

  // Also do a nearby search for natural features and parks
  try {
    const nearbyResults = await new Promise<google.maps.places.PlaceResult[]>((resolve, reject) => {
      service.nearbySearch(
        {
          location: location,
          radius: radiusM,
          type: 'natural_feature',
        },
        (results, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && results) {
            resolve(results);
          } else if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
            resolve([]);
          } else {
            reject(new Error(`Nearby search error: ${status}`));
          }
        }
      );
    });
    allResults.push(...nearbyResults);
  } catch (err) {
    console.warn('Nearby natural features search failed:', err);
  }

  // Deduplicate by place_id
  const uniquePlaces = new Map<string, google.maps.places.PlaceResult>();
  for (const place of allResults) {
    if (place.place_id && !uniquePlaces.has(place.place_id)) {
      uniquePlaces.set(place.place_id, place);
    }
  }

  // Convert to our format
  const spots: GooglePhotoSpot[] = [];

  for (const place of uniquePlaces.values()) {
    if (!place.geometry?.location || !place.name) continue;

    const lat = place.geometry.location.lat();
    const lng = place.geometry.location.lng();
    const distanceKm = haversineDistance(userLat, userLng, lat, lng);

    // Skip if outside radius
    if (distanceKm > radiusKm) continue;

    const bearing = calculateBearing(userLat, userLng, lat, lng);
    const types = place.types || [];
    const category = categorizePlace(types, place.name);
    const score = scorePlaceForPhotography(place, distanceKm, types, category);

    // Get photo URL if available
    let photoUrl: string | null = null;
    if (place.photos && place.photos.length > 0) {
      try {
        photoUrl = place.photos[0].getUrl({ maxWidth: 200 });
      } catch {
        // Photo URL might not be available
      }
    }

    spots.push({
      placeId: place.place_id!,
      name: place.name,
      lat,
      lng,
      rating: place.rating ?? null,
      userRatingsTotal: place.user_ratings_total || 0,
      types,
      vicinity: place.vicinity || place.formatted_address || '',
      distanceKm,
      bearing,
      bearingLabel: bearingToCardinal(bearing),
      photoUrl,
      score,
      category,
    });
  }

  // Sort by score
  spots.sort((a, b) => b.score - a.score);

  return spots.slice(0, 15);
}
