import type { ChannelEntityType } from 'shared';
import type { EntityRoute } from '~/modules/navigation/types';
import { type ChannelRouteEntry, channelRouteConfig } from '~/routes-config';

interface LinkTarget {
  channelId: string;
  channelType: string;
  organizationId: string;
  tenantId: string;
  /** With `subjectId`, lets the channel's `notificationSearch` open the subject itself (a sheet, a scroll target). */
  entityType?: string;
  subjectId?: string;
}

/**
 * Route to the channel a notification happened in. Ids go in the slug params: every channel route
 * resolves "by slug or ID" in `beforeLoad`, rewrites to the slug, and lands on its feed tab.
 */
export function getNotificationRoute(notification: LinkTarget): EntityRoute | null {
  const config = channelRouteConfig[notification.channelType as ChannelEntityType];
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
