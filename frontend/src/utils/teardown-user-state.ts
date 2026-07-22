import type { MeUser } from '~/modules/me/types';
import { useUIStore } from '~/modules/ui/ui-store';
import { useUserStore } from '~/modules/user/user-store';
import { deleteAppDb } from '~/query/app-db';
import { queryClient } from '~/query/query-client';

/**
 * Clears authenticated client state with structural per-user isolation.
 * A hard sign-out deletes the user's database and identity hint; a soft session loss only closes
 * it so the same user can recover offline work after reauthentication.
 */
export const teardownUserState = async (wipe = true): Promise<void> => {
  queryClient.clear();

  // Hard sign-out only: destroy all per-user persisted data while the owner is still known.
  if (wipe) await deleteAppDb();

  // Reset the bootstrap UI session flags (impersonation, offline access); theme/mode persist.
  useUIStore.getState().reset();

  // Nulling the user drives the appdb lifecycle to unbind (close) the DB and reset every
  // per-user store's in-memory state. A hard wipe also forgets `lastUser`; a soft teardown keeps it.
  if (wipe) useUserStore.getState().reset();
  else useUserStore.setState({ user: null as unknown as MeUser, isSystemAdmin: false, yjsTokens: {} });
};
