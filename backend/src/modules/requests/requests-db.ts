import { index, snakeCase, uuid, varchar } from 'drizzle-orm/pg-core';
import { generateId } from 'shared/utils/entity-id';
import { maxLength } from '#/db/utils/constraints';
import { timestampColumns } from '#/db/utils/timestamp-columns';

export const requestTypeEnum = ['waitlist', 'newsletter', 'contact'] as const;

/** Waitlist signups, newsletter subscriptions, and contact form messages. */
export const requestsTable = snakeCase.table(
  'requests',
  {
    createdAt: timestampColumns.createdAt,
    id: uuid().primaryKey().$defaultFn(generateId),
    message: varchar({ length: maxLength.field }),
    email: varchar({ length: maxLength.field }).notNull(),
    type: varchar({ enum: requestTypeEnum }).notNull(),
    tokenId: uuid(), // References tokens.id logically (no FK due to partitioning)
  },
  (table) => [index('requests_emails').on(table.email.desc()), index('requests_created_at').on(table.createdAt.desc())],
);

export type RequestModel = typeof requestsTable.$inferSelect;
export type InsertRequestModel = typeof requestsTable.$inferInsert;
