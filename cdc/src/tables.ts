import { entityTables } from '#/table-config';
import { resourceTables } from '#/table-config';
import { getTableName } from 'drizzle-orm';
import type { EntityTableEntry, ResourceTableEntry, TableRegistryEntry } from './types';

/**
 * Build the table registry with O(1) lookup by table name.
 */
function buildTableRegistry(): Map<string, TableRegistryEntry> {
  const registry = new Map<string, TableRegistryEntry>();

  // Register entity tables
  for (const [type, table] of Object.entries(entityTables)) {
    const tableName = getTableName(table);
    registry.set(tableName, {
      kind: 'entity',
      table,
      type: type as keyof typeof entityTables,
    } as EntityTableEntry);
  }

  // Register resource tables
  for (const [type, table] of Object.entries(resourceTables)) {
    const tableName = getTableName(table);
    registry.set(tableName, {
      kind: 'resource',
      table,
      type: type as keyof typeof resourceTables,
    } as ResourceTableEntry);
  }

  return registry;
}

/** Registry of all tracked tables, keyed by Drizzle table name */
export const tableRegistry = buildTableRegistry();

