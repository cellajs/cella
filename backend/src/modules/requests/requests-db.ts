import { sql } from 'drizzle-orm';
import { index, snakeCase, text, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { generateId } from 'shared/utils/entity-id';
import { maxLength } from '#/db/utils/constraints';
import { isoTimestamp, timestampColumns } from '#/db/utils/timestamp-columns';

export const requestKinds = ['waitlist', 'info', 'contact'] as const;

/** Waitlist signups, info requests and contact form messages. */
export const requestsTable = snakeCase.table(
  'requests',
  {
    createdAt: timestampColumns.createdAt,
    id: uuid().primaryKey().$defaultFn(generateId),
    message: text(),
    email: varchar({ length: maxLength.field }).notNull(),
    kind: varchar({ enum: requestKinds }).notNull(),
    /** When an invitation first went out to a waitlist request's address; responses carry it as `invited`. */
    invitedAt: isoTimestamp(),
  },
  (table) => [
    index('requests_emails').on(table.email.desc()),
    index('requests_created_at').on(table.createdAt.desc()),
    uniqueIndex('requests_unique_signup_email_kind').on(sql`lower(${table.email})`, table.kind).where(sql`${table.kind} in ('waitlist', 'info')`),
  ],
);

export type RequestModel = typeof requestsTable.$inferSelect;
