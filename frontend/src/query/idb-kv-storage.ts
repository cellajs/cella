import type { StateStorage } from 'zustand/middleware';
import { getLocalUserDb, type LocalUserDatabase } from '~/query/local-user-db';

/** Trailing-debounce window: batches write bursts (e.g. per-frame resize) into one txn. */
const WRITE_DEBOUNCE_MS = 250;

/** Flush callbacks for every live store, invoked on tab hide for best-effort durability. */
const flushers = new Set<() => void>();
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') for (const flush of flushers) flush();
  });
}

/**
 * Creates per-user Zustand storage backed by the live app database.
 * Writes are trailing-debounced per store, signed-out operations do nothing, and database rebinds
 * are resolved on every operation. Pair with explicit post-bind hydration.
 */
export function idbKvStorage(base: string): StateStorage {
  let pending: { value: string; db: LocalUserDatabase } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!pending) return;
    const { value, db } = pending;
    pending = null;
    // Skip if signed out or rebound to another owner since scheduling (cross-user isolation).
    if (getLocalUserDb() === db) void db.kv.put({ key: base, value });
  };
  flushers.add(flush);

  return {
    getItem: async () => {
      if (pending) return pending.value; // read-after-write: pending value wins over disk
      const row = await getLocalUserDb()?.kv.get(base);
      return row?.value ?? null;
    },
    setItem: (_name, value) => {
      const db = getLocalUserDb();
      if (!db) return;
      pending = { value, db };
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, WRITE_DEBOUNCE_MS);
    },
    removeItem: async () => {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
      await getLocalUserDb()?.kv.delete(base);
    },
  };
}
