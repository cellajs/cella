import { signOut } from 'sdk';
import { ApiError } from '~/lib/api';
import { settleOrReport } from '~/lib/tracing';
import { disablePushSubscription } from '~/modules/notification/use-push-subscription';
import { seenStore } from '~/modules/seen/seen-store';
import { teardownUserState } from '~/utils/teardown-user-state';
import { longWaitMs, shortWaitMs } from '~/utils/wait-for';

/**
 * Signs this browser out: the server ends the session, then the client state goes, `wipe` as `teardownUserState` takes
 * it. Only the sign-out request decides the outcome, and nothing on this device can hold it up. What needs the session
 * goes first, while it lasts: pending seen marks would beacon after the cookie is gone, and this device's push
 * subscription would bring the account's notifications to the next person here.
 * @throws when the request failed or went unanswered: the session may still work, and nothing was cleared. A 401 says
 * no session is left to end and counts as signed out.
 */
export async function endSession({ wipe }: { wipe: boolean }): Promise<void> {
  await settleOrReport('sign_out.last_requests', shortWaitMs, Promise.allSettled([seenStore.getState().flush(), disablePushSubscription()]));
  try {
    await signOut({ signal: AbortSignal.timeout(longWaitMs) });
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
  }
  await teardownUserState(wipe);
}
