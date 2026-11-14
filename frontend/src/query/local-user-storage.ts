import { persistQueryClientRestore } from '@tanstack/react-query-persist-client';
import { settleOrReport } from '~/lib/tracing';
import { offlineFilesStore } from '~/modules/attachment/offline/offline-files-store';
import { endSession, sweepForgottenUserDbs } from '~/modules/auth/end-session';
import { alertStore } from '~/modules/common/alerter/alert-store';
import { boardStore } from '~/modules/common/board/board-store';
import { draftStore } from '~/modules/common/form-draft/draft-store';
import { navigationStore } from '~/modules/navigation/navigation-store';
import { seenStore } from '~/modules/seen/seen-store';
import { storedUserIds, userStorageKey, userStore } from '~/modules/user/user-store';
import { extraLocalUserStores } from '~/query/extra-local-user-stores';
import { bindLocalUserDb, closeLocalUserDb, getLocalUserDb, notifyLocalUserChange } from '~/query/local-user-db';
import { persistOptions, resetPersister } from '~/query/persister';
import { queryClient } from '~/query/query-client';
import { resumeRestoredMutations } from '~/query/realtime/stream-manager';
import { syncStore } from '~/query/realtime/sync-store';
import { longWaitMs } from '~/utils/wait-for';

/** Minimal contract a per-user store must satisfy to join {@link localUserStores}: hydrate on bind, reset on sign-out. */
export interface LocalUserStore {
  persist: { rehydrate: () => void | Promise<void> };
  getState: () => { reset: () => void };
}

/** Persisted zustand stores living in `localUserDb.kv`, in-memory while signed out. Each exposes `reset()` for {@link unbind}; an app appends its own via {@link extraLocalUserStores}. */
const localUserStores = [seenStore, syncStore, navigationStore, draftStore, alertStore, boardStore, offlineFilesStore, ...extraLocalUserStores];

let boundUserId: string | null = null;
let readyPromise: Promise<void> = Promise.resolve();

/**
 * Warns about restored mutations that hold no `mutationFn`: their module set its defaults after the restore, so their
 * replay fails. Runs after the restore, before resuming.
 */
function warnMutationsWithoutDefaults(): void {
  const keys = queryClient
    .getMutationCache()
    .getAll()
    .filter((mutation) => mutation.state.isPaused && !mutation.options.mutationFn)
    .map((mutation) => mutation.options.mutationKey);
  if (keys.length === 0) return;
  console.warn('[QueryPersister] Restored mutations without a mutationFn; import their query.ts from the <name>-module.ts file', keys);
}

/**
 * Restores the query cache from the database just bound, at boot or when the same user signs in again after a lost
 * session, and resumes the writes queued in it after catchup. A failed restore resumes what it hydrated before failing.
 */
async function restoreQueryCache(): Promise<void> {
  await persistQueryClientRestore({ ...persistOptions, queryClient }).catch((error) => console.error('[QueryPersister] Restore failed:', error));
  warnMutationsWithoutDefaults();
  resumeRestoredMutations();
}

function bindLocalUser(userId: string): void {
  boundUserId = userId;
  const previous = getLocalUserDb();
  const db = bindLocalUserDb(userId);
  // A second evaluation of this module, as on an HMR update, finds the database bound and its cache in memory.
  if (db === previous) return;
  resetPersister();
  const rehydrations = localUserStores.map((store) => store.persist.rehydrate());
  readyPromise = settleOrReport('local_user_db.bind', longWaitMs, Promise.all([...rehydrations, restoreQueryCache()])).then((answered) => {
    if (answered || getLocalUserDb() !== db) return;
    // The tab goes on without a database, as while signed out, until its next load. Closed and reset, a read that
    // answers late fills nothing: it would put stored state over what the page loaded meanwhile.
    closeLocalUserDb();
    resetPersister();
    notifyLocalUserChange(null);
  });
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
  const userId = userStore.getState().user?.id || null;
  if (userId === boundUserId) return;
  if (userId) bindLocalUser(userId);
  else unbind();
  notifyLocalUserChange(boundUserId);
}

/** Resolves once `localUserDb` is open for the current user, all local user stores have rehydrated and the query cache is restored from it. */
export const localUserStorageReady = (): Promise<void> => readyPromise;

// Before the first bind: an anonymous session past its expiry has signed out by itself, and nothing loads as it.
const stored = userStore.getState();
if (stored.user?.isAnonymous && stored.session && Date.parse(stored.session.expiresAt) <= Date.now()) void endSession('expired');

userStore.subscribe(reconcileLocalUser);
reconcileLocalUser();

// A delete that a sign-out could not finish, as while another tab held the database open, is made here.
void sweepForgottenUserDbs();

// Another tab stored another signed-in user, or none: this tab boots again as whoever it names.
window.addEventListener('storage', (event) => {
  if (event.key === userStorageKey && storedUserIds(event.newValue).userId !== userStore.getState().user?.id) void endSession('elsewhere');
});
