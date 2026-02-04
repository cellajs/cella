import { hierarchy, type ProductEntityType } from 'config';
import router from '~/routes/router';
import { baseEntityRoutes } from '~/routes-config';

export type SyncPriority = 'high' | 'medium' | 'low';

interface SyncNotification {
  entityType: ProductEntityType;
  entityId: string;
  organizationId: string | null;
}

/** Extract org ID from current route pathname using baseEntityRoutes pattern. */
function getRouteOrgId(): string | null {
  const pathname = router.state.location.pathname;
  // Convert baseEntityRoutes.organization pattern to regex: /$idOrSlug/organization → /([^/]+)/organization
  const pattern = baseEntityRoutes.organization.replace('$idOrSlug', '([^/]+)');
  const match = pathname.match(new RegExp(`^${pattern}`));
  return match?.[1] ?? null;
}

/**
 * Determine sync priority based on current route context.
 *
 * Priority levels:
 * - high: User is viewing the organization that scopes this entity
 * - low: User is elsewhere (different org, not in org route, etc.)
 */
export function getSyncPriority(notification: SyncNotification): SyncPriority {
  const { entityType, organizationId } = notification;

  // Only product entities have sync priority logic
  if (!hierarchy.isProduct(entityType)) return 'low';

  const routeOrgId = getRouteOrgId();

  // Not in an org route → low priority
  if (!routeOrgId) return 'low';

  // Different org → low priority
  if (organizationId && routeOrgId !== organizationId) return 'low';

  // User is in matching org context
  return 'high';
}
