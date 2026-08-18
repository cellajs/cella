import { getColumns, getTableName } from 'drizzle-orm';
import { typedEntries } from 'shared';
import { entityTables, resourceTables } from '#/tables';
import type { EntityTableMeta, ResourceTableMeta, TableMeta } from './types';

/** Startup only, for building the column name map. */
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/** snake_case to camelCase column names, from the Drizzle schema. */
function buildColumnNameMap(columnKeys: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const camelKey of columnKeys) {
    map.set(camelToSnake(camelKey), camelKey);
  }
  return map;
}

function buildTableRegistry(): Map<string, TableMeta> {
  const registry = new Map<string, TableMeta>();

  for (const [type, table] of typedEntries(entityTables)) {
    const tableName = getTableName(table);
    const meta: EntityTableMeta = {
      kind: 'entity',
      table,
      type,
      columnNameMap: buildColumnNameMap(Object.keys(getColumns(table))),
    };
    registry.set(tableName, meta);
  }

  for (const [type, table] of typedEntries(resourceTables)) {
    const tableName = getTableName(table);
    const meta: ResourceTableMeta = {
      kind: 'resource',
      table,
      type,
      columnNameMap: buildColumnNameMap(Object.keys(getColumns(table))),
    };
    registry.set(tableName, meta);
  }

  return registry;
}

/** Tracked tables, keyed by Drizzle table name. */
export const tableRegistry = buildTableRegistry();
