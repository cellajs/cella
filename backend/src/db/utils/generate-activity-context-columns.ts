import { appConfig, type RelatableContextEntityType, relatableContextEntityTypes } from 'config';
import { desc } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { foreignKey, index, varchar } from 'drizzle-orm/pg-core';
import { relatableContextEntityTables } from '#/relatable-config';

/**
 * Type representing the column names for relatable context entity IDs.
 */
type RelatableContextEntityIdColumnNames = (typeof appConfig.entityIdColumnKeys)[RelatableContextEntityType];

/**
 * Generate context entity ID columns for the activities table.
 * Creates varchar columns for each relatable context entity type (organizationId, projectId, etc.).
 * Only includes entities from relatableContextEntityTypes (part of the parent tree).
 * Foreign keys and indexes are generated separately.
 */
export const generateActivityContextColumns = () => {
  const columns = {} as Record<RelatableContextEntityIdColumnNames, ReturnType<typeof varchar>>;

  for (const entityType of relatableContextEntityTypes) {
    const columnName = appConfig.entityIdColumnKeys[entityType] as RelatableContextEntityIdColumnNames;
    columns[columnName] = varchar();
  }

  return columns;
};

/**
 * Generate indexes for context entity ID columns in the activities table.
 * Creates both a simple index and a composite seq index for each relatable context entity.
 */
export const generateActivityContextIndexes = (table: Record<string, AnyPgColumn> & { seq: AnyPgColumn }) => {
  const indexes = [];

  for (const entityType of relatableContextEntityTypes) {
    const columnName = appConfig.entityIdColumnKeys[entityType];
    const column = table[columnName];
    const snakeColumn = columnName.replace(/([A-Z])/g, '_$1').toLowerCase();

    if (column) {
      // Simple index on the context entity ID
      indexes.push(index(`activities_${snakeColumn}_index`).on(column));
      // Composite index for seq queries scoped by this context entity
      indexes.push(index(`activities_${snakeColumn}_seq_index`).on(column, desc(table.seq)));
    }
  }

  return indexes;
};

/**
 * Generate foreign keys for context entity ID columns in the activities table.
 * Uses cascade delete to clean up activities when context entities are deleted.
 */
export const generateActivityContextForeignKeys = (table: Record<string, AnyPgColumn>) => {
  const foreignKeys = [];

  for (const entityType of relatableContextEntityTypes) {
    const columnName = appConfig.entityIdColumnKeys[entityType];
    const column = table[columnName];
    const contextTable = relatableContextEntityTables[entityType];

    if (column && contextTable) {
      foreignKeys.push(
        foreignKey({
          columns: [column],
          foreignColumns: [contextTable.id],
        }).onDelete('cascade'),
      );
    }
  }

  return foreignKeys;
};
