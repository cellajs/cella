import { appConfig } from 'shared';
import type { EnrichedContextEntity } from '~/modules/entities/types';
import type { EntityRoute } from '~/modules/navigation/types';
import { entityRouteConfig } from '~/routes-config';

/**
 * Config-driven entity path resolver
 *
 * Resolves an entity to its route using `entityRouteConfig`. Each entity declares
 * its route path, its param name, and optional subitem behavior. Ancestor slugs
 * (populated via cache enrichment) are mapped to params using the same config.
 *
 * When ancestor slugs are unavailable (cache miss), the route's `beforeLoad` +
 * `rewriteUrlToSlug` handles the fallback by redirecting to the slug-based URL after data loads.
 */
export const getContextEntityRoute = (item: EnrichedContextEntity, isSubitem?: boolean): EntityRoute => {
  const { entityType, slug, tenantId, ancestorSlugs = {} } = item;

  const config = entityRouteConfig[entityType];
  let to = config.path;
  const params: Record<string, string> = { tenantId };
  const search: Record<string, string> = {};

  // Set this entity's slug in its designated param
  params[config.paramName] = slug;

  // Set ancestor slugs in their designated params
  for (const type of appConfig.contextEntityTypes) {
    const ancestorSlug = ancestorSlugs[type];
    if (ancestorSlug) params[entityRouteConfig[type].paramName] = ancestorSlug;
  }

  // Subitem: navigate to parent route with entity slug as search param
  const subitemConfig = isSubitem && 'subitemOf' in config && config.subitemOf;
  if (subitemConfig) {
    const parentSlug = ancestorSlugs[subitemConfig.entityType];
    if (parentSlug) {
      const parentConfig = entityRouteConfig[subitemConfig.entityType];
      to = parentConfig.path;
      params[parentConfig.paramName] = parentSlug;
      search[subitemConfig.searchParam] = slug;
    }
  }

  return { to, params, search };
};
