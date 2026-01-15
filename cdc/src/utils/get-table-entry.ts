/**
 * Utility functions for working with CDC tracked tables.
 */

import { tableRegistry } from '../tables';
import type { TableRegistryEntry } from '../types';

/**
 * Check if a table name is tracked and get its registry entry.
 * Returns undefined if the table is not tracked.
 */
export function getTableEntry(tableName: string): TableRegistryEntry | undefined {
  return tableRegistry.get(tableName);
}
