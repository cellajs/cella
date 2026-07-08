import type { MiddlewareHandler } from 'hono';
import type { Env } from '#/core/context';
import { xMiddleware } from '#/core/x-middleware';
import { entityCache } from './app-entity-cache';
import { validateSignedCacheToken } from './token-signer';

/**
 * TODO [#03] implement, currently its not used by any route
 *
 * Batch-resolve cache middleware for list endpoints.
 * Intercepts requests with a batch cache token and assembles the response
 * from individually cached entities when all are available.
 */
export const batchCache = (): MiddlewareHandler<Env> =>
  xMiddleware(
    {
      functionName: 'batchCache',
      type: 'x-cache',
      name: 'batch',
      description: 'Batch-resolve cache for list endpoints with seqCursor',
    },
    async (ctx, next) => {
      const signedToken = ctx.req.header('X-Cache-Token');
      const sessionToken = ctx.get('sessionToken');

      // Skip if no token provided or no session
      if (!signedToken || !sessionToken) {
        await next();
        return;
      }

      // Validate signature and extract base token
      const baseToken = validateSignedCacheToken(signedToken, sessionToken);
      if (!baseToken) {
        await next();
        return;
      }

      // Try to resolve as batch token
      const entityKeys = entityCache.resolveBatchToken(baseToken);
      if (!entityKeys || entityKeys.length === 0) {
        await next();
        return;
      }

      // Check if ALL entities are enriched in cache
      const items: Record<string, unknown>[] = [];
      for (const key of entityKeys) {
        const cached = entityCache.get(key);
        if (cached === undefined || cached === null || !('id' in cached)) {
          await next();
          return;
        }
        items.push(cached);
      }

      ctx.header('X-Cache', 'BATCH-HIT');
      return ctx.json({ items, total: items.length });
    },
  );
