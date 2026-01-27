import { Coord, NormalizedElement, RawOsmElement } from './types';
import { normalizeResponse } from './normalize';
import { haversineDistance } from './extract';
import { executeOverpassQuery } from './query';

/**
 * Highlight types for nearby POIs
 */
export type HighlightType = 'viewpoint' | 'trail' | 'water' | 'camp';

/**
 * A nearby highlight/POI
 */
export interface Highlight {
  type: HighlightType;
  name: string | null;
  lat: number;
  lon: number;
  distanceMiles: number;
  osmId: number;
  osmType: 'node' | 'way';
  /** Whether this highlight has a name (used for ranking) */
  isNamed: boolean;
}

/**
 * Raw highlight before final selection
 */
interface RawHighlight extends Highlight {
  /** Priority score for selection (higher = better) */
  priority: number;
}

/**
 * Build Overpass QL query for nearby highlights
 * Queries within a radius around the anchor center
 *
 * @param center - Anchor center coordinate
 * @param radiusMeters - Search radius in meters (default 10000 = 10km)
 * @param timeout - Query timeout in seconds
 */
export function buildHighlightsQuery(
  center: Coord,
  radiusMeters: number = 10000,
  timeout: number = 15
): string {
  const around = `(around:${radiusMeters},${center.lat},${center.lng})`;

  return `
[out:json][timeout:${timeout}];
(
  // Viewpoints
  node["tourism"="viewpoint"]${around};

  // Trails - paths and footways (regardless of name)
  way["highway"="path"]${around};
  way["highway"="footway"]${around};

  // Water features - nodes
  node["natural"="water"]${around};
  node["natural"="spring"]${around};
  node["natural"="hot_spring"]${around};
  node["waterway"="waterfall"]${around};

  // Water features - ways (rivers, streams, lakes)
  way["waterway"="river"]${around};
  way["waterway"="stream"]${around};
  way["natural"="water"]${around};

  // Camping - all types
  node["tourism"="camp_site"]${around};
  node["tourism"="camp_pitch"]${around};
  node["tourism"="caravan_site"]${around};
  way["tourism"="camp_site"]${around};
  way["tourism"="caravan_site"]${around};

  // Shelter as camping fallback
  node["amenity"="shelter"]${around};
);
out center;
`.trim();
}

/**
 * Classify an OSM element into a highlight type
 */
function classifyHighlightType(tags: Record<string, string>): HighlightType | null {
  // Viewpoints
  if (tags.tourism === 'viewpoint') {
    return 'viewpoint';
  }

  // Trails
  if (tags.highway === 'path' || tags.highway === 'footway') {
    return 'trail';
  }

  // Camping (check before water since camp_site could be near water)
  if (
    tags.tourism === 'camp_site' ||
    tags.tourism === 'camp_pitch' ||
    tags.tourism === 'caravan_site' ||
    tags.amenity === 'shelter'
  ) {
    return 'camp';
  }

  // Water features
  if (
    tags.natural === 'water' ||
    tags.natural === 'spring' ||
    tags.natural === 'hot_spring' ||
    tags.waterway === 'waterfall' ||
    tags.waterway === 'river' ||
    tags.waterway === 'stream'
  ) {
    return 'water';
  }

  return null;
}

/**
 * Calculate priority score for a highlight
 * Higher score = more likely to be selected
 */
function calculatePriority(
  type: HighlightType,
  tags: Record<string, string>,
  distanceMiles: number
): number {
  let score = 100;

  // Named items get significant bonus
  const hasName = Boolean(tags.name);
  if (hasName) {
    score += 50;
  }

  // Distance penalty (closer is better)
  // Lose 5 points per mile
  score -= distanceMiles * 5;

  // Type-specific bonuses
  switch (type) {
    case 'viewpoint':
      // Viewpoints are always high value
      score += 20;
      break;

    case 'trail':
      // Named trails are much better
      if (hasName) score += 20;
      // Hiking trails preferred
      if (tags.sac_scale) score += 10;
      break;

    case 'water':
      // Hot springs are premium
      if (tags.natural === 'hot_spring') score += 30;
      // Waterfalls are great
      if (tags.waterway === 'waterfall') score += 25;
      // Named water features
      if (hasName) score += 15;
      break;

    case 'camp':
      // Actual campsites preferred over shelters
      if (tags.tourism === 'camp_site') score += 20;
      else if (tags.tourism === 'caravan_site') score += 15;
      else if (tags.tourism === 'camp_pitch') score += 10;
      // Shelters are fallback
      else if (tags.amenity === 'shelter') score -= 10;
      break;
  }

  return score;
}

/**
 * Get coordinate from a normalized element
 */
function getCoord(el: NormalizedElement): Coord | null {
  if (el.coord) return el.coord;
  if (el.center) return el.center;
  // For ways, try to get center from geometry
  if (el.geometry && el.geometry.length > 0) {
    const mid = Math.floor(el.geometry.length / 2);
    return el.geometry[mid];
  }
  return null;
}

/**
 * Extract raw highlights from normalized Overpass elements
 */
