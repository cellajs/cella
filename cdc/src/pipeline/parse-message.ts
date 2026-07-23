import type { Pgoutput } from 'pg-logical-replication';
import { isProduct, isUnpublishedDraft } from 'shared';
import type { InsertActivityModel } from '#/modules/activities/activities-db';
import { handleDelete, handleInsert, handleUpdate } from '../handlers';
import { log } from '../lib/pino';
import type { CdcRowData } from '../types';
import type { TableMeta } from '../types';
import { tableRegistry } from '../table-registry';

/** Activity without id, assigned later from WAL LSN in prepareActivity. */
export type ActivityWithoutId = Omit<InsertActivityModel, 'id'>;

/**
 * Parsed activity, row data, and table metadata. Reparented products include the old row's
 * permission fields so dispatch can remove them from subscribers who lost access.
 */
export interface ParseMessageResult {
  activity: ActivityWithoutId;
  rowData: CdcRowData;
  oldRowData: CdcRowData | null;
  movedFrom?: CdcRowData | null;
  tableMeta: TableMeta;
}

/** Rate limit for the draft-guard warning (one line per interval, not one per draft edit). */
const DRAFT_GUARD_WARN_INTERVAL_MS = 60_000;
let lastDraftGuardWarnAt = 0;

/**
 * Drops draft product rows that bypass the expected publication filter, preserving counters
 * and sequence stamps while warning about migration drift. Delete events use the old row,
 * so true draft deletes remain filtered and unpublishes still pass as published-row deletes.
 */
function isFilteredDraftEvent(result: ParseMessageResult): boolean {
  if (result.tableMeta.kind !== 'entity' || !isProduct(result.tableMeta.type)) return false;
  if (!isUnpublishedDraft(result.rowData)) return false;
  const now = Date.now();
  if (now - lastDraftGuardWarnAt > DRAFT_GUARD_WARN_INTERVAL_MS) {
    lastDraftGuardWarnAt = now;
    log.warn('Draft product row reached CDC — publication row filter missing? Regenerate migrations (pnpm generate + pnpm migrate).', {
      entityType: result.tableMeta.type,
      action: result.activity.action,
    });
  }
  return true;
}

/**
 * Parse a pgoutput message and return activity + row data for tracked tables.
 */
export function parseMessage(message: Pgoutput.Message): ParseMessageResult | null {
  // Only process DML messages with a relation
  const { tag } = message;
  if (tag !== 'insert' && tag !== 'update' && tag !== 'delete') {
    return null;
  }

  // Skip untracked tables
  const tableMeta = tableRegistry.get(message.relation.name);
  if (!tableMeta) return null;

  // Dispatch to handlers
  const result = (() => {
    switch (tag) {
      case 'insert':
        return handleInsert(tableMeta, message);
      case 'update':
        return handleUpdate(tableMeta, message);
      case 'delete':
        return handleDelete(tableMeta, message);
    }
  })();

  if (result && isFilteredDraftEvent(result)) return null;
  return result;
}
