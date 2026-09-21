import { index, primaryKey, snakeCase, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { maxLength } from '#/db/utils/constraints';
import { authStrategiesEnum } from '#/modules/auth/sessions-db';
import { usersTable } from '#/modules/user/user-db';

/**
 * Browsers a user has signed in from, one row per (user, device id hash). Sessions live a week, so this is the only memory of
 * which browsers are familiar; a first insert is what makes a sign-in "new". The device id itself lives only in the browser's
 * cookie: the hash is a per-user HMAC, so one shared browser gives two users unrelated rows. No IP data is kept here.
 */
export const devicesTable = snakeCase.table(
  'devices',
  {
    userId: uuid()
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    deviceIdHash: varchar({ length: 64 }).notNull(),
    firstSeenAt: timestamp({ mode: 'string' }).notNull(),
    lastSeenAt: timestamp({ mode: 'string' }).notNull(),
    // Set when a new sign-in notice went out for this row; the per-user daily budget counts these.
    notifiedAt: timestamp({ mode: 'string' }),
    lastStrategy: varchar({ enum: authStrategiesEnum }).notNull(),
    deviceName: varchar({ length: maxLength.field }),
    deviceType: varchar({ enum: ['desktop', 'mobile'] })
      .notNull()
      .default('desktop'),
    deviceOs: varchar({ length: maxLength.field }),
    browser: varchar({ length: maxLength.field }),
    ipCountry: varchar({ length: 2 }),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.deviceIdHash] }),
    index('devices_user_id_notified_at_idx').on(table.userId, table.notifiedAt),
    index('devices_last_seen_at_idx').on(table.lastSeenAt),
  ],
);

export type DeviceModel = typeof devicesTable.$inferSelect;
