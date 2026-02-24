import { boolean, foreignKey, index, pgTable, varchar } from 'drizzle-orm/pg-core';
import { orgScopedCrudPolicies } from '#/db/rls-helpers';
import { organizationsTable } from '#/db/schema/organizations';
import { maxLength } from '#/db/utils/constraints';
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
    bucketName: varchar({ length: maxLength.field }).notNull(),
    groupId: varchar({ length: maxLength.id }),
    filename: varchar({ length: maxLength.field }).notNull(),
    contentType: varchar({ length: maxLength.field }).notNull(),
    convertedContentType: varchar({ length: maxLength.field }),
    size: varchar({ length: maxLength.field }).notNull(),
    originalKey: varchar({ length: maxLength.url }).notNull(),
    convertedKey: varchar({ length: maxLength.url }),
    thumbnailKey: varchar({ length: maxLength.url }),
    organizationId: varchar({ length: maxLength.id })
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
    ...orgScopedCrudPolicies('attachments', table),
  ],
);

export type AttachmentModel = typeof attachmentsTable.$inferSelect;
export type InsertAttachmentModel = typeof attachmentsTable.$inferInsert;
