import { bigint, customType, index, primaryKey, snakeCase, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { tenantSelectPolicy, writeThroughPolicies } from '#/db/rls-helpers';
import { tenantIdLength } from '#/db/utils/constraints';
import { organizationForeignKey } from '#/db/utils/organization-foreign-key';
import { tenantsTable } from '#/modules/tenants/tenants-db';

// Custom bytea type for raw Y.Doc binary storage
const bytea = customType<{ data: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

/**
 * Compacted base state, one row per document: seeded from the entity's description on the first WS connect and kept
 * across sessions, so a client's surviving document shares its history. Updates land in `yjs_updates` first and fold
 * into `state` on compaction. The row goes when the document is retired: its description written by anything but the
 * relay, or its entity deleted (the yjs module's mutation handlers). The entity's own table owns the description.
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
    /** Names one seed of the document. The relay announces it at every handshake; a client whose document is of another generation rebuilds from the server state. */
    generation: uuid().defaultRandom().notNull(),
    /** Stamped on seeding, on compaction and every minute while a relay holds a session; the startup sweep takes an unstamped row with an uncompacted log for an orphan. */
    updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.entityType, table.entityId] }),
    index('idx_yjs_docs_tenant').on(table.tenantId),
    index('idx_yjs_docs_org').on(table.organizationId),
    organizationForeignKey(table),
    tenantSelectPolicy('yjs_documents', table),
    ...writeThroughPolicies('yjs_documents'),
  ],
);

export type YjsDocumentModel = typeof yjsDocumentsTable.$inferSelect;
export type InsertYjsDocumentModel = typeof yjsDocumentsTable.$inferInsert;

/**
 * Append-only log of client updates, one row per received update, in arrival order. Durable before
 * the update is broadcast, so a relay crash loses nothing. Compaction merges rows into the base
 * state and deletes exactly the rows it read.
 */
export const yjsUpdatesTable = snakeCase.table(
  'yjs_updates',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    entityType: varchar({ length: 50 }).notNull(),
    entityId: uuid().notNull(),
    tenantId: varchar('tenant_id', { length: tenantIdLength })
      .notNull()
      .references(() => tenantsTable.id),
    organizationId: uuid(),
    /** The client whose update this is; null for a server-origin row. Credits the materialized write. */
    userId: uuid(),
    payload: bytea().notNull(),
    createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_yjs_updates_doc').on(table.entityType, table.entityId, table.id),
    index('idx_yjs_updates_tenant').on(table.tenantId),
    organizationForeignKey(table),
    tenantSelectPolicy('yjs_updates', table),
    ...writeThroughPolicies('yjs_updates'),
  ],
);

export type YjsUpdateModel = typeof yjsUpdatesTable.$inferSelect;
export type InsertYjsUpdateModel = typeof yjsUpdatesTable.$inferInsert;
