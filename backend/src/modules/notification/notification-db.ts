import type { z } from '@hono/zod-openapi';
import { boolean, foreignKey, index, primaryKey, snakeCase, uuid, varchar } from 'drizzle-orm/pg-core';
import { appConfig } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { maxLength, tenantIdLength } from '#/db/utils/constraints';
import type { UserId } from '#/db/utils/ids';
import { isoTimestamp, isoTimestampWithoutZone, timestampColumns } from '#/db/utils/timestamp-columns';
import type { preferencesSchema } from '#/modules/notification/notification-schema';
import { notificationTypes } from '#/modules/notification/notification-types';
import { usersTable } from '#/modules/user/user-db';

/** Digest cadence options for `notification_preferences.digest`. */
export const digestFrequencies = ['off', 'daily', 'weekly'] as const;
export type DigestFrequency = (typeof digestFrequencies)[number];

/** The preferences of a user without a row, and the column defaults: every reader answers a missing row with these. */
export const defaultPreferences = { mentionEmail: true, commentEmail: false, digest: 'weekly' } as const satisfies z.infer<typeof preferencesSchema>;

/**
 * Per-recipient inbox rows for mentions and addressed activity, fanned out from the product
 * modules that declare a `notifications` source (see lib/module.ts). Ambient posts stay out:
 * menu-sheet unseen counts already cover them.
 *
 * Partitioned by `created_at` (weekly, kept `retention.activityDays`) like `seen_by`, so clearing is automatic. Two
 * consequences follow from that and must not be undone: the primary key has to include the partition column, and no
 * other unique constraint may exist. A user is therefore told of a subject once by an `INSERT ... WHERE NOT EXISTS`
 * guard over `(user_id, subject_id)` in `insertNotificationsIgnoringDuplicates`. Excluded from CDC: it is per-user
 * state, not synced content.
 */
export const notificationsTable = snakeCase.table(
  'notifications',
  {
    id: uuid().notNull().$defaultFn(generateId),
    createdAt: isoTimestampWithoutZone().defaultNow().notNull(),
    userId: uuid().notNull(),
    /** Who caused the notification: the event's user, else the row's creator; null when neither is known. */
    actorId: uuid(),
    type: varchar({ enum: notificationTypes }).notNull(),
    /** Product type of the row the notification is about (`subjectId`). */
    entityType: varchar({ enum: appConfig.productEntityTypes }).notNull(),
    subjectId: uuid().notNull(),
    /** Grouping/deep-link context (e.g. the host thread), from the source's `resolveContextId`; equals `subjectId` by default. */
    contextId: uuid(),
    /** The subject's home channel (`homeChannelOf`): the channel its seen count keys on, so badges and inbox agree. */
    channelId: uuid().notNull(),
    channelType: varchar({ length: maxLength.field, enum: appConfig.channelEntityTypes }).notNull(),
    organizationId: uuid().notNull(),
    tenantId: varchar({ length: tenantIdLength }).notNull(),
    /** The CDC activity of the write that told the user. */
    activityId: varchar({ length: 64 }).notNull(),
    readAt: isoTimestamp(),
    /** Set once the row's instant mail went out, and on every seeded row; the digest skips it. */
    emailedAt: isoTimestamp(),
  },
  (table) => [
    primaryKey({ columns: [table.id, table.createdAt] }),
    index('notifications_user_unread_index').on(table.userId, table.readAt),
    index('notifications_user_created_index').on(table.userId, table.createdAt.desc()),
    index('notifications_subject_index').on(table.subjectId),
    foreignKey({ columns: [table.userId], foreignColumns: [usersTable.id] }).onDelete('cascade'),
  ],
);

/**
 * Per-user delivery preferences. Deliberately NOT partitioned: `lastDigestAt` is mutable state
 * whose loss would reset everyone's digest cadence. Kept out of the users table because
 * `userFlags` is boolean-only and the digest cadence is not.
 */
export const notificationPreferencesTable = snakeCase.table('notification_preferences', {
  userId: uuid()
    .primaryKey()
    .references(() => usersTable.id, { onDelete: 'cascade' })
    .$type<UserId>(),
  /** In-app delivery is never opt-out; only email is. */
  mentionEmail: boolean().notNull().default(defaultPreferences.mentionEmail),
  commentEmail: boolean().notNull().default(defaultPreferences.commentEmail),
  digest: varchar({ enum: digestFrequencies }).notNull().default(defaultPreferences.digest),
  /** Start of the next digest window. Null means "never digested", handled as the first run. */
  lastDigestAt: isoTimestamp(),
  updatedAt: timestampColumns.updatedAt,
});

export type NotificationModel = typeof notificationsTable.$inferSelect;
export type InsertNotificationModel = typeof notificationsTable.$inferInsert;
export type NotificationPreferencesModel = typeof notificationPreferencesTable.$inferSelect;
