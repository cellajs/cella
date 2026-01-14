import { boolean, pgTable, varchar } from 'drizzle-orm/pg-core';
import { attachmentEntityColumns, attachmentEntityIndexes } from '#/attachment-config';
import { productEntityColumns } from '#/db/utils/product-entity-columns';

/**
 * Attachments table to store file metadata and relations.
 */
export const attachmentsTable = pgTable(
  'attachments',
  {
    ...productEntityColumns('attachment'),
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
    ...attachmentEntityColumns,
  },
  (table) => [...attachmentEntityIndexes(table)],
);

export type AttachmentModel = typeof attachmentsTable.$inferSelect;
export type InsertAttachmentModel = typeof attachmentsTable.$inferInsert;
