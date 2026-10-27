import { sql } from 'drizzle-orm';
import { bigint, index, type PgColumn, varchar } from 'drizzle-orm/pg-core';
import type { ProductEntityType } from 'shared';
import { tombstoneColumns } from '#/db/utils/audit-columns';
import { maxLength } from '#/db/utils/constraints';
import { publicColumn } from '#/db/utils/public-column';
import { stxColumns } from '#/db/utils/stx-columns';
import { tenantEntityColumns } from '#/db/utils/tenant-entity-columns';

/** The columns of every product table: the tenant entity columns, `stx`, description, keywords, the tombstone, `public` and `seq`. */
export const productColumns = <T extends ProductEntityType>(entityType: T) => ({
  ...tenantEntityColumns(entityType),
  name: varchar({ length: maxLength.field }).notNull().default(`New ${entityType}`),
  ...stxColumns,
  description: varchar({ length: maxLength.html }).default(''),
  keywords: varchar({ length: maxLength.html }).notNull().default(''),
  ...tombstoneColumns(),
  ...publicColumn,
  /** Org sequence driving delta sync. Stamped post-commit by the CDC worker; rows hold the default 0 until then. */
  seq: bigint({ mode: 'number' }).notNull().default(0),
});

/**
 * The six indexes every product table has, named `<table>_<column>_index`, for a product table's index list: the
 * organization, the organization with `seq` (a delta read filters the organization and a `seq` range and orders by
 * `seq`), the tenant, the creator with the organization (a creator's rows are read within a request's organization:
 * member counts, the replay check), the last editor, and the tombstones `apply_retention()` scans. A table lists its own
 * indexes after them.
 * @param tableName - The table's SQL name, the prefix of every index name.
 * @param table - The table's columns, as the index callback receives them.
 */
export const productIndexes = (
  tableName: string,
  table: Record<'organizationId' | 'seq' | 'tenantId' | 'createdBy' | 'updatedBy' | 'deletedAt', PgColumn>,
) => [
  index(`${tableName}_organization_id_index`).on(table.organizationId),
  index(`${tableName}_organization_id_seq_index`).on(table.organizationId, table.seq),
  index(`${tableName}_tenant_id_index`).on(table.tenantId),
  index(`${tableName}_created_by_index`).on(table.createdBy, table.organizationId),
  index(`${tableName}_updated_by_index`).on(table.updatedBy),
  index(`${tableName}_deleted_at_index`).on(table.deletedAt).where(sql`${table.deletedAt} is not null`),
];
