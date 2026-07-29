import type { LocalUserStore } from '~/query/local-user-storage';

/**
 * Extra per-user zustand stores this app adds, appended to the master list in `local-user-storage`.
 *
 * Cella ships none. Add stores you persist in `localUserDb.kv` (e.g. a board or recency store) so
 * `localUserStorageReady` rehydrates them for the signed-in user and sign-out resets them. Each store
 * must expose `persist.rehydrate()` and a `getState().reset()`.
 */
export const extraLocalUserStores: LocalUserStore[] = [];
