import * as Y from 'yjs';

/** Base state plus log payloads merged once; null when there is nothing at all. */
export function mergeState(base: Uint8Array | null, payloads: Uint8Array[]): Uint8Array | null {
  const parts = base && base.length > 0 ? [base, ...payloads] : payloads;
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return Y.mergeUpdates(parts);
}

/** True for an update carrying no structs and no deletions: the client's Step2 reply when it holds nothing the server lacks. Unparseable input counts as non-empty so it still reaches the log. */
export function isEmptyUpdate(update: Uint8Array): boolean {
  try {
    const { structs, ds } = Y.decodeUpdate(update);
    return structs.length === 0 && ds.clients.size === 0;
  } catch {
    return false;
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
