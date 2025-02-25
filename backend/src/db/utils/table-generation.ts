import { type PgColumnBuilderBase, pgTable } from 'drizzle-orm/pg-core';

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
