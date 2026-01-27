import { Bbox, Coord, NormalizedRoad, NormalizedPoi, RawOsmElement } from './types';
import { normalizeResponse } from './normalize';
import { extractRoadWays, extractPois } from './extract';
import { isCandidateRoad } from './roadFilter';
import { clampBbox, splitBboxIntoTiles } from './bbox';
import { buildOverpassQuery } from './query';
import { scoreAnchor, selectAnchor, ScoredAnchor, ScoringWeights, DEFAULT_WEIGHTS } from './scoring';
import { fetchNearbyHighlights, Highlight } from './highlights';
import {
  Cache,
  InMemoryCache,
  CachedAnchorData,
  getCachedAnchorData,
  cacheAnchorData,
  selectFromCachedCandidates,
} from './cache';
import {
  executeWithRetry,
  isFullyRateLimited,
  OverpassResult,
} from './overpassClient';
import {
  filterByDistanceRule,
  RecentAnchor,
  DISTANCE_THRESHOLDS,
} from './distanceRule';

/**
 * Region data required for scenic anchor lookup
 */
export interface RegionInput {
  id: string;
  bbox: Bbox;
  center: Coord;
  name?: string;
}

/**
 * Result of getScenicDriveAnchor
 */
export interface ScenicAnchorResult {
  success: boolean;
  anchor?: ScoredAnchor;
  highlights?: Highlight[];
  source: 'fresh' | 'cache' | 'stale_cache' | 'fallback';
  meta: {
    regionId: string;
    candidatesEvaluated: number;
    strategy: string;
    wasFallback: boolean;
    cacheHit: boolean;
    cacheStale: boolean;
    distanceThresholdUsed?: number;
    distanceRelaxed?: boolean;
    refreshTriggered?: boolean;
  };
  error?: string;
}

/**
 * Fallback anchor when Overpass is unavailable
 */
function createFallbackAnchor(region: RegionInput): ScoredAnchor {
  return {
    road: {
      id: 0,
      osmType: 'way',
      tags: {},
      geometry: [region.center, region.center],
      name: region.name ?? 'Region Center',
      ref: null,
      highway: 'unclassified',
      surface: 'unknown',
      tracktype: null,
    } as NormalizedRoad,
    score: {
      total: 0.5,
      components: {
        poi: 0,
        curve: 0,
        explore: 0.5,
        length: 0,
        priority: 0.5,
        penalty: 0,
      },
    },
    nearbyPois: [],
    start: region.center,
    end: region.center,
    center: region.center,
    lengthMiles: 0,
  };
}

/**
 * Execute Overpass query for a single bbox
 */
async function queryBbox(
  bbox: Bbox
): Promise<{ roads: NormalizedRoad[]; pois: NormalizedPoi[]; timeout: boolean }> {
  const query = buildOverpassQuery(bbox);
  const result = await executeWithRetry(query);

  if (!result.success) {
    return {
      roads: [],
      pois: [],
      timeout: result.error === 'timeout' || result.error === 'rate_limited',
    };
  }

  const elements = normalizeResponse({ elements: result.elements as RawOsmElement[] });
  const roads = extractRoadWays(elements).filter(isCandidateRoad);
  const pois = extractPois(elements);

  return { roads, pois, timeout: false };
}

/**
 * Fetch and score anchor candidates from Overpass
 */
async function fetchFreshCandidates(
  region: RegionInput,
  weights: ScoringWeights
): Promise<{
  candidates: ScoredAnchor[];
  strategy: string;
  wasFallback: boolean;
}> {
  let allRoads: NormalizedRoad[] = [];
  let allPois: NormalizedPoi[] = [];
  let strategy = 'unknown';
  let wasFallback = false;

  // Try clamped bbox first
  const clamped = clampBbox(region.bbox, region.center);
  const clampedResult = await queryBbox(clamped);

  if (!clampedResult.timeout && clampedResult.roads.length >= 5) {
    allRoads = clampedResult.roads;
    allPois = clampedResult.pois;
    strategy = 'clamped';
  } else {
    // Try tiled approach
    const tiles = splitBboxIntoTiles(clamped);

    for (const tile of tiles) {
      const tileResult = await queryBbox(tile);
      if (!tileResult.timeout) {
        allRoads.push(...tileResult.roads);
        allPois.push(...tileResult.pois);
      }
    }

    if (allRoads.length >= 5) {
      strategy = 'tiled';
    } else {
      strategy = 'fallback';
      wasFallback = true;
    }
  }

  // Deduplicate
  const seenRoadIds = new Set<number>();
  allRoads = allRoads.filter(r => {
    if (seenRoadIds.has(r.id)) return false;
    seenRoadIds.add(r.id);
    return true;
  });

  const seenPoiIds = new Set<number>();
  allPois = allPois.filter(p => {
    if (seenPoiIds.has(p.id)) return false;
    seenPoiIds.add(p.id);
    return true;
  });

  // Score candidates
  const candidates: ScoredAnchor[] = [];
  for (const road of allRoads) {
    const scored = scoreAnchor(road, allPois, weights);
    if (scored) {
      candidates.push(scored);
    }
  }

  return { candidates, strategy, wasFallback };
}

/**
 * Default in-memory cache instance
 * Replace with Redis/Upstash in production
 */
let defaultCache: Cache = new InMemoryCache();

/**
 * Set the cache implementation
 */
export function setCache(cache: Cache): void {
  defaultCache = cache;
}

/**
 * Get the current cache implementation
 */
