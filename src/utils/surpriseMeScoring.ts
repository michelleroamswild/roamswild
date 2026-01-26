/**
 * Surprise Me Scoring Algorithm
 *
 * Computes weighted scores for region candidates based on:
 * - Public land percentage
 * - Trail density
 * - Campsite availability
 * - Popularity (sweet spot: known but not overcrowded)
 * - Remoteness
 * - Seasonal accessibility
 * - Distance preference (gaussian curve)
 * - Biome diversity (rotation boost)
 */

import {
  BiomeType,
  RegionWithMetricsRow,
  ScoredCandidate,
  ScoreBreakdown,
  ScoreComponents,
  SCORE_WEIGHTS,
  DIVERSITY_MULTIPLIERS,
  SurpriseMeRequest,
} from '@/types/surpriseMe';

// ============================================
// Distance Scoring
// ============================================

/**
 * Gaussian function for distance preference
 * Peaks at preferred distance, drops off for too close or too far
 */
function gaussian(x: number, mu: number, sigma: number): number {
  return Math.exp(-Math.pow(x - mu, 2) / (2 * Math.pow(sigma, 2)));
}

/**
 * Calculate distance factor (0-1)
 * Favors regions near the preferred distance
 */
export function calculateDistanceFactor(
  distanceMiles: number,
  maxDistance: number,
  preferredDistance?: number
): number {
  const preferred = preferredDistance ?? maxDistance * 0.6;
  const sigma = maxDistance * 0.3;

  // Gaussian centered on preferred distance
  const factor = gaussian(distanceMiles, preferred, sigma);

  // Ensure minimum factor of 0.3 for regions within range
  return Math.max(0.3, factor);
}

// ============================================
// Diversity Scoring
// ============================================

/**
 * Get diversity multiplier based on recent biomes
 * Boosts fresh biomes, penalizes repetition
 */
export function getDiversityMultiplier(
  biome: BiomeType | null,
  recentBiomes: BiomeType[]
): number {
  if (!biome || recentBiomes.length === 0) {
    return DIVERSITY_MULTIPLIERS.fresh;
  }

  const count = recentBiomes.filter((b) => b === biome).length;

  if (count === 0) return DIVERSITY_MULTIPLIERS.fresh;
  if (count === 1) return DIVERSITY_MULTIPLIERS.recent1;
  if (count === 2) return DIVERSITY_MULTIPLIERS.recent2;
  return DIVERSITY_MULTIPLIERS.overused;
}

// ============================================
// Component Scoring
// ============================================

/**
 * Extract and normalize component scores from region metrics
 */
export function getComponentScores(region: RegionWithMetricsRow): ScoreComponents {
  return {
    publicLand: region.public_land_score ?? 0,
    trailDensity: region.trail_density_score ?? 0,
    campsiteDensity: region.campsite_density_score ?? 0,
    popularity: region.popularity_score ?? 50, // Default to middle if unknown
    remoteness: region.remoteness_score ?? 50,
    seasonalAccess: region.seasonal_access_score ?? 50,
  };
}

/**
 * Calculate base quality score from component scores
 */
export function calculateBaseScore(components: ScoreComponents): number {
  return (
    SCORE_WEIGHTS.publicLand * components.publicLand +
    SCORE_WEIGHTS.trailDensity * components.trailDensity +
    SCORE_WEIGHTS.campsiteDensity * components.campsiteDensity +
    SCORE_WEIGHTS.popularity * components.popularity +
    SCORE_WEIGHTS.remoteness * components.remoteness +
    SCORE_WEIGHTS.seasonalAccess * components.seasonalAccess
  );
}

// ============================================
// Main Scoring Function
// ============================================

/**
 * Calculate full score breakdown for a region candidate
 */
export function scoreRegion(
  region: RegionWithMetricsRow,
  distanceMiles: number,
  request: SurpriseMeRequest,
  recentBiomes: BiomeType[]
): ScoredCandidate {
  // Get component scores
  const components = getComponentScores(region);

  // Calculate base score
  const baseScore = calculateBaseScore(components);

  // Calculate distance factor
  const distanceFactor = calculateDistanceFactor(
    distanceMiles,
    request.maxDistanceMiles,
    request.preferredDistanceMiles
  );

  // Calculate diversity multiplier
  const diversityMult = request.skipDiversityBoost
    ? 1.0
    : getDiversityMultiplier(region.primary_biome, recentBiomes);

  // Final score
  const finalScore = baseScore * distanceFactor * diversityMult;

  const breakdown: ScoreBreakdown = {
    base: Math.round(baseScore * 10) / 10,
    distanceFactor: Math.round(distanceFactor * 100) / 100,
    diversityMult: Math.round(diversityMult * 100) / 100,
    components,
  };

  return {
    region,
    distanceMiles,
    score: Math.round(finalScore * 10) / 10,
    breakdown,
  };
}

// ============================================
// Weighted Random Selection
// ============================================

/**
 * Select a region using weighted random selection
 * Higher scores have higher probability but selection isn't deterministic
 */
