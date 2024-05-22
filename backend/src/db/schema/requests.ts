import { index, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { nanoid } from '../../lib/nanoid';
import { organizationsTable } from './organizations';
import { usersTable } from './users';

const requestTypeEnum = ['ORGANIZATION_REQUEST', 'SYSTEM_REQUEST', 'NEWSLETTER_REQUEST', 'CONTACT_REQUEST'] as const;

export const requestsTable = pgTable(
  'requests',
  {
    id: varchar('id').primaryKey().$defaultFn(nanoid),
    user_id: varchar('user_id').references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    organization_id: varchar('organization_id').references(() => organizationsTable.id, {
      onDelete: 'set null',
    }),
    accompanyingMessage: varchar('accompanying_message'),
    email: varchar('email').notNull(),
    type: varchar('type', { enum: requestTypeEnum }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => {
    return {
      emailIndex: index('requests_emails').on(table.email).desc(),
      createdAtIndex: index('requests_created_at').on(table.createdAt).desc(),
    };
  },
);

export type actionRequestsModel = typeof requestsTable.$inferSelect;
export type InsertactionRequestsModel = typeof requestsTable.$inferInsert;
