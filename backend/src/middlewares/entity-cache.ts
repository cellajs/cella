/**
 * Hono middleware for entity cache.
 * Checks cache before handler, caches response after.
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
  /** Extract version from context (default: from query param 'version') */
  getVersion?: (c: Parameters<Parameters<typeof createMiddleware>[0]>[0]) => number;
  /** Extract access token from context (default: from query param 'accessToken') */
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
    getVersion = (c) => Number.parseInt(c.req.query('version') ?? '0', 10),
    getAccessToken = (c) => c.req.query('accessToken'),
  } = options;

  return createMiddleware(async (c, next) => {
    const entityType = getEntityType(c);
    const entityId = getEntityId(c);
    const version = getVersion(c);
    const accessToken = getAccessToken(c);

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
      return c.json({ data: cached });
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
