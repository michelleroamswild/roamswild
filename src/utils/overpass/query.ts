import { Bbox } from './types';

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';

/**
 * Build Overpass QL query for roads and POIs
 */
export function buildOverpassQuery(bbox: Bbox, timeout: number = 25): string {
  const bboxStr = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;

  return `
[out:json][timeout:${timeout}];
(
  // Scenic road candidates
  way["highway"~"secondary|tertiary|unclassified|track"]
    ["access"!~"private|no"]
    (${bboxStr});

  // Viewpoints and peaks
  node["tourism"="viewpoint"](${bboxStr});
  node["natural"="peak"](${bboxStr});

  // Water features
  node["natural"~"spring|hot_spring"](${bboxStr});
  node["amenity"="drinking_water"](${bboxStr});
  node["waterway"="waterfall"](${bboxStr});

  // Parking areas
  node["amenity"="parking"]["access"!="private"](${bboxStr});
);
out body geom;
`.trim();
}

/**
 * Execute Overpass query
 */
export async function executeOverpassQuery(query: string): Promise<{
  elements: unknown[];
  timeout?: boolean;
  error?: string;
}> {
  try {
    const response = await fetch(OVERPASS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (response.status === 429) {
      return { elements: [], timeout: true, error: 'rate_limited' };
    }

    if (response.status === 504) {
      return { elements: [], timeout: true, error: 'gateway_timeout' };
    }

    if (!response.ok) {
      return { elements: [], error: `http_${response.status}` };
    }

    const data = await response.json();

    // Check for runtime timeout in response
    if (data.remark?.includes('runtime error')) {
      return { elements: data.elements || [], timeout: true };
    }

    return { elements: data.elements || [] };

  } catch (err) {
    return { elements: [], error: String(err) };
  }
}
