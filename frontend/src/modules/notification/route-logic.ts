import { redirect } from '@tanstack/react-router';
import { markNotificationsRead } from 'sdk';
import type { NotificationLinkSearch } from 'shared/utils/notification-link';
import { getMenuData } from '~/modules/navigation/menu-sheet/helpers/get-menu-data';
import { invalidateNotifications } from '~/modules/notification/query';
import { cacheRestored } from '~/query/query-client';
import { getProductRoute } from '~/utils/channel-route';

/** The link alone names the route, since the notification may be gone (90-day retention); marking read never delays the redirect. */
export async function notificationLinkBeforeLoad(search: NotificationLinkSearch): Promise<never> {
  if (search.nid) {
    void markNotificationsRead({ body: { ids: [search.nid] } })
      .then(() => invalidateNotifications())
      .catch(() => undefined);
  }

  // `getProductRoute` needs the menu's lists cached: a restored cache holds them, a fresh device loads them here.
  await cacheRestored;
  await getMenuData();
  const route = getProductRoute(search);
  if (!route) throw redirect({ to: '/home', replace: true });
  throw redirect({ to: route.to, params: route.params, search: route.search, replace: true });
}
