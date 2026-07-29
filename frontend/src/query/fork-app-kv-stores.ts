import type { AppKvStore } from '~/query/app-storage';

/**
 * Fork-owned per-user zustand stores, appended to the app's kv-store list in `app-storage`.
 *
 * Cella ships none; forks add stores they persist in `appdb.kv` (e.g. a board or recency store) so
 * `appStorageReady` rehydrates them for the signed-in user and sign-out resets them. Each store must
 * expose `persist.rehydrate()` and a `getState().reset()`.
 */
export const forkAppKvStores: AppKvStore[] = [];
