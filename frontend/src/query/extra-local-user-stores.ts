import type { LocalUserStore } from '~/query/local-user-storage';

/**
 * Extra per-user zustand stores this app adds, appended to the list in `local-user-storage`.
 * Add stores persisted in `localUserDb.kv` so `localUserStorageReady` rehydrates them and sign-out resets them; each must expose `persist.rehydrate()` and `getState().reset()`.
 */
export const extraLocalUserStores: LocalUserStore[] = [];
