import { offlineFilesStore } from '~/modules/attachment/offline/offline-files-store';
import { alertStore } from '~/modules/common/alerter/alert-store';
import { boardStore } from '~/modules/common/board/board-store';
import { draftStore } from '~/modules/common/form-draft/draft-store';
import { navigationStore } from '~/modules/navigation/navigation-store';
import { seenStore } from '~/modules/seen/seen-store';
import { userStorageKey, userStore } from '~/modules/user/user-store';
import { extraLocalUserStores } from '~/query/extra-local-user-stores';
import { bindLocalUserDb, closeLocalUserDb, deletedElsewhereListeners, notifyLocalUserChange } from '~/query/local-user-db';
import { resetPersisters } from '~/query/persister';
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

function bindLocalUser(userId: string): void {
  boundUserId = userId;
  bindLocalUserDb(userId);
  resetPersisters();
  readyPromise = hydrateAll();
}

function unbind(): void {
  boundUserId = null;
  closeLocalUserDb();
  resetPersisters();
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

/** Resolves once `localUserDb` is open and all local user stores have rehydrated for the current user. */
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
