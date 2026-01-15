import { appConfig } from 'config';
import { varchar } from 'drizzle-orm/pg-core';
import type { ContextEntityTypeColumns } from '#/db/types';
import { type RelatableContextEntityType, relatableContextEntityTables } from '#/relatable-config';

/** All relatable context entity types (keys of relatableContextEntityTables). */
const relatableContextEntityTypes = Object.keys(relatableContextEntityTables) as RelatableContextEntityType[];

/**
 * Generate id columns dynamically based on relatable context entity types,
 * loops through and create references for each entity type, ensuring proper relational mapping.
 *
 * @param include - Optional list of context entity types to include. Defaults to all relatable context entity types.
 * @returns A set of dynamically generated columns for context entities.
 */
export const generateContextEntityIdColumns = (include?: RelatableContextEntityType[]): ContextEntityTypeColumns => {
  const entityTypes = include ?? relatableContextEntityTypes;
  const columns = {} as ContextEntityTypeColumns;

  for (const entityType of entityTypes) {
    const table = relatableContextEntityTables[entityType]; // Retrieve associated table for context entity
    const columnName = appConfig.entityIdColumnKeys[entityType]; // Determine the entity ID column name

    // Add the column with a foreign key reference, ensuring cascading deletion
    (columns as Record<string, unknown>)[columnName] = varchar().references(() => table.id, { onDelete: 'cascade' });
  }

  return columns;
};
