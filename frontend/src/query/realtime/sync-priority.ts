import { getProductEntityConfig, type RealtimeEntityType } from 'config';
import router from '~/lib/router';

export type SyncPriority = 'high' | 'medium' | 'low';

interface SyncNotification {
  entityType: RealtimeEntityType;
  entityId: string;
  organizationId: string | null;
}

/**
 * Extract context entity IDs from current route params.
 * Uses common param naming conventions to identify which context the user is viewing.
 */
function getRouteContext(): Record<string, string> {
  const context: Record<string, string> = {};

  for (const match of router.state.matches) {
    const params = match.params as Record<string, string>;

    // Common param patterns → entity type mapping
    // /$idOrSlug (first segment) → organization
    // /$orgIdOrSlug/... → organization
    if (params.orgIdOrSlug) context.organization = params.orgIdOrSlug;
    if (params.idOrSlug && !context.organization) context.organization = params.idOrSlug;
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

  // Check org scope first - most entities are org-scoped
  const routeOrg = routeContext.organization;

  // No org in route (e.g., /home, /about) → low priority
  if (!routeOrg) return 'low';

  // Different org → low priority
  if (organizationId && routeOrg !== organizationId) return 'low';

  // User is in matching org - check if any ancestor matches route context
  for (const ancestor of ancestors) {
    if (routeContext[ancestor]) {
      return 'high';
    }
  }

  // Same org but not viewing relevant context → medium
  return 'medium';
}

/**
 * Quick check if user is in a context where this entity type is relevant.
 * Useful for deciding whether to process a notification at all.
 */
export function isEntityTypeRelevant(entityType: RealtimeEntityType): boolean {
  const productConfig = getProductEntityConfig(entityType);
  if (!productConfig) return false;

  const { ancestors } = productConfig;

  // Global entities (no ancestors) are always relevant
  if (ancestors.length === 0) return true;

  const routeContext = getRouteContext();

  // Relevant if user is in any ancestor context
  return ancestors.some((ancestor) => routeContext[ancestor]);
}
