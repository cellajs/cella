import type { AnyPgTable } from 'drizzle-orm/pg-core';
import type { ProductEntityType } from 'shared';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import type { PartitionConfig, ResolvableTable } from '#/tables';

/**
 * Product tables by type as lazy getters (pinned; apps list theirs): the product half of the
 * registration `tables.ts` resolves into `entityTables`, which drives RLS grants, the CDC
 * publication, immutability triggers and activity tracking. Channels live in `channel-tables.ts`,
 * kept apart on purpose: product tables read that map while loading, so one map importing both
 * would be a load-order cycle under drizzle-kit's per-file loading. `satisfies` makes a missing
 * product a compile error.
 */
export const productTables = {
  attachment: () => attachmentsTable,
} satisfies Record<ProductEntityType, () => ResolvableTable>;

/** App partition entry: the Drizzle table stands in for `name`, so the parity test checks the same schema the migration converts. */
export type AppPartitionConfig = Omit<PartitionConfig, 'name'> & { table: AnyPgTable };

/** App tables to convert to pg_partman partitions; merged after cella's own entries in the partman migration. */
export const appPartitionConfigs: AppPartitionConfig[] = [];

/** App tables outside RLS that runtime_role may read and write (application-layer guards), merged into the RLS migration grants. */
export const appFullCrudTables: string[] = [];

/** App tables outside RLS that runtime_role may only read, merged into the RLS migration grants. */
export const appReadOnlyTables: string[] = [];
