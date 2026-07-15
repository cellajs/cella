import type { StateStorage } from 'zustand/middleware';
import { type AppDatabase, getAppDb } from '~/query/app-db';

/** Trailing-debounce window: coalesces write bursts (e.g. per-frame resize) into one txn. */
const WRITE_DEBOUNCE_MS = 250;

/** Flush callbacks for every live store, invoked on tab hide for best-effort durability. */
const flushers = new Set<() => void>();
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') for (const flush of flushers) flush();
  });
}

/**
 * Zustand `StateStorage` over the per-user `appdb.kv` table, keyed by the store's base name.
 * Resolves the live DB on every op so it follows rebinds, and no-ops while signed out (anonymous
 * visitors simply never persist).
 *
 * Writes are trailing-debounced ({@link WRITE_DEBOUNCE_MS}) so high-frequency `set`s (e.g. a
 * resize loop persisting board layout every frame) collapse into one IndexedDB transaction.
 * `createJSONStorage` calls this factory once per store, so per-store state lives in the closure.
 *
 * Pair with `skipHydration: true`; hydration is driven explicitly after the DB is bound
 * (see `~/query/app-storage`), not at store creation.
 */
export function idbKvStorage(base: string): StateStorage {
  let pending: { value: string; db: AppDatabase } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!pending) return;
    const { value, db } = pending;
    pending = null;
    // Skip if signed out or rebound to another owner since scheduling (cross-user isolation).
    if (getAppDb() === db) void db.kv.put({ key: base, value });
  };
  flushers.add(flush);

  return {
    getItem: async () => {
      if (pending) return pending.value; // read-after-write: pending value wins over disk
      const row = await getAppDb()?.kv.get(base);
      return row?.value ?? null;
    },
    setItem: (_name, value) => {
      const db = getAppDb();
      if (!db) return;
      pending = { value, db };
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, WRITE_DEBOUNCE_MS);
    },
    removeItem: async () => {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
      await getAppDb()?.kv.delete(base);
    },
  };
}
