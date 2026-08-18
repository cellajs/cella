import type { Context, MiddlewareHandler } from 'hono';
import { draftVisibleTo, type ProductEntityType } from 'shared';
import type { Env } from '#/core/context';
import { xMiddleware } from '#/core/x-middleware';
import { checkAccess } from '#/permissions';
import { accessFrom } from '#/permissions/access';
import { buildSubjectFromEntity } from '#/permissions/build-subject';
import { coalesce, isInFlight } from '#/utils/request-coalescing';
import { productCache as productCacheStore } from './app-product-cache';

/**
 * Detail cache keyed by `entityType:{id}` from the request path, with no cache token. A hit re-authorizes the caller
 * against the cached row; a miss runs the handler once (coalesced) and caches it. CDC invalidates by entity id.
 */
export const productCache = (entityType: ProductEntityType): MiddlewareHandler<Env> =>
  xMiddleware(
    {
      functionName: 'productCache',
      type: 'x-cache',
      name: 'app',
      description: 'Entity-keyed detail cache with per-request read authorization',
    },
    async (ctx, next) => {
      const id = ctx.req.param('id');
      if (!id) {
        await next();
        return;
      }

      const key = `${entityType}:${id}`;
      const cached = productCacheStore.get(key);

      if (isEnriched(cached)) {
        if (callerCanRead(ctx, entityType, cached)) {
          ctx.header('X-Cache', 'HIT');
          return ctx.json(cached);
        }
        // Denied from cache: fall through so the handler produces the authoritative 403/404.
        ctx.header('X-Cache', 'MISS');
        await next();
        return;
      }

      // Coalesce concurrent misses on the same entity; a waiter re-checks the cache after.
      if (isInFlight(key)) {
        await coalesce(key, () => Promise.resolve());
        const coalesced = productCacheStore.get(key);
        if (isEnriched(coalesced) && callerCanRead(ctx, entityType, coalesced)) {
          ctx.header('X-Cache', 'COALESCED');
          return ctx.json(coalesced);
        }
      }

      ctx.header('X-Cache', 'MISS');
      await coalesce(key, async () => {
        await next();
        const entityData = ctx.get('productCacheData');
        if (entityData) productCacheStore.set(key, entityData);
      });
    },
  );

/** True if a cache value holds enriched entity data (not undefined and carrying an `id`). */
function isEnriched(value: Record<string, unknown> | null | undefined): value is Record<string, unknown> {
  return value !== undefined && value !== null && 'id' in value;
}

/**
 * Re-authorizes a cache hit, draft veto first so an author-cached draft never serves to a non-author. `createdBy` is
 * normalized from the enriched user object back to the raw id the permission subject expects.
 */
function callerCanRead(ctx: Context<Env>, productType: ProductEntityType, cached: Record<string, unknown>): boolean {
  try {
    const createdBy = cached.createdBy;
    const authRow = {
      ...cached,
      createdBy:
        typeof createdBy === 'object' && createdBy !== null && 'id' in createdBy
          ? ((createdBy as { id: string }).id ?? null)
          : ((createdBy as string | null | undefined) ?? null),
    } as { id: string; createdBy?: string | null };
    const access = accessFrom(ctx);
    if (!draftVisibleTo(authRow, 'anonymous' in access ? undefined : access.userId)) return false;
    const subject = buildSubjectFromEntity(productType, authRow);
    return checkAccess(access, 'read', subject).allowed;
  } catch {
    // Unexpected row shape → don't serve from cache; the handler re-authorizes authoritatively.
    return false;
  }
}
