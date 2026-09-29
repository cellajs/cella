import * as Y from 'yjs';
import type { LogRow } from '../data/storage';

/** Base state plus log payloads merged once; null when there is nothing at all. */
export function mergeState(base: Uint8Array | null, payloads: Uint8Array[]): Uint8Array | null {
  const parts = base && base.length > 0 ? [base, ...payloads] : payloads;
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return Y.mergeUpdates(parts);
}

/**
 * The merged document and the log rows left out of it: a row Yjs cannot decode, or one that decodes but will not
 * merge, is left out, so one bad row never blocks the document or the rows logged after it. Rows merge in one call,
 * and one at a time only when that call throws. The base is written by compaction and seeding alone, so it is trusted.
 */
export function mergeLog(
  base: Uint8Array | null,
  rows: readonly LogRow[],
): { state: Uint8Array | null; rejected: LogRow[] } {
  const rejected = rows.filter((row) => classifyUpdate(row.payload) === 'malformed');
  const decodable = rejected.length > 0 ? rows.filter((row) => !rejected.includes(row)) : rows;
  try {
    return {
      state: mergeState(
        base,
        decodable.map((row) => row.payload),
      ),
      rejected,
    };
  } catch {
    // A row that decodes can still fail to merge: merge one at a time to find it.
  }
  let state = base && base.length > 0 ? base : null;
  for (const row of decodable) {
    try {
      state = state ? Y.mergeUpdates([state, row.payload]) : row.payload;
    } catch {
      rejected.push(row);
    }
  }
  return { state, rejected };
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

/** True when the update integrates into an empty doc without leaving structs parked on a missing dependency. */
export function isIntegrable(update: Uint8Array): boolean {
  try {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, update);
    const store = doc.store as unknown as { pendingStructs: unknown };
    const integrable = store.pendingStructs === null;
    doc.destroy();
    return integrable;
  } catch {
    return false;
  }
}
