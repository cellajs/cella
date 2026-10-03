import { sql } from 'drizzle-orm';
import { index, snakeCase, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
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
    // The invitation token sent for this request, by its id: no foreign key, since the id outlives the swept or spent
    // token and keeps marking the request as invited (`wasInvited`).
    tokenId: uuid(),
  },
  (table) => [
    index('requests_emails').on(table.email.desc()),
    index('requests_created_at').on(table.createdAt.desc()),
    uniqueIndex('requests_unique_signup_email_type')
      .on(sql`lower(${table.email})`, table.type)
      .where(sql`${table.type} in ('waitlist', 'newsletter')`),
  ],
);

export type RequestModel = typeof requestsTable.$inferSelect;
export type InsertRequestModel = typeof requestsTable.$inferInsert;
