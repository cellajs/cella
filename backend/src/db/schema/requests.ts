import { index, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { nanoid } from '#/utils/nanoid';

const requestTypeEnum = ['waitlist', 'newsletter', 'contact'] as const;
export type RequestType = (typeof requestTypeEnum)[number];

export const requestsTable = pgTable(
  'requests',
  {
    id: varchar().primaryKey().$defaultFn(nanoid),
    message: varchar(),
    email: varchar().notNull(),
    type: varchar({ enum: requestTypeEnum }).notNull(),
    createdAt: timestamp().defaultNow().notNull(),
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
