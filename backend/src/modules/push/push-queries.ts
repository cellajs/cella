import { and, eq, inArray, or } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import { pushSubscriptionsTable } from '#/modules/push/push-subscription-db';
import { getIsoDate } from '#/utils/iso-date';

interface PushSubscriptionInput {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
}

/**
 * Upsert by the unique endpoint. The user's own endpoint takes the posted keys. Another user's endpoint moves to the
 * caller only with its stored auth secret, which the browser holding the subscription hands out and the server never
 * does: a browser profile that changed users stops pushing to its previous user, and an endpoint learned alone takes
 * nothing over. A new device is never refused: the nightly retention run trims a user's rows to
 * `maxPushSubscriptionsPerUser`.
 * @returns The stored row, or null when the endpoint stays with another user.
 */
export async function upsertPushSubscription(ctx: DbContext, { values }: { values: PushSubscriptionInput }) {
  const lastSeenAt = getIsoDate();
  const [row] = await ctx.var.db
    .insert(pushSubscriptionsTable)
    .values({ ...values, lastSeenAt })
    .onConflictDoUpdate({
      target: pushSubscriptionsTable.endpoint,
      set: { ...values, lastSeenAt },
      setWhere: or(eq(pushSubscriptionsTable.userId, values.userId), eq(pushSubscriptionsTable.auth, values.auth)),
    })
    .returning({ id: pushSubscriptionsTable.id, endpoint: pushSubscriptionsTable.endpoint });
  return row ?? null;
}

/** Scoped to the caller: an endpoint another user registered deletes nothing. */
export async function deletePushSubscription(ctx: DbContext, { userId, endpoint }: { userId: string; endpoint: string }): Promise<number> {
  const deleted = await ctx.var.db
    .delete(pushSubscriptionsTable)
    .where(and(eq(pushSubscriptionsTable.endpoint, endpoint), eq(pushSubscriptionsTable.userId, userId)))
    .returning({ id: pushSubscriptionsTable.id });
  return deleted.length;
}

/** Every subscription of these users, one per browser installation. */
export async function findSubscriptionsByUserIds(ctx: DbContext, { userIds }: { userIds: string[] }) {
  if (userIds.length === 0) return [];
  return ctx.var.db.select().from(pushSubscriptionsTable).where(inArray(pushSubscriptionsTable.userId, userIds));
}

/** Sender cleanup: the push service said the endpoint is gone (404/410). */
export async function deleteSubscriptionsByEndpoints(ctx: DbContext, { endpoints }: { endpoints: string[] }): Promise<void> {
  if (endpoints.length === 0) return;
  await ctx.var.db.delete(pushSubscriptionsTable).where(inArray(pushSubscriptionsTable.endpoint, endpoints));
}
