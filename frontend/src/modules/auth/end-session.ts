import { signOut } from 'sdk';
import { disablePushSubscription } from '~/modules/notification/use-push-subscription';
import { seenStore } from '~/modules/seen/seen-store';
import { teardownUserState } from '~/utils/teardown-user-state';

/**
 * Signs this browser out. What needs the session goes while it lasts: pending seen marks would beacon after the cookie
 * is gone, and this device's push subscription would bring the account's notifications to the next person here.
 * `wipe` as `teardownUserState` takes it; the session ends even when clearing the client state fails, so a rejection
 * always means the sign-out request failed.
 */
export async function endSession({ wipe }: { wipe: boolean }): Promise<void> {
  await Promise.allSettled([seenStore.getState().flush(), disablePushSubscription()]);
  await teardownUserState(wipe).catch((error) => console.error('Clearing client state at sign-out failed:', error));
  await signOut();
}
