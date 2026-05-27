import { customType, foreignKey, index, primaryKey, snakeCase, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { tenantSelectPolicy, writeThroughPolicies } from '#/db/rls-helpers';
import { organizationsTable } from '#/db/schema/organizations';
import { tenantsTable } from '#/db/schema/tenants';
import { tenantIdLength } from '#/db/utils/constraints';

// Custom bytea type for raw Y.Doc binary storage
const bytea = customType<{ data: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

/**
 * Ephemeral Y.Doc binary storage — one row per document.
 * Created on first WS connect, deleted after last disconnect + grace period.
 * Entity table (tasks/pages) is the single source of truth for description.
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
