import { getMe, getMyAuth, startImpersonation, stopImpersonation } from 'sdk';
import { meKeys } from '~/modules/me/query';
import { getCurrentUser, useUserStore } from '~/modules/user/user-store';
import { queryClient } from '~/query/query-client';
import { appStreamManager } from '~/query/realtime/stream-store';

/** Fetches who is signed in and writes the answer to the user store in one go: the user, system admin access and an impersonation's admin. */
export const getAndSetMe = async () => {
  const me = await getMe();
  const previousUserId = useUserStore.getState().lastUser?.id;

  useUserStore.getState().setMe(me);

  // Per-user storage namespaces bind at boot, so a different user id needs a full reload to rebind every cache and store.
  if (!me.impersonator && previousUserId && previousUserId !== me.user.id) window.location.reload();

  return me.user;
};

export const getAndSetMeAuthData = async () => {
  const authInfo = await getMyAuth();
  return authInfo;
};

/** Drops me and membership caches and reconnects SSE so the new identity's role and memberships apply. */
const refreshIdentityCaches = async () => {
  queryClient.removeQueries({ queryKey: meKeys.all });
  queryClient.removeQueries({ queryKey: meKeys.memberships });
  await getAndSetMe();
  appStreamManager.reconnect();
};

export const startImpersonationFlow = async (targetUserId: string) => {
  const { id, name, slug, thumbnailUrl } = getCurrentUser();
  await startImpersonation({ body: { targetUserId } });
  // Every request from here is answered as the user, so the admin's own database closes before `/me` says who that is.
  useUserStore.setState({ impersonator: { id, name, slug, thumbnailUrl, entityType: 'user' } });
  await refreshIdentityCaches();
};

/** Leaves an impersonation. The server answers the same when it already ended, so `/me` then says who this browser is. */
export const stopImpersonationFlow = async () => {
  await stopImpersonation();
  await refreshIdentityCaches();
};
