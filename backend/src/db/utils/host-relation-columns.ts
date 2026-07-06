import { uuid } from 'drizzle-orm/pg-core';
import { type HostEntityType, hierarchy, type ProductEntityType } from 'shared';

/** Column builder type for a nullable uuid host id column. */
type NullableUuid = ReturnType<typeof uuid>;

/**
 * Host-entity id column generated for a hosted product (see `host:` in the hierarchy
 * builder): e.g. `attachment` with `host: 'task'` gets a nullable `taskId` column.
 * Example: `HostRelationColumns<'attachment'>` → `{ taskId: NullableUuid }`.
 *
 * Nullable by design: a hosted row may exist unhosted (raak: project-level attachments
 * without a task). Forks that want strictly-hosted products (e.g. comment → item) add a
 * NOT NULL constraint in their migration; the mechanism (cascade, counters) treats null
 * as "not hosted".
 *
 * No FK is generated — the reference is soft, like embedding id arrays: the CDC cascade
 * owns lifecycle consistency, and a hard FK would force cross-module table imports.
 * Indexes still live in the table definition.
 */
// TODO use EntityIdColumnKey
export type HostRelationColumns<E extends string> = {
  [H in HostEntityType<E> & string as `${H}Id`]: NullableUuid;
};

/**
 * Generates the host id column for a hosted product entity from the hierarchy config.
 * Returns an empty object for products without a declared host, so tables can spread it
 * unconditionally.
 */
export const hostRelationColumns = <E extends ProductEntityType>(entityType: E): HostRelationColumns<E> => {
  const hostType = hierarchy.getHostType(entityType);
  const columns: Record<string, NullableUuid> = {};
  if (hostType) columns[`${hostType}Id`] = uuid();
  return columns as HostRelationColumns<E>;
};
