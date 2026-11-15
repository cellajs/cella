import { getMe } from 'sdk';
import { endSession } from '~/modules/auth/end-session';
import { userStore } from '~/modules/user/user-store';

/** Fetches who is signed in and writes the answer to the user store. Another user than the live one ends this tab's session as `replaced`. */
export const getAndSetMe = async () => {
  const me = await getMe();
  const live = userStore.getState().user;

  // This tab's cache and queued writes are the live user's: stored under another session, they would reach that account.
  if (live && live.id !== me.user.id) void endSession('replaced');
  else userStore.getState().setMe(me);

  return me.user;
};
