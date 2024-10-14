import { index, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';

export const sessionsTable = pgTable(
  'sessions',
  {
    id: varchar('id').primaryKey(),
    userId: varchar('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    deviceName: varchar('device_name'),
    deviceType: varchar('device_type', { enum: ['desktop', 'mobile'] })
      .notNull()
      .default('desktop'),
    deviceOs: varchar('device_os'),
    browser: varchar('browser'),
    authStrategy: varchar('auth_strategy', {
      enum: ['github', 'google', 'microsoft', 'password', 'passkey'],
    }),
    type: varchar('type', {
      enum: ['regular', 'impersonation'],
    })
      .notNull()
      .default('regular'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    adminUserId: varchar('admin_user_id').references(() => usersTable.id, { onDelete: 'cascade' }),
  },
  (table) => {
    return {
      adminUserIdIndex: index('idx_admin_id').on(table.adminUserId),
    };
  },
);

export type SessionModel = typeof sessionsTable.$inferSelect;
export type InsertSessionModel = typeof sessionsTable.$inferInsert;
