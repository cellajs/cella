import { signOut } from 'sdk';
import { appConfig } from 'shared';
import { safeRedirectPath } from 'shared/utils/safe-redirect-path';
import { ApiError } from '~/lib/api';
import { boundaryOf } from '~/lib/boundary';
import { settleOrReport } from '~/lib/tracing';
import { flushYjsStore } from '~/modules/common/blocknote/yjs-store';
import type { MeUser } from '~/modules/me/types';
import { disablePushSubscription } from '~/modules/notification/use-push-subscription';
import { seenStore } from '~/modules/seen/seen-store';
import { storedUserIds, userStore } from '~/modules/user/user-store';
import { closeLocalUserDb, sweepLocalUserDbs } from '~/query/local-user-db';
import { resetPersister } from '~/query/persister';
import { queryClient } from '~/query/query-client';
import { getRouter } from '~/routes/-router-instance';
import { stringifySearch } from '~/routes/-search-serializer';
import { longWaitMs, shortWaitMs } from '~/utils/wait-for';

/** Why a tab stops being its user: each is a row of the table in `cella/CLIENT.md`, which `end-session.test.ts` runs. */
export type SessionEnd = 'sign-out' | 'lost' | 'elsewhere' | 'expired' | 'replaced';

interface Ending {
  /** What the hint forgets: the user and the last user, the user only, or nothing, as another tab wrote it. */
  forget: 'both' | 'user' | 'none';
  /** Whether the database goes too. A kept one closes, with its offline work, for the same user's next session. */
  deleteDatabase: boolean;
  /** The page the tab loads next: a path, `here` for the one it is on, or null to stay, as nothing has rendered yet. */
  load: string | null;
}

/** Whether the page on screen needs an account. */
const onAppPage = () => boundaryOf(getRouter().state.matches.map((match) => match.staticData)) === 'app';

const endings: Record<SessionEnd, (user: MeUser | null, redirect?: string) => Ending> = {
  'sign-out': (_user, redirect) => ({ forget: 'both', deleteDatabase: true, load: safeRedirectPath(redirect) ?? appConfig.aboutUrl }),
  // An anonymous account's session is all it has: nothing signs it back in, so its browser forgets it and is a visitor
  // again. A public page reloads as it is, for that visitor.
  lost: (user, redirect) =>
    user?.isAnonymous
      ? { forget: 'both', deleteDatabase: true, load: onAppPage() ? appConfig.aboutUrl : 'here' }
      : { forget: 'user', deleteDatabase: false, load: onAppPage() ? `/auth/authenticate${stringifySearch({ redirect })}` : 'here' },
  elsewhere: () => ({ forget: 'none', deleteDatabase: false, load: 'here' }),
  expired: () => ({ forget: 'both', deleteDatabase: true, load: null }),
  replaced: () => ({ forget: 'user', deleteDatabase: false, load: 'here' }),
};

/** Deletes the database of every user this browser no longer knows: the stored user's and the last user's stay. A failure is logged. */
export const sweepForgottenUserDbs = (): Promise<void> =>
  sweepLocalUserDbs(() => Object.values(storedUserIds())).catch((error) =>
    console.error('[localUserDb] Deleting the databases of forgotten users failed:', error),
  );

/**
 * Ends the session on the server. What needs the session goes first, while it lasts: pending seen marks would beacon
 * after the cookie is gone, and this device's push subscription would bring the account's notifications to the next
 * person here. Nothing on this device can hold it up.
 * @throws when the request failed or went unanswered: the session may still work. A 401 says no session is left to end
 * and counts as signed out.
 */
async function endOnServer(): Promise<void> {
  await settleOrReport('sign_out.last_requests', shortWaitMs, Promise.allSettled([seenStore.getState().flush(), disablePushSubscription()]));
  try {
    await signOut({ signal: AbortSignal.timeout(longWaitMs) });
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
  }
}

async function end(reason: SessionEnd, user: MeUser | null, redirect?: string): Promise<void> {
  const ending = endings[reason](user, redirect);
  if (reason === 'sign-out') await endOnServer();

  // Before any wait: a queued write resumed meanwhile would replay on whatever session the browser holds next. A flush
  // of the emptied cache cannot delete the stored cache and queue: the persister forgets its restore.
  resetPersister();
  queryClient.clear();

  // Stored collaborative edits commit before the database closes: a kept one holds them for the same user's next
  // session. At boot no document is open yet.
  if (reason !== 'expired') await settleOrReport('end_session.yjs_flush', shortWaitMs, flushYjsStore());

  // The hint is this tab's to write while it names this tab's user: another tab that stored someone else, or no one,
  // wrote it last. Nulling the user closes the database and resets every per-user store.
  const forget = storedUserIds().userId === (user?.id ?? null) ? ending.forget : 'none';
  if (forget === 'both') userStore.getState().reset();
  else if (forget === 'user') userStore.setState({ user: null, isSystemAdmin: false, session: null });
  else closeLocalUserDb();

  // The badge belongs to the service worker, which outlives this page.
  if (forget !== 'none' && 'clearAppBadge' in navigator) void navigator.clearAppBadge().catch(() => {});

  // After the reset, which names nobody to keep. Other tabs see the delete and close their connection.
  if (ending.deleteDatabase) await settleOrReport('end_session.sweep', shortWaitMs, sweepForgottenUserDbs());

  if (ending.load === 'here') window.location.reload();
  else if (ending.load) window.location.assign(ending.load);
}

let running: Promise<void> | null = null;

/**
 * Ends this tab's session, as the table in `cella/CLIENT.md` says for `reason`: every row clears memory first and
 * commits collaborative edits, then forgets what its row forgets, and every row but `expired` leaves the page with a
 * load. With no stored user only a sign-out has anything to do: the server may hold a session the store never named.
 * A call while one runs joins it, as the 401s of the requests still in flight do.
 * @throws when a sign-out's request failed or went unanswered: the session may still work, and nothing was cleared.
 */
export function endSession(reason: SessionEnd, { redirect }: { redirect?: string } = {}): Promise<void> {
  const { user } = userStore.getState();
  if (!user && reason !== 'sign-out') return Promise.resolve();
  running ??= end(reason, user, redirect).finally(() => {
    running = null;
  });
  return running;
}
