import { appConfig } from 'shared';
import { useAlertStore } from '~/modules/common/alerter/alert-store';
import { useBoardStore } from '~/modules/common/board/board-store';
import { useDraftStore } from '~/modules/common/form-draft/draft-store';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { useSeenStore } from '~/modules/seen/seen-store';
import { useUIStore } from '~/modules/ui/ui-store';
import { userStore } from '~/modules/user/user-store';
import { bindAppDb, closeAppDb } from '~/query/app-db';
import { resetPersisters } from '~/query/persister';
import { useSyncStore } from '~/query/realtime/sync-store';

/** Persisted zustand stores that live in `appdb.kv` (per-user; in-memory while signed out).
 *  Each exposes a uniform `reset()` so {@link unbind} can drop in-memory state on sign-out. */
const appKvStores = [useSeenStore, useSyncStore, useNavigationStore, useDraftStore, useAlertStore, useBoardStore];

let boundOwner: string | null = null;
let readyPromise: Promise<void> = Promise.resolve();

/** Listeners notified after every actual owner change (new owner id, or `null` on sign-out). */
const ownerListeners = new Set<(owner: string | null) => void>();

/**
 * Subscribe to appdb owner changes. Fires AFTER the DB is (re)bound or closed, so callbacks
 * see the live instance via `getAppDb()`. Used by long-lived consumers (e.g. attachment
 * services holding a `liveQuery`) that must re-subscribe against the freshly bound DB.
 */
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
  await Promise.all(appKvStores.map((store) => store.persist.rehydrate()));
}

function bindOwner(ownerId: string): void {
  boundOwner = ownerId;
  bindAppDb(ownerId);
  resetPersisters();
  readyPromise = hydrateAll();
}

function unbind(): void {
  boundOwner = null;
  closeAppDb();
  resetPersisters();
  // Reset in-memory state of every per-user store (DB is closed, so these writes no-op on persist).
  for (const store of appKvStores) store.getState().reset();
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

/** Resolves once `appdb` is open and all app kv stores have rehydrated for the current owner. */
export function appStorageReady(): Promise<void> {
  return readyPromise;
}

/**
 * One-time best-effort cleanup of pre-appdb client storage (hard cutover, no migration):
 * obsolete per-store localStorage/sessionStorage keys (incl. orphaned `...:anon`) and the
 * retired standalone IndexedDB databases. Failures are ignored because this only removes dead noise.
 */
function gcLegacyStorage(): void {
  const flag = `${appConfig.slug}-storage-gc-v2`;
  try {
    if (localStorage.getItem(flag)) return;

    // Obsolete zustand bases with keys in the `<slug>-<base>:<owner>` shape.
    const legacyBases = ['seen', 'sync', 'navigation', 'drafts', 'alerts'];
    const prefixes = legacyBases.map((b) => `${appConfig.slug}-${b}:`);
    for (const web of [localStorage, sessionStorage]) {
      for (const key of Object.keys(web)) {
        if (prefixes.some((p) => key.startsWith(p))) web.removeItem(key);
      }
    }

    // Retired global board-store key.
    localStorage.removeItem(`${appConfig.slug}-board-store`);

    // Retired standalone IndexedDB databases.
    indexedDB
      ?.databases?.()
      .then((dbs) => {
        for (const { name } of dbs) {
          if (!name) continue;
          const legacy =
            name === `${appConfig.slug}-query-persister` ||
            name.startsWith(`${appConfig.slug}-attachments:`) ||
            name.startsWith(`${appConfig.slug}-failed-sync:`);
          if (legacy) indexedDB.deleteDatabase(name);
        }
      })
      .catch(() => {});

    localStorage.setItem(flag, '1');
  } catch {
    // Non-critical: orphans are harmless and can be retried next boot.
  }
}

gcLegacyStorage();
userStore.subscribe(syncOwner);
useUIStore.subscribe(syncOwner);
syncOwner();
