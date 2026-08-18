import type { Pgoutput } from 'pg-logical-replication';
import { isProduct, isUnpublishedDraft } from 'shared';
import type { InsertActivityModel } from '#/modules/activities/activities-db';
import { handleDelete, handleInsert, handleUpdate } from '../handlers';
import { log } from '../lib/pino';
import { tableRegistry } from '../table-registry';
import type { CdcRowData, TableMeta } from '../types';

/** Activity without id, assigned later from WAL LSN in prepareActivity. */
export type ActivityWithoutId = Omit<InsertActivityModel, 'id'>;

/** Reparented products carry the old row's permission fields so dispatch can drop subscribers who lost access. */
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
 * Drops draft product rows that bypassed the publication filter, keeping counters and sequence stamps
 * correct. Delete events use the old row, so draft deletes stay filtered and unpublishes still pass.
 */
function isFilteredDraftEvent(result: ParseMessageResult): boolean {
  if (result.tableMeta.kind !== 'entity' || !isProduct(result.tableMeta.type)) return false;
  if (!isUnpublishedDraft(result.rowData)) return false;
  const now = Date.now();
  if (now - lastDraftGuardWarnAt > DRAFT_GUARD_WARN_INTERVAL_MS) {
    lastDraftGuardWarnAt = now;
    log.warn(
      'Draft product row reached CDC: publication row filter missing? Regenerate migrations (pnpm generate + pnpm migrate).',
      {
        entityType: result.tableMeta.type,
        action: result.activity.action,
      },
    );
  }
  return true;
}

/** @returns null for untracked tables, non-DML messages, and filtered draft events. */
export function parseMessage(message: Pgoutput.Message): ParseMessageResult | null {
  const { tag } = message;
  if (tag !== 'insert' && tag !== 'update' && tag !== 'delete') {
    return null;
  }

  const tableMeta = tableRegistry.get(message.relation.name);
  if (!tableMeta) return null;

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
