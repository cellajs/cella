import { attachmentRelations } from '#/attachment-config';
import { usersTable } from '#/db/schema/users';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';
import { pgTable, varchar } from 'drizzle-orm/pg-core';

export const attachmentsTable = pgTable(
  'attachments',
  {
    createdAt: timestampColumns.createdAt,
    id: varchar().primaryKey().$defaultFn(nanoid),
    name: varchar().notNull().default('attachment'),
    entityType: varchar({ enum: ['attachment'] })
      .notNull()
      .default('attachment'),

    groupId: varchar(),
    filename: varchar().notNull(),
    contentType: varchar().notNull(),
    convertedContentType: varchar(),
    size: varchar().notNull(),
    originalKey: varchar().notNull(),
    convertedKey: varchar(),
    thumbnailKey: varchar(),
    createdBy: varchar().references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    modifiedAt: timestampColumns.modifiedAt,
    modifiedBy: varchar().references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    ...attachmentRelations.columns,
  },
  (table) => [...attachmentRelations.indexes(table)],
);

export type AttachmentModel = typeof attachmentsTable.$inferSelect;
export type InsertAttachmentModel = typeof attachmentsTable.$inferInsert;
