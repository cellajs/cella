import { index, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';

export const sessionsTable = pgTable(
  'sessions',
  {
    id: varchar().primaryKey(),
    userId: varchar()
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    deviceName: varchar(),
    deviceType: varchar({ enum: ['desktop', 'mobile'] })
      .notNull()
      .default('desktop'),
    deviceOs: varchar(),
    browser: varchar(),
    authStrategy: varchar({
      enum: ['github', 'google', 'microsoft', 'password', 'passkey'],
    }),
    type: varchar({
      enum: ['regular', 'impersonation'],
    })
      .notNull()
      .default('regular'),
    createdAt: timestamp().defaultNow().notNull(),
    expiresAt: timestamp({ withTimezone: true, mode: 'date' }).notNull(),
    adminUserId: varchar().references(() => usersTable.id, { onDelete: 'cascade' }),
  },
  (table) => {
    return {
      adminUserIdIndex: index('idx_admin_id').on(table.adminUserId),
    };
  },
);

export type SessionModel = typeof sessionsTable.$inferSelect;
export type InsertSessionModel = typeof sessionsTable.$inferInsert;
