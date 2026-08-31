import { and, eq, inArray } from 'drizzle-orm';
import { baseDb } from '#/db/db';
import { pushSubscriptionsTable } from './push-subscription-db';

export interface PushSubscriptionInput {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  expirationTime: string | null;
  userAgent: string | null;
}

/**
 * Upsert by the unique endpoint. A rotated or re-registered subscription reclaims its row even
 * when the browser profile changed users, so the previous user stops receiving pushes for it.
 */
export async function upsertPushSubscription(input: PushSubscriptionInput) {
  const [row] = await baseDb
    .insert(pushSubscriptionsTable)
    .values({ ...input, lastSeenAt: new Date().toISOString() })
    .onConflictDoUpdate({
      target: pushSubscriptionsTable.endpoint,
      set: {
        userId: input.userId,
        p256dh: input.p256dh,
        auth: input.auth,
        expirationTime: input.expirationTime,
        userAgent: input.userAgent,
        lastSeenAt: new Date().toISOString(),
      },
    })
    .returning({ id: pushSubscriptionsTable.id, endpoint: pushSubscriptionsTable.endpoint });
  return row;
}

/** Scoped to the caller: an endpoint owned by another user is a silent no-op. */
export async function deletePushSubscription(userId: string, endpoint: string): Promise<number> {
  const deleted = await baseDb
    .delete(pushSubscriptionsTable)
    .where(and(eq(pushSubscriptionsTable.endpoint, endpoint), eq(pushSubscriptionsTable.userId, userId)))
    .returning({ id: pushSubscriptionsTable.id });
  return deleted.length;
}

export async function findSubscriptionsByUserIds(userIds: string[]) {
  if (userIds.length === 0) return [];
  return baseDb.select().from(pushSubscriptionsTable).where(inArray(pushSubscriptionsTable.userId, userIds));
}

/** Sender cleanup: the push service said the endpoint is gone (404/410). */
export async function deleteSubscriptionsByEndpoints(endpoints: string[]): Promise<void> {
  if (endpoints.length === 0) return;
  await baseDb.delete(pushSubscriptionsTable).where(inArray(pushSubscriptionsTable.endpoint, endpoints));
}