export function weightedRandomSelect(
  candidates: ScoredCandidate[],
  seed?: number
): ScoredCandidate {
  if (candidates.length === 0) {
    throw new Error('No candidates to select from');
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  // Square scores for sharper distribution
  const weights = candidates.map((c) => Math.pow(c.score, 2));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  // Generate random value (use seed if provided for testing)
  const random = seed !== undefined
    ? seededRandom(seed)
    : Math.random();

  const target = random * totalWeight;

  // Shuffle to avoid bias toward early entries with equal scores
  const shuffled = [...candidates].sort(() => Math.random() - 0.5);
  const shuffledWeights = shuffled.map((c) => Math.pow(c.score, 2));

  let cumulative = 0;
  for (let i = 0; i < shuffled.length; i++) {
    cumulative += shuffledWeights[i];
    if (cumulative >= target) {
      return shuffled[i];
    }
  }

  // Fallback to last (shouldn't happen)
  return shuffled[shuffled.length - 1];
}

/**
 * Simple seeded random number generator for testing
 */
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// ============================================
// Explanation Generation
// ============================================

/**
 * Generate human-readable explanation for why a region was selected
 */
export function generateExplanation(
  candidate: ScoredCandidate,
  request: SurpriseMeRequest
): string {
  const { region, distanceMiles, breakdown } = candidate;
  const reasons: string[] = [];

  // Distance reasoning
  if (distanceMiles < 100) {
    reasons.push('close enough for a weekend trip');
  } else if (distanceMiles < 200) {
    reasons.push("a solid day's drive for a longer adventure");
  } else {
    reasons.push('worth the journey for something special');
  }

  // Quality reasoning
  if (breakdown.base > 80) {
    reasons.push('excellent mix of trails and camping');
  } else if (breakdown.base > 60) {
    reasons.push('good balance of activities and solitude');
  }

  // Popularity reasoning
  const popScore = breakdown.components.popularity;
  if (popScore > 85) {
    reasons.push('popular enough to be well-documented but not overrun');
  } else if (popScore < 50) {
    reasons.push('off the beaten path with few crowds');
  }

  // Diversity reasoning
  if (breakdown.diversityMult > 1.1) {
    reasons.push('a change of scenery from your recent trips');
  }

  // Seasonal reasoning
  if (breakdown.components.seasonalAccess > 90) {
    reasons.push('perfect conditions this time of year');
  }

  // Biome-specific flavor
  if (region.primary_biome) {
    const biomeReasons: Record<BiomeType, string> = {
      desert: 'stunning desert landscapes await',
      alpine: 'mountain air and alpine views',
      forest: 'peaceful forests to explore',
      coastal: 'coastal beauty and ocean breezes',
      grassland: 'wide open spaces and big skies',
    };
    if (biomeReasons[region.primary_biome]) {
      reasons.push(biomeReasons[region.primary_biome]);
    }
  }

  // Build sentence
  const name = region.name;
  if (reasons.length === 0) {
    return `We picked ${name} as a great spot to explore.`;
  }

  if (reasons.length === 1) {
    return `We picked ${name} because it's ${reasons[0]}.`;
  }

  const lastReason = reasons.pop();
  return `We picked ${name} because it's ${reasons.join(', ')}, and ${lastReason}.`;
}

// ============================================
// Reroll Selection
// ============================================

/**
 * Select a new candidate, excluding the previously selected one
 * Optionally boost lower-elevation candidates on later attempts
 */
export function rerollSelect(
  candidates: ScoredCandidate[],
  previousSelection: ScoredCandidate,
  attempt: number,
  seed?: number
): ScoredCandidate | null {
  // Filter out previously selected
  const remaining = candidates.filter(
    (c) => c.region.id !== previousSelection.region.id
  );

  if (remaining.length === 0) {
    return null;
  }

  // On later attempts, boost lower-elevation candidates
  let adjusted = remaining;
  if (attempt >= 3) {
    adjusted = remaining.map((c) => {
      const elevAvg = c.region.elevation_avg_ft ?? 5000;
      if (elevAvg < 6000) {
        return {
          ...c,
          score: c.score * 1.3,
        };
      }
      return c;
    });
  }

  return weightedRandomSelect(adjusted, seed);
}

// ============================================
// Batch Scoring
// ============================================

/**
 * Score all candidate regions
 */
export function scoreAllCandidates(
  candidates: Array<{ region: RegionWithMetricsRow; distanceMiles: number }>,
  request: SurpriseMeRequest,
  recentBiomes: BiomeType[]
): ScoredCandidate[] {
  return candidates.map(({ region, distanceMiles }) =>
    scoreRegion(region, distanceMiles, request, recentBiomes)
  );
}

/**
 * Sort candidates by score descending
 */
export function sortByScore(candidates: ScoredCandidate[]): ScoredCandidate[] {
  return [...candidates].sort((a, b) => b.score - a.score);
}

/**
 * Get top N candidates
 */
export function getTopCandidates(
  candidates: ScoredCandidate[],
  n: number
): ScoredCandidate[] {
  return sortByScore(candidates).slice(0, n);
}
