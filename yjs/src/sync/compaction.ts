import type { DocContext } from '../constants';
import { compactState, loadBase, readLog } from '../data/storage';
import { log } from '../lib/pino';
import { mergeState } from './document-state';
import { postMaterialize, stateToBlocksJson } from './materialize';

/** `empty`: nothing was logged since the last compaction, so nothing was written. The other values are the materialize outcome. */
export type CompactionResult = 'empty' | 'ok' | 'permanent' | 'retry';

/**
 * Folds the update log into the base state and writes the result to the entity through the
 * backend. The caller holds the document lock. Materialization comes first: on `retry` the log
 * stays intact so the next window, cleanup or sweep repeats the attempt; on `ok` and `permanent`
 * the base is replaced and exactly the rows that were read are deleted, so an update appended
 * during the POST survives for the next round. Unparseable state can never converge: it compacts
 * into the base (still durable) without a write.
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
    log.error(`Compaction: unparseable state for ${ctx.entityType}:${ctx.entityId}, compacting without a write`);
    await compactState(ctx, merged, ids);
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
  if (result === 'retry') return 'retry';

  await compactState(ctx, merged, ids);
  return result;
}
