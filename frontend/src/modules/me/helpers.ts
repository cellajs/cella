import { getMe } from 'sdk';
import { userStore } from '~/modules/user/user-store';

/** Fetches who is signed in and writes the answer to the user store. */
export const getAndSetMe = async () => {
  const me = await getMe();
  const previousUserId = userStore.getState().lastUser?.id;

  userStore.getState().setMe(me);

  // Per-user storage namespaces bind at boot, so a different user id needs a full reload to rebind every cache and store.
  if (previousUserId && previousUserId !== me.user.id) window.location.reload();

  return me.user;
};
