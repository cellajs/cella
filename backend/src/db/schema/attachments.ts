import { boolean, index, pgTable, varchar } from 'drizzle-orm/pg-core';
import { generateContextEntityIdColumns } from '#/db/utils/generate-context-entity-columns';
import { productEntityColumns } from '#/db/utils/product-entity-columns';

const { organizationId, ...otherEntityIdColumns } = generateContextEntityIdColumns();

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
    // Context entity columns
    organizationId: organizationId.notNull(),
    ...otherEntityIdColumns,
  },
  (table) => [index('attachments_organization_id_index').on(table.organizationId)],
);

export type AttachmentModel = typeof attachmentsTable.$inferSelect;
export type InsertAttachmentModel = typeof attachmentsTable.$inferInsert;
