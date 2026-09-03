import type { NotificationLinkSearch } from 'shared/utils/notification-link';
import type { EntityRoute } from '~/modules/navigation/types';
import { type ChannelRouteEntry, channelRouteConfig } from '~/routes-config';

type LinkTarget = Omit<NotificationLinkSearch, 'nid'>;

/**
 * Route to the channel a notification happened in. Ids go in the slug params: every channel route
 * resolves "by slug or ID" in `beforeLoad`, rewrites to the slug, and lands on its feed tab.
 */
export function getNotificationRoute(notification: LinkTarget): EntityRoute | null {
  const config = channelRouteConfig[notification.channelType];
  if (!config) return null;

  const params: Record<string, string> = {
    tenantId: notification.tenantId,
    organizationSlug: notification.organizationId,
  };
  params[config.paramName] = notification.channelId;

  const entry: ChannelRouteEntry = config;
  const { entityType, subjectId } = notification;
  const search =
    entry.notificationSearch && entityType && subjectId ? entry.notificationSearch({ entityType, subjectId }) : {};
  return { to: config.path, params, search };
}
