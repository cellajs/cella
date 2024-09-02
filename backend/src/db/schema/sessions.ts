import { index, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';

export const sessionsTable = pgTable(
  'sessions',
  {
    id: varchar('id').primaryKey(),
    userId: varchar('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    type: varchar('type').notNull().default('regular'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    adminUserId: varchar('admin_user_id').references(() => usersTable.id, { onDelete: 'cascade' }),
  },
  (table) => {
    return {
      adminUserIdIdx: index('idx_admin_id').on(table.adminUserId),
    };
  },
);
