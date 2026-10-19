import { bigint, index, type PgColumn, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import type { ProductEntityType } from 'shared';
import { maxLength } from '#/db/utils/constraints';
import type { ActorId } from '#/db/utils/ids';
import { tenantEntityColumns } from '#/db/utils/tenant-entity-columns';
import { actorsTable } from '#/modules/actors/actors-db';
import { stxColumns } from './stx-columns';

export const productColumns = <T extends ProductEntityType>(entityType: T) => ({
  ...tenantEntityColumns(entityType),
  name: varchar({ length: maxLength.field }).notNull().default(`New ${entityType}`),
  ...stxColumns,
  description: varchar({ length: maxLength.html }).default(''),
  keywords: varchar({ length: maxLength.html }).notNull().default(''),
  createdBy: uuid()
    .references(() => actorsTable.id, { onDelete: 'set null' })
    .$type<ActorId>(),
  updatedBy: uuid()
    .references(() => actorsTable.id, { onDelete: 'set null' })
    .$type<ActorId>(),
  deletedAt: timestamp('deleted_at', { mode: 'string' }),
  deletedBy: uuid('deleted_by')
    .references(() => actorsTable.id, { onDelete: 'set null' })
    .$type<ActorId>(),
  /** Actor-independent reads when the entity declares `publicRead()`. Parent publication is propagated as data. */
  publicAt: timestamp('public_at', { mode: 'string' }),
  /** Org sequence driving delta sync. Stamped post-commit by the CDC worker; rows hold the default 0 until then. */
  seq: bigint('seq', { mode: 'number' }).notNull().default(0),
});

/**
 * The five indexes every product table has, named `<table>_<column>_index`, for a product table's index list: the
 * organization, the organization with `seq` (a delta read filters the organization and a `seq` range and orders by
 * `seq`), the tenant, the creator with the organization (a creator's rows are read within a request's organization:
 * member counts, the replay check) and the last editor. A table lists its own indexes after them.
 * @param tableName - The table's SQL name, the prefix of every index name.
 * @param table - The table's columns, as the index callback receives them.
 */
export const productIndexes = (tableName: string, table: Record<'organizationId' | 'seq' | 'tenantId' | 'createdBy' | 'updatedBy', PgColumn>) => [
  index(`${tableName}_organization_id_index`).on(table.organizationId),
  index(`${tableName}_organization_id_seq_index`).on(table.organizationId, table.seq),
  index(`${tableName}_tenant_id_index`).on(table.tenantId),
  index(`${tableName}_created_by_index`).on(table.createdBy, table.organizationId),
  index(`${tableName}_updated_by_index`).on(table.updatedBy),
];

/**
 * @deprecated The fan-out reads mentions from `description`, so no column stores them. Empty, so a
 * table that still spreads it drops its `mentions` column on the next `pnpm generate`; removed in a
 * later release.
 * @public
 */
export const mentionableColumns = {};
