/**
 * Hono middleware for entity cache.
 * Checks cache before handler, caches response after.
 *
 * Supports two token sources:
 * - X-Cache-Token header: Token from SSE stream notification (preferred)
 * - accessToken query param: Legacy fallback
 */

import { createMiddleware } from 'hono/factory';
import { verifyCacheToken } from '#/lib/cache-token';
import { entityCache } from '#/lib/entity-cache';

/**
 * Context keys set by cache middleware.
 */
declare module 'hono' {
  interface ContextVariableMap {
    /** Entity data to cache (set by handler) */
    entityCacheData: Record<string, unknown> | null;
    /** Whether entity is public (set by handler) */
    entityCacheIsPublic: boolean;
    /** Entity version (set by handler) */
    entityCacheVersion: number;
    /** Whether response was from cache */
    entityCacheHit: boolean;
  }
}

export interface EntityCacheMiddlewareOptions {
  /** Extract entity type from context (default: from route param 'entityType') */
  getEntityType?: (c: Parameters<Parameters<typeof createMiddleware>[0]>[0]) => string | undefined;
  /** Extract entity ID from context (default: from route param 'id') */
  getEntityId?: (c: Parameters<Parameters<typeof createMiddleware>[0]>[0]) => string | undefined;
  /** Extract version from context (default: from query param 'version' or X-Cache-Token) */
  getVersion?: (c: Parameters<Parameters<typeof createMiddleware>[0]>[0]) => number;
  /** Extract access token from context (default: from X-Cache-Token header or query param) */
  getAccessToken?: (c: Parameters<Parameters<typeof createMiddleware>[0]>[0]) => string | undefined;
}

/**
 * Create entity cache middleware with custom extractors.
 *
 * Usage:
 * ```typescript
 * app.get('/pages/:id', entityCacheMiddleware({ ... }), handler);
 * ```
 *
 * Clients can provide cache tokens in two ways:
 * 1. X-Cache-Token header (preferred, from SSE notification)
 * 2. accessToken query param (legacy fallback)
 *
 * The token includes version, so clients don't need to pass version separately.
 * If a token is provided, its embedded version is used for cache lookup.
 *
 * In handler, set cache data:
 * ```typescript
 * c.set('entityCacheData', enrichedData);
 * c.set('entityCacheIsPublic', page.visibility === 'public');
 * c.set('entityCacheVersion', page.version);
 * ```
 */
export function createEntityCacheMiddleware(options: EntityCacheMiddlewareOptions = {}) {
  const {
    getEntityType = (c) => c.req.param('entityType'),
    getEntityId = (c) => c.req.param('id'),
    getVersion = (c) => {
      // Try to get version from cache token first
      const cacheToken = c.req.header('X-Cache-Token') ?? c.req.query('accessToken');
      if (cacheToken) {
        const payload = verifyCacheToken(cacheToken);
        if (payload) return payload.version;
      }
      // Fallback to query param
      return Number.parseInt(c.req.query('version') ?? '0', 10);
    },
    getAccessToken = (c) => c.req.header('X-Cache-Token') ?? c.req.query('accessToken'),
  } = options;

  return createMiddleware(async (c, next) => {
    const entityType = getEntityType(c);
    const entityId = getEntityId(c);
    const accessToken = getAccessToken(c);

    // Extract version (from token or query param)
    let version = getVersion(c);

    // If we have a cache token, verify it grants access to this entity
    if (accessToken) {
      const payload = verifyCacheToken(accessToken);
      if (payload) {
        // Verify token is for this entity
        if (payload.entityType !== entityType || payload.entityId !== entityId) {
          // Token doesn't match this entity - skip cache
          c.set('entityCacheHit', false);
          c.header('X-Cache', 'SKIP');
          await next();
          return;
        }
        // Use version from token
        version = payload.version;
      }
    }

    // Skip if missing required params or version is 0 (unknown)
    if (!entityType || !entityId || version === 0) {
      c.set('entityCacheHit', false);
      await next();
      return;
    }

    // Check cache
    const cached = entityCache.get(entityType, entityId, version, accessToken);

    if (cached) {
      c.set('entityCacheHit', true);
      c.header('X-Cache', 'HIT');
      return c.json(cached);
    }

    // Cache miss - proceed to handler
    c.set('entityCacheHit', false);
    c.header('X-Cache', 'MISS');

    await next();

    // After handler: cache the response if data was set
    const entityData = c.get('entityCacheData');
    const isPublic = c.get('entityCacheIsPublic') ?? false;
    const responseVersion = c.get('entityCacheVersion') ?? version;

    if (entityData && responseVersion > 0) {
      if (isPublic) {
        entityCache.setPublic(entityType, entityId, responseVersion, entityData);
      } else if (accessToken) {
        entityCache.setWithToken(accessToken, entityType, entityId, responseVersion, entityData);
      }
    }
  });
}

/**
 * Default entity cache middleware.
 * Uses standard param names: entityType, id, version, accessToken.
 */
export const entityCacheMiddleware = createEntityCacheMiddleware();

/**
 * Create middleware for a specific entity type.
 *
 * @example
 * ```typescript
 * app.get('/pages/:id', entityCacheFor('page'), getPageHandler);
 * ```
 */
export function entityCacheFor(entityType: string) {
  return createEntityCacheMiddleware({
    getEntityType: () => entityType,
  });
}
