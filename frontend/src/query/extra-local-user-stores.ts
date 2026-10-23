import type { LocalUserStore } from '~/query/local-user-storage';

/** Per-user zustand stores this app adds to `local-user-storage`'s list: kept in `localUserDb.kv`, rehydrated by `localUserStorageReady`, reset on sign-out. */
export const extraLocalUserStores: LocalUserStore[] = [];
