import { and, eq, inArray } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import { pushSubscriptionsTable } from '#/modules/push/push-subscription-db';
import { getIsoDate } from '#/utils/iso-date';

interface PushSubscriptionInput {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  expirationTime: string | null;
  userAgent: string | null;
}

interface UpsertPushSubscriptionOpts {
  values: PushSubscriptionInput;
}

/**
 * Upsert by the unique endpoint. A rotated or re-registered subscription reclaims its row even
 * when the browser profile changed users, so the previous user stops receiving pushes for it.
 */
export async function upsertPushSubscription(ctx: DbContext, { values }: UpsertPushSubscriptionOpts) {
  const lastSeenAt = getIsoDate();
  const [row] = await ctx.var.db
    .insert(pushSubscriptionsTable)
    .values({ ...values, lastSeenAt })
    .onConflictDoUpdate({ target: pushSubscriptionsTable.endpoint, set: { ...values, lastSeenAt } })
    .returning({ id: pushSubscriptionsTable.id, endpoint: pushSubscriptionsTable.endpoint });
  return row;
}

interface DeletePushSubscriptionOpts {
  userId: string;
  endpoint: string;
}

/** Scoped to the caller: an endpoint another user registered deletes nothing. */
export async function deletePushSubscription(ctx: DbContext, { userId, endpoint }: DeletePushSubscriptionOpts): Promise<number> {
  const deleted = await ctx.var.db
    .delete(pushSubscriptionsTable)
    .where(and(eq(pushSubscriptionsTable.endpoint, endpoint), eq(pushSubscriptionsTable.userId, userId)))
    .returning({ id: pushSubscriptionsTable.id });
  return deleted.length;
}

interface FindSubscriptionsByUserIdsOpts {
  userIds: string[];
}

/** Every subscription of these users, one per browser installation. */
export async function findSubscriptionsByUserIds(ctx: DbContext, { userIds }: FindSubscriptionsByUserIdsOpts) {
  if (userIds.length === 0) return [];
  return ctx.var.db.select().from(pushSubscriptionsTable).where(inArray(pushSubscriptionsTable.userId, userIds));
}

interface DeleteSubscriptionsByEndpointsOpts {
  endpoints: string[];
}

/** Sender cleanup: the push service said the endpoint is gone (404/410). */
export async function deleteSubscriptionsByEndpoints(ctx: DbContext, { endpoints }: DeleteSubscriptionsByEndpointsOpts): Promise<void> {
  if (endpoints.length === 0) return;
  await ctx.var.db.delete(pushSubscriptionsTable).where(inArray(pushSubscriptionsTable.endpoint, endpoints));
}
