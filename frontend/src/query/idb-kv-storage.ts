import type { StateStorage } from 'zustand/middleware';
import { getLocalUserDb, type LocalUserDatabase } from '~/query/local-user-db';
import { onPageHide } from '~/utils/on-page-hide';

/** Trailing-debounce window: batches write bursts (e.g. per-frame resize) into one transaction. */
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

/** Per-user Zustand storage over the live app database: writes are trailing-debounced per store, signed-out operations no-op, and every operation re-resolves the bound database. */
export function idbKvStorage(key: string): StateStorage {
  let pending: { value: string; db: LocalUserDatabase } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!pending) return;
    const { value, db } = pending;
    pending = null;
    // Skip if signed out or rebound to another owner since scheduling (cross-user isolation).
    if (getLocalUserDb() === db) void db.kv.put({ key, value });
  };
  flushers.add(flush);

  return {
    getItem: async () => {
      // A write still in the debounce window is newer than the disk.
      if (pending) return pending.value;
      const row = await getLocalUserDb()?.kv.get(key);
      return row?.value ?? null;
    },
    setItem: (_name, value) => {
      const db = getLocalUserDb();
      if (!db) return;
      pending = { value, db };
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, writeDebounceMs);
    },
    removeItem: async () => {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
      await getLocalUserDb()?.kv.delete(key);
    },
  };
}
