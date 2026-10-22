import { redirect } from '@tanstack/react-router';
import { markNotificationsRead } from 'sdk';
import type { NotificationLinkSearch } from 'shared/utils/notification-link';
import { getMenuData } from '~/modules/navigation/menu-sheet/helpers/get-menu-data';
import { invalidateNotifications } from '~/modules/notification/query';
import { cacheRestored } from '~/query/query-client';
import { getProductRoute } from '~/utils/channel-route';

/**
 * `/n` resolves an email or push link to the subject's channel route and forwards. The link is
 * self-describing, so no lookup: the notification row may be long gone (90-day retention) while
 * the subject is not. Marking read is best-effort and never delays the redirect.
 */
export async function notificationLinkBeforeLoad(search: NotificationLinkSearch): Promise<never> {
  if (search.nid) {
    void markNotificationsRead({ body: { ids: [search.nid] } })
      .then(() => invalidateNotifications())
      .catch(() => undefined);
  }

  // The channel routes as it does from the menu, a subitem on its parent's page, once the menu's lists are cached: the
  // restored cache has them, a fresh device loads them here.
  await cacheRestored;
  await getMenuData();
  const route = getProductRoute(search);
  if (!route) throw redirect({ to: '/home', replace: true });
  throw redirect({ to: route.to, params: route.params, search: route.search, replace: true });
}
