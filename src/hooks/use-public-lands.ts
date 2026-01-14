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
  'FS': 'US Forest Service',
  'FWS': 'Fish & Wildlife Service',
  'NPS': 'National Park Service',
};

// USA Federal Lands service (based on PAD-US ownership data, not administrative boundaries)
// This excludes private inholdings within forest boundaries
const USA_FEDERAL_LANDS_URL = 'https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Federal_Lands/FeatureServer/0/query';

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

      // Clear previous data immediately when starting a new search
      setPublicLands([]);

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

        // Query both BLM SMA and USFS boundaries services in parallel
        const blmParams = new URLSearchParams({
          where: "ADMIN_AGENCY_CODE IN ('BLM', 'NPS', 'FWS')",
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
          resultRecordCount: '100',
          f: 'json',
        });

        // USA Federal Lands query (PAD-US based) - uses lat/lng (4326)
        // Include all major federal land agencies for complete coverage
        // Field is "Agency" with full names like "Forest Service", "Bureau of Land Management"
        const federalLandsParams = new URLSearchParams({
          where: "Agency IN ('Forest Service', 'Bureau of Land Management', 'National Park Service', 'Fish and Wildlife Service', 'Department of Defense', 'Bureau of Reclamation')",
          geometry: JSON.stringify({
            xmin: centerLng - (radiusMiles / 50), // Rough conversion
            ymin: centerLat - (radiusMiles / 69),
            xmax: centerLng + (radiusMiles / 50),
            ymax: centerLat + (radiusMiles / 69),
            spatialReference: { wkid: 4326 },
          }),
          geometryType: 'esriGeometryEnvelope',
          inSR: '4326',
          outSR: '4326',
          spatialRel: 'esriSpatialRelIntersects',
          outFields: 'OBJECTID,unit_name,Agency',
          returnGeometry: 'true',
          resultRecordCount: '100',
          f: 'json',
        });

        console.log('Fetching public lands from BLM SMA and USA Federal Lands (PAD-US) services');
        console.log(`Search area: ${centerLat.toFixed(4)}, ${centerLng.toFixed(4)} - radius ${radiusMiles}mi`);

        // Fetch both in parallel - handle failures gracefully
        const [blmResult, federalLandsResult] = await Promise.all([
          fetch(`/api/blm-sma/BLM_Natl_SMA_Cached_with_PriUnk/MapServer/1/query?${blmParams.toString()}`)
            .then(async (res) => {
              if (!res.ok) {
                console.warn(`BLM SMA API returned ${res.status}`);
                return null;
              }
              return res.json();
            })
            .catch(err => {
              console.warn('BLM SMA fetch failed:', err);
              return null;
            }),
          fetch(`${USA_FEDERAL_LANDS_URL}?${federalLandsParams.toString()}`)
            .then(async (res) => {
              if (!res.ok) {
                console.warn(`USA Federal Lands API returned ${res.status}`);
                return null;
              }
              return res.json();
            })
            .catch(err => {
              console.warn('USA Federal Lands fetch failed:', err);
              return null;
            }),
        ]);

        let features: any[] = [];

        // Process BLM response
        if (blmResult && !blmResult.error && blmResult.features) {
          console.log(`BLM returned ${blmResult.features.length} features`);
          features = features.concat(blmResult.features.map((f: any) => ({
            ...f,
            source: 'blm',
          })));
        }

        // Process USA Federal Lands (PAD-US) response
        if (federalLandsResult && !federalLandsResult.error && federalLandsResult.features) {
          console.log(`USA Federal Lands returned ${federalLandsResult.features.length} features`);
          // Map full agency names to codes
          const agencyToCode: Record<string, string> = {
            'Forest Service': 'USFS',
            'Bureau of Land Management': 'BLM',
            'National Park Service': 'NPS',
            'Fish and Wildlife Service': 'FWS',
            'Department of Defense': 'DOD',
            'Bureau of Reclamation': 'BOR',
          };
          // Transform Federal Lands features to match BLM format
          const federalFeatures = federalLandsResult.features.map((f: any) => ({
            attributes: {
              OBJECTID: f.attributes.OBJECTID,
              ADMIN_UNIT_NAME: f.attributes.unit_name || 'Federal Land',
              ADMIN_AGENCY_CODE: agencyToCode[f.attributes.Agency] || f.attributes.Agency || 'FED',
            },
            geometry: f.geometry,
            source: 'federal',
          }));
          features = features.concat(federalFeatures);
        }

        console.log(`Fetched ${features.length} total public land features`);

        // If no features from either source, that's okay - just show empty
        if (features.length === 0) {
          console.log('No public land features found in this area');
          setPublicLands([]);
          setLoading(false);
          return;
        }

        // Transform features to our format
        // Each feature may have multiple rings (multi-polygon), so we flatten them
        const lands: PublicLand[] = [];

        features.forEach((f: any) => {
          if (!f.geometry?.rings?.length) return;

          const agencyCode = f.attributes.ADMIN_AGENCY_CODE || 'UNK';
          const baseName = f.attributes.ADMIN_UNIT_NAME || agencyNames[agencyCode] || 'Public Land';
          const isFederalLands = f.source === 'federal';

          // Process each ring - the API already filtered for intersection, so we trust those results
          // Only process the first ring (outer boundary) for each feature to avoid holes being treated as separate polygons
          f.geometry.rings.forEach((ring: number[][], ringIndex: number) => {
            if (ring.length < 3) return; // Need at least 3 points for a polygon
            // Skip inner rings (holes) - they typically wind in the opposite direction
            // We only want the outer boundary (first ring)
            if (ringIndex > 0) return;

            let polygon: { lat: number; lng: number }[];
            let centroidLat: number;
            let centroidLng: number;

            if (isFederalLands) {
              // Federal Lands data is already in lat/lng (4326)
              // Ring format is [lng, lat]

              // Calculate centroid
              const sumLng = ring.reduce((sum: number, coord: number[]) => sum + coord[0], 0);
              const sumLat = ring.reduce((sum: number, coord: number[]) => sum + coord[1], 0);
              centroidLng = sumLng / ring.length;
              centroidLat = sumLat / ring.length;

              // Convert ring to polygon format
              polygon = ring.map((coord: number[]) => ({
                lat: coord[1],
                lng: coord[0],
              }));
            } else {
              // BLM SMA data is in Web Mercator (102100)

              // Calculate centroid in Web Mercator, then convert
              const sumX = ring.reduce((sum: number, coord: number[]) => sum + coord[0], 0);
              const sumY = ring.reduce((sum: number, coord: number[]) => sum + coord[1], 0);
              const centroid = webMercatorToLatLng(sumX / ring.length, sumY / ring.length);
              centroidLat = centroid.lat;
              centroidLng = centroid.lng;

              // Convert polygon ring to lat/lng coordinates
              polygon = ring.map((coord: number[]) => {
                const converted = webMercatorToLatLng(coord[0], coord[1]);
                return { lat: converted.lat, lng: converted.lng };
              });
            }

            const distance = getDistanceMiles(centerLat, centerLng, centroidLat, centroidLng);

            lands.push({
              id: `${isFederalLands ? 'federal' : 'sma'}-${f.attributes.OBJECTID}-${ringIndex}`,
              name: baseName,
              managingAgency: agencyCode,
              managingAgencyFull: agencyNames[agencyCode] || agencyCode,
              lat: centroidLat,
              lng: centroidLng,
              distance,
              polygon,
            });
          });
        });

        // Sort by distance
        lands.sort((a, b) => a.distance - b.distance);

        // Limit to 100 polygons to avoid performance issues
        const limitedLands = lands.slice(0, 100);

        console.log(`Found ${limitedLands.length} public land areas (PAD-US ownership data)`);
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
