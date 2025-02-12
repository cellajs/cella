import { config } from 'config';
import { type PgColumnBuilderBase, pgTable, varchar } from 'drizzle-orm/pg-core';
import type { ContextEntityColumns } from '#/db/types';
import { entityIdFields, entityTables } from '#/entity-config';

/**
 * Utility function to generate a drizzle pgTable with type-safe columns.
 * Combines base columns and additional columns to define a table structure dynamically.
 *
 * @param  tableName - Name of the table.
 * @param  baseColumns - The base columns shared across tables.
 * @param  additionalColumns - The additional columns specific to this table.
 * @returns  - The generated database table.
 */
export const generateTable = <
  TBaseColumns extends Record<string, PgColumnBuilderBase>,
  TAdditionalColumns extends Record<string, PgColumnBuilderBase>,
>(
  tableName: string,
  baseColumns: TBaseColumns,
  additionalColumns: TAdditionalColumns,
) =>
  pgTable(tableName, {
    ...baseColumns,
    ...additionalColumns,
  });

/**
 * Helper function to generate fields dynamically based on `config.contextEntityTypes`,
 * loops through and create references for each entity type, ensuring proper relational mapping.
 *
 * @returns A set of dynamically generated fields for context entities.
 */
export const generateContextEntityFields = () =>
  config.contextEntityTypes.reduce((fields, entityType) => {
    const fieldTable = entityTables[entityType]; // Retrieve associated table for entity
    const fieldName = entityIdFields[entityType]; // Determine the entity's ID field name

    // Add the field with a foreign key reference, ensuring cascading deletion
    fields[fieldName] = varchar().references(() => fieldTable.id, { onDelete: 'cascade' });

    return fields;
  }, {} as ContextEntityColumns);
