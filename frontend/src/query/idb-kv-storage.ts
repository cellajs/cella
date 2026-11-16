import type { StateStorage } from 'zustand/middleware';
import { getLocalUserDb, type LocalUserDatabase } from '~/query/local-user-db';
import { onPageHide } from '~/utils/on-page-hide';

/** Trailing-debounce window: batches a burst of writes into one transaction. */
const writeDebounceMs = 250;

/** Flush callbacks for every live store, invoked on tab hide for best-effort durability. */
const flushers = new Set<() => void>();

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

interface KvStorageOptions {
  /**
   * Called when a value is set: the value is stored once the wait settles, and no debounce applies. A store whose
   * record describes cached rows passes `whenCacheWritten`.
   */
  writeAfter?: () => Promise<void>;
}

/**
 * Per-user Zustand storage over the live app database: writes are trailing-debounced per store, or made after the
 * store's own `writeAfter`, signed-out operations no-op, and every operation re-resolves the bound database.
 */
export function idbKvStorage(key: string, { writeAfter }: KvStorageOptions = {}): StateStorage {
  let pending: PendingWrite | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** The value whose wait is under way; a newer one in `pending` starts a wait of its own after it. */
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
  // An early put from `flushKvWrites` would reach disk ahead of what the store waits for.
  if (!writeAfter) flushers.add(flush);

  const putAfter = (wait: () => Promise<void>) => {
    const ride = pending;
    riding = ride;
    void wait().then(() => {
      if (!ride || riding !== ride) return;
      put(ride);
      if (pending === ride) {
        pending = null;
        riding = null;
      } else putAfter(wait);
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
      if (writeAfter) {
        if (!riding) putAfter(writeAfter);
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
