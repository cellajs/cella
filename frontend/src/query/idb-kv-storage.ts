import type { StateStorage } from 'zustand/middleware';
import { getAppDb } from '~/query/app-db';

/**
 * Zustand `StateStorage` over the per-user `appdb.kv` table, keyed by the store's
 * base name. Resolves the live DB on every operation so it follows rebinds, and
 * no-ops while signed out (no bound DB) — the structural replacement for the old
 * `:anon` namespace: anonymous visitors simply never persist.
 *
 * Pair with `skipHydration: true`; hydration is driven explicitly after the DB is
 * bound (see `~/query/app-storage`), not at store creation.
 */
export function idbKvStorage(base: string): StateStorage {
  return {
    getItem: async () => {
      const db = getAppDb();
      if (!db) return null;
      const row = await db.kv.get(base);
      return row?.value ?? null;
    },
    setItem: async (_name, value) => {
      const db = getAppDb();
      if (!db) return;
      await db.kv.put({ key: base, value });
    },
    removeItem: async () => {
      const db = getAppDb();
      if (!db) return;
      await db.kv.delete(base);
    },
  };
}
