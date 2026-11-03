import { persistQueryClientRestore } from '@tanstack/react-query-persist-client';
import { offlineFilesStore } from '~/modules/attachment/offline/offline-files-store';
import { alertStore } from '~/modules/common/alerter/alert-store';
import { boardStore } from '~/modules/common/board/board-store';
import { draftStore } from '~/modules/common/form-draft/draft-store';
import { navigationStore } from '~/modules/navigation/navigation-store';
import { seenStore } from '~/modules/seen/seen-store';
import { userStorageKey, userStore } from '~/modules/user/user-store';
import { extraLocalUserStores } from '~/query/extra-local-user-stores';
import {
  bindLocalUserDb,
  closeLocalUserDb,
  deletedElsewhereListeners,
  getLocalUserDb,
  type LocalUserDatabase,
  notifyLocalUserChange,
} from '~/query/local-user-db';
import { persister, persistOptions, resetPersister } from '~/query/persister';
import { cacheRestored, queryClient } from '~/query/query-client';
import { resumeRestoredMutations } from '~/query/realtime/stream-manager';
import { syncStore } from '~/query/realtime/sync-store';
import { clearUserState, teardownUserState } from '~/utils/teardown-user-state';

/** Minimal contract a per-user store must satisfy to join {@link localUserStores}: hydrate on bind, reset on sign-out. */
export interface LocalUserStore {
  persist: { rehydrate: () => void | Promise<void> };
  getState: () => { reset: () => void };
}

/** Persisted zustand stores living in `localUserDb.kv`, in-memory while signed out. Each exposes `reset()` for {@link unbind}; an app appends its own via {@link extraLocalUserStores}. */
const localUserStores = [seenStore, syncStore, navigationStore, draftStore, alertStore, boardStore, offlineFilesStore, ...extraLocalUserStores];

let boundUserId: string | null = null;
let readyPromise: Promise<void> = Promise.resolve();

/** The user whose database to bind: the current user, unless impersonated (then ephemeral, no durable DB). */
function resolveLocalUserId(): string | null {
  const { user, impersonator } = userStore.getState();
  return impersonator ? null : user?.id || null;
}

/** The signed-in user id in a value the user store persisted; `null` when signed out, removed or unreadable. */
function storedUserId(value: string | null): string | null {
  try {
    const stored: { state?: { user?: { id?: string } | null } } | null = JSON.parse(value ?? 'null');
    return stored?.state?.user?.id ?? null;
  } catch {
    return null;
  }
}

async function hydrateAll(): Promise<void> {
  await Promise.all(localUserStores.map((store) => store.persist.rehydrate()));
}

/**
 * The provider restores the query cache once per page. A database bound after it read, as when the same user signs in
 * again after a lost session, restores here, the writes that session left queued included.
 */
async function restoreQueryCache(db: LocalUserDatabase): Promise<void> {
  await cacheRestored;
  if (getLocalUserDb() !== db || persister.isRestored()) return;
  await persistQueryClientRestore({ ...persistOptions, queryClient }).catch((error) => console.error('[QueryPersister] Restore failed:', error));
  resumeRestoredMutations();
}

function bindLocalUser(userId: string): void {
  boundUserId = userId;
  const previous = getLocalUserDb();
  const db = bindLocalUserDb(userId);
  // A second evaluation of this module, as on an HMR update, finds the database bound and its cache in memory.
  if (db === previous) return;
  resetPersister();
  readyPromise = Promise.all([hydrateAll(), restoreQueryCache(db)]).then(() => {});
}

function unbind(): void {
  boundUserId = null;
  closeLocalUserDb();
  resetPersister();
  // The DB is already closed, so these resets no-op on persist.
  for (const store of localUserStores) store.getState().reset();
  readyPromise = Promise.resolve();
}

/** Reconcile the bound DB with the current auth state. Cheap; no-ops when unchanged. */
function reconcileLocalUser(): void {
  const userId = resolveLocalUserId();
  if (userId === boundUserId) return;
  if (userId) bindLocalUser(userId);
  else unbind();
  notifyLocalUserChange(boundUserId);
}

/** Resolves once `localUserDb` is open for the current user, all local user stores have rehydrated and the query cache is restored from it. */
export function localUserStorageReady(): Promise<void> {
  return readyPromise;
}

userStore.subscribe(reconcileLocalUser);
reconcileLocalUser();

// Another tab stored another signed-in user, or none: this tab's queued writes would replay on whatever session the
// browser holds next. They leave memory before a focus or online event can resume them, their copy stays on disk for
// their user, and the tab boots as whoever is signed in. It stores no user, which the other tab would read as a sign-out.
window.addEventListener('storage', (event) => {
  const userId = userStore.getState().user?.id;
  if (event.key !== userStorageKey || !userId || storedUserId(event.newValue) === userId) return;
  void clearUserState().finally(() => {
    closeLocalUserDb();
    window.location.reload();
  });
});

// Another tab's hard sign-out deleted this user's database: mirror it here, then leave the app. A lazy import keeps the
// router out of this module's importer graph.
deletedElsewhereListeners.add(() => {
  void teardownUserState()
    .then(() => import('~/routes/router'))
    .then(({ router }) => router.navigate({ to: '/auth/authenticate', replace: true }));
});
