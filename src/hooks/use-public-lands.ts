import { useState, useEffect } from 'react';

export interface PublicLand {
  id: string;
  name: string;
  managingAgency: string; // BLM, USFS, etc.
  managingAgencyFull: string;
  lat: number;
  lng: number;
  distance: number;
  // Polygon coordinates for overlay (array of {lat, lng} points)
  polygon?: { lat: number; lng: number }[];
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

// Convert lat/lng to Web Mercator (EPSG:3857)
function latLngToWebMercator(lat: number, lng: number): { x: number; y: number } {
  const x = lng * 20037508.34 / 180;
  let y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180);
  y = y * 20037508.34 / 180;
  return { x, y };
}

// Convert Web Mercator to lat/lng
function webMercatorToLatLng(x: number, y: number): { lat: number; lng: number } {
  const lng = x * 180 / 20037508.34;
  const lat = Math.atan(Math.exp(y * Math.PI / 20037508.34)) * 360 / Math.PI - 90;
  return { lat, lng };
}

// Agency code to full name mapping
const agencyNames: Record<string, string> = {
  'BLM': 'Bureau of Land Management',
  'USFS': 'US Forest Service',
  'FWS': 'Fish & Wildlife Service',
  'NPS': 'National Park Service',
};

export function usePublicLands(
  centerLat: number,
  centerLng: number,
  radiusMiles: number = 50
) {
  const [publicLands, setPublicLands] = useState<PublicLand[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!centerLat || !centerLng) {
      return;
    }

    async function fetchPublicLands() {
      setLoading(true);
      setError(null);

      try {
        // Convert center point to Web Mercator
        const center = latLngToWebMercator(centerLat, centerLng);

        // Create bounding box in Web Mercator (roughly radiusMiles)
        // At ~35° latitude, 1 mile ≈ 1609 meters
        const meterRadius = radiusMiles * 1609;
        const bbox = {
          xmin: center.x - meterRadius,
          ymin: center.y - meterRadius,
          xmax: center.x + meterRadius,
          ymax: center.y + meterRadius,
        };

        // Query BLM SMA service for BLM, USFS, NPS, and FWS lands
        // NPS includes National Recreation Areas, FWS includes Wildlife Refuges
        const params = new URLSearchParams({
          where: "ADMIN_AGENCY_CODE IN ('BLM', 'USFS', 'NPS', 'FWS')",
          geometry: JSON.stringify({
            xmin: bbox.xmin,
            ymin: bbox.ymin,
            xmax: bbox.xmax,
            ymax: bbox.ymax,
            spatialReference: { wkid: 102100 },
          }),
          geometryType: 'esriGeometryEnvelope',
          inSR: '102100',
          spatialRel: 'esriSpatialRelIntersects',
          outFields: 'OBJECTID,ADMIN_UNIT_NAME,ADMIN_AGENCY_CODE',
          returnGeometry: 'true',
          resultRecordCount: '50',
          f: 'json',
        });

        const url = `/api/blm-sma/BLM_Natl_SMA_Cached_with_PriUnk/MapServer/1/query?${params.toString()}`;

        console.log('Fetching public lands from BLM SMA service');

        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`BLM SMA API error: ${response.status}`);
        }

        const data = await response.json();

        if (data.error) {
          console.error('BLM SMA API error:', data.error);
          throw new Error(data.error.message || 'Failed to fetch public lands');
        }

        const features = data.features || [];

        // Transform features to our format
        // Each feature may have multiple rings (multi-polygon), so we flatten them
        const lands: PublicLand[] = [];

        // Convert search center to Web Mercator for comparison
        const searchCenter = latLngToWebMercator(centerLat, centerLng);
        const searchRadiusMeters = radiusMiles * 1609;

        features.forEach((f: any) => {
          if (!f.geometry?.rings?.length) return;

          const agencyCode = f.attributes.ADMIN_AGENCY_CODE || 'UNK';
          const baseName = f.attributes.ADMIN_UNIT_NAME || agencyNames[agencyCode] || 'Public Land';

          // Process each ring - find rings that have ANY point within search area
          f.geometry.rings.forEach((ring: number[][], ringIndex: number) => {
            if (ring.length < 3) return; // Need at least 3 points for a polygon

            // Check if any point in the ring is within the search bounding box
            const hasPointInArea = ring.some((coord: number[]) => {
              const dx = Math.abs(coord[0] - searchCenter.x);
              const dy = Math.abs(coord[1] - searchCenter.y);
              return dx < searchRadiusMeters && dy < searchRadiusMeters;
            });

            if (!hasPointInArea) return;

            // Calculate centroid for the marker position
            const sumX = ring.reduce((sum: number, coord: number[]) => sum + coord[0], 0);
            const sumY = ring.reduce((sum: number, coord: number[]) => sum + coord[1], 0);
            const centroidX = sumX / ring.length;
            const centroidY = sumY / ring.length;

            // Convert centroid back to lat/lng
            const { lat, lng } = webMercatorToLatLng(centroidX, centroidY);
            const distance = getDistanceMiles(centerLat, centerLng, lat, lng);

            // Convert polygon ring to lat/lng coordinates
            const polygon = ring.map((coord: number[]) => {
              const converted = webMercatorToLatLng(coord[0], coord[1]);
              return { lat: converted.lat, lng: converted.lng };
            });

            lands.push({
              id: `sma-${f.attributes.OBJECTID}-${ringIndex}`,
              name: baseName,
              managingAgency: agencyCode,
              managingAgencyFull: agencyNames[agencyCode] || agencyCode,
              lat,
              lng,
              distance,
              polygon,
            });
          });
        });

        // Sort by distance
        lands.sort((a, b) => a.distance - b.distance);

        // Limit to 50 polygons to avoid performance issues
        const limitedLands = lands.slice(0, 50);

        console.log(`Found ${limitedLands.length} public land areas for dispersed camping`);
        setPublicLands(limitedLands);
      } catch (err) {
        console.error('Error fetching public lands:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch public lands');
        setPublicLands([]);
      } finally {
        setLoading(false);
      }
    }

    fetchPublicLands();
  }, [centerLat, centerLng, radiusMiles]);

  return { publicLands, loading, error };
}
