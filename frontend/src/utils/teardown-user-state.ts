import { flushYjsStore } from '~/modules/common/blocknote/yjs-store';
import { useUIStore } from '~/modules/ui/ui-store';
import { useUserStore } from '~/modules/user/user-store';
import { deleteLocalUserDb } from '~/query/local-user-db';
import { queryClient } from '~/query/query-client';

/** Clears authenticated client state. `wipe` deletes the user's database and identity hint; without it both survive. */
export const teardownUserState = async (wipe = true): Promise<void> => {
  queryClient.clear();

  // The badge belongs to the service worker, which outlives this page.
  if (typeof navigator !== 'undefined' && 'clearAppBadge' in navigator) void navigator.clearAppBadge().catch(() => {});

  // Stored collaborative edits commit before the database closes: a lost session keeps them for the same user's next one.
  await flushYjsStore();

  // Hard sign-out only: destroy all per-user persisted data while the owner is still known. Other tabs see the delete and sign out too.
  if (wipe) await deleteLocalUserDb();

  // Reset the bootstrap UI session flag (offline access); theme/mode persist.
  useUIStore.getState().reset();

  // Nulling the user closes the local DB and resets every per-user store; only a wipe forgets `lastUser`.
  if (wipe) useUserStore.getState().reset();
  else useUserStore.setState({ user: null, isSystemAdmin: false, impersonator: null, yjsTokens: {} });
};
