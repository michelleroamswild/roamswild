import { useState, useEffect } from 'react';

export interface PhotoHotspot {
  id: string;
  name: string;
  lat: number;
  lng: number;
  photoCount: number;
  woeid?: string; // Flickr's "Where On Earth ID"
  placeUrl?: string;
}

interface FlickrPlace {
  place_id: string;
  woeid: string;
  latitude: string;
  longitude: string;
  place_url: string;
  place_type: string;
  place_type_id: string;
  _content: string;
  photo_count?: string;
}

interface FlickrHotTag {
  score: string;
  _content: string;
}

// Flickr API key - users should replace with their own
// Get one free at: https://www.flickr.com/services/api/keys/
const FLICKR_API_KEY = import.meta.env.VITE_FLICKR_API_KEY || '';

const FLICKR_API_BASE = 'https://api.flickr.com/services/rest/';

// Search for places with lots of photos near a location
async function searchPhotoHotspots(
  lat: number,
  lng: number,
  radiusKm: number = 50
): Promise<PhotoHotspot[]> {
  if (!FLICKR_API_KEY) {
    console.warn('Flickr API key not configured. Set VITE_FLICKR_API_KEY in your .env file.');
    return [];
  }

  try {
    // Use flickr.places.findByLatLon to find nearby places
    const placesUrl = new URL(FLICKR_API_BASE);
    placesUrl.searchParams.set('method', 'flickr.places.findByLatLon');
    placesUrl.searchParams.set('api_key', FLICKR_API_KEY);
    placesUrl.searchParams.set('lat', lat.toString());
    placesUrl.searchParams.set('lon', lng.toString());
    placesUrl.searchParams.set('accuracy', '11'); // City level accuracy
    placesUrl.searchParams.set('format', 'json');
    placesUrl.searchParams.set('nojsoncallback', '1');

    const placesResponse = await fetch(placesUrl.toString());
    const placesData = await placesResponse.json();

    if (placesData.stat !== 'ok' || !placesData.places?.place) {
      return [];
    }

    // Get photo counts for interesting places by searching for photos
    const hotspots: PhotoHotspot[] = [];

    // Also search for geotagged photos directly to find clusters
    const photosUrl = new URL(FLICKR_API_BASE);
    photosUrl.searchParams.set('method', 'flickr.photos.search');
    photosUrl.searchParams.set('api_key', FLICKR_API_KEY);
    photosUrl.searchParams.set('lat', lat.toString());
    photosUrl.searchParams.set('lon', lng.toString());
    photosUrl.searchParams.set('radius', Math.min(radiusKm, 32).toString()); // Max 32km
    photosUrl.searchParams.set('radius_units', 'km');
    photosUrl.searchParams.set('has_geo', '1');
    photosUrl.searchParams.set('extras', 'geo,place_url');
    photosUrl.searchParams.set('per_page', '250');
    photosUrl.searchParams.set('sort', 'interestingness-desc');
    photosUrl.searchParams.set('format', 'json');
    photosUrl.searchParams.set('nojsoncallback', '1');

    const photosResponse = await fetch(photosUrl.toString());
    const photosData = await photosResponse.json();

    if (photosData.stat !== 'ok' || !photosData.photos?.photo) {
      return [];
    }

    // Cluster photos by location (group nearby photos)
    const clusters = clusterPhotosByLocation(photosData.photos.photo);

    // Convert clusters to hotspots
    for (const cluster of clusters) {
      if (cluster.count >= 3) { // Only show clusters with 3+ photos
        hotspots.push({
          id: `hotspot-${cluster.lat.toFixed(4)}-${cluster.lng.toFixed(4)}`,
          name: cluster.placeName || `Photo Hotspot`,
          lat: cluster.lat,
          lng: cluster.lng,
          photoCount: cluster.count,
        });
      }
    }

    // Sort by photo count descending and take top 10
    return hotspots
      .sort((a, b) => b.photoCount - a.photoCount)
      .slice(0, 10);

  } catch (error) {
    console.error('Error fetching Flickr hotspots:', error);
    return [];
  }
}

interface PhotoCluster {
  lat: number;
  lng: number;
  count: number;
  placeName?: string;
}

interface FlickrPhoto {
  id: string;
  latitude?: string;
  longitude?: string;
  place_url?: string;
  title?: string;
}

// Cluster photos that are within ~1km of each other
function clusterPhotosByLocation(photos: FlickrPhoto[]): PhotoCluster[] {
  const clusters: PhotoCluster[] = [];
  const CLUSTER_RADIUS_KM = 1;

  for (const photo of photos) {
    if (!photo.latitude || !photo.longitude) continue;

    const lat = parseFloat(photo.latitude);
    const lng = parseFloat(photo.longitude);

    // Find existing cluster within radius
    let foundCluster = false;
    for (const cluster of clusters) {
      const distance = getDistanceKm(lat, lng, cluster.lat, cluster.lng);
      if (distance <= CLUSTER_RADIUS_KM) {
        // Add to existing cluster (update centroid)
        const totalCount = cluster.count + 1;
        cluster.lat = (cluster.lat * cluster.count + lat) / totalCount;
        cluster.lng = (cluster.lng * cluster.count + lng) / totalCount;
        cluster.count = totalCount;

        // Use place name from photo if available
        if (photo.place_url && !cluster.placeName) {
          cluster.placeName = extractPlaceName(photo.place_url);
        }

        foundCluster = true;
        break;
      }
    }

    // Create new cluster if no nearby cluster found
    if (!foundCluster) {
      clusters.push({
        lat,
        lng,
        count: 1,
        placeName: photo.place_url ? extractPlaceName(photo.place_url) : undefined,
      });
    }
  }

  return clusters;
}

// Extract readable place name from Flickr place URL
function extractPlaceName(placeUrl: string): string {
  // Place URLs look like: /United+States/Arizona/Page/Horseshoe+Bend
  const parts = placeUrl.split('/').filter(Boolean);
  if (parts.length >= 1) {
    // Get the most specific part (last segment)
    const lastPart = parts[parts.length - 1];
    return lastPart.replace(/\+/g, ' ');
  }
  return '';
}

// Haversine formula for distance in km
function getDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth's radius in km
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

export function usePhotoHotspots(lat: number, lng: number, radiusKm: number = 50) {
  const [hotspots, setHotspots] = useState<PhotoHotspot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!lat || !lng) return;

    const fetchHotspots = async () => {
      setLoading(true);
      setError(null);

      try {
        const results = await searchPhotoHotspots(lat, lng, radiusKm);
        setHotspots(results);
      } catch (err) {
        setError('Failed to fetch photo hotspots');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchHotspots();
  }, [lat, lng, radiusKm]);

  return { hotspots, loading, error };
}
