import type { NotificationLinkSearch } from 'shared/utils/notification-link';
import { getProductDeepLink } from '~/lib/entity-modules';
import type { EntityRoute } from '~/modules/navigation/types';
import { channelRouteConfig } from '~/routes-config';

/** A link's search or an inbox row; the row carries `contextId` as `string | null`. */
type LinkTarget = Omit<NotificationLinkSearch, 'nid' | 'contextId'> & { contextId?: string | null };

/**
 * Search that opens the subject on the page it lands on, from the subject product's
 * `deepLinkParam`. Both its own param and its host's go in: whichever the target route does not
 * declare in `validateSearch`, the router strips.
 */
function getSubjectSearch({ entityType, subjectId, contextId }: LinkTarget): Record<string, string> {
  if (!entityType || !subjectId) return {};

  const { param, hostParam } = getProductDeepLink(entityType);
  return { ...(param ? { [param]: subjectId } : {}), ...(hostParam && contextId ? { [hostParam]: contextId } : {}) };
}

/**
 * Route to the channel a notification happened in. Ids go in the slug params: every channel route
 * resolves "by slug or ID" in `beforeLoad`, rewrites to the slug, and lands on its feed tab.
 */
export function getNotificationRoute(notification: LinkTarget): EntityRoute | null {
  const config = channelRouteConfig[notification.channelType];
  if (!config) return null;

  const params: Record<string, string> = { tenantId: notification.tenantId, organizationSlug: notification.organizationId };
  params[config.paramName] = notification.channelId;

  return { to: config.path, params, search: getSubjectSearch(notification) };
}
