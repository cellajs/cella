import type { entityTables, resourceTables } from '#/tables';
import type { ParseMessageResult } from './pipeline/parse-message';

/** Row data from a pgoutput message. */
export type RowData = Record<string, unknown>;

/** Entity or resource row data after camelCase conversion, open to entity-specific fields. */
export interface CdcRowData extends RowData {
  id: string;
  seq?: number;
}

export interface EntityTableMeta {
  kind: 'entity';
  table: (typeof entityTables)[keyof typeof entityTables];
  type: keyof typeof entityTables;
  columnNameMap: Map<string, string>;
}

export interface ResourceTableMeta {
  kind: 'resource';
  table: (typeof resourceTables)[keyof typeof resourceTables];
  type: keyof typeof resourceTables;
  columnNameMap: Map<string, string>;
}

export type TableMeta = EntityTableMeta | ResourceTableMeta;

/** A change the worker keeps, on its way from its source transaction to a flush. */
export interface PendingEvent {
  /** Position of the change itself. A failure is reported at the position of the first change of its flush. */
  lsn: string;
  /**
   * Commit position of the change's source transaction, from its BEGIN; absent for a change outside one. A flush
   * acknowledges the one of its last change.
   */
  commitLsn?: string | null;
  /** Index of the change in its transaction, counted over every change received, kept or not. */
  index?: number;
  /** Id of the change's source transaction, from its BEGIN: it tells whether a recount already saw the change. */
  xid?: number;
  /**
   * On the delete of a channel: what the rows that went with it take off the counts of the channels that remain, per
   * channel key. Their own deletes are no change the worker keeps, so this change carries their counts.
   */
  cascadeCounts?: Map<string, Record<string, number>>;
  result: ParseMessageResult;
}
