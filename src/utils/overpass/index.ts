import { Bbox, Coord, NormalizedRoad, NormalizedPoi, RawOsmElement } from './types';
import { normalizeResponse } from './normalize';
import { extractRoadWays, extractPois } from './extract';
import { isCandidateRoad } from './roadFilter';
import { executeBboxStrategy } from './bbox';
import { buildOverpassQuery, executeOverpassQuery } from './query';
import { scoreAnchor, selectAnchor, ScoredAnchor, ScoringWeights, DEFAULT_WEIGHTS } from './scoring';

export interface AnchorResult {
  success: boolean;
  anchor?: ScoredAnchor;
  highlights?: NormalizedPoi[];
  meta?: {
    strategy: string;
    candidatesEvaluated: number;
    roadsFound: number;
    poisFound: number;
  };
  error?: string;
}

export async function findScenicAnchor(
  regionBbox: Bbox,
  regionCenter: Coord,
  weights?: ScoringWeights
): Promise<AnchorResult> {
  try {
    let allRoads: NormalizedRoad[] = [];
    let allPois: NormalizedPoi[] = [];
    let strategy = 'unknown';

    // Execute bbox strategy with query function
    const result = await executeBboxStrategy(
      regionBbox,
      regionCenter,
      async (bbox) => {
        const query = buildOverpassQuery(bbox);
        const response = await executeOverpassQuery(query);

        if (response.timeout || response.error) {
          return { roadCount: 0, poiCount: 0, timeout: response.timeout };
        }

        const elements = normalizeResponse({ elements: response.elements as RawOsmElement[] });
        const roads = extractRoadWays(elements).filter(isCandidateRoad);
        const pois = extractPois(elements);

        // Accumulate results
        allRoads.push(...roads);
        allPois.push(...pois);

        return { roadCount: roads.length, poiCount: pois.length };
      }
    );

    strategy = result.strategy;

    // Deduplicate roads by ID
    const seenRoadIds = new Set<number>();
    allRoads = allRoads.filter(r => {
      if (seenRoadIds.has(r.id)) return false;
      seenRoadIds.add(r.id);
      return true;
    });

    // Deduplicate POIs by ID
    const seenPoiIds = new Set<number>();
    allPois = allPois.filter(p => {
      if (seenPoiIds.has(p.id)) return false;
      seenPoiIds.add(p.id);
      return true;
    });

    if (allRoads.length === 0) {
      return {
        success: false,
        error: 'no_roads_found',
        meta: { strategy, candidatesEvaluated: 0, roadsFound: 0, poisFound: allPois.length },
      };
    }

    // Score all candidates
    const scoredCandidates: ScoredAnchor[] = [];
    for (const road of allRoads) {
      const scored = scoreAnchor(road, allPois, weights ?? DEFAULT_WEIGHTS);
      if (scored) {
        scoredCandidates.push(scored);
      }
    }

    if (scoredCandidates.length === 0) {
      return {
        success: false,
        error: 'no_valid_candidates',
        meta: { strategy, candidatesEvaluated: allRoads.length, roadsFound: allRoads.length, poisFound: allPois.length },
      };
    }

    // Select anchor
    const anchor = selectAnchor(scoredCandidates);

    if (!anchor) {
      return {
        success: false,
        error: 'selection_failed',
        meta: { strategy, candidatesEvaluated: scoredCandidates.length, roadsFound: allRoads.length, poisFound: allPois.length },
      };
    }

    return {
      success: true,
      anchor,
      highlights: anchor.nearbyPois,
      meta: {
        strategy,
        candidatesEvaluated: scoredCandidates.length,
        roadsFound: allRoads.length,
        poisFound: allPois.length,
      },
    };

  } catch (err) {
    return {
      success: false,
      error: String(err),
    };
  }
}

// Re-export types and utilities
export * from './types';
export { ScoredAnchor, ScoringWeights, DEFAULT_WEIGHTS } from './scoring';
export { normalizeResponse, normalizeElement, getElementCoord } from './normalize';
export { extractRoadWays, extractPois, haversineDistance, polylineLength, filterPoisWithinRadius } from './extract';
export { clampBbox, splitBboxIntoTiles, executeBboxStrategy } from './bbox';
export { classifySurface, filterRoad, isCandidateRoad, roadPriorityScore } from './roadFilter';
export { curvinessRatio, curvinessScore, curvinessScoreCustom, straightLineDistance } from './curviness';
export { parseMaxspeedMph, calculatePenalties, hasDisqualifyingPenalties } from './penalties';
export { buildOverpassQuery, executeOverpassQuery } from './query';
export { scoreAnchor, selectAnchor } from './scoring';
export {
  extractAnchorGeometry,
  midpointAlongPolyline,
  coordAtDistance,
  coordAtPercentage,
  interpolateCoord,
  samplePolyline,
  type AnchorGeometry,
} from './anchorGeometry';
export {
  passesDistanceRule,
  getMinDistanceToRecent,
  filterByDistanceRule,
  sortByFarthestFromRecent,
  parseRecentAnchors,
  DISTANCE_THRESHOLDS,
  DEFAULT_RECENT_COUNT,
  type RecentAnchor,
  type DistanceFilterResult,
} from './distanceRule';
export {
  buildHighlightsQuery,
  selectNearbyHighlights,
  fetchNearbyHighlights,
  formatHighlightLabel,
  getHighlightIcon,
  type Highlight,
  type HighlightType,
  type HighlightSelectionResult,
} from './highlights';
export {
  CACHE_KEY_PREFIX,
  TTL,
  InMemoryCache,
  buildCacheKey,
  determineTtl,
  isStale,
  getTtlRemainingPercent,
  shouldProbabilisticRefresh,
  getCachedAnchorData,
  cacheAnchorData,
  selectFromCachedCandidates,
  type Cache,
  type CachedAnchorData,
  type CacheGetResult,
} from './cache';
export {
  DEFAULT_CONFIG as OVERPASS_CLIENT_CONFIG,
  executeWithRetry,
  isFullyRateLimited,
  getClientState,
  resetClientState,
  type OverpassErrorType,
  type OverpassResult,
} from './overpassClient';
export {
  getScenicDriveAnchor,
  warmCache,
  setCache,
  getCache,
  type RegionInput,
  type ScenicAnchorResult,
} from './orchestrator';
