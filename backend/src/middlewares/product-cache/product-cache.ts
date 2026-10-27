import type { Context, MiddlewareHandler } from 'hono';
import { draftVisibleTo, type ProductEntityType } from 'shared';
import type { Env } from '#/core/context';
import { xMiddleware } from '#/core/x-middleware';
import { productCacheStore } from '#/middlewares/product-cache/product-cache-store';
import { checkAccess } from '#/permissions';
import { accessFrom } from '#/permissions/access';
import { buildSubjectFromEntity } from '#/permissions/build-subject';
import { coalesce, isInFlight } from '#/utils/request-coalescing';

/**
 * Detail cache keyed by entity type and the row's id. A hit re-authorizes the caller against the cached row, and
 * concurrent misses share the first one's read when it stores a row they may read.
 */
export const productCache = (entityType: ProductEntityType): MiddlewareHandler<Env> =>
  xMiddleware(
    { functionName: 'productCache', type: 'x-cache', name: 'app', description: 'Entity-keyed detail cache with per-request read authorization' },
    async (ctx, next) => {
      const id = ctx.req.param('id');
      if (!id) {
        await next();
        return;
      }

      const cached = productCacheStore.get(entityType, id);

      if (isEnriched(cached)) {
        if (callerCanRead(ctx, entityType, cached)) {
          ctx.header('X-Cache', 'HIT');
          return ctx.json(cached);
        }
        // Denied from cache: fall through so the handler's own check returns the 403/404.
        ctx.header('X-Cache', 'MISS');
        await next();
        return;
      }

      // Stored under the row's own id: a URL id in another letter case reads the row but never finds an entry.
      const readAndStore = async () => {
        const readStartedAt = performance.now();
        await next();
        const entityData = ctx.get('productCacheData');
        if (isEnriched(entityData)) productCacheStore.set(entityType, entityData, readStartedAt);
      };

      // Concurrent misses on one id wait for the first one's read. A waiter that then finds nothing it may serve runs
      // its own handler: joining a later read would leave its own request without an answer.
      const flightKey = `${entityType}:${id}`;
      if (isInFlight(flightKey)) {
        await coalesce(flightKey, () => Promise.resolve());
        const coalesced = productCacheStore.get(entityType, id);
        if (isEnriched(coalesced) && callerCanRead(ctx, entityType, coalesced)) {
          ctx.header('X-Cache', 'COALESCED');
          return ctx.json(coalesced);
        }
        ctx.header('X-Cache', 'MISS');
        await readAndStore();
        return;
      }

      ctx.header('X-Cache', 'MISS');
      await coalesce(flightKey, readAndStore);
      return;
    },
  );

/** True if a cache value holds enriched entity data: a row with its `id`. */
const isEnriched = (value: Record<string, unknown> | null | undefined): value is Record<string, unknown> & { id: string } =>
  typeof value?.id === 'string';

/**
 * Re-authorizes a cache hit: the row must sit in the tenant and organization of the request path, as `getValidProduct`
 * requires, since the key names the id alone and the caller's memberships may reach the row's own scope. Then the draft
 * veto, so an author-cached draft never serves to a non-author. `createdBy` is normalized from the actor reference
 * back to the raw id the permission subject expects.
 */
const callerCanRead = (ctx: Context<Env>, entityType: ProductEntityType, cached: Record<string, unknown>): boolean => {
  if (cached.tenantId !== ctx.var.tenantId || cached.organizationId !== ctx.var.organizationId) return false;
  try {
    const createdBy = cached.createdBy as { id: string } | null | undefined;
    const authRow = { ...cached, createdBy: createdBy?.id ?? null } as { id: string; createdBy?: string | null };
    const access = accessFrom(ctx);
    if (!draftVisibleTo(authRow, 'anonymous' in access ? undefined : access.actorId)) return false;
    const subject = buildSubjectFromEntity(entityType, authRow);
    return checkAccess(access, 'read', subject).allowed;
  } catch {
    // Unexpected row shape → don't serve from cache; the handler runs the full permission check.
    return false;
  }
};
