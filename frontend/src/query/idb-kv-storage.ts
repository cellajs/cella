import type { StateStorage } from 'zustand/middleware';
import { getLocalUserDb, type LocalUserDatabase } from '~/query/local-user-db';
import { onPageHide } from '~/utils/on-page-hide';

/** Trailing-debounce window: batches a burst of writes into one transaction. */
const writeDebounceMs = 250;

/** Flush callbacks for every live store, invoked on tab hide for best-effort durability. */
const flushers = new Set<() => void>();

/** What a cache-bound store's write waits for: the persister's write of the cache as it stands, once the persister loads. */
let cacheWritten = () => Promise.resolve();

export const setCacheWritten = (wait: () => Promise<void>) => {
  cacheWritten = wait;
};

/**
 * Issue every store's pending write now. A put issued while the page unloads (a reload's pagehide) does not commit,
 * so a write that has to survive a reload calls this when it is made. A hide listener registered after this module's
 * own calls it after its write.
 */
export const flushKvWrites = () => {
  for (const flush of flushers) flush();
};

onPageHide(flushKvWrites);

type PendingWrite = { value: string; db: LocalUserDatabase };

/**
 * Per-user Zustand storage over the live app database: writes are trailing-debounced per store, signed-out operations
 * no-op, and every operation re-resolves the bound database. A `cacheBound` store, whose record describes cached rows,
 * stores a value only once the persister has written the cache as it stood when the value was set.
 */
export function idbKvStorage(key: string, { cacheBound = false } = {}): StateStorage {
  let pending: PendingWrite | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** The value a cache-bound store waits to write; a newer one in `pending` waits for a later cache write. */
  let riding: PendingWrite | null = null;

  const put = ({ value, db }: PendingWrite) => {
    // Skip if signed out or rebound to another user since scheduling (cross-user isolation).
    if (getLocalUserDb() === db) void db.kv.put({ key, value });
  };

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!pending) return;
    put(pending);
    pending = null;
  };
  // An early put from `flushKvWrites` would reach disk ahead of the rows: the persister's hide flush settles the wait.
  if (!cacheBound) flushers.add(flush);

  // The rows a value covers were patched before it was set: the cache write requested now holds them.
  const writeAfterCache = () => {
    const ride = pending;
    riding = ride;
    void cacheWritten().then(() => {
      if (!ride || riding !== ride) return;
      put(ride);
      if (pending === ride) {
        pending = null;
        riding = null;
      } else writeAfterCache();
    });
  };

  return {
    getItem: async () => {
      const db = getLocalUserDb();
      // A write still waiting is newer than the disk, for the database it was made in.
      if (pending?.db === db) return pending.value;
      const row = await db?.kv.get(key);
      // Unbound or rebound while the read ran: the row is not this binding's.
      return getLocalUserDb() === db ? (row?.value ?? null) : null;
    },
    setItem: (_name, value) => {
      const db = getLocalUserDb();
      if (!db) return;
      pending = { value, db };
      if (cacheBound) {
        if (!riding) writeAfterCache();
        return;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, writeDebounceMs);
    },
    removeItem: async () => {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
      riding = null;
      await getLocalUserDb()?.kv.delete(key);
    },
  };
}
