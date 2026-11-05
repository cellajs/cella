import { bigint, bytea, index, primaryKey, snakeCase, uuid, varchar } from 'drizzle-orm/pg-core';
import { appConfig } from 'shared';
import { tenantSelectPolicy, writeThroughPolicies } from '#/db/rls-helpers';
import { tenantIdLength } from '#/db/utils/constraints';
import type { UserId } from '#/db/utils/ids';
import { organizationForeignKey } from '#/db/utils/organization-foreign-key';
import { isoTimestamp } from '#/db/utils/timestamp-columns';
import { tenantsTable } from '#/modules/tenants/tenants-db';

/**
 * Compacted base state, one row per document: seeded from the entity's description on the first WS connect or HTTP
 * pull, and kept across sessions, so a client's surviving document shares its history. Updates are logged in
 * `yjs_updates` first and fold into `state` on compaction; a description written outside the relay is logged there
 * too, as a server-origin update. The row goes when the document is retired, with its entity's deletion (the yjs
 * module's mutation handlers). The entity's own table holds the description.
 */
export const yjsDocumentsTable = snakeCase.table(
  'yjs_documents',
  {
    entityType: varchar({ length: 50, enum: appConfig.productEntityTypes }).notNull(),
    entityId: uuid().notNull(),
    tenantId: varchar({ length: tenantIdLength })
      .notNull()
      .references(() => tenantsTable.id),
    organizationId: uuid().notNull(),
    state: bytea().notNull(),
    /**
     * Names one seed of the document. The relay announces it at every handshake; a client whose document is of another
     * generation rebuilds from the server state.
     */
    generation: uuid().defaultRandom().notNull(),
    /**
     * Stamped on seeding, on compaction and every minute while a relay holds a session; the relay's sweep takes an
     * unstamped row with an uncompacted log for one no session holds.
     */
    updatedAt: isoTimestamp().defaultNow().notNull(),
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

/**
 * Append-only log of updates, one row per received update, in arrival order: a client's, or a server-origin one an
 * outside write of the description left. Durable before the update is broadcast, so a relay crash loses nothing.
 * Compaction merges rows into the base state and deletes exactly the rows it read.
 */
export const yjsUpdatesTable = snakeCase.table(
  'yjs_updates',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    entityType: varchar({ length: 50, enum: appConfig.productEntityTypes }).notNull(),
    entityId: uuid().notNull(),
    tenantId: varchar({ length: tenantIdLength })
      .notNull()
      .references(() => tenantsTable.id),
    organizationId: uuid().notNull(),
    /** The client whose update this is; null for a server-origin row. Credits the materialized write. */
    userId: uuid().$type<UserId>(),
    payload: bytea().notNull(),
    createdAt: isoTimestamp().defaultNow().notNull(),
  },
  (table) => [
    index('idx_yjs_updates_doc').on(table.entityType, table.entityId, table.id),
    index('idx_yjs_updates_tenant').on(table.tenantId),
    organizationForeignKey(table),
    tenantSelectPolicy('yjs_updates', table),
    ...writeThroughPolicies('yjs_updates'),
  ],
);
