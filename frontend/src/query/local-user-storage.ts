import { useAlertStore } from '~/modules/common/alerter/alert-store';
import { useBoardStore } from '~/modules/common/board/board-store';
import { useDraftStore } from '~/modules/common/form-draft/draft-store';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { seenStore } from '~/modules/seen/seen-store';
import { useUIStore } from '~/modules/ui/ui-store';
import { userStore } from '~/modules/user/user-store';
import { extraLocalUserStores } from '~/query/extra-local-user-stores';
import { bindLocalUserDb, closeLocalUserDb } from '~/query/local-user-db';
import { resetPersisters } from '~/query/persister';
import { syncStore } from '~/query/realtime/sync-store';

/** Minimal contract a per-user store must satisfy to join {@link localUserStores}: hydrate on bind, reset on sign-out. */
export interface LocalUserStore {
  persist: { rehydrate: () => void | Promise<void> };
  getState: () => { reset: () => void };
}

/** Persisted zustand stores living in `localUserDb.kv`, in-memory while signed out. Each exposes `reset()` for {@link unbind}; an app appends its own via {@link extraLocalUserStores}. */
const localUserStores = [
  seenStore,
  syncStore,
  useNavigationStore,
  useDraftStore,
  useAlertStore,
  useBoardStore,
  ...extraLocalUserStores,
];

let boundOwner: string | null = null;
let readyPromise: Promise<void> = Promise.resolve();

/** Listeners notified after every actual owner change (new owner id, or `null` on sign-out). */
const ownerListeners = new Set<(owner: string | null) => void>();

/** Fires after the DB is rebound or closed, so callbacks see the live instance via `getLocalUserDb()`. Long-lived holders of a `liveQuery` must re-subscribe here. */
export function subscribeOwnerChange(listener: (owner: string | null) => void): () => void {
  ownerListeners.add(listener);
  return () => ownerListeners.delete(listener);
}

/** Owner to bind: the current user, unless impersonating (then ephemeral, no durable DB). */
function resolveOwner(): string | null {
  if (useUIStore.getState().impersonating) return null;
  const id = userStore.getState().user?.id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

async function hydrateAll(): Promise<void> {
  await Promise.all(localUserStores.map((store) => store.persist.rehydrate()));
}

function bindOwner(ownerId: string): void {
  boundOwner = ownerId;
  bindLocalUserDb(ownerId);
  resetPersisters();
  readyPromise = hydrateAll();
}

function unbind(): void {
  boundOwner = null;
  closeLocalUserDb();
  resetPersisters();
  // The DB is already closed, so these resets no-op on persist.
  for (const store of localUserStores) store.getState().reset();
  readyPromise = Promise.resolve();
}

/** Reconcile the bound DB with the current auth state. Cheap; no-ops when unchanged. */
function syncOwner(): void {
  const owner = resolveOwner();
  if (owner === boundOwner) return;
  if (owner) bindOwner(owner);
  else unbind();
  for (const listener of ownerListeners) listener(boundOwner);
}

/** Resolves once `localUserDb` is open and all local user stores have rehydrated for the current owner. */
export function localUserStorageReady(): Promise<void> {
  return readyPromise;
}

userStore.subscribe(syncOwner);
useUIStore.subscribe(syncOwner);
syncOwner();