function extractRawHighlights(
  elements: NormalizedElement[],
  anchorCenter: Coord
): RawHighlight[] {
  const highlights: RawHighlight[] = [];

  for (const el of elements) {
    const type = classifyHighlightType(el.tags);
    if (!type) continue;

    const coord = getCoord(el);
    if (!coord) continue;

    const distanceMiles = haversineDistance(anchorCenter, coord);
    const isNamed = Boolean(el.tags.name);
    const priority = calculatePriority(type, el.tags, distanceMiles);

    highlights.push({
      type,
      name: el.tags.name ?? null,
      lat: coord.lat,
      lon: coord.lng,
      distanceMiles: Math.round(distanceMiles * 100) / 100,
      osmId: el.id,
      osmType: el.osmType as 'node' | 'way',
      isNamed,
      priority,
    });
  }

  return highlights;
}

/**
 * Selection result
 */
export interface HighlightSelectionResult {
  highlights: Highlight[];
  /** Total highlights found before filtering */
  totalFound: number;
  /** Highlights per type before selection */
  countsByType: Record<HighlightType, number>;
}

/**
 * Select the best nearby highlights
 *
 * Selection rules:
 * - Prefer named items
 * - Choose closest to anchor center
 * - Cap 1 per type
 * - Max 4 total
 *
 * @param elements - Normalized Overpass elements
 * @param anchorCenter - Anchor center coordinate
 * @param maxPerType - Maximum highlights per type (default 1)
 * @param maxTotal - Maximum total highlights (default 4)
 */
export function selectNearbyHighlights(
  elements: NormalizedElement[],
  anchorCenter: Coord,
  maxPerType: number = 1,
  maxTotal: number = 4
): HighlightSelectionResult {
  // Extract and score all highlights
  const rawHighlights = extractRawHighlights(elements, anchorCenter);

  // Count by type before filtering
  const countsByType: Record<HighlightType, number> = {
    viewpoint: 0,
    trail: 0,
    water: 0,
    camp: 0,
  };

  for (const h of rawHighlights) {
    countsByType[h.type]++;
  }

  // Group by type
  const byType = new Map<HighlightType, RawHighlight[]>();
  for (const h of rawHighlights) {
    const list = byType.get(h.type) ?? [];
    list.push(h);
    byType.set(h.type, list);
  }

  // Sort each type by priority (descending) and take top N
  const selectedByType: Highlight[] = [];
  const types: HighlightType[] = ['viewpoint', 'trail', 'water', 'camp'];

  for (const type of types) {
    const list = byType.get(type) ?? [];
    if (list.length === 0) continue;

    // Sort by priority descending
    list.sort((a, b) => b.priority - a.priority);

    // Take top maxPerType
    for (let i = 0; i < Math.min(maxPerType, list.length); i++) {
      const h = list[i];
      // Convert to Highlight (drop priority)
      selectedByType.push({
        type: h.type,
        name: h.name,
        lat: h.lat,
        lon: h.lon,
        distanceMiles: h.distanceMiles,
        osmId: h.osmId,
        osmType: h.osmType,
        isNamed: h.isNamed,
      });
    }
  }

  // Sort all selected by distance, take maxTotal
  selectedByType.sort((a, b) => a.distanceMiles - b.distanceMiles);
  const highlights = selectedByType.slice(0, maxTotal);

  return {
    highlights,
    totalFound: rawHighlights.length,
    countsByType,
  };
}

/**
 * Fetch and select nearby highlights for an anchor
 * Complete flow: query Overpass → normalize → select
 *
 * @param anchorCenter - Anchor center coordinate
 * @param radiusMeters - Search radius in meters (default 10000 = 10km)
 */
export async function fetchNearbyHighlights(
  anchorCenter: Coord,
  radiusMeters: number = 10000
): Promise<HighlightSelectionResult & { error?: string }> {
  try {
    const query = buildHighlightsQuery(anchorCenter, radiusMeters);
    const response = await executeOverpassQuery(query);

    if (response.error) {
      return {
        highlights: [],
        totalFound: 0,
        countsByType: { viewpoint: 0, trail: 0, water: 0, camp: 0 },
        error: response.error,
      };
    }

    const elements = normalizeResponse({ elements: response.elements as RawOsmElement[] });
    return selectNearbyHighlights(elements, anchorCenter);

  } catch (err) {
    return {
      highlights: [],
      totalFound: 0,
      countsByType: { viewpoint: 0, trail: 0, water: 0, camp: 0 },
      error: String(err),
    };
  }
}

/**
 * Format a highlight for display
 */
export function formatHighlightLabel(highlight: Highlight): string {
  if (highlight.name) {
    return highlight.name;
  }

  // Generate a generic label based on type
  switch (highlight.type) {
    case 'viewpoint':
      return 'Viewpoint';
    case 'trail':
      return 'Trail';
    case 'water':
      return 'Water Feature';
    case 'camp':
      return 'Campsite';
    default:
      return 'Point of Interest';
  }
}

/**
 * Get an icon identifier for a highlight type
 */
export function getHighlightIcon(type: HighlightType): string {
  switch (type) {
    case 'viewpoint':
      return 'binoculars';
    case 'trail':
      return 'path';
    case 'water':
      return 'droplet';
    case 'camp':
      return 'tent';
    default:
      return 'map-pin';
  }
}
