import { varchar } from 'drizzle-orm/pg-core';
import { appConfig, type ContextEntityType, type EntityIdColumnKey, type RelatableContextEntityType } from 'shared';
import { allContextEntityTables, relatableContextEntityTables } from '#/relatable-config';

/** Column type produced by varchar().references() */
type VarcharColumn = ReturnType<typeof varchar>;

/**
 * Mapped type that produces statically-known keys from entity ID column config.
 * e.g. { organizationId: VarcharColumn }
 */
type ContextEntityIdColumns<T extends ContextEntityType = ContextEntityType> = {
  [K in T as EntityIdColumnKey<K>]: VarcharColumn;
};

/** All relatable context entity types (keys of relatableContextEntityTables). */
const relatableContextEntityTypes = Object.keys(relatableContextEntityTables) as RelatableContextEntityType[];

/**
 * Generate id columns dynamically based on context entity types,
 * loops through and create references for each entity type, ensuring proper relational mapping.
 *
 * @param mode - 'all' includes all context entity types from appConfig, 'relatable' only includes those from relatableContextEntityTables. Defaults to 'all'.
 * @returns A set of dynamically generated columns for context entities.
 */
export function generateContextEntityIdColumns(mode?: 'all'): ContextEntityIdColumns<ContextEntityType>;
export function generateContextEntityIdColumns(mode: 'relatable'): ContextEntityIdColumns<RelatableContextEntityType>;
export function generateContextEntityIdColumns(mode: 'all' | 'relatable' = 'all'): ContextEntityIdColumns {
  const entityTypes = mode === 'all' ? appConfig.contextEntityTypes : relatableContextEntityTypes;
  const tables = mode === 'all' ? allContextEntityTables : relatableContextEntityTables;
  const columns = {} as ContextEntityIdColumns;

  for (const entityType of entityTypes) {
    const table = tables[entityType as keyof typeof tables];
    const columnName = appConfig.entityIdColumnKeys[entityType];

    (columns as Record<string, unknown>)[columnName] = varchar().references(() => table.id, { onDelete: 'cascade' });
  }

  return columns;
}
