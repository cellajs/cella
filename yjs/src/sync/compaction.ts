import type { DocContext } from '../constants';
import { compactState, loadBase, readLog } from '../data/storage';
import { log } from '../lib/pino';
import { mergeState } from './document-state';
import { postMaterialize, stateToBlocksJson } from './materialize';

/** `empty`: nothing was logged since the last compaction, so nothing was written. The other values are the materialize outcome. */
export type CompactionResult = 'empty' | 'ok' | 'permanent' | 'retry';

/**
 * Writes the merged document to the entity through the backend, then folds the update log into
 * the base state. The caller holds the document lock. Only a written window folds: on `ok` the
 * base is replaced and exactly the rows that were read are deleted, so an update appended during
 * the POST survives for the next round. Every other outcome leaves base and log untouched, so the
 * base only ever holds written state and the log every edit the entity has not received; cleanup
 * and sweep rely on this to delete a document only after `ok` or `empty`. Unparseable state is
 * never posted and counts as `permanent`.
 */
export async function compactDocument(ctx: DocContext): Promise<CompactionResult> {
  const [base, rows] = await Promise.all([loadBase(ctx), readLog(ctx)]);
  if (rows.length === 0) return 'empty';

  const merged = mergeState(
    base,
    rows.map((row) => row.payload),
  ) as Uint8Array;
  const ids = rows.map((row) => row.id);

  const json = stateToBlocksJson(merged);
  if (json === null) {
    log.error(`Compaction: unparseable state for ${ctx.entityType}:${ctx.entityId}, keeping the log`);
    return 'permanent';
  }

  // The last client whose update is in this window is credited with the durable write.
  let editedBy = ctx.userId;
  for (let i = rows.length - 1; i >= 0; i--) {
    const userId = rows[i].userId;
    if (userId) {
      editedBy = userId;
      break;
    }
  }
  const result = await postMaterialize(ctx, editedBy, json);
  if (result !== 'ok') return result;

  await compactState(ctx, merged, ids);
  return 'ok';
}
