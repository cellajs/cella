import { entityTables } from '#/table-config';
import { resourceTables } from '#/table-config';
import { getTableName } from 'drizzle-orm';
import { typedEntries } from 'shared';
import type { EntityTableEntry, ResourceTableEntry, TableRegistryEntry } from './types';

/**
 * Build the table registry with O(1) lookup by table name.
 */
function buildTableRegistry(): Map<string, TableRegistryEntry> {
  const registry = new Map<string, TableRegistryEntry>();

  // Register entity tables
  for (const [type, table] of typedEntries(entityTables)) {
    const tableName = getTableName(table);
    registry.set(tableName, {
      kind: 'entity',
      table,
      type,
    } as EntityTableEntry);
  }

  // Register resource tables
  for (const [type, table] of typedEntries(resourceTables)) {
    const tableName = getTableName(table);
    registry.set(tableName, {
      kind: 'resource',
      table,
      type,
    } as ResourceTableEntry);
  }

  return registry;
}

/** Registry of all tracked tables, keyed by Drizzle table name */
export const tableRegistry = buildTableRegistry();

