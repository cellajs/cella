/**
 * Hono middleware for entity cache.
 * Checks cache before handler, enriches and caches response after.
 *
 * Flow:
 * 1. Get cache token from X-Cache-Token header
 * 2. Check if cache has enriched data (has 'id' field)
 * 3. If enriched: return cached data
 * 4. If not enriched or miss: run handler
 * 5. After handler: cache the enriched response
 */

import { createMiddleware } from 'hono/factory';
import { entityCache } from '#/lib/entity-cache';

/**
 * Context keys set by cache middleware.
 */
declare module 'hono' {
  interface ContextVariableMap {
    /** Entity data to cache (set by handler) */
    entityCacheData: Record<string, unknown> | null;
    /** Cache token from request (set by middleware) */
    entityCacheToken: string | null;
    /** Whether response was from cache */
    entityCacheHit: boolean;
  }
}

export interface EntityCacheMiddlewareOptions {
  /** Extract cache token from context (default: from X-Cache-Token header) */
  getCacheToken?: (c: Parameters<Parameters<typeof createMiddleware>[0]>[0]) => string | undefined;
}

/**
 * Create entity cache middleware.
 *
 * Usage:
 * ```typescript
 * app.get('/pages/:id', entityCacheMiddleware(), handler);
 * ```
 *
 * In handler, set cache data:
 * ```typescript
 * c.set('entityCacheData', enrichedData);
 * ```
 */
export function createEntityCacheMiddleware(options: EntityCacheMiddlewareOptions = {}) {
  const { getCacheToken = (c) => c.req.header('X-Cache-Token') } = options;

  return createMiddleware(async (c, next) => {
    const cacheToken = getCacheToken(c);

    // Store token in context for handler access
    c.set('entityCacheToken', cacheToken ?? null);

    // Skip if no token provided
    if (!cacheToken) {
      c.set('entityCacheHit', false);
      await next();
      return;
    }

    // Check cache - returns enriched data, null (reserved), or undefined (miss)
    const cached = entityCache.get(cacheToken);

    // If we have enriched data (not null/undefined and has 'id'), return it
    if (cached !== undefined && cached !== null && 'id' in cached) {
      c.set('entityCacheHit', true);
      c.header('X-Cache', 'HIT');
      return c.json(cached);
    }

    // Cache miss or reserved - proceed to handler
    c.set('entityCacheHit', false);
    c.header('X-Cache', cached === null ? 'RESERVED' : 'MISS');

    await next();

    // After handler: cache the response if data was set
    const entityData = c.get('entityCacheData');

    if (entityData && cacheToken) {
      entityCache.set(cacheToken, entityData);
    }
  });
}

/**
 * Default entity cache middleware.
 * Gets token from X-Cache-Token header.
 */
export const entityCacheMiddleware = createEntityCacheMiddleware;
