import { getColumns, getTableName, type Table } from 'drizzle-orm';
import { typedEntries } from 'shared';
import { entityTables, resourceTables } from '#/tables';
import type { EntityTableMeta, ResourceTableMeta, TableMeta } from './types';

/** The camelCase key of each column of a table by its database name, both as the Drizzle schema declares them. */
function buildColumnNameMap(table: Table): Map<string, string> {
  return new Map(Object.entries(getColumns(table)).map(([key, column]) => [column.name, key]));
}

function buildTableRegistry(): Map<string, TableMeta> {
  const registry = new Map<string, TableMeta>();

  for (const [type, table] of typedEntries(entityTables)) {
    const tableName = getTableName(table);
    const columnNameMap = buildColumnNameMap(table);
    const meta: EntityTableMeta = { kind: 'entity', table, type, columnNameMap };
    registry.set(tableName, meta);
  }

  for (const [type, table] of typedEntries(resourceTables)) {
    const tableName = getTableName(table);
    const columnNameMap = buildColumnNameMap(table);
    const meta: ResourceTableMeta = { kind: 'resource', table, type, columnNameMap };
    registry.set(tableName, meta);
  }

  return registry;
}

/** Tracked tables, keyed by Drizzle table name. */
export const tableRegistry = buildTableRegistry();