export function getCache(): Cache {
  return defaultCache;
}

/**
 * Main orchestrator: Get a scenic drive anchor for a region
 *
 * Flow:
 * 1. Check cache
 * 2. If cache hit and not stale, maybe trigger probabilistic refresh
 * 3. If cache miss or stale, fetch fresh (unless rate-limited)
 * 4. If rate-limited, serve stale cache or fallback
 * 5. Apply distance rules for sporadic selection
 * 6. Fetch highlights for selected anchor
 */
export async function getScenicDriveAnchor(
  region: RegionInput,
  options: {
    weights?: ScoringWeights;
    recentAnchors?: RecentAnchor[];
    skipCache?: boolean;
    skipHighlights?: boolean;
    cache?: Cache;
  } = {}
): Promise<ScenicAnchorResult> {
  const {
    weights = DEFAULT_WEIGHTS,
    recentAnchors = [],
    skipCache = false,
    skipHighlights = false,
    cache = defaultCache,
  } = options;

  const meta: ScenicAnchorResult['meta'] = {
    regionId: region.id,
    candidatesEvaluated: 0,
    strategy: 'unknown',
    wasFallback: false,
    cacheHit: false,
    cacheStale: false,
  };

  let candidates: ScoredAnchor[] = [];
  let source: ScenicAnchorResult['source'] = 'fresh';
  let cachedData: CachedAnchorData | null = null;

  // Step 1: Check cache
  if (!skipCache) {
    const cacheResult = await getCachedAnchorData(cache, region.id);
    cachedData = cacheResult.data;

    if (cachedData) {
      meta.cacheHit = true;
      meta.cacheStale = cacheResult.isStale;
      meta.refreshTriggered = cacheResult.shouldRefresh;

      // Use cached data if not stale and no refresh needed
      if (!cacheResult.isStale && !cacheResult.shouldRefresh) {
        candidates = cachedData.candidates;
        meta.candidatesEvaluated = candidates.length;
        meta.strategy = cachedData.strategy;
        meta.wasFallback = cachedData.wasFallback;
        source = 'cache';
      }
    }
  }

  // Step 2: Fetch fresh if needed
  if (candidates.length === 0) {
    // Check if we're rate-limited
    if (isFullyRateLimited()) {
      // Serve stale cache if available
      if (cachedData) {
        candidates = cachedData.candidates;
        meta.candidatesEvaluated = candidates.length;
        meta.strategy = cachedData.strategy;
        meta.wasFallback = cachedData.wasFallback;
        source = 'stale_cache';
      } else {
        // No cache, use fallback
        const fallback = createFallbackAnchor(region);
        meta.strategy = 'fallback';
        meta.wasFallback = true;
        source = 'fallback';

        return {
          success: true,
          anchor: fallback,
          highlights: [],
          source,
          meta,
        };
      }
    } else {
      // Fetch fresh data
      const freshResult = await fetchFreshCandidates(region, weights);
      candidates = freshResult.candidates;
      meta.candidatesEvaluated = candidates.length;
      meta.strategy = freshResult.strategy;
      meta.wasFallback = freshResult.wasFallback;

      // Cache the results
      if (candidates.length > 0 && !skipCache) {
        await cacheAnchorData(
          cache,
          region.id,
          candidates,
          freshResult.strategy,
          freshResult.wasFallback
        );
      }

      source = 'fresh';
    }
  }

  // Step 3: Handle no candidates
  if (candidates.length === 0) {
    const fallback = createFallbackAnchor(region);
    meta.strategy = 'fallback';
    meta.wasFallback = true;

    return {
      success: true,
      anchor: fallback,
      highlights: [],
      source: 'fallback',
      meta,
    };
  }

  // Step 4: Apply distance rules for sporadic selection
  let selectedCandidates = candidates;
  if (recentAnchors.length > 0) {
    const distanceResult = filterByDistanceRule(
      candidates,
      recentAnchors,
      c => c.center
    );
    selectedCandidates = distanceResult.passing;
    meta.distanceThresholdUsed = distanceResult.thresholdUsed;
    meta.distanceRelaxed = distanceResult.wasRelaxed;
  }

  // Step 5: Select anchor from candidates
  const anchor = selectFromCachedCandidates(selectedCandidates);

  if (!anchor) {
    const fallback = createFallbackAnchor(region);
    return {
      success: true,
      anchor: fallback,
      highlights: [],
      source: 'fallback',
      meta,
    };
  }

  // Step 6: Fetch highlights
  let highlights: Highlight[] = [];
  if (!skipHighlights) {
    const highlightResult = await fetchNearbyHighlights(anchor.center);
    highlights = highlightResult.highlights;
  }

  return {
    success: true,
    anchor,
    highlights,
    source,
    meta,
  };
}

/**
 * Warm the cache for a region (background refresh)
 */
export async function warmCache(
  region: RegionInput,
  options: {
    weights?: ScoringWeights;
    cache?: Cache;
  } = {}
): Promise<{ success: boolean; candidateCount: number }> {
  const { weights = DEFAULT_WEIGHTS, cache = defaultCache } = options;

  try {
    const result = await fetchFreshCandidates(region, weights);

    if (result.candidates.length > 0) {
      await cacheAnchorData(
        cache,
        region.id,
        result.candidates,
        result.strategy,
        result.wasFallback
      );
    }

    return {
      success: true,
      candidateCount: result.candidates.length,
    };
  } catch (err) {
    return {
      success: false,
      candidateCount: 0,
    };
  }
}
