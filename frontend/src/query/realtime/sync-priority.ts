import { hierarchy, type RealtimeEntityType } from 'config';
import router from '~/routes/router';

export type SyncPriority = 'high' | 'medium' | 'low';

interface SyncNotification {
  entityType: RealtimeEntityType;
  entityId: string;
  organizationId: string | null;
}

/** Extract context entity IDs from router's loaderData (already resolved by route loaders). */
function getRouteContext(): Record<string, string> {
  const context: Record<string, string> = {};

  for (const match of router.state.matches) {
    const entityType = (match.staticData as { entityType?: string } | undefined)?.entityType;
    const id = (match.loaderData as { id?: string } | null)?.id;
    if (entityType && id) context[entityType] = id;
  }

  return context;
}

/**
 * Determine sync priority based on hierarchy.getOrderedAncestors() and current route context.
 *
 * Uses the ancestor chain from hierarchy to understand entity scoping:
 * - attachment with parent 'organization' → scoped to org
 * - page with parent null → global, no org scope
 *
 * Priority levels:
 * - high: User is viewing a context that scopes this entity
 * - medium: User is in same org but different view, or global entity
 * - low: User is elsewhere (different org, unauthenticated, etc.)
 */
export function getSyncPriority(notification: SyncNotification): SyncPriority {
  const { entityType, organizationId } = notification;

  // Only product entities have sync priority logic
  if (!hierarchy.isProduct(entityType)) return 'low';

  const ancestors = hierarchy.getOrderedAncestors(entityType);
  const routeContext = getRouteContext();

  // Global entity (no ancestors, like 'page') → medium if user is in app
  if (ancestors.length === 0) {
    return Object.keys(routeContext).length > 0 ? 'medium' : 'low';
  }

  const routeOrg = routeContext.organization;

  // Not in an org route → low priority
  if (!routeOrg) return 'low';

  // Different org → low priority
  if (organizationId && routeOrg !== organizationId) return 'low';

  // User is in matching org - high if viewing an ancestor context, else medium
  return ancestors.some((a) => routeContext[a]) ? 'high' : 'medium';
}
