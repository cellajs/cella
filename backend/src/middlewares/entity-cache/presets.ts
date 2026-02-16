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

import type { MiddlewareHandler } from 'hono';
import type { ProductEntityType } from 'shared';
import { xMiddleware } from '#/docs/x-middleware';
import { validateSignedCacheToken } from '#/lib/cache-token-signer';
import type { Env } from '#/lib/context';
import { logEvent } from '#/utils/logger';
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
 * Uses X-Cache-Token header for cache key, validates session-signed tokens.
 *
 * Flow:
 * 1. CDC reserves token with null value (uses base token)
 * 2. SSE signs token per-subscriber with their session
 * 3. Client sends signed token, we validate and extract base token
 * 4. First user fetch enriches: handler sets actual data
 * 5. Subsequent users get cache hit (all share same base token key)
 */
export const appCache = (): MiddlewareHandler<Env> =>
  xMiddleware(
    'appCache',
    'x-cache',
    async (ctx, next) => {
      const signedToken = ctx.req.header('X-Cache-Token');
      const sessionToken = ctx.get('sessionToken');

      // Skip if no token provided
      if (!signedToken) {
        ctx.set('entityCacheToken', null);
        ctx.set('entityCacheHit', false);
        await next();
        return;
      }

      // Validate signature and extract base token
      let baseToken: string | null = null;
      if (sessionToken) {
        baseToken = validateSignedCacheToken(signedToken, sessionToken);
        if (!baseToken) {
          logEvent('debug', 'Cache token signature validation failed', {
            signedTokenPrefix: signedToken.slice(0, 8),
          });
        }
      }

      // Store base token in context for handler access
      ctx.set('entityCacheToken', baseToken);

      // If signature invalid, skip cache and proceed to handler
      if (!baseToken) {
        ctx.set('entityCacheHit', false);
        ctx.header('X-Cache', 'INVALID');
        await next();
        return;
      }

      // Check cache using base token - returns enriched data, null (reserved), or undefined (miss)
      const cached = entityCache.get(baseToken);

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

      // After handler: cache the response using base token
      const entityData = ctx.get('entityCacheData');

      if (entityData && baseToken) {
        entityCache.set(baseToken, entityData);
      }
    },
    'TTL cache with session-signed token validation',
  );
