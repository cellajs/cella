import { pgTable, varchar } from 'drizzle-orm/pg-core';
import { nanoid } from '#/utils/nanoid';
import { attachmentRelations } from '../../attachments-config';
import { timestampsColumn } from '../utils/timestamp-columns';
import { usersTable } from './users';

export const attachmentsTable = pgTable(
  'attachments',
  {
    id: varchar().primaryKey().$defaultFn(nanoid),
    groupId: varchar(),
    name: varchar().notNull().default('attachment'),
    filename: varchar().notNull(),
    contentType: varchar().notNull(),
    convertedContentType: varchar(),
    size: varchar().notNull(),
    entity: varchar({ enum: ['attachment'] })
      .notNull()
      .default('attachment'),
    originalKey: varchar().notNull(),
    convertedKey: varchar(),
    thumbnailKey: varchar(),
    createdAt: timestampsColumn.createdAt,
    createdBy: varchar().references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    modifiedAt: timestampsColumn.modifiedAt,
    modifiedBy: varchar().references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    ...attachmentRelations.columns,
  },
  (table) => [...attachmentRelations.indexes(table)],
);

export type AttachmentModel = typeof attachmentsTable.$inferSelect;
export type InsertAttachmentModel = typeof attachmentsTable.$inferInsert;
