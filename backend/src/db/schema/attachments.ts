import { pgTable, varchar } from 'drizzle-orm/pg-core';
import { nanoid } from '#/utils/nanoid';
import { attachmentRelationsColumns } from '../attachments-schema-config';
import { timestampsColumn } from '../utils/timestamp-columns';
import { usersTable } from './users';

export const attachmentsTable = pgTable('attachments', {
  id: varchar().primaryKey().$defaultFn(nanoid),
  name: varchar().notNull().default('attachment'),
  filename: varchar().notNull(),
  contentType: varchar().notNull(),
  size: varchar().notNull(),
  entity: varchar({ enum: ['attachment'] })
    .notNull()
    .default('attachment'),
  url: varchar().notNull(),
  createdAt: timestampsColumn.createdAt,
  createdBy: varchar().references(() => usersTable.id, {
    onDelete: 'set null',
  }),
  modifiedAt: timestampsColumn.baseString,
  modifiedBy: varchar().references(() => usersTable.id, {
    onDelete: 'set null',
  }),
  ...attachmentRelationsColumns,
});

export type AttachmentModel = typeof attachmentsTable.$inferSelect;
export type InsertAttachmentModel = typeof attachmentsTable.$inferInsert;
