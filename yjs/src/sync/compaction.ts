import type { DocScope } from '../constants';
import { compactState, type LogRow, loadBase, readLog } from '../data/storage';
import { log } from '../lib/pino';
import { mergeState } from './document-state';
import { postMaterialize, stateToBlocksJson } from './materialize';

/** Editors a materialize request names at most, so its size stays bounded however many sockets wrote. */
const MAX_EDITORS = 20;

/** The distinct senders of a window's rows, the most recent first. */
function editorsNewestFirst(rows: LogRow[]): string[] {
  const editors: string[] = [];
  for (let i = rows.length - 1; i >= 0 && editors.length < MAX_EDITORS; i--) {
    const userId = rows[i].userId;
    if (userId && !editors.includes(userId)) editors.push(userId);
  }
  return editors;
}

/** `empty`: nothing was logged since the last compaction, so nothing was written. The other values are the materialize outcome. */
export type CompactionResult = 'empty' | 'ok' | 'gone' | 'permanent' | 'retry';

/**
 * Writes the merged document to the entity through the backend, then folds the update log into
 * the base state. Runs as the system in the document's own scope, whoever joined the session; the
 * caller holds the document lock. Only a written window folds: on `ok` the base is replaced and
 * exactly the rows that were read are deleted, so an update appended during the POST survives for
 * the next round. Every other outcome leaves base and log untouched, so the base only ever holds
 * written state and the log every edit the entity has not received; cleanup and sweep rely on
 * this to delete a document only after `ok`, `empty` or `gone` (the entity no longer exists).
 * Unparseable state, or a log crediting no editor, is never posted and counts as `permanent`.
 */
export async function compactDocument(scope: DocScope): Promise<CompactionResult> {
  const [base, rows] = await Promise.all([loadBase(scope), readLog(scope)]);
  if (rows.length === 0) return 'empty';

  const merged = mergeState(
    base,
    rows.map((row) => row.payload),
  ) as Uint8Array;
  const ids = rows.map((row) => row.id);

  const json = stateToBlocksJson(merged);
  if (json === null) {
    log.error(`Compaction: unparseable state for ${scope.entityType}:${scope.entityId}, keeping the log`);
    return 'permanent';
  }

  // The backend credits the newest of the window's editors who may still update the entity.
  const editors = editorsNewestFirst(rows);
  if (editors.length === 0) {
    log.error(`Compaction: no editor in the log of ${scope.entityType}:${scope.entityId}, keeping the log`);
    return 'permanent';
  }
  const result = await postMaterialize(scope, editors, json);
  if (result !== 'ok') return result;

  await compactState(scope, merged, ids);
  return 'ok';
}
