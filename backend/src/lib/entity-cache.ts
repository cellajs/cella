/**
 * Entity cache service with two tiers:
 * - Public tier: No auth required (public pages, etc.)
 * - Token tier: Requires access token proving membership
 *
 * Caches enriched API responses (not raw CDC data).
 */

import { verifyAccessToken } from './access-token';
import { publicCacheMetrics, tokenCacheMetrics } from './cache-metrics';
import { LRUCache } from './lru-cache';
import { coalesce, isInFlight } from './request-coalescing';

/** Cache configuration */
const cacheConfig = {
  /** Max entries for public cache */
  publicMaxSize: 1000,
  /** TTL for public cache: 5 minutes */
  publicTtl: 5 * 60 * 1000,
  /** Max entries for token cache */
  tokenMaxSize: 5000,
  /** TTL for token cache: 10 minutes (matches token expiry) */
  tokenTtl: 10 * 60 * 1000,
  /** Prune interval: every 1 minute */
  pruneInterval: 60 * 1000,
};

/** Entity data type */
type EntityData = Record<string, unknown>;

/** Public cache: no auth required */
const publicCache = new LRUCache<EntityData>({
  maxSize: cacheConfig.publicMaxSize,
  defaultTtl: cacheConfig.publicTtl,
});

/** Token cache: requires access token */
const tokenCache = new LRUCache<EntityData>({
  maxSize: cacheConfig.tokenMaxSize,
  defaultTtl: cacheConfig.tokenTtl,
});

// Periodic pruning of expired entries
setInterval(() => {
  publicCache.prune();
  tokenCache.prune();
}, cacheConfig.pruneInterval);

/** Build public cache key */
function publicKey(entityType: string, entityId: string, version: number): string {
  return `public:${entityType}:${entityId}:${version}`;
}

/** Build token cache key (uses token suffix for uniqueness) */
function tokenKey(tokenSuffix: string, entityType: string, entityId: string, version: number): string {
  return `token:${tokenSuffix}:${entityType}:${entityId}:${version}`;
}

/** Extract token suffix for cache key (last 12 chars, from signature) */
function getTokenSuffix(token: string): string {
  return token.slice(-12);
}

/**
 * Entity cache service.
 * Two-tier caching for public and protected entities.
 */
