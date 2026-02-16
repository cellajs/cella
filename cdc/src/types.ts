/**
 * Type definitions for CDC tables.
 * Derived from the tracked tables registry.
 */

import { entityTables } from '#/table-config';
import { resourceTables } from '#/table-config';

/** Type representing an entity table */
export type EntityTable = (typeof entityTables)[keyof typeof entityTables];

/** Type representing a resource table */
export type ResourceTable = (typeof resourceTables)[keyof typeof resourceTables];

/** Registry entry for an entity table */
export interface EntityTableEntry {
  kind: 'entity';
  table: EntityTable;
  type: keyof typeof entityTables;
}

/** Registry entry for a resource table */
export interface ResourceTableEntry {
  kind: 'resource';
  table: ResourceTable;
  type: keyof typeof resourceTables;
}

/** Discriminated union for table registry entries */
export type TableRegistryEntry = EntityTableEntry | ResourceTableEntry;
