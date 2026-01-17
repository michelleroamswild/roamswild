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
  // Whether to render this polygon on the map (false for very large polygons to avoid performance issues)
  renderOnMap: boolean;
  // Number of vertices in the polygon (for debugging)
  vertexCount?: number;
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
  'STATE': 'State Park',
  'SDOL': 'State Trust Land',
  'SFW': 'State Fish & Wildlife',
  'SPR': 'State Parks & Recreation',
  'SDNR': 'State Natural Resources',
  'NGO': 'Land Trust',
};

// Overpass API endpoints for redundancy
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

// USA Federal Lands service (based on PAD-US ownership data, not administrative boundaries)
// This excludes private inholdings within forest boundaries
const USA_FEDERAL_LANDS_URL = 'https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Federal_Lands/FeatureServer/0/query';

// PAD-US full service for state trust lands and other state-managed lands
const PAD_US_STATE_LANDS_URL = 'https://services.arcgis.com/v01gqwM5QqNysAAi/ArcGIS/rest/services/Manager_Name/FeatureServer/0/query';

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
          resultRecordCount: '200',
          f: 'json',
        });

        // USA Federal Lands query (PAD-US based) - uses lat/lng (4326)
        // Include all major federal land agencies for complete coverage
        // Field is "Agency" with full names like "Forest Service", "Bureau of Land Management"
        // Use maxAllowableOffset to simplify large polygons on the server side
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
          resultRecordCount: '200',
          // Simplify geometry on server side - 0.001 degrees ≈ 100m tolerance
          // This reduces polygon complexity while maintaining general shape
          maxAllowableOffset: '0.001',
          geometryPrecision: '5',
          f: 'json',
        });

        // OSM Overpass query for state parks
        const minLat = centerLat - (radiusMiles / 69);
        const maxLat = centerLat + (radiusMiles / 69);
        const minLng = centerLng - (radiusMiles / 50);
        const maxLng = centerLng + (radiusMiles / 50);

        const osmQuery = `
          [out:json][timeout:30];
          (
            relation["boundary"="protected_area"]["protection_title"~"State Park|State Recreation Area|State Reserve"](${minLat},${minLng},${maxLat},${maxLng});
            way["boundary"="protected_area"]["protection_title"~"State Park|State Recreation Area|State Reserve"](${minLat},${minLng},${maxLat},${maxLng});
            relation["boundary"="protected_area"]["owner"~"Trust|Conserv",i](${minLat},${minLng},${maxLat},${maxLng});
            way["boundary"="protected_area"]["owner"~"Trust|Conserv",i](${minLat},${minLng},${maxLat},${maxLng});
            relation["boundary"="protected_area"]["operator"~"Trust|Conserv",i](${minLat},${minLng},${maxLat},${maxLng});
            way["boundary"="protected_area"]["operator"~"Trust|Conserv",i](${minLat},${minLng},${maxLat},${maxLng});
          );
          out geom;
        `;

        // PAD-US State & NGO Lands query (state trust lands, land trusts, etc.)
        // SDOL = State Dept of Lands, SFW = State Fish & Wildlife, NGO = Land Trusts
        const stateLandsParams = new URLSearchParams({
          where: "(Mang_Type='STAT' AND Mang_Name IN ('SDOL', 'SFW', 'SPR', 'SDNR')) OR Mang_Type='NGO'",
          geometry: JSON.stringify({
            xmin: centerLng - (radiusMiles / 50),
            ymin: centerLat - (radiusMiles / 69),
            xmax: centerLng + (radiusMiles / 50),
            ymax: centerLat + (radiusMiles / 69),
            spatialReference: { wkid: 4326 },
          }),
          geometryType: 'esriGeometryEnvelope',
          inSR: '4326',
          outSR: '4326',
          spatialRel: 'esriSpatialRelIntersects',
          outFields: 'OBJECTID,Unit_Nm,Mang_Name,Mang_Type,Pub_Access,GIS_Acres',
          returnGeometry: 'true',
          resultRecordCount: '100',
          maxAllowableOffset: '0.001',
          geometryPrecision: '5',
          f: 'json',
        });

        // Fetch all four in parallel - handle failures gracefully
        const [blmResult, federalLandsResult, stateLandsResult, osmResult] = await Promise.all([
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
          // Fetch state trust lands from PAD-US
          fetch(`${PAD_US_STATE_LANDS_URL}?${stateLandsParams.toString()}`)
            .then(async (res) => {
              if (!res.ok) {
                console.warn(`PAD-US State Lands API returned ${res.status}`);
                return null;
              }
              return res.json();
            })
            .catch(err => {
              console.warn('PAD-US State Lands fetch failed:', err);
              return null;
            }),
          // Fetch state parks from OSM
          (async () => {
            for (const endpoint of OVERPASS_ENDPOINTS) {
              try {
                const response = await fetch(endpoint, {
                  method: 'POST',
                  body: `data=${encodeURIComponent(osmQuery)}`,
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                });
                if (response.ok) {
                  return response.json();
                }
              } catch (err) {
                console.warn(`OSM endpoint ${endpoint} failed:`, err);
              }
            }
            return null;
          })(),
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
          // Log each BLM feature to debug
          const blmFeatures = federalLandsResult.features.filter((f: any) => f.attributes.Agency === 'Bureau of Land Management');
          console.log(`  - ${blmFeatures.length} BLM features from PAD-US`);
          blmFeatures.forEach((f: any) => {
            const hasGeom = f.geometry && f.geometry.rings && f.geometry.rings.length > 0;
            const ringCount = hasGeom ? f.geometry.rings.length : 0;
            const vertexCount = hasGeom ? f.geometry.rings.reduce((sum: number, ring: any[]) => sum + ring.length, 0) : 0;
            console.log(`    BLM OBJECTID ${f.attributes.OBJECTID}: ${f.attributes.unit_name || 'unnamed'} - ${hasGeom ? `${ringCount} rings, ${vertexCount} vertices` : 'NO GEOMETRY'}`);
          });
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
        } else if (federalLandsResult?.error) {
          console.error('USA Federal Lands API error:', federalLandsResult.error);
        }

        // Process PAD-US State Lands response (state trust lands, wildlife areas, etc.)
        if (stateLandsResult && !stateLandsResult.error && stateLandsResult.features) {
          console.log(`PAD-US State Lands returned ${stateLandsResult.features.length} features`);
          // Log breakdown by type
          const ngoFeatures = stateLandsResult.features.filter((f: any) => f.attributes.Mang_Type === 'NGO');
          const stateTypeFeatures = stateLandsResult.features.filter((f: any) => f.attributes.Mang_Type === 'STAT');
          console.log(`  - ${ngoFeatures.length} NGO (land trust) features, ${stateTypeFeatures.length} state type features`);
          ngoFeatures.forEach((f: any) => {
            const hasGeom = f.geometry && f.geometry.rings && f.geometry.rings.length > 0;
            console.log(`    NGO: ${f.attributes.Unit_Nm || 'unnamed'} | Mang_Name=${f.attributes.Mang_Name} | ${hasGeom ? 'has geometry' : 'NO GEOMETRY'}`);
          });
          // Transform state lands features to match our format
          const stateFeatures = stateLandsResult.features.map((f: any) => ({
            attributes: {
              OBJECTID: f.attributes.OBJECTID,
              ADMIN_UNIT_NAME: f.attributes.Unit_Nm || agencyNames[f.attributes.Mang_Name] || 'State Land',
              ADMIN_AGENCY_CODE: f.attributes.Mang_Name || 'STATE',
            },
            geometry: f.geometry,
            source: 'state',
          }));
          features = features.concat(stateFeatures);
        } else if (stateLandsResult?.error) {
          console.error('PAD-US State Lands API error:', stateLandsResult.error);
        } else {
          console.log('PAD-US State Lands: no result or no features', stateLandsResult);
        }

        // Process OSM state parks and land trusts response
        if (osmResult && osmResult.elements) {
          console.log(`OSM returned ${osmResult.elements.length} protected area features`);
          osmResult.elements.forEach((element: any) => {
            // Detect if this is a land trust based on owner/operator tags
            const owner = element.tags?.owner || '';
            const operator = element.tags?.operator || '';
            const isLandTrust = /trust|conserv/i.test(owner) || /trust|conserv/i.test(operator);
            const agencyCode = isLandTrust ? 'NGO' : 'STATE';
            const defaultName = isLandTrust ? 'Land Trust' : 'State Park';
            const parkName = element.tags?.name || defaultName;

            // Get the geometry - ways have geometry directly, relations have it in members
            let coords: { lat: number; lng: number }[] = [];

            if (element.geometry) {
              // Way with geometry - simple case
              coords = element.geometry.map((node: any) => ({
                lat: node.lat,
                lng: node.lon,
              }));
            } else if (element.members) {
              // Relation - need to stitch outer ways together in correct order
              const outerWays = element.members
                .filter((m: any) => m.role === 'outer' && m.geometry && m.geometry.length > 0)
                .map((m: any) => m.geometry.map((n: any) => ({ lat: n.lat, lng: n.lon })));

              // State park with multiple outer ways

              if (outerWays.length > 0) {
                // Check if ways are already closed loops (start == end)
                const tolerance = 0.0001;
                const closedWays = outerWays.filter((way: { lat: number; lng: number }[]) => {
                  const first = way[0];
                  const last = way[way.length - 1];
                  return Math.abs(first.lat - last.lat) < tolerance &&
                         Math.abs(first.lng - last.lng) < tolerance;
                });

                if (closedWays.length === outerWays.length && outerWays.length > 1) {
                  // All ways are already closed loops - create separate features for each
                  outerWays.forEach((way: { lat: number; lng: number }[], idx: number) => {
                    if (way.length >= 3) {
                      const ring = way.map((c: { lat: number; lng: number }) => [c.lng, c.lat]);
                      features.push({
                        attributes: {
                          OBJECTID: `${element.id}-${idx}`,
                          ADMIN_UNIT_NAME: parkName,
                          ADMIN_AGENCY_CODE: agencyCode,
                        },
                        geometry: { rings: [ring] },
                        source: 'osm',
                      });
                    }
                  });
                  // Skip the normal processing since we already added the features
                  return;
                } else if (closedWays.length === outerWays.length) {
                  // Single closed loop
                  coords = [...outerWays[0]];
                } else {
                  // Ways need to be stitched together - build endpoint graph
                  type Endpoint = { wayIndex: number; isStart: boolean; lat: number; lng: number };
                  const endpoints: Endpoint[] = [];

                  outerWays.forEach((way: { lat: number; lng: number }[], idx: number) => {
                    endpoints.push({ wayIndex: idx, isStart: true, lat: way[0].lat, lng: way[0].lng });
                    endpoints.push({ wayIndex: idx, isStart: false, lat: way[way.length - 1].lat, lng: way[way.length - 1].lng });
                  });

                  // Find matching endpoint pairs
                  const stitchTolerance = 0.001;
                  const connections: Map<string, string[]> = new Map();

                  for (let i = 0; i < endpoints.length; i++) {
                    const key = `${endpoints[i].wayIndex}-${endpoints[i].isStart ? 's' : 'e'}`;
                    connections.set(key, []);

                    for (let j = 0; j < endpoints.length; j++) {
                      if (endpoints[i].wayIndex === endpoints[j].wayIndex) continue;
                      const dist = Math.sqrt(
                        Math.pow(endpoints[i].lat - endpoints[j].lat, 2) +
                        Math.pow(endpoints[i].lng - endpoints[j].lng, 2)
                      );
                      if (dist < stitchTolerance) {
                        const targetKey = `${endpoints[j].wayIndex}-${endpoints[j].isStart ? 's' : 'e'}`;
                        connections.get(key)!.push(targetKey);
                      }
                    }
                  }

                  // Build the ring by following connections
                  const usedWays = new Set<number>();
                  const orderedWays: { wayIndex: number; reversed: boolean }[] = [];

                  orderedWays.push({ wayIndex: 0, reversed: false });
                  usedWays.add(0);
                  let currentEndpoint = `0-e`;

                  while (usedWays.size < outerWays.length) {
                    const connectedTo = connections.get(currentEndpoint) || [];
                    let foundNext = false;

                    for (const targetKey of connectedTo) {
                      const [wayIdxStr, endType] = targetKey.split('-');
                      const wayIdx = parseInt(wayIdxStr);

                      if (usedWays.has(wayIdx)) continue;

                      const reversed = endType === 'e';
                      orderedWays.push({ wayIndex: wayIdx, reversed });
                      usedWays.add(wayIdx);
                      currentEndpoint = `${wayIdx}-${reversed ? 's' : 'e'}`;
                      foundNext = true;
                      break;
                    }

                    if (!foundNext) {
                      for (let i = 0; i < outerWays.length; i++) {
                        if (!usedWays.has(i)) {
                          orderedWays.push({ wayIndex: i, reversed: false });
                          usedWays.add(i);
                          break;
                        }
                      }
                    }
                  }

                  // Build coords from ordered ways
                  coords = [];
                  orderedWays.forEach(({ wayIndex, reversed }, idx) => {
                    let wayCoords = outerWays[wayIndex];
                    if (reversed) {
                      wayCoords = [...wayCoords].reverse();
                    }
                    if (idx === 0) {
                      coords = [...wayCoords];
                    } else {
                      coords = coords.concat(wayCoords.slice(1));
                    }
                  });
                }

                // Ensure polygon is closed
                if (coords.length > 0) {
                  const first = coords[0];
                  const last = coords[coords.length - 1];
                  if (Math.abs(first.lat - last.lat) > tolerance ||
                      Math.abs(first.lng - last.lng) > tolerance) {
                    coords.push({ lat: first.lat, lng: first.lng });
                  }
                }
              }
            }

            if (coords.length >= 3) {
              // Convert to rings format for consistency with other sources
              const ring = coords.map(c => [c.lng, c.lat]);
              features.push({
                attributes: {
                  OBJECTID: element.id,
                  ADMIN_UNIT_NAME: element.tags?.name || 'State Park',
                  ADMIN_AGENCY_CODE: agencyCode,
                },
                geometry: { rings: [ring] },
                source: 'osm',
              });
            }
          });
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
          const isLatLngFormat = f.source === 'federal' || f.source === 'state' || f.source === 'osm';

          // Process all rings - BLM land can have many separate parcels stored as different rings
          // Limit to first 500 rings to avoid performance issues with highly fragmented land
          const maxRings = 500;
          let processedRings = 0;

          f.geometry.rings.forEach((ring: number[][], ringIndex: number) => {
            if (processedRings >= maxRings) return;
            if (ring.length < 4) return; // Need at least 4 points for a meaningful polygon (triangle + close)

            let polygon: { lat: number; lng: number }[];
            let centroidLat: number;
            let centroidLng: number;

            if (isLatLngFormat) {
              // Federal Lands and OSM data is already in lat/lng (4326)
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
            const vertexCount = polygon.length;

            // Very large polygons (>5000 vertices) still work for point-in-polygon filtering
            // but skip rendering to avoid performance issues
            const MAX_RENDER_VERTICES = 5000;
            const renderOnMap = vertexCount <= MAX_RENDER_VERTICES;

            if (!renderOnMap) {
              console.log(`Large polygon ${baseName} (${agencyCode}) has ${vertexCount} vertices - using for filtering only`);
            }

            lands.push({
              id: `${f.source}-${f.attributes.OBJECTID}-${ringIndex}`,
              name: baseName,
              managingAgency: agencyCode,
              managingAgencyFull: agencyNames[agencyCode] || agencyCode,
              lat: centroidLat,
              lng: centroidLng,
              distance,
              polygon,
              renderOnMap,
              vertexCount,
            });
            processedRings++;
          });
        });

        // Sort by distance
        lands.sort((a, b) => a.distance - b.distance);

        // Limit to 1000 polygons total for filtering, but only render smaller ones
        // This allows comprehensive coverage for point-in-polygon checks
        const limitedLands = lands.slice(0, 1000);

        const renderableCount = limitedLands.filter(l => l.renderOnMap).length;
        const filterOnlyCount = limitedLands.filter(l => !l.renderOnMap).length;
        console.log(`Found ${limitedLands.length} public land polygons (${renderableCount} renderable, ${filterOnlyCount} filter-only) from ${features.length} features`);
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
