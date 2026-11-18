import { getColumns, getTableName } from 'drizzle-orm';
import { typedEntries } from 'shared';
import { secretColumnsOf } from '#/db/secret-columns';
import { entityTables, resourceTables } from '#/tables';
import type { TableMeta } from './types';

/**
 * Varchar length at or above which a column is stripped from in-memory row data. Column lists are incompatible with
 * REPLICA IDENTITY FULL, and the publication carries every column. Stripping happens in the parser, after change detection.
 */
const cdcExcludeColumnLengthThreshold = 10_000;

function buildTableRegistry(): Map<string, TableMeta> {
  const tracked = [
    ...typedEntries(entityTables).map(([type, table]) => ({ kind: 'entity' as const, type, table })),
    ...typedEntries(resourceTables).map(([type, table]) => ({ kind: 'resource' as const, type, table })),
  ];
  const registry = new Map<string, TableMeta>();

  for (const meta of tracked) {
    const tableName = getTableName(meta.table);
    const columns = Object.entries(getColumns(meta.table));
    const columnNameMap = new Map(columns.map(([key, column]) => [column.name, key]));
    const longKeys = columns.filter(([, column]) => column.length !== undefined && column.length >= cdcExcludeColumnLengthThreshold);
    const strippedKeys = new Set([...longKeys.map(([key]) => key), ...secretColumnsOf(tableName)]);
    registry.set(tableName, { ...meta, columnNameMap, strippedKeys });
  }

  return registry;
}

/** Tracked tables, keyed by Drizzle table name. */
export const tableRegistry = buildTableRegistry();
