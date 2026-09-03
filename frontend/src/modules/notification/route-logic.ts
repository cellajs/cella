import { redirect } from '@tanstack/react-router';
import { markNotificationsRead } from 'sdk';
import type { z } from 'zod';
import { getNotificationRoute, type notificationLinkSearchSchema } from '~/modules/notification/notification-link';
import { invalidateNotifications } from '~/modules/notification/query';

type NotificationLinkSearch = z.infer<typeof notificationLinkSearchSchema>;

/**
 * `/n` resolves an email or push link to the subject's channel route and forwards. The link is
 * self-describing, so no lookup: the notification row may be long gone (90-day retention) while
 * the subject is not. Marking read is best-effort and never delays the redirect.
 */
export function notificationLinkBeforeLoad(search: NotificationLinkSearch): never {
  if (search.nid) {
    void markNotificationsRead({ body: { ids: [search.nid] } })
      .then(() => invalidateNotifications())
      .catch(() => undefined);
  }

  const route = getNotificationRoute(search);
  if (!route) throw redirect({ to: '/home', replace: true });
  throw redirect({ to: route.to, params: route.params, search: route.search, replace: true });
}
