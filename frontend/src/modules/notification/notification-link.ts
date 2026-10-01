import type { NotificationLinkSearch } from 'shared/utils/notification-link';
import type { EntityRoute } from '~/modules/navigation/types';
import { type ChannelRouteEntry, channelRouteConfig } from '~/routes-config';

/** A link's search or an inbox row; the row carries `contextId` as `string | null`. */
type LinkTarget = Omit<NotificationLinkSearch, 'nid' | 'contextId'> & { contextId?: string | null };

/**
 * Route to the channel a notification happened in. Ids go in the slug params: every channel route
 * resolves "by slug or ID" in `beforeLoad`, rewrites to the slug, and lands on its feed tab.
 */
export function getNotificationRoute(notification: LinkTarget): EntityRoute | null {
  const config = channelRouteConfig[notification.channelType];
  if (!config) return null;

  const params: Record<string, string> = { tenantId: notification.tenantId, organizationSlug: notification.organizationId };
  params[config.paramName] = notification.channelId;

  const entry: ChannelRouteEntry = config;
  const { entityType, subjectId, contextId } = notification;
  // A variable, not a literal in the call, so an app whose `notificationSearch` type lacks `contextId` still compiles.
  const subject = entityType && subjectId ? { entityType, subjectId, contextId: contextId ?? null } : null;
  const search = entry.notificationSearch && subject ? entry.notificationSearch(subject) : {};
  return { to: config.path, params, search };
}
