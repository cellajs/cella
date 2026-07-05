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
import type { Env } from '#/core/context';
import { xMiddleware } from '#/core/x-middleware';
import { log } from '#/utils/logger';
import { coalesce, isInFlight } from '#/utils/request-coalescing';
import { entityCache } from './app-entity-cache';
import { publicEntityCache } from './public-entity-cache';
import { validateSignedCacheToken } from './token-signer';

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
    {
      functionName: 'publicCache',
      type: 'x-cache',
      name: 'public',
      description: `LRU cache for public ${entityType} entities`,
    },
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
  );

/**
 * App entity cache middleware - entity-keyed TTL cache with forward-only token resolution.
 * Uses X-Cache-Token header for access, validates session-signed tokens,
 * resolves token to entity key for cache lookup.
 *
 * Forward-only flow:
 * 1. CDC reserves token → maps token to entity key, invalidates stale data
 * 2. SSE signs token per-subscriber with their session
 * 3. Client sends signed token, we validate and resolve to entity key
 * 4. First user fetch enriches: handler sets actual data under entity key
 * 5. Subsequent users (any token, old or new) get cache hit on same entity key
 */
export const appCache = (): MiddlewareHandler<Env> =>
  xMiddleware(
    {
      functionName: 'appCache',
      type: 'x-cache',
      name: 'app',
      description: 'Entity-keyed TTL cache with forward-only token resolution',
    },
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
          log.debug('Cache token signature validation failed', {
            signedTokenPrefix: signedToken.slice(0, 8),
          });
        }
      }

      // If signature invalid, skip cache and proceed to handler
      if (!baseToken) {
        ctx.set('entityCacheToken', null);
        ctx.set('entityCacheHit', false);
        ctx.header('X-Cache', 'INVALID');
        await next();
        return;
      }

      // Resolve token to entity key (forward-only: old tokens still resolve)
      const resolvedKey = entityCache.resolveToken(baseToken);

      // Store resolved entity key in context for handler access
      ctx.set('entityCacheToken', resolvedKey ?? null);

      // If token can't be resolved (expired/unknown), skip cache
      if (!resolvedKey) {
        ctx.set('entityCacheHit', false);
        ctx.header('X-Cache', 'MISS');
        await next();
        return;
      }

      // Check cache using entity key
      const cached = entityCache.get(resolvedKey);

      // If we have enriched data (not null/undefined and has 'id'), return it
      if (cached !== undefined && cached !== null && 'id' in cached) {
        ctx.set('entityCacheHit', true);
        ctx.header('X-Cache', 'HIT');
        return ctx.json(cached);
      }

      // Cache miss or reserved — check if another request is already fetching
      ctx.set('entityCacheHit', false);

      if (isInFlight(resolvedKey)) {
        // Another request is fetching this entity — wait for it, then serve from cache
        await coalesce(resolvedKey, () => Promise.resolve());

        const coalesced = entityCache.get(resolvedKey);
        if (coalesced !== undefined && coalesced !== null && 'id' in coalesced) {
          ctx.set('entityCacheHit', true);
          ctx.header('X-Cache', 'COALESCED');
          return ctx.json(coalesced);
        }
      }

      // First request (or coalesced miss) — fetch via handler
      ctx.header('X-Cache', cached === null ? 'RESERVED' : 'MISS');

      await coalesce(resolvedKey, async () => {
        await next();

        const entityData = ctx.get('entityCacheData');
        if (entityData) {
          entityCache.set(resolvedKey, entityData);
        }
      });
    },
  );
