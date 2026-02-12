import { boolean, foreignKey, index, pgTable, varchar } from 'drizzle-orm/pg-core';
import { membershipCrudPolicies } from '#/db/rls-helpers';
import { organizationsTable } from '#/db/schema/organizations';
import { productEntityColumns } from '#/db/utils/product-entity-columns';

/**
 * Attachments table to store file metadata and relations.
 * Each attachment belongs to exactly one tenant and organization (RLS isolation boundary).
 */
export const attachmentsTable = pgTable(
  'attachments',
  {
    ...productEntityColumns('attachment'),
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
    organizationId: varchar()
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('attachments_organization_id_index').on(table.organizationId),
    index('attachments_tenant_id_index').on(table.tenantId),
    foreignKey({
      columns: [table.tenantId, table.organizationId],
      foreignColumns: [organizationsTable.tenantId, organizationsTable.id],
    }).onDelete('cascade'),
    ...membershipCrudPolicies('attachments', table),
  ],
);

export type AttachmentModel = typeof attachmentsTable.$inferSelect;
export type InsertAttachmentModel = typeof attachmentsTable.$inferInsert;
