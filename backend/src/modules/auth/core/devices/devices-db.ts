import { index, primaryKey, snakeCase, uuid, varchar } from 'drizzle-orm/pg-core';
import type { UserId } from '#/db/utils/ids';
import { isoTimestamp, timestampColumns } from '#/db/utils/timestamp-columns';
import { usersTable } from '#/modules/user/user-db';

/**
 * Browsers a user has signed in from, one row per (user, device id hash). Sessions live a week, so this is the only memory of
 * which browsers are familiar; a first insert is what makes a sign-in "new". The device id itself lives only in the browser's
 * cookie: the hash is a per-user HMAC, so one shared browser gives two users unrelated rows. What the browser looked like
 * at a sign-in (user agent, country, strategy) is the session row's snapshot and is not repeated here.
 */
export const devicesTable = snakeCase.table(
  'devices',
  {
    userId: uuid()
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' })
      .$type<UserId>(),
    deviceIdHash: varchar({ length: 64 }).notNull(),
    /** The first sign-in from this browser. */
    createdAt: timestampColumns.createdAt,
    lastSignInAt: isoTimestamp().notNull(),
    /** When the last new sign-in mail for this row went out; the per-user daily budget counts these. */
    mailedAt: isoTimestamp(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.deviceIdHash] }),
    index('devices_user_id_mailed_at_idx').on(table.userId, table.mailedAt),
    index('devices_last_sign_in_at_idx').on(table.lastSignInAt),
  ],
);
