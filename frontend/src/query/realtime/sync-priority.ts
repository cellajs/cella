import { getProductEntityConfig, type RealtimeEntityType } from 'config';
import router from '~/lib/router';

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
 * Determine sync priority based on entityConfig.ancestors and current route context.
 *
 * Uses the ancestor chain from entityConfig to understand entity scoping:
 * - `attachment: { ancestors: ['organization'] }` → scoped to org
 * - `page: { ancestors: [] }` → global, no org scope
 *
 * Priority levels:
 * - high: User is viewing a context that scopes this entity
 * - medium: User is in same org but different view, or global entity
 * - low: User is elsewhere (different org, unauthenticated, etc.)
 */
export function getSyncPriority(notification: SyncNotification): SyncPriority {
  const { entityType, organizationId } = notification;
  const productConfig = getProductEntityConfig(entityType);

  // Only product entities have sync priority logic
  if (!productConfig) return 'low';

  const { ancestors } = productConfig;
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
