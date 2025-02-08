import { config } from 'config';
import { type PgColumnBuilderBase, pgTable, varchar } from 'drizzle-orm/pg-core';
import type { ContextEntityColumns } from '#/db/types';
import { entityIdFields, entityTables } from '#/entity-config';

// Create dynamic table with type-safe columns
export const createDynamicTable = <
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

// Helper function for dynamic fields generation based of context entities
export const generateContextEntityDynamicFields = () =>
  config.contextEntityTypes.reduce((fields, entityType) => {
    const fieldTable = entityTables[entityType];
    const fieldName = entityIdFields[entityType];
    // Add the dynamic field with optional constraints
    fields[fieldName] = varchar().references(() => fieldTable.id, { onDelete: 'cascade' });
    return fields;
  }, {} as ContextEntityColumns);
