import type { Pgoutput } from 'pg-logical-replication';
import { hierarchy, isUnpublishedDraft } from 'shared';
import type { InsertActivityModel } from '#/modules/activities/activities-db';
import { handleDelete, handleInsert, handleUpdate } from '../handlers';
import { log } from '../lib/pino';
import type { CdcRowData } from '../types';
import type { TableMeta } from '../types';
import { tableRegistry } from '../table-registry';

/** Activity without id, assigned later from WAL LSN in prepareActivity. */
export type ActivityWithoutId = Omit<InsertActivityModel, 'id'>;

/**
 * Result of parsing a CDC message.
 * Includes activity to insert, row data (entity or resource) and table metadata.
 * `movedFrom` is set on product updates whose materialized `path` changed (reparent):
 * the permission-relevant subset of the OLD row, so dispatch can deliver a move-out
 * to subscribers who could read the old location but not the new one.
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
 * Entrance guard for the draft boundary. The publication row filter
 * (`published_at IS NOT NULL`, see backend `publication-filter.ts`) keeps draft product
 * rows out of the replication stream entirely, so a draft row here means a fork
 * misconfiguration. The usual cause: `publishedColumn` was added without regenerating the
 * publication (`pnpm generate` + `pnpm migrate`). Dropping the event keeps counters
 * correct (drafts must count nothing); the rate-limited warning makes the gap loud
 * so sequence stamps are not silently corrupted.
 *
 * Uniform across actions because the delete handler snapshots the OLD row into
 * `rowData`: a true draft hard-delete never arrives (old row fails the filter), while
 * an unpublish arrives as DELETE with a published old row and passes untouched.
 */
function isFilteredDraftEvent(result: ParseMessageResult): boolean {
  if (result.tableMeta.kind !== 'entity' || !hierarchy.isProduct(result.tableMeta.type)) return false;
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

