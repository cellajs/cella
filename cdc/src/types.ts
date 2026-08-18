import type { entityTables, resourceTables } from '#/tables';
import type { ParseMessageResult } from './pipeline/parse-message';

/** Row data from a pgoutput message. */
export type RowData = Record<string, unknown>;

/** Entity or resource row data after camelCase conversion, open to entity-specific fields. */
export interface CdcRowData extends RowData {
  id: string;
  seq?: number;
}

export type EntityTable = (typeof entityTables)[keyof typeof entityTables];

export type ResourceTable = (typeof resourceTables)[keyof typeof resourceTables];

export interface EntityTableMeta {
  kind: 'entity';
  table: EntityTable;
  type: keyof typeof entityTables;
  columnNameMap: Map<string, string>;
}

export interface ResourceTableMeta {
  kind: 'resource';
  table: ResourceTable;
  type: keyof typeof resourceTables;
  columnNameMap: Map<string, string>;
}

export type TableMeta = EntityTableMeta | ResourceTableMeta;

/** A pending event within a transaction, including the LSN for acknowledgment. */
export interface PendingEvent {
  lsn: string;
  result: ParseMessageResult;
}
