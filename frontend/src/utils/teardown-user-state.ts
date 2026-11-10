import { flushYjsStore } from '~/modules/common/blocknote/yjs-store';
import { userStore } from '~/modules/user/user-store';
import { deleteLocalUserDb } from '~/query/local-user-db';
import { resetPersister } from '~/query/persister';
import { queryClient } from '~/query/query-client';

/** Drops this tab's authenticated state from memory, the queued writes synchronously, and leaves the database and the stored user to the caller. */
export const clearUserState = async (): Promise<void> => {
  // The database stays bound below: a flush of the cleared cache would delete its stored cache and queue.
  resetPersister();
  queryClient.clear();

  // Stored collaborative edits commit before the database closes: a lost session keeps them for the same user's next one.
  await flushYjsStore();
};

let teardowns = 0;

/** Whether a teardown is under way: the user stays in the store until the tab has left its page, and goes after. */
export const isTearingDown = () => teardowns > 0;

/**
 * Clears authenticated client state. `wipe` deletes the user's database and identity hint; without it both survive.
 * `leave` takes the tab off its page before the user goes, which a page still on screen would read and throw over.
 */
export const teardownUserState = async (wipe = true, leave?: () => Promise<unknown>): Promise<void> => {
  teardowns++;
  try {
    // Before `leave`: a cache cleared under the page it opens would strand that page's first requests.
    await clearUserState();

    // The badge belongs to the service worker, which outlives this page.
    if (typeof navigator !== 'undefined' && 'clearAppBadge' in navigator) void navigator.clearAppBadge().catch(() => {});

    // Hard sign-out only: destroy all per-user persisted data while the user is still known. Other tabs see the delete and sign out too.
    if (wipe) await deleteLocalUserDb();

    if (leave) {
      // Only the auth pages read `lastUser`: a wipe forgets it before one opens.
      if (wipe) userStore.setState({ lastUser: null });
      await leave().catch((error) => console.error('Leaving the page at sign-out failed:', error));
    }

    // Nulling the user closes the local DB and resets every per-user store; only a wipe forgets `lastUser`.
    if (wipe) userStore.getState().reset();
    else userStore.setState({ user: null, isSystemAdmin: false });
  } finally {
    teardowns--;
  }
};
