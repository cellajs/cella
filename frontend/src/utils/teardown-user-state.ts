import { flushYjsStore } from '~/modules/common/blocknote/yjs-store';
import { userStore } from '~/modules/user/user-store';
import { deleteLocalUserDb } from '~/query/local-user-db';
import { queryClient } from '~/query/query-client';

/** Drops this tab's authenticated state from memory, the queued writes synchronously, and leaves the database and the stored user to the caller. */
export const clearUserState = async (): Promise<void> => {
  queryClient.clear();

  // Stored collaborative edits commit before the database closes: a lost session keeps them for the same user's next one.
  await flushYjsStore();
};

/** Clears authenticated client state. `wipe` deletes the user's database and identity hint; without it both survive. */
export const teardownUserState = async (wipe = true): Promise<void> => {
  await clearUserState();

  // The badge belongs to the service worker, which outlives this page.
  if (typeof navigator !== 'undefined' && 'clearAppBadge' in navigator) void navigator.clearAppBadge().catch(() => {});

  // Hard sign-out only: destroy all per-user persisted data while the user is still known. Other tabs see the delete and sign out too.
  if (wipe) await deleteLocalUserDb();

  // Nulling the user closes the local DB and resets every per-user store; only a wipe forgets `lastUser`.
  if (wipe) userStore.getState().reset();
  else userStore.setState({ user: null, isSystemAdmin: false, impersonator: null, yjsTokens: {} });
};
