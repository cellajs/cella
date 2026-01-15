import { appConfig } from 'config';
import { varchar } from 'drizzle-orm/pg-core';
import { organizationsTable } from '#/db/schema/organizations';
import type { ContextEntityTypeColumns } from '#/db/types';

/**
 * Mapping of context entity types to their tables.
 * Defined here to avoid circular dependency with entity-config.ts.
 */
const contextEntityTables = {
  organization: organizationsTable,
} as const;

/**
 * Generate id columns dynamically based on `appConfig.contextEntityTypes`,
 * loops through and create references for each entity type, ensuring proper relational mapping.
 *
 * @returns A set of dynamically generated columns for context entities.
 */
export const generateContextEntityIdColumns = () =>
  appConfig.contextEntityTypes.reduce((columns, entityType) => {
    const table = contextEntityTables[entityType]; // Retrieve associated table for context entity
    const columnName = appConfig.entityIdColumnKeys[entityType]; // Determine the entity ID column name

    // Add the column with a foreign key reference, ensuring cascading deletion
    columns[columnName] = varchar().references(() => table.id, { onDelete: 'cascade' });
    return columns;
  }, {} as ContextEntityTypeColumns);
