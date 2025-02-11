import { config } from 'config';
import { type PgColumnBuilderBase, pgTable, varchar } from 'drizzle-orm/pg-core';
import type { ContextEntityColumns } from '#/db/types';
import { entityIdFields, entityTables } from '#/entity-config';

// TODO improve comments
// Generate table with type-safe columns
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

// Helper function for fields generation based of context entities
export const generateContextEntityFields = () =>
  config.contextEntityTypes.reduce((fields, entityType) => {
    const fieldTable = entityTables[entityType];
    const fieldName = entityIdFields[entityType];
    // Add the field with optional constraints
    fields[fieldName] = varchar().references(() => fieldTable.id, { onDelete: 'cascade' });
    return fields;
  }, {} as ContextEntityColumns);
