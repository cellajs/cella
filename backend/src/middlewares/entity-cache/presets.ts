/**
 * Cache middleware presets for common caching patterns.
 * Similar to rate-limiter/limiters.ts, these wrap the core cache middleware
 * with sensible defaults for different use cases.
 *
 * Both presets use passthrough pattern:
 * 1. Middleware checks cache → HIT returns immediately
 * 2. MISS → handler fetches/enriches data, sets ctx.set('entityCacheData', data)
 * 3. Middleware caches result after handler completes
 */

import type { ProductEntityType } from 'config';
import type { MiddlewareHandler } from 'hono';
import { xMiddleware } from '#/docs/x-middleware';
import type { Env } from '#/lib/context';
import { entityCache } from './app-entity-cache';
import { publicEntityCache } from './public-entity-cache';

/**
 * Public entity cache middleware - LRU cache keyed by entityType:entityId.
 * Uses passthrough pattern: handler fetches/enriches, middleware caches.
 *
 * Flow:
 * 1. Check LRU cache by entityType:entityId
 * 2. HIT: return cached data immediately
 * 3. MISS: handler fetches + optional enrichment, sets entityCacheData
 * 4. Middleware caches result for subsequent requests
 *
 * @param entityType - The product entity type (must be a public entity)
 * @param idParam - Route param name for entity ID (default: 'id')
 */
export const publicCache = (entityType: ProductEntityType, idParam = 'id'): MiddlewareHandler<Env> =>
  xMiddleware(
    'publicCache',
    'x-cache',
    async (ctx, next) => {
      // Extract entity ID from route params
      const entityId = ctx.req.param(idParam);

      if (!entityId) {
        ctx.set('entityCacheHit', false);
        await next();
        return;
      }

      // Check LRU cache
      const cached = publicEntityCache.get(entityType, entityId);

      if (cached) {
        ctx.set('entityCacheHit', true);
        ctx.header('X-Cache', 'HIT');
        return ctx.json(cached);
      }

      // Cache miss - proceed to handler for fetch/enrichment
      ctx.set('entityCacheHit', false);

      await next();

      // After handler: cache the response if data was set
      const entityData = ctx.get('entityCacheData');

      if (entityData) {
        publicEntityCache.set(entityType, entityId, entityData);
        ctx.header('X-Cache', 'MISS');
      }
    },
    `LRU cache for public ${entityType} entities`,
  );

/**
 * App entity cache middleware - TTL cache with CDC token reservation pattern.
 * Uses X-Cache-Token header for cache key, supports reservation flow.
 *
 * Flow:
 * 1. CDC reserves token with null value
 * 2. First user fetch enriches: handler sets actual data
 * 3. Subsequent users get cache hit
 */
export const appCache = (): MiddlewareHandler<Env> =>
  xMiddleware(
    'appCache',
    'x-cache',
    async (ctx, next) => {
      const cacheToken = ctx.req.header('X-Cache-Token');

      // Store token in context for handler access
      ctx.set('entityCacheToken', cacheToken ?? null);

      // Skip if no token provided
      if (!cacheToken) {
        ctx.set('entityCacheHit', false);
        await next();
        return;
      }

      // Check cache - returns enriched data, null (reserved), or undefined (miss)
      const cached = entityCache.get(cacheToken);

      // If we have enriched data (not null/undefined and has 'id'), return it
      if (cached !== undefined && cached !== null && 'id' in cached) {
        ctx.set('entityCacheHit', true);
        ctx.header('X-Cache', 'HIT');
        return ctx.json(cached);
      }

      // Cache miss or reserved - proceed to handler
      ctx.set('entityCacheHit', false);
      ctx.header('X-Cache', cached === null ? 'RESERVED' : 'MISS');

      await next();

      // After handler: cache the response if data was set
      const entityData = ctx.get('entityCacheData');

      if (entityData && cacheToken) {
        entityCache.set(cacheToken, entityData);
      }
    },
    'TTL cache with CDC token reservation pattern',
  );
