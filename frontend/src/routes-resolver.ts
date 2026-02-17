import type { ContextEntity } from '~/modules/entities/types';
import type { EntityRoute } from '~/modules/navigation/types';
import { baseEntityRoutes, routeParamMap } from '~/routes-config';

/**
 * Entity-agnostic context entity path resolver.
 *
 * Uses `ancestorSlugs` (populated via cache enrichment) to map parent entity slugs
 * to route params. The `routeParamMap` config maps entity types to param names.
 *
 * When ancestor slugs are unavailable (cache miss), the route's `beforeLoad` + `rewriteUrlToSlug`
 * handles the fallback by redirecting to the slug-based URL after data loads.
 */
export const getContextEntityRoute = (item: ContextEntity, _isSubitem?: boolean): EntityRoute => {
  const { entityType, slug, tenantId, ancestorSlugs = {} } = item;

  const to = baseEntityRoutes[entityType];
  const params: Record<string, string> = { tenantId, slug };

  // Map ancestor slugs to route param names via config
  for (const [type, ancestorSlug] of Object.entries(ancestorSlugs)) {
    const paramKey = routeParamMap[type];
    if (paramKey) params[paramKey] = ancestorSlug;
  }

  // Organization uses its own slug as orgSlug (it has no ancestors)
  if (entityType === 'organization') {
    params.orgSlug = slug;
  }

  return { to, params, search: {} };
};
