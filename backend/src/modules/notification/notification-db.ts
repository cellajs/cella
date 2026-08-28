import { boolean, foreignKey, index, primaryKey, snakeCase, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { appConfig } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { maxLength, tenantIdLength } from '#/db/utils/constraints';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { usersTable } from '#/modules/user/user-db';

/**
 * Notification vocabulary, shared by the table enum, the fan-out and the preference schema.
 *
 * `mention` outranks the activity types when one event would produce both: a mention is addressed
 * to you personally, so it survives a muted channel and defaults to email-on, while ambient
 * activity does neither.
 */
export const notificationTypes = ['mention', 'comment', 'reply'] as const;
export type NotificationType = (typeof notificationTypes)[number];

/** Digest cadence options for `notification_preferences.digest`. */
export const digestFrequencies = ['off', 'daily', 'weekly'] as const;
export type DigestFrequency = (typeof digestFrequencies)[number];

/**
 * Per-recipient inbox rows for mentions and addressed activity, fanned out from the product
 * modules that declare a `notifications` source (see lib/module.ts). Ambient posts stay out:
 * menu-sheet unseen counts already cover them.
 *
 * Partitioned by `created_at` (weekly, 90-day retention) like `seen_by`, so clearing is automatic.
 * Two consequences follow from that and must not be undone: the primary key has to include the
 * partition column, and no other unique constraint may exist. Redelivery is therefore deduped by
 * an `INSERT ... WHERE NOT EXISTS` guard over `(user_id, activity_id, type)`, see `fan-out.ts`.
 * Excluded from CDC: it is per-user state, not synced content.
 */
export const notificationsTable = snakeCase.table(
  'notifications',
  {
    id: uuid().notNull().$defaultFn(generateId),
    createdAt: timestampColumns.createdAt,
    userId: uuid().notNull(),
    /** Who caused the notification; null once the actor is deleted. */
    actorId: uuid(),
    type: varchar({ enum: notificationTypes }).notNull(),
    /** The row the notification is about. */
    entityType: varchar({ enum: appConfig.productEntityTypes }).notNull(),
    subjectId: uuid().notNull(),
    /** Grouping/deep-link context (e.g. the host thread), from the source's `resolveContextId`; equals `subjectId` by default. */
    contextId: uuid(),
    /** Deepest non-null ancestor, org as fallback. Must match `getSeenChannelId` or badges disagree. */
    channelId: uuid().notNull(),
    channelType: varchar({ length: maxLength.field }).notNull(),
    organizationId: uuid().notNull(),
    tenantId: varchar('tenant_id', { length: tenantIdLength }).notNull(),
    /** CDC activity id: the dedupe key for at-least-once delivery. */
    activityId: varchar({ length: 64 }).notNull(),
    readAt: timestamp({ mode: 'string' }),
    /** Set when an instant email went out, so the digest can skip it. */
    emailedAt: timestamp({ mode: 'string' }),
    digestedAt: timestamp({ mode: 'string' }),
  },
  (table) => [
    // Composite PK required for partitioning by created_at.
    primaryKey({ columns: [table.id, table.createdAt] }),
    // Non-unique on purpose: partitioning forbids a unique arbiter, so this only serves the
    // NOT EXISTS dedupe guard.
    index('notifications_user_activity_index').on(table.userId, table.activityId, table.type),
    index('notifications_user_unread_index').on(table.userId, table.readAt),
    index('notifications_user_created_index').on(table.userId, table.createdAt.desc()),
    index('notifications_subject_index').on(table.subjectId),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [usersTable.id],
    }).onDelete('cascade'),
  ],
);

/**
 * Per-user delivery preferences. Deliberately NOT partitioned: `lastDigestAt` is mutable state
 * whose loss would silently reset everyone's digest cadence. Kept out of the users table because
 * `userFlags` is boolean-only and the digest cadence is not.
 */
export const notificationPreferencesTable = snakeCase.table('notification_preferences', {
  userId: uuid()
    .primaryKey()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  /** In-app delivery is never opt-out; only email is. */
  mentionEmail: boolean().notNull().default(true),
  commentEmail: boolean().notNull().default(false),
  digest: varchar({ enum: digestFrequencies }).notNull().default('weekly'),
  /** Start of the next digest window. Null means "never digested", handled as the first run. */
  lastDigestAt: timestamp({ mode: 'string' }),
  updatedAt: timestampColumns.updatedAt,
});

export type NotificationModel = typeof notificationsTable.$inferSelect;
export type InsertNotificationModel = typeof notificationsTable.$inferInsert;
export type NotificationPreferencesModel = typeof notificationPreferencesTable.$inferSelect;
