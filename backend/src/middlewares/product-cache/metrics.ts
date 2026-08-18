interface CacheMetricsData {
  hits: number;
  misses: number;
  invalidations: number;
  coalescedRequests: number;
  startedAt: number;
}

class CacheMetrics {
  private data: CacheMetricsData = {
    hits: 0,
    misses: 0,
    invalidations: 0,
    coalescedRequests: 0,
    startedAt: Date.now(),
  };

  recordHit(): void {
    this.data.hits++;
  }

  recordMiss(): void {
    this.data.misses++;
  }

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

  get totalRequests(): number {
    return this.data.hits + this.data.misses;
  }

  /** Get uptime in seconds */
  get uptimeSeconds(): number {
    return Math.floor((Date.now() - this.data.startedAt) / 1000);
  }

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

export const productCacheMetrics = new CacheMetrics();

export function getCacheMetrics(): ReturnType<CacheMetrics['getStats']> {
  return productCacheMetrics.getStats();
}

export function resetCacheMetrics(): void {
  productCacheMetrics.reset();
}
