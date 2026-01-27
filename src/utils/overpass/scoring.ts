import { Coord, NormalizedRoad, NormalizedPoi } from './types';
import { polylineLength, filterPoisWithinRadius } from './extract';
import { curvinessScore } from './curviness';
import { calculatePenalties, hasDisqualifyingPenalties } from './penalties';
import { roadPriorityScore } from './roadFilter';
import { extractAnchorGeometry } from './anchorGeometry';

export interface ScoringWeights {
  poi: number;      // POI density weight (default 0.40)
  curve: number;    // Curviness weight (default 0.25)
  explore: number;  // Exploration bonus (default 0.20)
  length: number;   // Length bonus (default 0.15)
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  poi: 0.40,
  curve: 0.25,
  explore: 0.20,
  length: 0.15,
};

export interface AnchorScore {
  total: number;
  components: {
    poi: number;
    curve: number;
    explore: number;
    length: number;
    priority: number;
    penalty: number;
  };
}

export interface ScoredAnchor {
  road: NormalizedRoad;
  score: AnchorScore;
  nearbyPois: NormalizedPoi[];
  start: Coord;
  end: Coord;
  center: Coord;
  lengthMiles: number;
}

/**
 * Calculate POI density score (0-1)
 */
function poiDensityScore(poiCount: number): number {
  // 0 POIs = 0, 1 POI = 0.3, 3+ POIs = 1.0
  if (poiCount === 0) return 0;
  if (poiCount === 1) return 0.3;
  if (poiCount === 2) return 0.6;
  return 1.0;
}

/**
 * Calculate length bonus (0-1)
 * Prefer roads 2-10 miles
 */
function lengthScore(miles: number): number {
  if (miles < 0.5) return 0.2;
  if (miles < 2) return 0.5;
  if (miles <= 10) return 1.0;
  if (miles <= 20) return 0.8;
  return 0.5;
}

/**
 * Calculate exploration bonus based on road name/designation
 */
function explorationScore(road: NormalizedRoad): number {
  const name = (road.name || '').toLowerCase();
  const ref = (road.ref || '').toLowerCase();

  // Forest roads get bonus
  if (name.includes('forest') || ref.startsWith('fs') || ref.startsWith('fr')) {
    return 1.0;
  }

  // Named scenic routes
  if (name.includes('scenic') || name.includes('vista') || name.includes('overlook')) {
    return 0.9;
  }

  // Named roads get some bonus
  if (road.name) return 0.5;

  // Unnamed roads
  return 0.3;
}

/**
 * Score a road as a potential anchor
 */
export function scoreAnchor(
  road: NormalizedRoad,
  allPois: NormalizedPoi[],
  weights: ScoringWeights = DEFAULT_WEIGHTS
): ScoredAnchor | null {
  // Disqualify roads with major penalties
  if (hasDisqualifyingPenalties(road)) {
    return null;
  }

  // Extract geometry with proper distance-based midpoint
  const geometry = extractAnchorGeometry(road.geometry);
  const { start, end, center, lengthMiles } = geometry;

  // Find POIs within 2 miles of center
  const nearbyPois = filterPoisWithinRadius(allPois, center, 2);

  // Calculate component scores
  const poiScoreValue = poiDensityScore(nearbyPois.length);
  const curveScoreValue = curvinessScore(road.geometry);
  const exploreScoreValue = explorationScore(road);
  const lengthScoreValue = lengthScore(lengthMiles);
  const priorityScoreValue = roadPriorityScore(road) / 100;

  // Calculate penalties
  const penalties = calculatePenalties(road, poiScoreValue);
  const penaltyValue = penalties.total / 100; // Normalize to 0-1 scale

  // Weighted sum
  const weightedScore =
    weights.poi * poiScoreValue +
    weights.curve * curveScoreValue +
    weights.explore * exploreScoreValue +
    weights.length * lengthScoreValue;

  // Apply priority bonus and penalties
  const total = Math.max(0, Math.min(1, weightedScore * (0.5 + 0.5 * priorityScoreValue) + penaltyValue));

  return {
    road,
    score: {
      total: Math.round(total * 100) / 100,
      components: {
        poi: poiScoreValue,
        curve: curveScoreValue,
        explore: exploreScoreValue,
        length: lengthScoreValue,
        priority: priorityScoreValue,
        penalty: penaltyValue,
      },
    },
    nearbyPois,
    start,
    end,
    center,
    lengthMiles: Math.round(lengthMiles * 1000) / 1000, // 3 decimal places for accuracy
  };
}

/**
 * Select best anchor using weighted random selection
 */
export function selectAnchor(candidates: ScoredAnchor[]): ScoredAnchor | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // Sort by score descending
  const sorted = [...candidates].sort((a, b) => b.score.total - a.score.total);

  // Take top 5
  const top = sorted.slice(0, 5);

  // Weighted random selection (square the scores for stronger bias toward best)
  const weights = top.map(c => c.score.total ** 2);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  if (totalWeight === 0) return top[0];

  const target = Math.random() * totalWeight;
  let cumulative = 0;

  for (let i = 0; i < top.length; i++) {
    cumulative += weights[i];
    if (cumulative >= target) return top[i];
  }

  return top[top.length - 1];
}
