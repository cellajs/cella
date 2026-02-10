import { sql } from 'drizzle-orm';
import { boolean, foreignKey, index, pgPolicy, pgTable, varchar } from 'drizzle-orm/pg-core';
import { isAuthenticated, membershipExists, tenantMatch } from '#/db/rls-helpers';
import { organizationsTable } from '#/db/schema/organizations';
import { generateContextEntityIdColumns } from '#/db/utils/generate-context-entity-columns';
import { productEntityColumns } from '#/db/utils/product-entity-columns';

const { organizationId, ...otherEntityIdColumns } = generateContextEntityIdColumns('relatable');

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
    organizationId: organizationId.notNull(),
    ...otherEntityIdColumns,
  },
  (table) => [
    index('attachments_organization_id_index').on(table.organizationId),
    index('attachments_tenant_id_index').on(table.tenantId),
    foreignKey({
      columns: [table.tenantId, table.organizationId],
      foreignColumns: [organizationsTable.tenantId, organizationsTable.id],
    }).onDelete('cascade'),
    pgPolicy('attachments_select_policy', {
      for: 'select',
      using: sql`${tenantMatch(table)} AND ${isAuthenticated} AND ${membershipExists(table)}`,
    }),
    pgPolicy('attachments_insert_policy', {
      for: 'insert',
      withCheck: sql`${tenantMatch(table)} AND ${isAuthenticated} AND ${membershipExists(table)}`,
    }),
    pgPolicy('attachments_update_policy', {
      for: 'update',
      using: sql`${tenantMatch(table)} AND ${isAuthenticated} AND ${membershipExists(table)}`,
      withCheck: sql`${tenantMatch(table)} AND ${isAuthenticated} AND ${membershipExists(table)}`,
    }),
    pgPolicy('attachments_delete_policy', {
      for: 'delete',
      using: sql`${tenantMatch(table)} AND ${isAuthenticated} AND ${membershipExists(table)}`,
    }),
  ],
);

export type AttachmentModel = typeof attachmentsTable.$inferSelect;
export type InsertAttachmentModel = typeof attachmentsTable.$inferInsert;
