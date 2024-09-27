import { index, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { nanoid } from '#/utils/nanoid';

const requestTypeEnum = ['waitlist', 'newsletter', 'contact'] as const;
export type RequestType = (typeof requestTypeEnum)[number];

export const requestsTable = pgTable(
  'requests',
  {
    id: varchar('id').primaryKey().$defaultFn(nanoid),
    message: varchar('message'),
    email: varchar('email').notNull(),
    type: varchar('type', { enum: requestTypeEnum }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => {
    return {
      emailIndex: index('requests_emails').on(table.email.desc()),
      createdAtIndex: index('requests_created_at').on(table.createdAt.desc()),
    };
  },
);

export type RequestsModel = typeof requestsTable.$inferSelect;
export type InsertRequestModel = typeof requestsTable.$inferInsert;
