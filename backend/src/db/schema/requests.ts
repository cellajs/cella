import { index, pgTable, varchar } from 'drizzle-orm/pg-core';
import { nanoid } from '#/utils/nanoid';
import { timestampsColumn } from '../utils';
import { tokensTable } from './tokens';

const requestTypeEnum = ['waitlist', 'newsletter', 'contact'] as const;

export const requestsTable = pgTable(
  'requests',
  {
    id: varchar().primaryKey().$defaultFn(nanoid),
    message: varchar(),
    email: varchar().notNull(),
    type: varchar({ enum: requestTypeEnum }).notNull(),
    tokenId: varchar().references(() => tokensTable.id, { onDelete: 'cascade' }),
    createdAt: timestampsColumn.createdAt,
  },
  (table) => [index('requests_emails').on(table.email.desc()), index('requests_created_at').on(table.createdAt.desc())],
);

export type RequestModel = typeof requestsTable.$inferSelect;
export type InsertRequestModel = typeof requestsTable.$inferInsert;
