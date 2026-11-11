import { settleOrReport } from '~/lib/tracing';
import { flushYjsStore } from '~/modules/common/blocknote/yjs-store';
import { storedUserIds, userStore } from '~/modules/user/user-store';
import { sweepLocalUserDbs } from '~/query/local-user-db';
import { resetPersister } from '~/query/persister';
import { queryClient } from '~/query/query-client';
import { longWaitMs, shortWaitMs } from '~/utils/wait-for';

/** Deletes the database of every user this browser no longer knows: the signed-in user's and the last user's stay. A failure is logged. */
export const sweepForgottenUserDbs = (): Promise<void> =>
  sweepLocalUserDbs(() => Object.values(storedUserIds())).catch((error) =>
    console.error('[localUserDb] Deleting the databases of forgotten users failed:', error),
  );

/** Drops this tab's authenticated state from memory, the queued writes synchronously, and leaves the database and the stored user to the caller. */
export const clearUserState = async (): Promise<void> => {
  // The database stays bound below: a flush of the cleared cache would delete its stored cache and queue.
  resetPersister();
  queryClient.clear();

  // Stored collaborative edits commit before the database closes: a lost session keeps them for the same user's next one.
  await settleOrReport('teardown.yjs_flush', shortWaitMs, flushYjsStore());
};

let teardowns = 0;

/** Whether a teardown is under way: the user stays in the store until the tab has left its page, and goes after. */
export const isTearingDown = () => teardowns > 0;

/**
 * Clears authenticated client state. `wipe` forgets the user and deletes their database; without it the database and
 * the identity hint survive. `leave` takes the tab off its page before the user goes, which a page still on screen
 * would read and throw over. Every step has its time and none can keep a tab signed in; it never rejects.
 */
export const teardownUserState = async (wipe = true, leave?: () => Promise<unknown>): Promise<void> => {
  teardowns++;
  try {
    // Before `leave`: a cache cleared under the page it opens would strand that page's first requests.
    await clearUserState();

    // The badge belongs to the service worker, which outlives this page.
    if (typeof navigator !== 'undefined' && 'clearAppBadge' in navigator) void navigator.clearAppBadge().catch(() => {});

    // Only the auth pages read `lastUser`: a wipe forgets it before one opens.
    if (leave && wipe) userStore.setState({ lastUser: null });
    const left = !leave || (await settleOrReport('teardown.leave', longWaitMs, leave()));

    // Nulling the user closes the local DB and resets every per-user store. A wipe forgets `lastUser` too, and so does
    // a hard sign-out another tab made meanwhile: with none stored any more, this tab's write would store its own again.
    if (wipe || !storedUserIds().lastUserId) userStore.getState().reset();
    else userStore.setState({ user: null, isSystemAdmin: false });

    // After the reset, which names nobody to keep. Other tabs see the delete and sign out too.
    if (wipe) await settleOrReport('teardown.sweep', shortWaitMs, sweepForgottenUserDbs());

    // The page still on screen reads the user that just went: a fresh load lets the route guard place the tab.
    if (!left) window.location.reload();
  } catch (error) {
    console.error('Clearing client state failed:', error);
  } finally {
    teardowns--;
  }
};
