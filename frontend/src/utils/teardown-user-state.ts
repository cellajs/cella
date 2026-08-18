import { useUIStore } from '~/modules/ui/ui-store';
import { useUserStore } from '~/modules/user/user-store';
import { deleteLocalUserDb } from '~/query/local-user-db';
import { queryClient } from '~/query/query-client';

/** Clears authenticated client state. `wipe` deletes the user's database and identity hint; without it both survive. */
export const teardownUserState = async (wipe = true): Promise<void> => {
  queryClient.clear();

  // Hard sign-out only: destroy all per-user persisted data while the owner is still known.
  if (wipe) await deleteLocalUserDb();

  // Reset the bootstrap UI session flags (impersonation, offline access); theme/mode persist.
  useUIStore.getState().reset();

  // Nulling the user closes the local DB and resets every per-user store; only a wipe forgets `lastUser`.
  if (wipe) useUserStore.getState().reset();
  else useUserStore.setState({ user: null, isSystemAdmin: false, yjsTokens: {} });
};
