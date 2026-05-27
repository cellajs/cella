import { entityTables } from '#/tables';
import { resourceTables } from '#/tables';
import { getColumns, getTableName } from 'drizzle-orm';
import { typedEntries } from 'shared';
import type { EntityTableMeta, ResourceTableMeta, TableMeta } from './types';

/** Convert camelCase to snake_case (used only at startup for column name map building) */
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/** Pre-compute snake_case → camelCase column name mapping from Drizzle schema */
function buildColumnNameMap(columnKeys: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const camelKey of columnKeys) {
    map.set(camelToSnake(camelKey), camelKey);
  }
  return map;
}

/**
 * Build the table registry with O(1) lookup by table name.
 */
function buildTableRegistry(): Map<string, TableMeta> {
  const registry = new Map<string, TableMeta>();

  // Register entity tables
  for (const [type, table] of typedEntries(entityTables)) {
    const tableName = getTableName(table);
    registry.set(tableName, {
      kind: 'entity',
      table,
      type,
      columnNameMap: buildColumnNameMap(Object.keys(getColumns(table))),
    } as EntityTableMeta);
  }

  // Register resource tables
  for (const [type, table] of typedEntries(resourceTables)) {
    const tableName = getTableName(table);
    registry.set(tableName, {
      kind: 'resource',
      table,
      type,
      columnNameMap: buildColumnNameMap(Object.keys(getColumns(table))),
    } as ResourceTableMeta);
  }

  return registry;
}

/** Registry of all tracked tables, keyed by Drizzle table name */
export const tableRegistry = buildTableRegistry();

