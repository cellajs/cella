import type { ChannelEntityType } from 'shared';
import type { EntityRoute } from '~/modules/navigation/types';
import { channelRouteConfig } from '~/routes-config';

interface LinkTarget {
  channelId: string;
  channelType: string;
  organizationId: string;
  tenantId: string;
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

  return { to: config.path, params, search: {} };
}
