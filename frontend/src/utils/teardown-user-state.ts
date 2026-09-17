import { disablePushSubscription } from '~/modules/notification/use-push-subscription';
import { seenStore } from '~/modules/seen/seen-store';
import { useUIStore } from '~/modules/ui/ui-store';
import { useUserStore } from '~/modules/user/user-store';
import { deleteLocalUserDb } from '~/query/local-user-db';
import { queryClient } from '~/query/query-client';

const ignore = () => {};

interface TeardownOptions {
  /** Delete the user's database and identity hint. Without it both survive, so the same user can re-authenticate into their offline work. */
  wipe?: boolean;
  /** The server session still exists: flush pending seen batches and, on a wipe, drop this device's push subscription while requests can still authenticate. */
  sessionAlive?: boolean;
}

/** Ends the signed-in state on this device in fixed phases: outbound flush, device state, in-memory stores, wipe. Every sign-out path calls this. */
export const teardownUserState = async ({ wipe = true, sessionAlive = true }: TeardownOptions = {}): Promise<void> => {
  // Seen batches would otherwise beacon on unload, after the cookie is gone.
  const { flush: flushSeen } = seenStore.getState();
  if (sessionAlive) await flushSeen().catch(ignore);

  // The badge and the push subscription live in the service worker, which outlives this page.
  if (typeof navigator !== 'undefined' && 'clearAppBadge' in navigator) void navigator.clearAppBadge().catch(() => {});
  if (wipe && sessionAlive) await disablePushSubscription().catch(ignore);

  queryClient.clear();

  // Hard sign-out only: destroy all per-user persisted data while the owner is still known. Other tabs see the delete and sign out too.
  if (wipe) await deleteLocalUserDb();

  // Reset the bootstrap UI session flags (impersonation, offline access); theme/mode persist.
  useUIStore.getState().reset();

  // Nulling the user closes the local DB and resets every per-user store; only a wipe forgets `lastUser`.
  if (wipe) useUserStore.getState().reset();
  else useUserStore.setState({ user: null, isSystemAdmin: false, yjsTokens: {} });
};
