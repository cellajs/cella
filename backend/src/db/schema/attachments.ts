import { boolean, pgTable, varchar } from 'drizzle-orm/pg-core';
import { attachmentEntityColumns, attachmentEntityIndexes } from '#/attachment-config';
import { usersTable } from '#/db/schema/users';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';

/**
 * Attachments table to store file metadata and relations.
 */
export const attachmentsTable = pgTable(
  'attachments',
  {
    // Base columns
    createdAt: timestampColumns.createdAt,
    id: varchar().primaryKey().$defaultFn(nanoid),
    entityType: varchar({ enum: ['attachment'] })
      .notNull()
      .default('attachment'),
    name: varchar().notNull().default('New attachment'),
    description: varchar(),
    //TODO add keywords column?
    // Specific columns
    public: boolean().notNull().default(false),
    bucketName: varchar().notNull(),
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
    ...attachmentEntityColumns,
  },
  (table) => [...attachmentEntityIndexes(table)],
);

export type AttachmentModel = typeof attachmentsTable.$inferSelect;
export type InsertAttachmentModel = typeof attachmentsTable.$inferInsert;
