import { sql } from 'drizzle-orm';
import { boolean, foreignKey, index, pgPolicy, pgTable, varchar } from 'drizzle-orm/pg-core';
import { isAuthenticated, membershipExists, tenantMatch } from '#/db/rls-helpers';
import { organizationsTable } from '#/db/schema/organizations';
import { tenantsTable } from '#/db/schema/tenants';
import { generateContextEntityIdColumns } from '#/db/utils/generate-context-entity-columns';
import { productEntityColumns } from '#/db/utils/product-entity-columns';
import { txColumns } from '#/db/utils/tx-columns';

const { organizationId, ...otherEntityIdColumns } = generateContextEntityIdColumns('relatable');

/**
 * Attachments table to store file metadata and relations.
 * Each attachment belongs to exactly one tenant and organization (RLS isolation boundary).
 */
export const attachmentsTable = pgTable(
  'attachments',
  {
    ...productEntityColumns('attachment'),
    // Tenant isolation
    tenantId: varchar('tenant_id', { length: 24 })
      .notNull()
      .references(() => tenantsTable.id),
    // Sync: transient transaction metadata
    ...txColumns,
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
  (table) => [
    index('attachments_organization_id_index').on(table.organizationId),
    index('attachments_tenant_id_index').on(table.tenantId),
    // Composite FK to organization (prevents franken-rows)
    foreignKey({
      columns: [table.tenantId, table.organizationId],
      foreignColumns: [organizationsTable.tenantId, organizationsTable.id],
    }).onDelete('cascade'),

    // RLS Policies: Membership-verified for all operations
    // SELECT: Requires authenticated + membership in organization
    pgPolicy('attachments_select_policy', {
      for: 'select',
      using: sql`${tenantMatch(table)} AND ${isAuthenticated} AND ${membershipExists(table)}`,
    }),
    // INSERT: Requires membership in target organization
    pgPolicy('attachments_insert_policy', {
      for: 'insert',
      withCheck: sql`${tenantMatch(table)} AND ${isAuthenticated} AND ${membershipExists(table)}`,
    }),
    // UPDATE: Requires membership on both old and new row values
    pgPolicy('attachments_update_policy', {
      for: 'update',
      using: sql`${tenantMatch(table)} AND ${isAuthenticated} AND ${membershipExists(table)}`,
      withCheck: sql`${tenantMatch(table)} AND ${isAuthenticated} AND ${membershipExists(table)}`,
    }),
    // DELETE: Requires membership
    pgPolicy('attachments_delete_policy', {
      for: 'delete',
      using: sql`${tenantMatch(table)} AND ${isAuthenticated} AND ${membershipExists(table)}`,
    }),
  ],
);

export type AttachmentModel = typeof attachmentsTable.$inferSelect;
export type InsertAttachmentModel = typeof attachmentsTable.$inferInsert;
