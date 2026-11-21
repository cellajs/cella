import { redirect } from '@tanstack/react-router';
import { redeemLtiHandoff } from 'sdk';
import type { NotificationLinkSearch } from 'shared/utils/notification-link';
import { ApiError } from '~/lib/api';
import { keepEmbeddedSessionToken, takeEmbeddedHandoffCode } from '~/lib/embedded-context';
import { startSignedInApp } from '~/modules/common/app/route-logic';
import { readMe } from '~/modules/me/query';
import { userStore } from '~/modules/user/user-store';
import { getEmbeddedChannelRoute } from '~/utils/channel-route';

type RouteCause = 'preload' | 'enter' | 'stay';

/**
 * `beforeLoad` of the embedded layout: the session gate of every page below it, then the boot on entry. The first
 * visit redeems the launch's handoff, and the user comes from the API. A visit without a session (a reload, a frame
 * no launch opened, a session that ended) ends in the router's error notice for `embedded_session_missing`, which asks
 * the person to open the app again from the platform. A frame cannot sign anyone in.
 * @throws `embedded_session_missing` on a 401. A network failure or 5xx rethrows to the error boundary.
 */
export async function embedLayoutBeforeLoad(cause: RouteCause): Promise<void> {
  if (!userStore.getState().user) {
    try {
      const code = takeEmbeddedHandoffCode();
      if (code) keepEmbeddedSessionToken((await redeemLtiHandoff({ body: { code } })).token);
      await readMe();
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      throw Object.assign(new Error(), { name: 'embedded_session_missing' });
    }
  }
  if (cause === 'enter') await startSignedInApp();
}

/** `beforeLoad` of `/embed/n`, where a finished LTI launch lands: forwards to the embedded page of its channel. */
export function embeddedLinkBeforeLoad(search: NotificationLinkSearch): never {
  const route = getEmbeddedChannelRoute(search);
  throw redirect({ to: route.to, params: route.params, replace: true });
}
