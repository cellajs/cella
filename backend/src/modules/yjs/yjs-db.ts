import { customType, foreignKey, index, primaryKey, snakeCase, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { tenantSelectPolicy, writeThroughPolicies } from '#/db/rls-helpers';
import { tenantIdLength } from '#/db/utils/constraints';
import { organizationsTable } from '#/modules/organization/organization-db';
import { tenantsTable } from '#/modules/tenants/tenants-db';

// Custom bytea type for raw Y.Doc binary storage
const bytea = customType<{ data: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

/**
 * Ephemeral Y.Doc binary storage, one row per document.
 * Created on first WS connect, deleted after last disconnect + grace period.
 * The entity's own table (e.g. tasks in a fork) is the single source of truth for description.
 */
export const yjsDocumentsTable = snakeCase.table(
  'yjs_documents',
  {
    entityType: varchar({ length: 50 }).notNull(),
    entityId: uuid().notNull(),
    tenantId: varchar('tenant_id', { length: tenantIdLength })
      .notNull()
      .references(() => tenantsTable.id),
    organizationId: uuid(),
    state: bytea().notNull(),
    /** Last user whose update the relay saved, for materialization attribution (null = seed-only, no edits). */
    lastEditedBy: uuid(),
    updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.entityType, table.entityId] }),
    index('idx_yjs_docs_tenant').on(table.tenantId),
    index('idx_yjs_docs_org').on(table.organizationId),
    foreignKey({
      columns: [table.tenantId, table.organizationId],
      foreignColumns: [organizationsTable.tenantId, organizationsTable.id],
    }).onDelete('cascade'),
    tenantSelectPolicy('yjs_documents', table),
    ...writeThroughPolicies('yjs_documents'),
  ],
);

export type YjsDocumentModel = typeof yjsDocumentsTable.$inferSelect;
export type InsertYjsDocumentModel = typeof yjsDocumentsTable.$inferInsert;
