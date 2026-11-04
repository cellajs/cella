import type { entityTables, resourceTables } from '#/tables';
import type { ParseMessageResult } from './pipeline/parse-message';

/** Row data from a pgoutput message. */
export type RowData = Record<string, unknown>;

/**
 * Entity or resource row data after camelCase conversion, open to entity-specific fields. A `seq` there is the row
 * image's text: pg leaves `int8` a string.
 */
export interface CdcRowData extends RowData {
  id: string;
}

/** A tracked entity table: its Drizzle table, entity type and column names. */
export interface EntityTableMeta {
  kind: 'entity';
  table: (typeof entityTables)[keyof typeof entityTables];
  type: keyof typeof entityTables;
  columnNameMap: Map<string, string>;
}

/** A tracked resource table (a membership, a tenant, an API key): no place of its own in the hierarchy. */
export interface ResourceTableMeta {
  kind: 'resource';
  table: (typeof resourceTables)[keyof typeof resourceTables];
  type: keyof typeof resourceTables;
  columnNameMap: Map<string, string>;
}

/** What the worker knows of a tracked table, from the table registry. */
export type TableMeta = EntityTableMeta | ResourceTableMeta;

/** A change the worker keeps, on its way from its source transaction to a flush. */
export interface PendingEvent {
  /** Position of the change itself. A failure is reported at the position of the first change of its flush. */
  lsn: string;
  /** Commit position of the change's source transaction, from its BEGIN. */
  commitLsn: string;
  /** End of the commit record of the change's source transaction, from its COMMIT. A flush acknowledges the one of its last change. */
  commitEndLsn: string;
  /** Index of the change in its transaction, counted over every change received, kept or not. */
  index: number;
  /** Id of the change's source transaction, from its BEGIN: it tells whether a recount already saw the change. */
  xid: number;
  /**
   * On the delete of a channel: what the rows that went with it take off the counts of the channels that remain, per
   * channel key. Their own deletes are no change the worker keeps, so this change carries their counts.
   */
  cascadeCounts?: Map<string, Record<string, number>>;
  /**
   * The sequence value the change's product row holds once its flush is recorded: the stamp, or the value read back for
   * a change delivered again. A delete gets neither, and neither does a row that left its table since.
   */
  seq?: number;
  result: ParseMessageResult;
}
