import { index, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { nanoid } from '../../lib/nanoid';
import { usersTable } from './users';
import { organizationsTable } from './organizations';

const requestTypeEnum = ['ORGANIZATION_REQUEST', 'SYSTEM_REQUEST'] as const;

export const accessRequestsTable = pgTable(
  'access_requests',
  {
    id: varchar('id').primaryKey().$defaultFn(nanoid),
    user_id: varchar('user_id').references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    organization_id: varchar('organization_id').references(() => organizationsTable.id, {
      onDelete: 'set null',
    }),
    email: varchar('email').notNull(),
    type: varchar('type', { enum: requestTypeEnum }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => {
    return {
      emailIndex: index('access_requests_email_index').on(table.email).desc(),
      createdAtIndex: index('access_requests_created_at_index').on(table.createdAt).desc(),
    };
  },
);

export type accessRequestsModel = typeof accessRequestsTable.$inferSelect;
export type InsertAccessRequestsModel = typeof accessRequestsTable.$inferInsert;
