import * as Y from 'yjs';

/** Base state plus log payloads merged once; null when there is nothing at all. */
export function mergeState(base: Uint8Array | null, payloads: Uint8Array[]): Uint8Array | null {
  const parts = base && base.length > 0 ? [base, ...payloads] : payloads;
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return Y.mergeUpdates(parts);
}

/**
 * The state with the content of deleted items dropped, for a base about to be stored: `Y.mergeUpdates` keeps every
 * deleted character, a garbage-collected document keeps only their length. Structs waiting on a missing dependency are
 * encoded along.
 */
export function collectGarbage(state: Uint8Array): Uint8Array {
  const doc = new Y.Doc({ gc: true });
  try {
    Y.applyUpdate(doc, state);
    return Y.encodeStateAsUpdate(doc);
  } finally {
    doc.destroy();
  }
}

/**
 * The merged document, the log rows it holds (`accepted`, in log order) and the rows left out of it: a row that will
 * not merge is left out, so one bad row never blocks the document or the rows logged after it. Rows merge in one call,
 * and one at a time only when that call throws. The base is written by compaction and seeding alone, so it is trusted.
 */
export function mergeLog<Row extends { payload: Uint8Array }>(
  base: Uint8Array | null,
  rows: readonly Row[],
): { state: Uint8Array | null; accepted: readonly Row[]; rejected: Row[] } {
  const payloads = rows.map((row) => row.payload);
  try {
    return { state: mergeState(base, payloads), accepted: rows, rejected: [] };
  } catch {
    // Merge one at a time to find the row that throws.
  }
  let state = base && base.length > 0 ? base : null;
  const accepted: Row[] = [];
  const rejected: Row[] = [];
  for (const row of rows) {
    try {
      state = state ? Y.mergeUpdates([state, row.payload]) : row.payload;
      accepted.push(row);
    } catch {
      rejected.push(row);
    }
  }
  return { state, accepted, rejected };
}

/**
 * How an inbound update reads: `malformed` when Yjs cannot decode it, `empty` when it carries no structs and no
 * deletions (a client's Step2 reply when it holds nothing the server lacks), `update` otherwise.
 */
export function classifyUpdate(update: Uint8Array): 'malformed' | 'empty' | 'update' {
  try {
    const { structs, ds } = Y.decodeUpdate(update);
    return structs.length === 0 && ds.clients.size === 0 ? 'empty' : 'update';
  } catch {
    return 'malformed';
  }
}
