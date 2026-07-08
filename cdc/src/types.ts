import { entityTables } from '#/tables';
import { resourceTables } from '#/tables';
import type { ParseMessageResult } from './pipeline/parse-message';

/** Row data from pgoutput message */
export type RowData = Record<string, unknown>;

/**
 * Base type for CDC entity/resource row data after camelCase conversion.
 * Provides typed access to common fields while remaining open to entity-specific fields.
 */
export interface CdcRowData extends RowData {
  id: string;
  seq?: number;
}

/** Type representing an entity table */
export type EntityTable = (typeof entityTables)[keyof typeof entityTables];

/** Type representing a resource table */
export type ResourceTable = (typeof resourceTables)[keyof typeof resourceTables];

/** Entity table metadata */
export interface EntityTableMeta {
  kind: 'entity';
  table: EntityTable;
  type: keyof typeof entityTables;
  columnNameMap: Map<string, string>;
}

/** Resource table metadata */
export interface ResourceTableMeta {
  kind: 'resource';
  table: ResourceTable;
  type: keyof typeof resourceTables;
  columnNameMap: Map<string, string>;
}

/** Discriminated union for table metadata */
export type TableMeta = EntityTableMeta | ResourceTableMeta;

/** A pending event within a transaction, including the LSN for acknowledgment. */
export interface PendingEvent {
  lsn: string;
  result: ParseMessageResult;
}
