import { mergeLog, mergeState } from '#/modules/yjs/helpers/yjs-state';
import { type DocScope, YJS_MAX_SERVER_ROW_IDS } from '../constants';
import { compactState, discardLogRows, type LogRow, loadDocument } from '../data/storage';
import { log } from '../lib/pino';
import { postMaterialize, stateToBlocksJson } from './materialize';

/** Editors a materialize request names at most, so its size stays bounded however many sockets wrote. */
const MAX_EDITORS = 20;

/** The distinct senders of a window's rows, the most recent first; server-origin rows have none. */
function editorsNewestFirst(rows: LogRow[]): string[] {
  const editors: string[] = [];
  for (let i = rows.length - 1; i >= 0 && editors.length < MAX_EDITORS; i--) {
    const userId = rows[i].userId;
    if (userId && !editors.includes(userId)) editors.push(userId);
  }
  return editors;
}

/** `empty`: nothing was logged since the last compaction, so nothing was written. `retired`: the document row is gone, or of another generation than the session's. The other values are the materialize outcome. */
export type CompactionResult = 'empty' | 'ok' | 'gone' | 'permanent' | 'retry' | 'retired';

/**
 * Writes the merged document to the entity through the backend, then folds the update log into the base state. Runs
 * as the system in the document's own scope, whoever joined the session; the caller holds the document lock. Base and
 * log are one read (`loadDocument`), so a fold by another relay never splits them.
 *
 * - A window holding a client's row is posted, credited to its senders, newest first, and names the server-origin
 *   rows (outside writes, no sender) its merge holds as `serverRowIds`, none usually and at most YJS_MAX_SERVER_ROW_IDS.
 *   The backend refuses it with 409 when the log holds a server row the window lacks, an outside write committed
 *   during the POST: the stale merge would overwrite it. That is a retry, and the next window holds the row.
 * - A window of server rows alone is not posted: its merge is the last outside write, which the entity row already
 *   holds. It folds unsaved.
 *
 * Only a written window, or one with nothing to write, folds: the base is replaced and exactly the rows read are
 * deleted, so an update appended during the POST survives for the next round. Every other outcome leaves base and log
 * untouched, so the base only ever holds written state and the log every edit the entity has not received; cleanup and
 * sweep rely on this to forget a document only after `ok`, `empty` or `gone` (the entity no longer exists). A fold
 * another compaction overlapped (a second relay during a rollout) is rolled back as a retry. Unparseable state is
 * never posted and counts as `permanent`. A row no merge accepts (logged before the relay refused undecodable updates,
 * or one that decodes but will not merge) is discarded first, with its sender logged: it carries no edit anyone can
 * apply, and kept it would fail every window. A document gone, or of another `generation` than the session's, was
 * retired or reseeded: nothing is touched.
 */
export async function compactDocument(scope: DocScope, generation: string | null = null): Promise<CompactionResult> {
  const document = await loadDocument(scope);
  if (document === null) return generation === null ? 'empty' : 'retired';
  if (generation !== null && document.generation !== generation) return 'retired';
  if (document.rows.length === 0) return 'empty';

  const { state, rejected } = mergeLog(document.base, document.rows);
  if (rejected.length > 0) {
    for (const row of rejected) {
      log.error(`Compaction: discarding log row ${row.id} of ${scope.entityType}:${scope.entityId}, which does not merge`, {
        userId: row.userId,
        bytes: row.payload.length,
      });
    }
    await discardLogRows(
      scope,
      rejected.map((row) => row.id),
    );
  }
  const rows = document.rows.filter((row) => !rejected.includes(row));
  if (rows.length === 0 || !state) return 'empty';
  const ids = rows.map((row) => row.id);

  const serverRows = rows.filter((row) => row.userId === null);
  if (serverRows.length < rows.length) {
    if (serverRows.length > YJS_MAX_SERVER_ROW_IDS) {
      // More outside writes than one request may name. Merges commute, so the oldest of them fold alone, unsaved,
      // and the window is compacted again: the rows it posts then name what the log still holds.
      log.error(`Compaction: ${serverRows.length} outside writes in one window of ${scope.entityType}:${scope.entityId}, folding them first`);
      const batch = serverRows.slice(0, YJS_MAX_SERVER_ROW_IDS);
      const merged = mergeState(
        document.base,
        batch.map((row) => row.payload),
      );
      const batchIds = batch.map((row) => row.id);
      const folded = merged ? await compactState(scope, merged, batchIds, document.generation) : 'ok';
      if (folded !== 'ok') return folded === 'overlap' ? 'retry' : 'retired';
      return compactDocument(scope, document.generation);
    }
    const json = stateToBlocksJson(state);
    if (json === null) {
      log.error(`Compaction: unparseable state for ${scope.entityType}:${scope.entityId}, keeping the log`);
      return 'permanent';
    }
    // The backend credits the newest of the window's editors who may still update the entity.
    const serverRowIds = serverRows.map((row) => row.id);
    const result = await postMaterialize(scope, editorsNewestFirst(rows), json, serverRowIds);
    if (result !== 'ok') return result;
  }

  const folded = await compactState(scope, state, ids, document.generation);
  if (folded === 'overlap') {
    log.warn(`Compaction: another compaction folded rows of ${scope.entityType}:${scope.entityId}, retrying`);
    return 'retry';
  }
  return folded === 'retired' ? 'retired' : 'ok';
}
