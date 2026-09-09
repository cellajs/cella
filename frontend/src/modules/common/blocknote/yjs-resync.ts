import type * as Y from 'yjs';

/** Structs stay parked this long before the watch treats the document as stuck. */
export const PARKED_GRACE_MS = 2_000;
/** Minimum spacing between two resyncs of the same connection. */
export const RESYNC_COOLDOWN_MS = 10_000;
const POLL_MS = 1_000;

interface ResyncableProvider {
  wsconnected: boolean;
  disconnect: () => void;
  connect: () => void;
}

/**
 * Self-healing for a lost update. When an inbound update depends on one that never arrived, Yjs
 * parks it and everything after it in `store.pendingStructs`: edits stop propagating while the
 * connection looks healthy, and nothing else notices. A fresh handshake clears it: the relay
 * answers Step1 with exactly the missing range, then asks for what it lacks itself. The watch polls
 * the store and reconnects once the park has lasted `PARKED_GRACE_MS` while connected, with a
 * cooldown so a gap the relay itself cannot fill does not turn into a reconnect storm.
 */
export function watchPendingStructs(
  doc: Y.Doc,
  provider: ResyncableProvider,
  now: () => number = Date.now,
): () => void {
  let parkedSince = 0;
  let lastResyncAt = 0;

  const check = () => {
    const store = doc.store as unknown as { pendingStructs: unknown };
    const parked = store.pendingStructs !== null && store.pendingStructs !== undefined;
    const time = now();
    if (!parked) {
      parkedSince = 0;
      return;
    }
    if (parkedSince === 0) parkedSince = time;
    if (time - parkedSince < PARKED_GRACE_MS) return;
    if (time - lastResyncAt < RESYNC_COOLDOWN_MS) return;
    if (!provider.wsconnected) return;

    lastResyncAt = time;
    parkedSince = time;
    provider.disconnect();
    provider.connect();
  };

  const timer = setInterval(check, POLL_MS);
  return () => clearInterval(timer);
}
