import type { MeUser } from '~/modules/me/types';
import { useUIStore } from '~/modules/ui/ui-store';
import { useUserStore } from '~/modules/user/user-store';
import { deleteAppDb } from '~/query/app-db';
import { queryClient } from '~/query/query-client';

/**
 * Flush client state when the user leaves the authenticated app.
 *
 * Cross-user isolation is structural: all per-user data lives in one IndexedDB named for the
 * owner (`~/query/app-db`). Nulling the user drives the auth-driven lifecycle
 * (`~/query/app-storage`) to unbind that DB and reset the in-memory per-user zustand stores.
 *
 * Two modes control whether the user's data is destroyed or merely closed:
 * - `wipe = true` (explicit sign-out, default): delete the appdb outright and forget `lastUser`.
 *   Nothing per-user lingers on disk, a clean slate for shared machines.
 * - `wipe = false` (involuntary session loss, e.g. a 401): keep the appdb and `lastUser` on disk.
 *   The DB is only closed, so the SAME user recovers their offline work (queued mutations, drafts)
 *   and gets a prefilled sign-in after re-authenticating. Avoids data loss on a transient expiry.
 */
export const flushStores = async (wipe = true): Promise<void> => {
  queryClient.clear();

  // Hard sign-out only: destroy all per-user persisted data while the owner is still known.
  if (wipe) await deleteAppDb();

  // Reset the bootstrap UI session flags (impersonation, offline access); theme/mode persist.
  useUIStore.getState().reset();

  // Nulling the user drives the appdb lifecycle to unbind (close) the DB and reset every
  // per-user store's in-memory state. A hard wipe also forgets `lastUser`; a soft flush keeps it.
  if (wipe) useUserStore.getState().reset();
  else useUserStore.setState({ user: null as unknown as MeUser, isSystemAdmin: false, yjsTokens: {} });
};
