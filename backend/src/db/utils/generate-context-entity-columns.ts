import { appConfig, type ContextEntityType, type RelatableContextEntityType } from 'config';
import { type PgVarcharBuilderInitial, varchar } from 'drizzle-orm/pg-core';
import { allContextEntityTables, relatableContextEntityTables } from '#/relatable-config';

/**
 * Type representing the column names used to identify an entity using other entities' IDs' as foreign keys.
 */
type ContextEntityTypeIdColumnNames = {
  [K in keyof typeof appConfig.entityIdColumnKeys]: K extends ContextEntityType
    ? (typeof appConfig.entityIdColumnKeys)[K]
    : never;
}[keyof typeof appConfig.entityIdColumnKeys];

export type ContextEntityTypeColumns = {
  [K in ContextEntityTypeIdColumnNames]: PgVarcharBuilderInitial<'', [string, ...string[]], undefined>;
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
export const generateContextEntityIdColumns = (mode: 'all' | 'relatable' = 'all'): ContextEntityTypeColumns => {
  const entityTypes = mode === 'all' ? appConfig.contextEntityTypes : relatableContextEntityTypes;
  const tables = mode === 'all' ? allContextEntityTables : relatableContextEntityTables;
  const columns = {} as ContextEntityTypeColumns;

  for (const entityType of entityTypes) {
    const table = tables[entityType as keyof typeof tables];
    const columnName = appConfig.entityIdColumnKeys[entityType];

    (columns as Record<string, unknown>)[columnName] = varchar().references(() => table.id, { onDelete: 'cascade' });
  }

  return columns;
};
