/**
 * Cache metrics for monitoring hit rates and performance.
 */

interface CacheMetricsData {
  hits: number;
  misses: number;
  invalidations: number;
  coalescedRequests: number;
  startedAt: number;
}

/**
 * Metrics collector for entity cache.
 * Tracks hits, misses, and invalidations.
 */
class CacheMetrics {
  private data: CacheMetricsData = {
    hits: 0,
    misses: 0,
    invalidations: 0,
    coalescedRequests: 0,
    startedAt: Date.now(),
  };

  /** Record a cache hit */
  recordHit(): void {
    this.data.hits++;
  }

  /** Record a cache miss */
  recordMiss(): void {
    this.data.misses++;
  }

  /** Record an invalidation */
  recordInvalidation(count = 1): void {
    this.data.invalidations += count;
  }

  /** Record a coalesced request (avoided DB query) */
  recordCoalesced(): void {
    this.data.coalescedRequests++;
  }

  /** Get hit rate as percentage (0-100) */
  get hitRate(): number {
    const total = this.data.hits + this.data.misses;
    if (total === 0) return 0;
    return (this.data.hits / total) * 100;
  }

  /** Get total requests (hits + misses) */
  get totalRequests(): number {
    return this.data.hits + this.data.misses;
  }

  /** Get uptime in seconds */
  get uptimeSeconds(): number {
    return Math.floor((Date.now() - this.data.startedAt) / 1000);
  }

  /** Get all metrics as snapshot */
  getStats(): {
    hits: number;
    misses: number;
    hitRate: number;
    invalidations: number;
    coalescedRequests: number;
    totalRequests: number;
    uptimeSeconds: number;
  } {
    return {
      hits: this.data.hits,
      misses: this.data.misses,
      hitRate: Math.round(this.hitRate * 100) / 100,
      invalidations: this.data.invalidations,
      coalescedRequests: this.data.coalescedRequests,
      totalRequests: this.totalRequests,
      uptimeSeconds: this.uptimeSeconds,
    };
  }

  /** Reset all metrics */
  reset(): void {
    this.data = {
      hits: 0,
      misses: 0,
      invalidations: 0,
      coalescedRequests: 0,
      startedAt: Date.now(),
    };
  }
}

/** Singleton metrics instance for public cache */
export const publicCacheMetrics = new CacheMetrics();

/** Singleton metrics instance for token cache */
export const tokenCacheMetrics = new CacheMetrics();

/** Get combined metrics for all caches */
export function getCombinedCacheMetrics(): {
  public: ReturnType<CacheMetrics['getStats']>;
  token: ReturnType<CacheMetrics['getStats']>;
  combined: {
    totalHits: number;
    totalMisses: number;
    overallHitRate: number;
    totalInvalidations: number;
  };
} {
  const publicStats = publicCacheMetrics.getStats();
  const tokenStats = tokenCacheMetrics.getStats();

  const totalHits = publicStats.hits + tokenStats.hits;
  const totalMisses = publicStats.misses + tokenStats.misses;
  const total = totalHits + totalMisses;

  return {
    public: publicStats,
    token: tokenStats,
    combined: {
      totalHits,
      totalMisses,
      overallHitRate: total > 0 ? Math.round((totalHits / total) * 10000) / 100 : 0,
      totalInvalidations: publicStats.invalidations + tokenStats.invalidations,
    },
  };
}

/** Reset all cache metrics */
export function resetAllCacheMetrics(): void {
  publicCacheMetrics.reset();
  tokenCacheMetrics.reset();
}
