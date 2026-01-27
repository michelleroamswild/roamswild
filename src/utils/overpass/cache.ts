import { ScoredAnchor } from './scoring';

/**
 * Cache key prefix for scenic drive anchors
 */
export const CACHE_KEY_PREFIX = 'scenic_drive_anchor:v1:';

/**
 * TTL values in milliseconds
 */
export const TTL = {
  /** 14 days - used when >= 3 candidates found */
  GOOD: 14 * 24 * 60 * 60 * 1000,
  /** 7 days - used when 1-2 candidates found */
  SPARSE: 7 * 24 * 60 * 60 * 1000,
  /** 3 days - used when fallback was needed */
  FALLBACK: 3 * 24 * 60 * 60 * 1000,
} as const;

/**
 * Cached anchor data
 */
export interface CachedAnchorData {
  /** Top 5 candidates with scores */
  candidates: ScoredAnchor[];
  /** When this cache entry was created */
  createdAt: number;
  /** When this cache entry expires */
  expiresAt: number;
  /** TTL that was applied (for debugging) */
  ttlMs: number;
  /** Whether fallback strategy was used */
  wasFallback: boolean;
  /** Bbox strategy used */
  strategy: string;
  /** Cache version for future migrations */
  version: 1;
}

/**
 * Result of a cache get operation
 */
export interface CacheGetResult {
  /** The cached data, if found */
  data: CachedAnchorData | null;
  /** Whether the cache entry is stale (past expiry) */
  isStale: boolean;
  /** Whether a probabilistic refresh should be triggered */
  shouldRefresh: boolean;
}

/**
 * Abstract cache interface - implement with Redis/Upstash/etc.
 */
export interface Cache {
  /**
   * Get a value from the cache
   * @param key - Cache key
   * @returns The cached value or null if not found
   */
  get(key: string): Promise<CachedAnchorData | null>;

  /**
   * Set a value in the cache
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttlMs - Time to live in milliseconds
   */
  set(key: string, value: CachedAnchorData, ttlMs: number): Promise<void>;

  /**
   * Delete a value from the cache
   * @param key - Cache key
   */
  delete(key: string): Promise<void>;
}

/**
 * In-memory cache implementation for development/testing
 */
export class InMemoryCache implements Cache {
  private store = new Map<string, { value: CachedAnchorData; expiresAt: number }>();

  async get(key: string): Promise<CachedAnchorData | null> {
    const entry = this.store.get(key);
    if (!entry) return null;

    // Don't auto-delete stale entries - let the caller decide
    return entry.value;
  }

  async set(key: string, value: CachedAnchorData, ttlMs: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  /** Clear all entries (for testing) */
  clear(): void {
    this.store.clear();
  }

  /** Get current size (for testing) */
  size(): number {
    return this.store.size;
  }
}

/**
 * Build cache key for a region
 */
export function buildCacheKey(regionId: string): string {
  return `${CACHE_KEY_PREFIX}${regionId}`;
}

/**
 * Determine TTL based on results quality
 */
export function determineTtl(candidateCount: number, wasFallback: boolean): number {
  if (wasFallback) {
    return TTL.FALLBACK;
  }
  if (candidateCount >= 3) {
    return TTL.GOOD;
  }
  return TTL.SPARSE;
}

/**
 * Check if cache entry is stale
 */
export function isStale(data: CachedAnchorData): boolean {
  return Date.now() > data.expiresAt;
}

/**
 * Calculate remaining TTL percentage (0-1)
 */
export function getTtlRemainingPercent(data: CachedAnchorData): number {
  const now = Date.now();
  const elapsed = now - data.createdAt;
  const total = data.expiresAt - data.createdAt;

  if (total <= 0) return 0;

  const remaining = Math.max(0, total - elapsed);
  return remaining / total;
}

/**
 * Check if we should probabilistically refresh the cache
 *
 * After 50% TTL elapsed, there's a 10% chance per request to trigger refresh
 * This prevents thundering herd when cache expires
 */
export function shouldProbabilisticRefresh(data: CachedAnchorData): boolean {
  const remainingPercent = getTtlRemainingPercent(data);

  // Only consider refresh after 50% of TTL has elapsed
  if (remainingPercent > 0.5) {
    return false;
  }

  // 10% chance to refresh
  return Math.random() < 0.1;
}

/**
 * Get cached data with staleness and refresh checks
 */
export async function getCachedAnchorData(
  cache: Cache,
  regionId: string
): Promise<CacheGetResult> {
  const key = buildCacheKey(regionId);
  const data = await cache.get(key);

  if (!data) {
    return {
      data: null,
      isStale: false,
      shouldRefresh: false,
    };
  }

  const stale = isStale(data);
  const shouldRefresh = !stale && shouldProbabilisticRefresh(data);

  return {
    data,
    isStale: stale,
    shouldRefresh,
  };
}

/**
 * Store anchor candidates in cache
 */
export async function cacheAnchorData(
  cache: Cache,
  regionId: string,
  candidates: ScoredAnchor[],
  strategy: string,
  wasFallback: boolean
): Promise<CachedAnchorData> {
  const key = buildCacheKey(regionId);
  const ttlMs = determineTtl(candidates.length, wasFallback);
  const now = Date.now();

  // Store top 5 candidates
  const topCandidates = [...candidates]
    .sort((a, b) => b.score.total - a.score.total)
    .slice(0, 5);

  const data: CachedAnchorData = {
    candidates: topCandidates,
    createdAt: now,
    expiresAt: now + ttlMs,
    ttlMs,
    wasFallback,
    strategy,
    version: 1,
  };

  await cache.set(key, data, ttlMs);
  return data;
}

/**
 * Select an anchor from cached candidates using weighted random
 */
export function selectFromCachedCandidates(candidates: ScoredAnchor[]): ScoredAnchor | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // Weighted random selection (square scores for bias toward best)
  const weights = candidates.map(c => c.score.total ** 2);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  if (totalWeight === 0) return candidates[0];

  const target = Math.random() * totalWeight;
  let cumulative = 0;

  for (let i = 0; i < candidates.length; i++) {
    cumulative += weights[i];
    if (cumulative >= target) return candidates[i];
  }

  return candidates[candidates.length - 1];
}
