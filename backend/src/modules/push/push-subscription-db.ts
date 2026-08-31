import { index, snakeCase, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { generateId } from 'shared/utils/entity-id';
import { maxLength } from '#/db/utils/constraints';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { usersTable } from '#/modules/user/user-db';

/**
 * Web Push subscriptions, one row per (user, browser installation). Per-user, not tenant-scoped:
 * read on baseDb without RLS (grants only) and excluded from CDC, like
 * `notification_preferences`. The unique `endpoint` dedupes re-subscribes; the sender deletes
 * rows on 404/410, and `pushsubscriptionchange` re-registers rotated endpoints.
 */
export const pushSubscriptionsTable = snakeCase.table(
  'push_subscriptions',
  {
    id: uuid().primaryKey().$defaultFn(generateId),
    userId: uuid()
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    /** Push service URL; globally unique per subscription, the natural upsert key. */
    endpoint: text().notNull().unique(),
    /** Client public key (`getKey('p256dh')`), base64url. */
    p256dh: text().notNull(),
    /** Auth secret (`getKey('auth')`), base64url. */
    auth: text().notNull(),
    /** Browser-reported expiry; null means no fixed expiry (the common case). */
    expirationTime: timestamp({ mode: 'string' }),
    /** Coarse device hint for the user's own subscription list; never parsed. */
    userAgent: varchar({ length: maxLength.field }),
    createdAt: timestampColumns.createdAt,
    /** Bumped on re-subscribe, so stale rows are identifiable if pruning ever needs it. */
    lastSeenAt: timestamp({ mode: 'string' }),
  },
  (table) => [index('push_subscriptions_user_index').on(table.userId)],
);

export type PushSubscriptionModel = typeof pushSubscriptionsTable.$inferSelect;
