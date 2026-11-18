import { redirect } from '@tanstack/react-router';
import type { NotificationLinkSearch } from 'shared/utils/notification-link';
import { ApiError } from '~/lib/api';
import { startSignedInApp } from '~/modules/common/app/route-logic';
import { readMe } from '~/modules/me/query';
import { userStore } from '~/modules/user/user-store';
import { getEmbeddedChannelRoute } from '~/utils/channel-route';

type RouteCause = 'preload' | 'enter' | 'stay';

/**
 * `beforeLoad` of the embedded layout: the session gate of every page below it, then the boot on entry. A visit
 * without a session ends in the router's error notice for `embedded_session_missing`, which names the browsers that
 * keep a session inside another site. A frame cannot sign anyone in.
 * @throws `embedded_session_missing` on a 401. A network failure or 5xx rethrows to the error boundary.
 */
export async function embedLayoutBeforeLoad(cause: RouteCause): Promise<void> {
  if (!userStore.getState().user) {
    try {
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
