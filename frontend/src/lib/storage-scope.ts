import { appConfig } from 'shared';

/**
 * Per-user local-storage namespacing.
 *
 * Client-side storage (IndexedDB query cache, queued mutations, persisted zustand
 * stores) is partitioned by the owning user id so one user can never read another
 * user's data on a shared browser. Isolation is therefore structural — a property
 * of the storage key — rather than something we must remember to flush on logout.
 *
 * The owner id is resolved synchronously from the persisted `user` store, which is
 * intentionally NOT per-user scoped (it is the bootstrap store that tells us who
 * the last user was). This lets us pick the namespace at module-init time, before
 * the async `/me` round-trip resolves — the cold-boot / offline-first case.
 */

/** Sentinel owner used before any user has signed in (or when the blob is unreadable). */
export const ANON_OWNER = 'anon';

/**
 * Synchronously resolve the owner id used to namespace per-user storage.
 * Reads `lastUser.id` (falling back to the current `user.id`) from the persisted
 * user store in localStorage. Returns {@link ANON_OWNER} when unavailable.
 */
export function getOwnerId(): string {
  try {
    if (typeof localStorage === 'undefined') return ANON_OWNER;
    const raw = localStorage.getItem(`${appConfig.slug}-user`);
    if (!raw) return ANON_OWNER;
    const state = (JSON.parse(raw) as { state?: { lastUser?: { id?: unknown }; user?: { id?: unknown } } })?.state;
    const id = state?.lastUser?.id ?? state?.user?.id;
    return typeof id === 'string' && id.length > 0 ? id : ANON_OWNER;
  } catch {
    return ANON_OWNER;
  }
}

/**
 * Build a per-user namespaced storage key from a base name,
 * e.g. `userScopedName('drafts')` → `cella-drafts:<ownerId>`.
 */
export function userScopedName(base: string): string {
  return `${appConfig.slug}-${base}:${getOwnerId()}`;
}

/** Query-cache persister scope for the current owner, e.g. `rq:<ownerId>`. */
export function getQueryScope(): string {
  return `rq:${getOwnerId()}`;
}