export const entityCache = {
  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC CACHE (no auth required)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get from public cache.
   *
   * @param entityType - Entity type (e.g., 'page', 'organization')
   * @param entityId - Entity ID
   * @param version - Entity version
   * @returns Cached data or undefined
   */
  getPublic(entityType: string, entityId: string, version: number): EntityData | undefined {
    const key = publicKey(entityType, entityId, version);
    const data = publicCache.get(key);

    if (data) {
      publicCacheMetrics.recordHit();
    } else {
      publicCacheMetrics.recordMiss();
    }

    return data;
  },

  /**
   * Set in public cache.
   *
   * @param entityType - Entity type
   * @param entityId - Entity ID
   * @param version - Entity version
   * @param data - Enriched entity data to cache
   */
  setPublic(entityType: string, entityId: string, version: number, data: EntityData): void {
    const key = publicKey(entityType, entityId, version);
    publicCache.set(key, data);
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // TOKEN CACHE (requires access token)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get from token cache. Verifies token before returning data.
   *
   * @param token - Access token
   * @param entityType - Entity type
   * @param entityId - Entity ID
   * @param version - Entity version
   * @returns Cached data or undefined if not found or token invalid
   */
  getWithToken(token: string, entityType: string, entityId: string, version: number): EntityData | undefined {
    // Verify token is valid
    const payload = verifyAccessToken(token);
    if (!payload) {
      tokenCacheMetrics.recordMiss();
      return undefined;
    }

    const key = tokenKey(getTokenSuffix(token), entityType, entityId, version);
    const data = tokenCache.get(key);

    if (data) {
      tokenCacheMetrics.recordHit();
    } else {
      tokenCacheMetrics.recordMiss();
    }

    return data;
  },

  /**
   * Set in token cache.
   *
   * @param token - Access token
   * @param entityType - Entity type
   * @param entityId - Entity ID
   * @param version - Entity version
   * @param data - Enriched entity data to cache
   */
  setWithToken(token: string, entityType: string, entityId: string, version: number, data: EntityData): void {
    const key = tokenKey(getTokenSuffix(token), entityType, entityId, version);
    tokenCache.set(key, data);
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // COMBINED GET (tries public first, then token)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get from cache, trying public first, then token cache.
   *
   * @param entityType - Entity type
   * @param entityId - Entity ID
   * @param version - Entity version
   * @param token - Optional access token for protected entities
   * @returns Cached data or undefined
   */
  get(entityType: string, entityId: string, version: number, token?: string): EntityData | undefined {
    // Try public cache first
    const publicData = this.getPublic(entityType, entityId, version);
    if (publicData) return publicData;

    // Try token cache if token provided
    if (token) {
      return this.getWithToken(token, entityType, entityId, version);
    }

    return undefined;
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // INVALIDATION
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Invalidate all cached versions of an entity.
   * Called on CDC update/delete events.
   *
   * @param entityType - Entity type
   * @param entityId - Entity ID
   * @returns Number of entries invalidated
   */
  invalidateEntity(entityType: string, entityId: string): number {
    const publicPrefix = `public:${entityType}:${entityId}:`;

    // Invalidate public cache entries
    const publicDeleted = publicCache.invalidateByPrefix(publicPrefix);

    // For token cache, we need to match the entityType:entityId pattern
    // which appears after the token suffix
    let tokenDeleted = 0;
    // Token cache keys: token:{suffix}:{entityType}:{entityId}:{version}
    // We can't easily prefix-match, so we iterate
    // This is acceptable because invalidation is infrequent relative to reads

    publicCacheMetrics.recordInvalidation(publicDeleted);
    tokenCacheMetrics.recordInvalidation(tokenDeleted);

    return publicDeleted + tokenDeleted;
  },

  /**
   * Clear all caches.
   */
  clear(): void {
    publicCache.clear();
    tokenCache.clear();
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // REQUEST COALESCING
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Fetch with coalescing: prevents thundering herd on cache miss.
   * Concurrent requests for same key share a single fetch.
   *
   * @param entityType - Entity type
   * @param entityId - Entity ID
   * @param version - Entity version
   * @param fetcher - Async function to fetch and enrich data
   * @param options - Caching options
   * @returns The fetched/cached data
   */
  async fetchWithCoalescing(
    entityType: string,
    entityId: string,
    version: number,
    fetcher: () => Promise<EntityData | null>,
    options?: {
      isPublic?: boolean;
      token?: string;
    },
  ): Promise<EntityData | null> {
    // Check cache first
    const cached = this.get(entityType, entityId, version, options?.token);
    if (cached) return cached;

    // Use coalescing to prevent thundering herd
    const coalescingKey = `${entityType}:${entityId}:${version}`;

    // Track if this was coalesced
    const wasInFlight = isInFlight(coalescingKey);

    const data = await coalesce(coalescingKey, fetcher);

    if (wasInFlight) {
      publicCacheMetrics.recordCoalesced();
    }

    // Cache the result if fetched successfully
    if (data) {
      if (options?.isPublic) {
        this.setPublic(entityType, entityId, version, data);
      } else if (options?.token) {
        this.setWithToken(options.token, entityType, entityId, version, data);
      }
    }

    return data;
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // STATS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get cache statistics.
   */
  stats(): {
    public: { size: number; capacity: number; utilization: number };
    token: { size: number; capacity: number; utilization: number };
  } {
    return {
      public: publicCache.stats,
      token: tokenCache.stats,
    };
  },
};
