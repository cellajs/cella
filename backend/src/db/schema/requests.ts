import { index, pgTable, varchar } from 'drizzle-orm/pg-core';
import { tokensTable } from '#/db/schema/tokens';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';

const requestTypeEnum = ['waitlist', 'newsletter', 'contact'] as const;

export const requestsTable = pgTable(
  'requests',
  {
    id: varchar().primaryKey().$defaultFn(nanoid),
    message: varchar(),
    email: varchar().notNull(),
    type: varchar({ enum: requestTypeEnum }).notNull(),
    tokenId: varchar().references(() => tokensTable.id, { onDelete: 'cascade' }),
    createdAt: timestampColumns.createdAt,
  },
  (table) => [index('requests_emails').on(table.email.desc()), index('requests_created_at').on(table.createdAt.desc())],
);

export type RequestModel = typeof requestsTable.$inferSelect;
export type InsertRequestModel = typeof requestsTable.$inferInsert;
